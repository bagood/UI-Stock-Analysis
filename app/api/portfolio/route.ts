import { NextResponse } from 'next/server';
import {
  errorMessage,
  organizerFetch,
  readJson,
  SESSION_COOKIE,
} from '@/lib/server/organizer';
import { getSessionToken, isTrustedOrigin } from '@/lib/server/session';

function unauthorized() {
  const response = NextResponse.json(
    { detail: 'Your session has expired.' },
    { status: 401 },
  );
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const token = await getSessionToken();
  if (!token) return unauthorized();
  try {
    const url = new URL(request.url);
    const offset = Math.max(
      0,
      Number(url.searchParams.get('offset') ?? 0) || 0,
    );
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50),
    );
    const upstream = await organizerFetch(
      `/portfolios?offset=${offset}&limit=${limit}`,
      {},
      token,
    );
    const data = await readJson(upstream);
    if (upstream.status === 401) return unauthorized();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { detail: 'The portfolio service is temporarily unavailable.' },
      { status: 502 },
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
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ticker =
      typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
    const price =
      typeof body.price === 'string' || typeof body.price === 'number'
        ? String(body.price).trim()
        : '';
    const tradingWindow = body.trading_window;
    if (
      !/^[A-Z0-9.]{1,20}$/.test(ticker) ||
      !/^\d{1,14}(?:\.\d{1,4})?$/.test(price) ||
      !['5-10dd', '10-20dd'].includes(String(tradingWindow))
    ) {
      return NextResponse.json(
        {
          detail:
            'Ticker, non-negative price, and a valid trading window are required.',
        },
        { status: 400 },
      );
    }
    const upstream = await organizerFetch(
      '/portfolios',
      {
        method: 'POST',
        body: JSON.stringify({ ticker, price, trading_window: tradingWindow }),
      },
      token,
    );
    const data = await readJson(upstream);
    if (upstream.status === 401) return unauthorized();
    if (!upstream.ok)
      return NextResponse.json(
        { detail: errorMessage(data, 'Unable to create this position.') },
        { status: upstream.status },
      );
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json(
      { detail: 'The portfolio service is temporarily unavailable.' },
      { status: 502 },
    );
  }
}
