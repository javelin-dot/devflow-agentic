const BASE = '/api';

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = localStorage.getItem('devflow_token');
  return {
    'X-Actor': 'user',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(isFormData ? options?.headers : { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }),
    ...options,
  });
  if (res.status === 401) {
    localStorage.removeItem('devflow_token');
    window.dispatchEvent(new Event('devflow:unauthorized'));
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string | { code?: string; message?: string }; detail?: string }
      | null;
    const err = body?.error;
    const msg =
      typeof err === 'string'
        ? err
        : err?.message ?? body?.detail ?? res.statusText;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
