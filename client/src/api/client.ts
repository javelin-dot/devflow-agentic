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
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
