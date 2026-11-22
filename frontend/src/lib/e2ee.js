// End-to-end encryption for one-to-one chats.
// Each device makes its own ECDH (P-256) key pair; the private key stays in IndexedDB on that device.
// Format v2 (current): the text is encrypted once with a random AES-GCM key, and that key is wrapped for
// every device of the recipient and every device of the sender, so each of your devices can read it.
// Format v1 (older messages): the text is encrypted once for the recipient and once for the sender.
// The server stores only ciphertext and each device's public key.
import { api } from '../api.js';
import { useAppStore } from '../store.js';

export const E2E_V1 = 'e2e:v1:';
export const E2E_V2 = 'e2e:v2:';
const DB_NAME = 'rs-e2ee';
const STORE = 'keys';
const PLAIN_STORE = 'plain';   // decrypted text, keyed by message id, so each message is opened once
const IDENTITY_KEY = 'identity';
const CANT_OPEN = 'Encrypted message';

let identityPromise = null;
const pairKeys = new Map();   // v1 only: other user id (or 'self') -> AES-GCM key
const peerKeys = new Map();   // v1 only: user id -> { key, at }
const deviceKeys = new Map(); // user id -> { devices: [{ deviceId, key }], at }
const KEY_TTL_MS = 60 * 1000;

export const isEncrypted = (body) => typeof body === 'string' && (body.startsWith(E2E_V1) || body.startsWith(E2E_V2));

// One shared connection for the session. Opening a new one for every read (a poll reads every
// message) piles up connections and slows or stalls the chat.
let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(PLAIN_STORE)) db.createObjectStore(PLAIN_STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => { dbPromise = null; throw error; });
  }
  return dbPromise;
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

const toBase64 = (buffer) => {
  let binary = '';
  new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const newDeviceId = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));

// Creates this device's key pair and id on first use, and publishes the public half for this device
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
          deviceId: newDeviceId(),
        };
        await idbPut(IDENTITY_KEY, identity);
      } else if (!identity.deviceId) {
        // Keys made before devices existed get an id now; the key itself is unchanged
        identity = { ...identity, deviceId: newDeviceId() };
        await idbPut(IDENTITY_KEY, identity);
      }
      await api('/v1/messages/keys', { method: 'PUT', body: { publicKey: JSON.stringify(identity.publicJwk), deviceId: identity.deviceId } });
      return identity;
    })().catch((error) => { identityPromise = null; throw error; });
  }
  return identityPromise;
}

