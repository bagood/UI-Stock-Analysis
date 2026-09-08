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

function safeMessage(
  value: unknown,
  allowedRoles: Array<'assistant' | 'user'>,
) {
  const message = objectValue(value);
  if (
    !message ||
    !allowedRoles.includes(message.role as 'assistant' | 'user') ||
    typeof message.content !== 'string' ||
    message.content.length > 100_000
  )
    return null;
  return {
    ...(typeof message.id === 'string' ? { id: message.id } : {}),
    role: message.role,
    content: message.content,
    ...(typeof message.created_at === 'string'
      ? { created_at: message.created_at }
      : {}),
  };
}

export function safeQuotaResponse(data: Record<string, unknown>) {
  return safeQuota(data);
}

export function safeMessageResponse(data: Record<string, unknown>) {
  const message = safeMessage(data.assistant_message, ['assistant']);
  const quota = safeQuota(data.quota);
  return message && quota ? { message, quota } : null;
}

const ALLOWED_ERROR_CODES = new Set([
  'ASSISTANT_TIMEOUT',
  'ASSISTANT_UPSTREAM_ERROR',
  'AUTHENTICATION_REQUIRED',
  'AUTHENTICATION_UNAVAILABLE',
  'DAILY_QUOTA_EXCEEDED',
  'INVALID_QUESTION',
  'INVALID_QUOTA_RESPONSE',
  'QUOTA_SERVICE_UNAVAILABLE',
  'USER_INACTIVE',
]);

export function safeAssistantError(
  status: number,
  data: Record<string, unknown>,
) {
  const error = objectValue(data.error);
  const code = error?.code;
  const upstreamCode = typeof code === 'string' ? code.toUpperCase() : '';
  const errorCode = ALLOWED_ERROR_CODES.has(upstreamCode)
    ? upstreamCode
    : status === 429
      ? 'DAILY_QUOTA_EXCEEDED'
      : status === 408 || status === 504
        ? 'ASSISTANT_TIMEOUT'
        : 'ASSISTANT_UPSTREAM_ERROR';

  const messages: Record<string, string> = {
    ASSISTANT_TIMEOUT: 'The research request timed out. Please try again later.',
    ASSISTANT_UPSTREAM_ERROR:
      'The research assistant is temporarily unavailable.',
    AUTHENTICATION_REQUIRED: 'Your session has expired.',
    AUTHENTICATION_UNAVAILABLE:
      'Session validation is temporarily unavailable.',
    DAILY_QUOTA_EXCEEDED: "You have reached today's question limit.",
    INVALID_QUESTION: 'Enter a valid question and try again.',
    INVALID_QUOTA_RESPONSE:
      'Daily allowance information is temporarily unavailable.',
    QUOTA_SERVICE_UNAVAILABLE:
      'Daily allowance information is temporarily unavailable.',
    USER_INACTIVE: 'This account is inactive.',
  };

  const quota = safeQuota(error?.details);
  return {
    detail: messages[errorCode],
    error_code: errorCode,
    ...(quota ? { quota } : {}),
  };
}

export function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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
