const API_BASE = 'https://facturas-api.ju6hsc.easypanel.host';

const TOKEN_KEY = 'facturas_jwt_token';
const USER_KEY = 'facturas_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getSavedUser(): { id: string; email: string; role: string; team_id: string | null } | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveUser(user: { id: string; email: string; role: string; team_id: string | null }): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only set Content-Type for non-FormData bodies
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Unexpected response: ${text.substring(0, 200)}`);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}`);
  }

  return data as T;
}
