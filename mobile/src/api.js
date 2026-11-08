import { useAppStore } from './store';
import { API_BASE } from './config';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Same contract as the web api(): Bearer token, JSON bodies, 401 clears the session
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const { token, logout, setOffline } = useAppStore.getState();
  const h = { Accept: 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload = body;
  // FormData (photos and videos) is sent as-is so React Native sets the multipart boundary itself
  if (body && !(body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers: h, body: payload });
  } catch {
    setOffline(true);
    throw new ApiError(`Cannot reach RimSocial API at ${API_BASE}${path}`, 0);
  }
  setOffline(false);
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (res.status === 401 && token) logout();
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}
