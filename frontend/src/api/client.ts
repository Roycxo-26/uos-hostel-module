const TOKEN_KEY = 'hostel_dev_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

// Backend's own response envelope (src/utils/response.ts +
// src/middlewares/errorHandler.ts) — success is { success: true, data },
// failure is { success: false, code, error: "<message>" } (a string, not a
// nested object — different from a REST API that nests { error: { message } }).
interface SuccessEnvelope<T> {
  success: true;
  data: T;
}
interface ErrorEnvelope {
  success: false;
  code: string;
  error: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL;

/**
 * One fetch wrapper for the whole app — every module's api/*.ts file routes
 * through this instead of calling fetch() directly. Unwraps the backend's
 * {success, data} envelope here so every other api/*.ts file can just
 * return T, not SuccessEnvelope<T>.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => undefined)) as SuccessEnvelope<T> | ErrorEnvelope | undefined;

  if (!res.ok || !body?.success) {
    const err = body as ErrorEnvelope | undefined;
    throw new ApiRequestError(res.status, err?.code ?? 'UNKNOWN_ERROR', err?.error ?? `Request failed with status ${res.status}`);
  }

  return body.data;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, data?: unknown) => apiFetch<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) => apiFetch<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
