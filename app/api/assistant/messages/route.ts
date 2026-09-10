import { NextResponse } from 'next/server';
import {
  assistantFetch,
  assistantInputLimit,
  isAssistantTimeout,
  readAssistantJson,
  safeChatHistoryResponse,
  safeChatResponse,
  safeQuotaResponse,
} from '@/lib/server/assistant';
import {
  organizerFetch,
  readJson,
  SESSION_COOKIE,
} from '@/lib/server/organizer';
import { getSessionToken, isTrustedOrigin } from '@/lib/server/session';

const MAX_BODY_BYTES = 65_536;

function privateHeaders(upstream?: Response) {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie',
  });
  const retryAfter = upstream?.headers.get('retry-after');
  if (retryAfter) headers.set('Retry-After', retryAfter);
  return headers;
}

function unauthorized() {
  const response = NextResponse.json(
    { detail: 'Your session has expired.' },
    { status: 401, headers: privateHeaders() },
  );
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function upstreamDetail(data: Record<string, unknown>, fallback: string) {
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    const details = data.detail
      .map((item) => {
        const row = recordValue(item);
        return typeof row?.msg === 'string' ? row.msg : '';
      })
      .filter(Boolean)
      .join(' ');
    if (details) return details;
  }
  const detail = recordValue(data.detail);
  return typeof detail?.message === 'string' ? detail.message : fallback;
}

export async function GET() {
  const token = await getSessionToken();
  if (!token) return unauthorized();

  try {
    const upstream = await organizerFetch(
      '/chat-history',
      { cache: 'no-store' },
      token,
    );
    const rawData = await readJson(upstream);
    const data = Array.isArray(rawData) ? {} : rawData;
    if (upstream.status === 401) return unauthorized();
    if (!upstream.ok)
      return NextResponse.json(
        {
          detail: upstreamDetail(
            data,
            'Chat history is temporarily unavailable.',
          ),
          error_code:
            upstream.status === 503
              ? 'CHAT_HISTORY_UNAVAILABLE'
              : 'CHAT_HISTORY_UPSTREAM_ERROR',
        },
        { status: upstream.status, headers: privateHeaders(upstream) },
      );

    const history = safeChatHistoryResponse(data);
    if (!history)
      return NextResponse.json(
        {
          detail: 'The chat history service returned an unreadable response.',
          error_code: 'INVALID_CHAT_HISTORY_RESPONSE',
        },
        { status: 502, headers: privateHeaders() },
      );

    return NextResponse.json(history, { headers: privateHeaders() });
  } catch {
    return NextResponse.json(
      {
        detail: 'Chat history is temporarily unavailable.',
        error_code: 'CHAT_HISTORY_UNAVAILABLE',
      },
      { status: 503, headers: privateHeaders() },
    );
  }
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request))
    return NextResponse.json(
      { detail: 'Request origin is not allowed.' },
      { status: 403 },
    );

  const token = await getSessionToken();
  if (!token) return unauthorized();

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES)
    return NextResponse.json(
      { detail: 'The request is too large.' },
      { status: 413 },
    );

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES)
      return NextResponse.json(
        { detail: 'The request is too large.' },
        { status: 413 },
      );

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message || message.length > assistantInputLimit())
      return NextResponse.json(
        {
          detail: `Enter a question between 1 and ${assistantInputLimit()} characters.`,
        },
        { status: 400 },
      );

    const upstream = await assistantFetch(
      '/chat',
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      },
      token,
    );
    const data = await readAssistantJson(upstream);
    if (upstream.status === 401) return unauthorized();
    if (!upstream.ok) {
      const quota = safeQuotaResponse(data.quota);
      const status = upstream.status;
      const fallback =
        status === 422
          ? 'The question is not valid.'
          : status === 429
            ? "You have reached today's question limit."
            : status === 502
              ? 'The generated response could not be completed or saved.'
              : status === 504
                ? 'The research request timed out. Please try again later.'
                : 'The research assistant is temporarily unavailable.';
      return NextResponse.json(
        {
          detail: upstreamDetail(data, fallback),
          error_code:
            typeof data.error_code === 'string'
              ? data.error_code
              : status === 429
                ? 'DAILY_QUOTA_EXCEEDED'
                : status === 504
                  ? 'ASSISTANT_TIMEOUT'
                  : 'ASSISTANT_UPSTREAM_ERROR',
          ...(quota ? { quota } : {}),
        },
        { status, headers: privateHeaders(upstream) },
      );
    }

    const chat = safeChatResponse(data);
    if (!chat)
      return NextResponse.json(
        {
          detail: 'The research assistant returned an unreadable response.',
          error_code: 'INVALID_CHAT_RESPONSE',
        },
        { status: 502, headers: privateHeaders() },
      );

    return NextResponse.json(chat, { headers: privateHeaders() });
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { detail: 'The request body must be valid JSON.' },
        { status: 400 },
      );
    if (isAssistantTimeout(error))
      return NextResponse.json(
        {
          detail: 'The research request timed out. Please try again later.',
          error_code: 'ASSISTANT_TIMEOUT',
        },
        { status: 504, headers: privateHeaders() },
      );
    return NextResponse.json(
      {
        detail: 'The research assistant is temporarily unavailable.',
        error_code: 'ASSISTANT_UPSTREAM_ERROR',
      },
      { status: 503, headers: privateHeaders() },
    );
  }
}
