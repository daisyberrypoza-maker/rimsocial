import { useAppStore } from './store.js';
import { API_BASE } from './lib/config.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const { token, logout } = useAppStore.getState();
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers: h, body });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  // Expired session: clear it so the router sends the user to /login
  if (res.status === 401 && token) logout();
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}
