export const SESSION_COOKIE = 'stocknub_session';

export type OrganizerUser = {
  id: string;
  username: string;
  is_active: boolean;
  created_at: string;
};

export type OrganizerPortfolio = {
  id: string;
  ticker: string;
  price: string;
  trading_window: '5-10dd' | '10-20dd';
  username: string;
  created_at: string;
  updated_at: string;
};

export type OrganizerToken = {
  access_token: string;
  token_type?: string;
  expires_in: number;
};

export const organizerBaseUrl = () =>
  (process.env.ORGANIZER_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export async function organizerFetch(
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${organizerBaseUrl()}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15000),
  });
}

export async function readJson(
  response: Response,
): Promise<Record<string, unknown> | unknown[]> {
  const data: unknown = await response
    .json()
    .catch(() => ({
      detail: 'The account service returned an unreadable response.',
    }));
  return Array.isArray(data) || (typeof data === 'object' && data !== null)
    ? (data as Record<string, unknown> | unknown[])
    : { detail: 'The account service returned an unreadable response.' };
}

export function errorMessage(
  data: Record<string, unknown> | unknown[],
  fallback: string,
) {
  if (!Array.isArray(data) && typeof data.detail === 'string')
    return data.detail;
  if (!Array.isArray(data) && Array.isArray(data.detail)) {
    return data.detail
      .map((item) =>
        typeof item === 'object' && item && 'msg' in item
          ? String(item.msg)
          : '',
      )
      .filter(Boolean)
      .join(' ');
  }
  return fallback;
}
