import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/server/organizer';
import { isTrustedOrigin } from '@/lib/server/session';

export async function POST(request: Request) {
  if (!isTrustedOrigin(request))
    return NextResponse.json(
      { detail: 'Request origin is not allowed.' },
      { status: 403 },
    );
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