// Every device key of a person (newest first). A fetch error is thrown, never turned into plain text.
async function devicesOf(userId) {
  const id = String(userId);
  const cached = deviceKeys.get(id);
  if (cached && Date.now() - cached.at < KEY_TTL_MS) return cached.devices;
  const data = await api(`/v1/messages/keys/${id}`);
  const devices = [];
  for (const device of data.devices || []) {
    try {
      const key = await crypto.subtle.importKey('jwk', JSON.parse(device.publicKey), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
      devices.push({ deviceId: device.deviceId, key });
    } catch { /* skip a key that cannot be read */ }
  }
  deviceKeys.set(id, { devices, at: Date.now() });
  return devices;
}

// v1 only: the single key a person last published (older app versions)
async function peerPublicKey(userId) {
  const id = String(userId);
  const cached = peerKeys.get(id);
  if (cached && Date.now() - cached.at < KEY_TTL_MS) return cached.key;
  let key = null;
  try {
    const data = await api(`/v1/messages/keys/${id}`);
    if (data.publicKey) key = await crypto.subtle.importKey('jwk', JSON.parse(data.publicKey), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  } catch (error) {
    console.warn('[RimSocial] could not load encryption key:', error);
  }
  if (!key) return null;
  peerKeys.set(id, { key, at: Date.now() });
  return key;
}

// Shared AES key between this device and another device's public key
function aesWith(otherPublicKey, identity) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: otherPublicKey },
    identity.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// v1 only: AES key shared with a person (or with ourselves, for our own copy)
function pairKey(cacheId, otherPublicKey, identity) {
  if (!otherPublicKey) return Promise.reject(new Error('No public key for this person'));
  if (cacheId !== 'self') return aesWith(otherPublicKey, identity);
  if (!pairKeys.has(cacheId)) {
    const key = aesWith(otherPublicKey, identity);
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

// Encrypts a text message for every device of the recipient and of ourselves. Returns the string the server stores.
export async function sealFor(recipientId, text) {
  const identity = await ensureIdentity();
  const recipients = await devicesOf(recipientId);
  if (!recipients.length) return text;   // the person has no key yet: sent as plain text
  const meId = useAppStore.getState().user?.id;
  const own = meId ? await devicesOf(meId) : [];
  const targets = new Map();
  for (const device of [...recipients, ...own]) targets.set(device.deviceId, device);
  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawKey = await crypto.subtle.exportKey('raw', contentKey);
  const body = await seal(contentKey, text);
  const wraps = {};
  for (const [deviceId, device] of targets) {
    wraps[deviceId] = await seal(await aesWith(device.key, identity), toBase64(rawKey));
  }
  return E2E_V2 + JSON.stringify({ f: identity.deviceId, i: body.iv, c: body.ct, k: wraps });
}

// v2: unwrap the content key that was made for this device, then decrypt the text
async function openV2(message, envelope, identity) {
  const wrap = envelope.k?.[identity.deviceId];
  if (!wrap) throw new Error('This message was not sent to this device');
  let senderKey = null;
  if (envelope.f === identity.deviceId) {
    senderKey = identity.publicKey;
  } else {
    const senderDevice = async () => (await devicesOf(message.senderId)).find((d) => d.deviceId === envelope.f)?.key || null;
    senderKey = await senderDevice();
    if (!senderKey) {
      deviceKeys.delete(String(message.senderId));   // the sender may have a new device: fetch the list again
      senderKey = await senderDevice();
    }
    if (!senderKey) throw new Error('Unknown sender device');
  }
  const rawKey = fromBase64(await open(await aesWith(senderKey, identity), wrap));
  const contentKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  return open(contentKey, { iv: envelope.i, ct: envelope.c });
}

// v1: older messages, read with the single key of each person
async function openV1(message, identity, meId) {
  let parts;
  try { parts = JSON.parse(message.body.slice(E2E_V1.length)); } catch { return CANT_OPEN; }
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

// Returns the readable text of a message. Plain (non-encrypted) bodies are returned unchanged.
export async function openBody(message, meId) {
  if (!isEncrypted(message.body)) return message.body;
  if (message.id) {
    const cached = await plainGet(message.id).catch(() => null);
    if (cached !== null) return cached;
  }
  const identity = await ensureIdentity().catch(() => null);
  if (!identity) return CANT_OPEN;
  if (message.body.startsWith(E2E_V2)) {
    let envelope;
    try { envelope = JSON.parse(message.body.slice(E2E_V2.length)); } catch { return CANT_OPEN; }
    try {
      const text = await openV2(message, envelope, identity);
      await rememberPlain(message.id, text);
      return text;
    } catch {
      return CANT_OPEN;
    }
  }
  return openV1(message, identity, meId);
}

// Readable copies of a list of messages (including the quoted message in each reply)
export async function openMessages(items, meId) {
  return Promise.all(items.map(async (message) => ({
    ...message,
    body: await openBody(message, meId).catch(() => CANT_OPEN),
    replyTo: message.replyTo ? { ...message.replyTo, body: await openBody(message.replyTo, meId).catch(() => CANT_OPEN) } : message.replyTo,
  })));
}

// Decrypts the newest messages of one conversation as soon as they arrive, so they are readable
// before anyone opens the chat. Called from the live stream for every new message.
export async function syncConversation(peerId, meId) {
  const data = await api(`/v1/messages/with/${peerId}`);
  await Promise.all((data.items || []).filter((m) => isEncrypted(m.body)).map((m) => openBody(m, meId)));
}
