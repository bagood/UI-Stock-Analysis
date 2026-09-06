import { cookies } from 'next/headers';
import { organizerFetch, OrganizerUser, SESSION_COOKIE } from './organizer';

export async function getSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<OrganizerUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const response = await organizerFetch('/auth/me', {}, token);
    if (!response.ok) return null;
    return (await response.json()) as OrganizerUser;
  } catch {
    return null;
  }
}

export function isTrustedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
