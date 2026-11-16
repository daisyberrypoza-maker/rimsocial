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
  // Raw bodies (FormData and Blob chunks) go out as they are; other bodies are sent as JSON
  if (body && !(body instanceof FormData) && !(body instanceof Blob)) {
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

// XHR is used only for media transfers so the UI can report actual bytes sent.
export function apiWithProgress(path, { method = 'POST', body, headers = {}, onUploadProgress } = {}) {
  if (Capacitor.isNativePlatform() && !API_BASE) {
    return Promise.reject(new ApiError('The app is not connected to its service yet. Please try again later.', 0));
  }
  const { token, logout } = useAppStore.getState();
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body && !(body instanceof FormData) && !(body instanceof Blob)) {
    requestHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_BASE}${path}`);
    Object.entries(requestHeaders).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onUploadProgress === 'function') {
        onUploadProgress({ loaded: event.loaded, total: event.total, percent: Math.round((event.loaded / event.total) * 100) });
      }
    };
    xhr.onerror = () => {
      useAppStore.getState().setOffline(true);
      reject(new ApiError(safeErrorMessage(0), 0));
    };
    xhr.onabort = () => reject(new ApiError(safeErrorMessage(0), 0));
    xhr.onload = () => {
      useAppStore.getState().setOffline(false);
      const data = xhr.status === 204 ? null : (() => { try { return JSON.parse(xhr.responseText || 'null'); } catch { return null; } })();
      if (xhr.status === 401 && token) logout();
      if (xhr.status < 200 || xhr.status >= 300) {
        console.warn('[RimSocial] API upload failed:', { method, path, status: xhr.status, serverMessage: typeof data?.error === 'string' ? data.error : undefined });
        reject(new ApiError(safeErrorMessage(xhr.status), xhr.status));
        return;
      }
      if (typeof onUploadProgress === 'function') onUploadProgress({ loaded: 1, total: 1, percent: 100 });
      resolve(data);
    };
    xhr.send(payload ?? null);
  });
}
