import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/server/session';
import { backendUrl } from '@/lib/server/environment';

const ALLOWED_ACTIONS = new Set(['recommendations', 'report', 'entry', 'hold']);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { detail: 'Authentication required.' },
      { status: 401 },
    );
  const action = request.nextUrl.searchParams.get('action') ?? '';
  const rollingWindow =
    request.nextUrl.searchParams.get('rolling_window') ?? '';
  const ticker = (
    request.nextUrl.searchParams.get('ticker') ?? ''
  ).toUpperCase();

  if (
    !ALLOWED_ACTIONS.has(action) ||
    !['5dd', '10dd'].includes(rollingWindow)
  ) {
    return NextResponse.json(
      { detail: 'Invalid stock request.' },
      { status: 400 },
    );
  }
  if (action !== 'recommendations' && !/^[A-Z0-9.]{1,12}$/.test(ticker)) {
    return NextResponse.json(
      { detail: 'A valid ticker is required.' },
      { status: 400 },
    );
  }

  const paths: Record<string, string> = {
    recommendations: `/analysis?rolling_window=${rollingWindow}`,
    report: `/analysis/report?ticker=${encodeURIComponent(ticker)}&rolling_window=${rollingWindow}`,
    entry: `/entry_strategy/report?ticker=${encodeURIComponent(ticker)}&rolling_window=${rollingWindow}`,
    hold: `/hold_strategy/report?ticker=${encodeURIComponent(ticker)}&rolling_window=${rollingWindow}`,
  };

  try {
    const response = await fetch(
      `${backendUrl('AGENTIC_BASE_URL')}${paths[action]}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      },
    );
    const data = await response.json().catch(() => ({
      detail: 'The analysis service returned an unreadable response.',
    }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: 'The analysis service is temporarily unavailable.' },
      { status: 502 },
    );
  }
}
