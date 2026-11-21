// End-to-end encryption for one-to-one chats.
// Each browser makes an ECDH (P-256) key pair; the private key stays in IndexedDB on this device.
// A text message is encrypted twice with AES-GCM: once for the recipient and once for the sender,
// so both can read it. The server stores only the ciphertext.
import { api } from '../api.js';

export const E2E_PREFIX = 'e2e:v1:';
const DB_NAME = 'rs-e2ee';
const STORE = 'keys';
const PLAIN_STORE = 'plain';   // decrypted text, keyed by message id, so each message is opened once
const IDENTITY_KEY = 'identity';
const CANT_OPEN = 'Encrypted message';

let identityPromise = null;
const pairKeys = new Map();   // other user id (or 'self') -> AES-GCM key
const peerKeys = new Map();   // user id -> { key, at }: ECDH public key, refreshed so a new device is picked up
const PEER_KEY_TTL_MS = 60 * 1000;

export const isEncrypted = (body) => typeof body === 'string' && body.startsWith(E2E_PREFIX);

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(PLAIN_STORE)) db.createObjectStore(PLAIN_STORE);
    };
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

async function plainGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(PLAIN_STORE).objectStore(PLAIN_STORE).get(String(id));
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

// Remember the readable text of a message (sent or received) so it is never decrypted twice
export async function rememberPlain(id, text) {
  if (!id || typeof text !== 'string') return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PLAIN_STORE, 'readwrite');
      tx.objectStore(PLAIN_STORE).put(text, String(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('[RimSocial] could not keep decrypted text:', error);
  }
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
  const cached = peerKeys.get(id);
  if (cached && Date.now() - cached.at < PEER_KEY_TTL_MS) return cached.key;
  {
    let key = null;
    try {
      const data = await api(`/v1/messages/keys/${id}`);
      if (data.publicKey) key = await crypto.subtle.importKey('jwk', JSON.parse(data.publicKey), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    } catch (error) {
      console.warn('[RimSocial] could not load encryption key:', error);
    }
    // No key yet: the message is sent as plain text, and the key is picked up once they open the app
    if (!key) return null;
    peerKeys.set(id, { key, at: Date.now() });
    return key;
  }
}

// AES key shared with another person (or with ourselves, for our own copy). Only our own key is cached:
// a peer's key is derived each time, so a new device on their side is never shadowed by an old key.
function pairKey(cacheId, otherPublicKey, identity) {
  if (!otherPublicKey) return Promise.reject(new Error('No public key for this person'));
  const derive = () => crypto.subtle.deriveKey(
    { name: 'ECDH', public: otherPublicKey },
    identity.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  if (cacheId !== 'self') return derive();
  if (!pairKeys.has(cacheId)) {
    const key = derive();
    pairKeys.set(cacheId, key);
    key.catch(() => pairKeys.delete(cacheId));
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
  if (!recipientKey) return text;
  const [r, s] = await Promise.all([
    pairKey(String(recipientId), recipientKey, identity).then((key) => seal(key, text)),
    pairKey('self', identity.publicKey, identity).then((key) => seal(key, text)),
  ]);
  return E2E_PREFIX + JSON.stringify({ r, s });
}

// Returns the readable text of a message. Plain (non-encrypted) bodies are returned unchanged.
export async function openBody(message, meId) {
  if (!isEncrypted(message.body)) return message.body;
  if (message.id) {
    const cached = await plainGet(message.id).catch(() => null);
    if (cached !== null) return cached;
  }
  const identity = await ensureIdentity().catch(() => null);
  if (!identity) return CANT_OPEN;
  const parts = JSON.parse(message.body.slice(E2E_PREFIX.length));
  const mine = String(message.senderId) === String(meId);
  // One retry for a received message: the sender's key may have changed, so fetch it again
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const key = mine
        ? await pairKey('self', identity.publicKey, identity)
        : await pairKey(String(message.senderId), await peerPublicKey(message.senderId), identity);
      const text = await open(key, mine ? parts.s : parts.r);
      await rememberPlain(message.id, text);
      return text;
    } catch {
      if (mine || attempt > 0) break;
      peerKeys.delete(String(message.senderId));
    }
  }
  return CANT_OPEN;
}

// Readable copies of a list of messages (including the quoted message in each reply)
export async function openMessages(items, meId) {
  return Promise.all(items.map(async (message) => ({
    ...message,
    body: await openBody(message, meId),
    replyTo: message.replyTo ? { ...message.replyTo, body: await openBody(message.replyTo, meId) } : message.replyTo,
  })));
}

// Decrypts the newest messages of one conversation as soon as they arrive, so they are readable
// before anyone opens the chat. Called from the live stream for every new message.
export async function syncConversation(peerId, meId) {
  const data = await api(`/v1/messages/with/${peerId}`);
  await Promise.all((data.items || []).filter((m) => isEncrypted(m.body)).map((m) => openBody(m, meId)));
}
