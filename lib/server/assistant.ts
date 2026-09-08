import { backendUrl } from '@/lib/server/environment';

const ASSISTANT_TIMEOUT_MS = 100_000;

export const assistantBaseUrl = () => backendUrl('ASSISTANT_BASE_URL');

export async function assistantFetch(
  path: string,
  init: RequestInit = {},
  token: string,
) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  return fetch(`${assistantBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(ASSISTANT_TIMEOUT_MS),
  });
}

export async function readAssistantJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const data: unknown = await response.json().catch(() => null);
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeQuota(value: unknown) {
  const quota = objectValue(value);
  if (
    !quota ||
    typeof quota.allowed !== 'boolean' ||
    typeof quota.daily_limit !== 'number' ||
    typeof quota.remaining !== 'number' ||
    typeof quota.resets_at !== 'string'
  )
    return null;
  return {
    allowed: quota.allowed,
    daily_limit: quota.daily_limit,
    remaining: quota.remaining,
    resets_at: quota.resets_at,
  };
}

export function safeQuotaResponse(data: Record<string, unknown>) {
  return safeQuota(data);
}

export function assistantInputLimit() {
  const configured = Number(process.env.CHAT_MAX_INPUT_CHARS);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 10_000)
    : 2_000;
}

export function isAssistantTimeout(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
