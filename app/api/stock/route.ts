import { NextRequest, NextResponse } from 'next/server';

const API_ROOT = 'https://backend-production.stocknub.online/mcp';
const ALLOWED_ACTIONS = new Set(['recommendations', 'report', 'entry', 'hold']);

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action') ?? '';
  const rollingWindow = request.nextUrl.searchParams.get('rolling_window') ?? '';
  const ticker = (request.nextUrl.searchParams.get('ticker') ?? '').toUpperCase();

  if (!ALLOWED_ACTIONS.has(action) || !['5dd', '10dd'].includes(rollingWindow)) {
    return NextResponse.json({ detail: 'Invalid stock request.' }, { status: 400 });
  }
  if (action !== 'recommendations' && !/^[A-Z0-9.]{1,12}$/.test(ticker)) {
    return NextResponse.json({ detail: 'A valid ticker is required.' }, { status: 400 });
  }

  const paths: Record<string, string> = {
    recommendations: `/analysis?rolling_window=${rollingWindow}`,
    report: `/analysis/report?ticker=${encodeURIComponent(ticker)}&rolling_window=${rollingWindow}`,
    entry: `/analysis/entry_strategy?ticker=${encodeURIComponent(ticker)}&rolling_window=${rollingWindow}`,
    hold: `/analysis/hold_strategy?ticker=${encodeURIComponent(ticker)}&rolling_window=${rollingWindow}`,
  };

  try {
    const response = await fetch(`${API_ROOT}${paths[action]}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => ({ detail: 'The analysis service returned an unreadable response.' }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ detail: 'The analysis service is temporarily unavailable.' }, { status: 502 });
  }
}
