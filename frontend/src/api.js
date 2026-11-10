import { useAppStore } from './store.js';
import { API_BASE } from './lib/config.js';
import { Capacitor } from '@capacitor/core';

const SAFE_MESSAGES = {
  0: 'Connection problem. Please check your internet connection and try again.',
  400: 'Please check the information you entered and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'The requested item could not be found.',
  408: 'The request took too long. Please try again.',
  409: 'This action conflicts with the latest data. Refresh and try again.',
  413: 'This file is too large. Please choose a smaller file.',
  415: 'This file type is not supported.',
  422: 'Some information is missing or invalid. Please review and try again.',
  429: 'You are doing that too quickly. Please wait a moment and try again.',
};

function safeErrorMessage(status) {
  if (SAFE_MESSAGES[status]) return SAFE_MESSAGES[status];
  if (status >= 500) return 'Something went wrong. Please try again shortly.';
  return 'We could not complete that request. Please try again.';
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  if (Capacitor.isNativePlatform() && !API_BASE) {
    console.error('[RimSocial] Native API configuration is missing. Set VITE_API_URL and rebuild the app.');
    throw new ApiError('The app is not connected to its service yet. Please try again later.', 0);
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
  } catch (error) {
    useAppStore.getState().setOffline(true);
    console.warn('[RimSocial] API network request failed:', { method, path, cause: error?.message });
    throw new ApiError(safeErrorMessage(0), 0);
  }

  useAppStore.getState().setOffline(false);
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  // Expired session: clear it so the router sends the user to /login.
  if (res.status === 401 && token) logout();

  if (!res.ok) {
    // Keep technical response details in developer logs, never expose them in UI messages.
    console.warn('[RimSocial] API request failed:', {
      method,
      path,
      status: res.status,
      serverMessage: typeof data?.error === 'string' ? data.error : undefined,
    });
    throw new ApiError(safeErrorMessage(res.status), res.status);
  }

  return data;
}
