import { backendUrl } from '@/lib/server/environment';

const DEFAULT_ASSISTANT_TIMEOUT_MS = 130_000;

export type AssistantApiMessage = {
  id: string;
  client_message_id: string | null;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type AssistantQuotaResponse = {
  allowed: boolean;
  daily_limit: number;
  remaining: number;
  resets_at: string;
};

export type ChatHistoryResponse = {
  conversation: {
    id: string | null;
    business_date: string;
    timezone: 'Asia/Jakarta';
    expires_at: string;
    messages: AssistantApiMessage[];
  };
  quota: AssistantQuotaResponse;
};

export type ChatResponse = {
  conversation_id: string;
  messages: AssistantApiMessage[];
  quota: AssistantQuotaResponse;
};

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
    signal: AbortSignal.timeout(assistantTimeout()),
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

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function safeMessage(value: unknown): AssistantApiMessage | null {
  const message = objectValue(value);
  if (
    !message ||
    !validUuid(message.id) ||
    (message.client_message_id !== null &&
      !validUuid(message.client_message_id)) ||
    (message.role !== 'user' && message.role !== 'assistant') ||
    typeof message.content !== 'string' ||
    !message.content.trim() ||
    !validTimestamp(message.created_at)
  )
    return null;
  return {
    id: message.id,
    client_message_id: message.client_message_id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
  };
}

function safeMessages(value: unknown): AssistantApiMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages = value.map(safeMessage);
  return messages.every((message) => message !== null)
    ? (messages as AssistantApiMessage[])
    : null;
}

function safeQuota(value: unknown): AssistantQuotaResponse | null {
  const quota = objectValue(value);
  if (
    !quota ||
    typeof quota.allowed !== 'boolean' ||
    typeof quota.daily_limit !== 'number' ||
    !Number.isInteger(quota.daily_limit) ||
    quota.daily_limit < 0 ||
    typeof quota.remaining !== 'number' ||
    !Number.isInteger(quota.remaining) ||
    quota.remaining < 0 ||
    quota.remaining > quota.daily_limit ||
    !validTimestamp(quota.resets_at)
  )
    return null;
  return {
    allowed: quota.allowed,
    daily_limit: quota.daily_limit,
    remaining: quota.remaining,
    resets_at: quota.resets_at,
  };
}

export function safeQuotaResponse(value: unknown) {
  return safeQuota(value);
}

export function safeChatHistoryResponse(
  value: unknown,
): ChatHistoryResponse | null {
  const data = objectValue(value);
  const conversation = objectValue(data?.conversation);
  const messages = safeMessages(conversation?.messages);
  const quota = safeQuota(data?.quota);
  if (
    !data ||
    !conversation ||
    (conversation.id !== null && !validUuid(conversation.id)) ||
    typeof conversation.business_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(conversation.business_date) ||
    conversation.timezone !== 'Asia/Jakarta' ||
    !validTimestamp(conversation.expires_at) ||
    !messages ||
    !quota
  )
    return null;
  return {
    conversation: {
      id: conversation.id,
      business_date: conversation.business_date,
      timezone: conversation.timezone,
      expires_at: conversation.expires_at,
      messages,
    },
    quota,
  };
}

export function safeChatResponse(value: unknown): ChatResponse | null {
  const data = objectValue(value);
  const messages = safeMessages(data?.messages);
  const quota = safeQuota(data?.quota);
  if (
    !data ||
    !validUuid(data.conversation_id) ||
    !messages ||
    messages.length !== 2 ||
    messages[0].role !== 'user' ||
    messages[1].role !== 'assistant' ||
    !quota
  )
    return null;
  return {
    conversation_id: data.conversation_id,
    messages,
    quota,
  };
}

export function assistantInputLimit() {
  const configured = Number(process.env.CHAT_MAX_INPUT_CHARS);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 10_000)
    : 10_000;
}

function assistantTimeout() {
  const configured = Number(process.env.ASSISTANT_REQUEST_TIMEOUT_MS);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_ASSISTANT_TIMEOUT_MS;
}

export function isAssistantTimeout(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
