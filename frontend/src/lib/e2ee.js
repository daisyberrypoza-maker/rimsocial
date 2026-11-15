// End-to-end encryption for one-to-one chats.
// Each browser makes an ECDH (P-256) key pair; the private key stays in IndexedDB on this device.
// A text message is encrypted twice with AES-GCM: once for the recipient and once for the sender,
// so both can read it. The server stores only the ciphertext.
import { api } from '../api.js';

export const E2E_PREFIX = 'e2e:v1:';
const DB_NAME = 'rs-e2ee';
const STORE = 'keys';
const IDENTITY_KEY = 'identity';
const CANT_OPEN = "🔒 This message can't be opened on this device";

let identityPromise = null;
const pairKeys = new Map();   // other user id (or 'self') -> AES-GCM key
const peerKeys = new Map();   // user id -> ECDH public key

export const isEncrypted = (body) => typeof body === 'string' && body.startsWith(E2E_PREFIX);

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const toBase64 = (buffer) => {
  let binary = '';
  new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// Creates this device's key pair on first use and publishes the public half
export function ensureIdentity() {
  if (!identityPromise) {
    identityPromise = (async () => {
      let identity = await idbGet(IDENTITY_KEY);
      if (!identity) {
        const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
        identity = {
          privateKey: pair.privateKey,
          publicKey: pair.publicKey,
          publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
        };
        await idbPut(IDENTITY_KEY, identity);
      }
      await api('/v1/messages/keys', { method: 'PUT', body: { publicKey: JSON.stringify(identity.publicJwk) } });
      return identity;
    })().catch((error) => { identityPromise = null; throw error; });
  }
  return identityPromise;
}

async function peerPublicKey(userId) {
  const id = String(userId);
  if (!peerKeys.has(id)) {
    const data = await api(`/v1/messages/keys/${id}`);
    if (!data.publicKey) throw new Error("This person hasn't set up encryption yet, so they can't receive this message.");
    const key = await crypto.subtle.importKey('jwk', JSON.parse(data.publicKey), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    peerKeys.set(id, key);
  }
  return peerKeys.get(id);
}

// AES key shared with another person (or with ourselves, for our own copy)
function pairKey(cacheId, otherPublicKey, identity) {
  if (!pairKeys.has(cacheId)) {
    pairKeys.set(cacheId, crypto.subtle.deriveKey(
      { name: 'ECDH', public: otherPublicKey },
      identity.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ));
  }
  return pairKeys.get(cacheId);
}

async function seal(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: toBase64(iv), ct: toBase64(ciphertext) };
}

async function open(key, part) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(part.iv) }, key, fromBase64(part.ct));
  return new TextDecoder().decode(plain);
}

// Encrypts a text message for the recipient (and for ourselves). Returns the string the server stores.
export async function sealFor(recipientId, text) {
  const identity = await ensureIdentity();
  const recipientKey = await peerPublicKey(recipientId);
  const [r, s] = await Promise.all([
    pairKey(String(recipientId), recipientKey, identity).then((key) => seal(key, text)),
    pairKey('self', identity.publicKey, identity).then((key) => seal(key, text)),
  ]);
  return E2E_PREFIX + JSON.stringify({ r, s });
}

// Returns the readable text of a message. Plain (non-encrypted) bodies are returned unchanged.
export async function openBody(message, meId) {
  if (!isEncrypted(message.body)) return message.body;
  try {
    const identity = await ensureIdentity();
    const parts = JSON.parse(message.body.slice(E2E_PREFIX.length));
    const mine = String(message.senderId) === String(meId);
    const key = mine
      ? await pairKey('self', identity.publicKey, identity)
      : await pairKey(String(message.senderId), await peerPublicKey(message.senderId), identity);
    return await open(key, mine ? parts.s : parts.r);
  } catch {
    return CANT_OPEN;
  }
}

// Readable copies of a list of messages (including the quoted message in each reply)
export async function openMessages(items, meId) {
  return Promise.all(items.map(async (message) => ({
    ...message,
    body: await openBody(message, meId),
    replyTo: message.replyTo ? { ...message.replyTo, body: await openBody(message.replyTo, meId) } : message.replyTo,
  })));
}
