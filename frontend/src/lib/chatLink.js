// Chat addresses carry a random token, never a user or group id.
// The real id is kept in this tab's session storage and looked up from the token.
const KEY = 'rs_chat_links';

function readLinks() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

function writeLinks(links) {
  try { sessionStorage.setItem(KEY, JSON.stringify(links)); } catch { /* storage unavailable: links last for this page only */ }
}

function newToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// kind is 'direct' or 'group'
export function chatPath(kind, id) {
  const links = readLinks();
  let token = Object.keys(links).find((key) => links[key].kind === kind && String(links[key].id) === String(id));
  if (!token) {
    token = newToken();
    links[token] = { kind, id: String(id) };
    writeLinks(links);
  }
  return `/chat/${kind === 'group' ? 'g' : 'd'}/${token}`;
}

export function chatTargetId(kind, token) {
  const entry = readLinks()[token];
  return entry && entry.kind === kind ? entry.id : null;
}
