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
    if (!/^[a-z0-9._-]{3,50}$/.test(username))
      return NextResponse.json(
        { detail: 'Use 3–50 letters, numbers, dots, underscores, or hyphens.' },
        { status: 400 },
      );
    if (password.length < 12 || password.length > 128)
      return NextResponse.json(
        { detail: 'Password must contain 12–128 characters.' },
        { status: 400 },
      );

    const registered = await organizerFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const registrationData = await readJson(registered);
    if (!registered.ok)
      return NextResponse.json(
        {
          detail: errorMessage(
            registrationData,
            'Unable to create the account.',
          ),
        },
        { status: registered.status },
      );

    const loggedIn = await organizerFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const loginData = await readJson(loggedIn);
    if (
      !loggedIn.ok ||
      Array.isArray(loginData) ||
      typeof loginData.access_token !== 'string'
    ) {
      return NextResponse.json(
        {
          detail: 'Account created. Sign in to continue.',
          accountCreated: true,
        },
        { status: 409 },
      );
    }

    const token = loginData as unknown as OrganizerToken;
    const response = NextResponse.json(
      { authenticated: true },
      { status: 201 },
    );
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
