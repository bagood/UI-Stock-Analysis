import { NextResponse } from 'next/server';
import {
  errorMessage,
  organizerFetch,
  readJson,
  SESSION_COOKIE,
} from '@/lib/server/organizer';
import { getSessionToken, isTrustedOrigin } from '@/lib/server/session';

const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
function unauthorized() {
  const response = NextResponse.json(
    { detail: 'Your session has expired.' },
    { status: 401 },
  );
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
async function contextId(context: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const params = await context.params;
  return params.id;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const id = await contextId(context);
  if (!validId(id))
    return NextResponse.json(
      { detail: 'Invalid portfolio ID.' },
      { status: 400 },
    );
  const token = await getSessionToken();
  if (!token) return unauthorized();
  try {
    const upstream = await organizerFetch(`/portfolios/${id}`, {}, token);
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  if (!isTrustedOrigin(request))
    return NextResponse.json(
      { detail: 'Request origin is not allowed.' },
      { status: 403 },
    );
  const id = await contextId(context);
  if (!validId(id))
    return NextResponse.json(
      { detail: 'Invalid portfolio ID.' },
      { status: 400 },
    );
  const token = await getSessionToken();
  if (!token) return unauthorized();
  try {
    const incoming = (await request.json()) as Record<string, unknown>;
    const body: Record<string, unknown> = {};
    if (typeof incoming.ticker === 'string')
      body.ticker = incoming.ticker.trim().toUpperCase();
    if (
      typeof incoming.price === 'string' ||
      typeof incoming.price === 'number'
    )
      body.price = String(incoming.price).trim();
    if (incoming.trading_window !== undefined)
      body.trading_window = incoming.trading_window;
    const upstream = await organizerFetch(
      `/portfolios/${id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      token,
    );
    const data = await readJson(upstream);
    if (upstream.status === 401) return unauthorized();
    if (!upstream.ok)
      return NextResponse.json(
        { detail: errorMessage(data, 'Unable to update this position.') },
        { status: upstream.status },
      );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { detail: 'The portfolio service is temporarily unavailable.' },
      { status: 502 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  if (!isTrustedOrigin(request))
    return NextResponse.json(
      { detail: 'Request origin is not allowed.' },
      { status: 403 },
    );
  const id = await contextId(context);
  if (!validId(id))
    return NextResponse.json(
      { detail: 'Invalid portfolio ID.' },
      { status: 400 },
    );
  const token = await getSessionToken();
  if (!token) return unauthorized();
  try {
    const upstream = await organizerFetch(
      `/portfolios/${id}`,
      { method: 'DELETE' },
      token,
    );
    if (upstream.status === 401) return unauthorized();
    if (upstream.status === 204) return new NextResponse(null, { status: 204 });
    const data = await readJson(upstream);
    return NextResponse.json(
      { detail: errorMessage(data, 'Unable to delete this position.') },
      { status: upstream.status },
    );
  } catch {
    return NextResponse.json(
      { detail: 'The portfolio service is temporarily unavailable.' },
      { status: 502 },
    );
  }
}
