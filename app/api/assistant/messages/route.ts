import { NextResponse } from 'next/server';
import {
  assistantFetch,
  assistantInputLimit,
  isAssistantTimeout,
  readAssistantJson,
  safeQuotaResponse,
} from '@/lib/server/assistant';
import {
  organizerFetch,
  readJson,
  SESSION_COOKIE,
} from '@/lib/server/organizer';
import { getSessionToken, isTrustedOrigin } from '@/lib/server/session';

const MAX_BODY_BYTES = 8_192;

function unauthorized() {
  const response = NextResponse.json(
    { detail: 'Your session has expired.' },
    { status: 401 },
  );
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

    // The assistant's /chat endpoint consumes the quota when it successfully
    // processes a message. Only check eligibility here so one message cannot
    // be charged once by the organizer and again by the assistant.
    const quotaUpstream = await organizerFetch(
      '/chat-quota',
      { cache: 'no-store' },
      token,
    );
    const rawQuotaData = await readJson(quotaUpstream);
    const quotaData = Array.isArray(rawQuotaData) ? {} : rawQuotaData;
    if (quotaUpstream.status === 401) return unauthorized();
    if (!quotaUpstream.ok) {
      const headers = new Headers();
      const retryAfter = quotaUpstream.headers.get('retry-after');
      if (retryAfter) headers.set('Retry-After', retryAfter);

      const detail = recordValue(quotaData.detail);
      const quota = detail
        ? safeQuotaResponse({ ...detail, allowed: false })
        : null;
      return NextResponse.json(
        {
          detail:
            quotaUpstream.status === 429
              ? "You have reached today's question limit."
              : 'Daily allowance information is temporarily unavailable.',
          error_code:
            quotaUpstream.status === 429
              ? 'DAILY_QUOTA_EXCEEDED'
              : 'QUOTA_SERVICE_UNAVAILABLE',
          ...(quota ? { quota } : {}),
        },
        { status: quotaUpstream.status, headers },
      );
    }

    const quota = safeQuotaResponse(quotaData);
    if (!quota)
      return NextResponse.json(
        {
          detail: 'Daily allowance information is temporarily unavailable.',
          error_code: 'INVALID_QUOTA_RESPONSE',
        },
        { status: 502 },
      );
    if (!quota.allowed)
      return NextResponse.json(
        {
          detail: "You have reached today's question limit.",
          error_code: 'DAILY_QUOTA_EXCEEDED',
          quota,
        },
        { status: 429 },
      );

    const assistantUpstream = await assistantFetch(
      '/chat',
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      },
      token,
    );
    const assistantData = await readAssistantJson(assistantUpstream);
    if (assistantUpstream.status === 401) return unauthorized();
    if (!assistantUpstream.ok)
      return NextResponse.json(
        {
          detail:
            assistantUpstream.status === 408 || assistantUpstream.status === 504
              ? 'The research request timed out. Please try again later.'
              : 'The research assistant is temporarily unavailable.',
          error_code:
            assistantUpstream.status === 408 || assistantUpstream.status === 504
              ? 'ASSISTANT_TIMEOUT'
              : 'ASSISTANT_UPSTREAM_ERROR',
          quota,
        },
        { status: assistantUpstream.status },
      );

    if (typeof assistantData.reply !== 'string' || !assistantData.reply.trim())
      return NextResponse.json(
        {
          detail: 'The research assistant returned an unreadable response.',
          error_code: 'ASSISTANT_UPSTREAM_ERROR',
          quota,
        },
        { status: 502 },
      );

    // /chat has now performed the single quota deduction. Read the updated
    // value so the client immediately displays the authoritative remainder.
    const updatedQuotaUpstream = await organizerFetch(
      '/chat-quota',
      { cache: 'no-store' },
      token,
    );
    const rawUpdatedQuotaData = await readJson(updatedQuotaUpstream);
    const updatedQuotaData = Array.isArray(rawUpdatedQuotaData)
      ? {}
      : rawUpdatedQuotaData;
    const updatedQuota = updatedQuotaUpstream.ok
      ? safeQuotaResponse(updatedQuotaData)
      : null;

    return NextResponse.json({
      message: {
        role: 'assistant',
        content: assistantData.reply,
        created_at: new Date().toISOString(),
      },
      quota: updatedQuota ?? quota,
    });
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
        { status: 504 },
      );
    return NextResponse.json(
      {
        detail: 'The research assistant is temporarily unavailable.',
        error_code: 'ASSISTANT_UPSTREAM_ERROR',
      },
      { status: 502 },
    );
  }
}
