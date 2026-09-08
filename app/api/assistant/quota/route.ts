import { NextResponse } from 'next/server';
import { safeQuotaResponse } from '@/lib/server/assistant';
import {
  organizerFetch,
  readJson,
  SESSION_COOKIE,
} from '@/lib/server/organizer';
import { getSessionToken } from '@/lib/server/session';

function unauthorized() {
  const response = NextResponse.json(
    { detail: 'Your session has expired.' },
    { status: 401 },
  );
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET() {
  const token = await getSessionToken();
  if (!token) return unauthorized();

  try {
    const upstream = await organizerFetch(
      '/chat-quota',
      { cache: 'no-store' },
      token,
    );
    const rawData = await readJson(upstream);
    const data = Array.isArray(rawData) ? {} : rawData;
    if (upstream.status === 401) return unauthorized();
    if (!upstream.ok)
      return NextResponse.json(
        {
          detail: 'Daily allowance information is temporarily unavailable.',
          error_code: 'QUOTA_SERVICE_UNAVAILABLE',
        },
        { status: upstream.status },
      );
    const response = safeQuotaResponse(data);
    if (!response)
      return NextResponse.json(
        {
          detail: 'Daily allowance information is temporarily unavailable.',
          error_code: 'INVALID_QUOTA_RESPONSE',
        },
        { status: 502 },
      );
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      {
        detail: 'The research assistant is temporarily unavailable.',
        error_code: 'ASSISTANT_UPSTREAM_ERROR',
      },
      { status: 502 },
    );
  }
}
