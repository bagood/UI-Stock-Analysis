import { NextResponse } from 'next/server';
import {
  errorMessage,
  OrganizerToken,
  organizerFetch,
  readJson,
  SESSION_COOKIE,
} from '@/lib/server/organizer';
import { isTrustedOrigin } from '@/lib/server/session';

export async function POST(request: Request) {
  if (!isTrustedOrigin(request))
    return NextResponse.json(
      { detail: 'Request origin is not allowed.' },
      { status: 403 },
    );
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const username = body.username?.trim().toLowerCase() ?? '';
    const password = body.password ?? '';
    if (!username || !password)
      return NextResponse.json(
        { detail: 'Username and password are required.' },
        { status: 400 },
      );

    const upstream = await organizerFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const data = await readJson(upstream);
    if (
      !upstream.ok ||
      Array.isArray(data) ||
      typeof data.access_token !== 'string'
    ) {
      return NextResponse.json(
        { detail: errorMessage(data, 'Unable to sign in.') },
        { status: upstream.status },
      );
    }

    const token = data as unknown as OrganizerToken;
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(SESSION_COOKIE, token.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(1, Math.min(token.expires_in, 1800)),
    });
    return response;
  } catch {
    return NextResponse.json(
      { detail: 'The account service is temporarily unavailable.' },
      { status: 502 },
    );
  }
}
