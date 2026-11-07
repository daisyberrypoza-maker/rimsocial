import { useAppStore } from './store.js';
import { API_BASE } from './lib/config.js';
import { Capacitor } from '@capacitor/core';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  if (Capacitor.isNativePlatform() && !API_BASE) {
    throw new ApiError('Android API address is not configured. Set VITE_API_URL to your public HTTPS backend URL, then rebuild and sync Android.', 0);
  }
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
    useAppStore.getState().setOffline(true);
    const target = `${API_BASE || window.location.origin}${path}`;
    throw new ApiError(`Cannot reach RimSocial API at ${target}. Check that the backend is online and the API URL is correct.`, 0);
  }
  useAppStore.getState().setOffline(false);
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  // Expired session: clear it so the router sends the user to /login
  if (res.status === 401 && token) logout();
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}
