import { NextResponse } from 'next/server';
import {
  assistantFetch,
  assistantInputLimit,
  isAssistantTimeout,
  readAssistantJson,
  safeAssistantError,
  safeMessageResponse,
  validUuid,
} from '@/lib/server/assistant';
import { SESSION_COOKIE } from '@/lib/server/organizer';
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
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const idempotencyKey = request.headers.get('idempotency-key') ?? '';

    if (!validUuid(idempotencyKey))
      return NextResponse.json(
        { detail: 'A valid Idempotency-Key header is required.' },
        { status: 400 },
      );
    if (!content || content.length > assistantInputLimit())
      return NextResponse.json(
        {
          detail: `Enter a question between 1 and ${assistantInputLimit()} characters.`,
        },
        { status: 400 },
      );

    const upstream = await assistantFetch(
      '/assistant/messages',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ content }),
      },
      token,
    );
    const data = await readAssistantJson(upstream);
    if (upstream.status === 401) return unauthorized();
    if (!upstream.ok) {
      const headers = new Headers();
      const retryAfter = upstream.headers.get('retry-after');
      if (retryAfter) headers.set('Retry-After', retryAfter);
      return NextResponse.json(safeAssistantError(upstream.status, data), {
        status: upstream.status,
        headers,
      });
    }
    const response = safeMessageResponse(data);
    if (!response)
      return NextResponse.json(
        {
          detail: 'The research assistant returned an unreadable response.',
          error_code: 'ASSISTANT_UPSTREAM_ERROR',
        },
        { status: 502 },
      );
    return NextResponse.json(response);
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
