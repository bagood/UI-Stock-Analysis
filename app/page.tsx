'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  BarChart3,
  BriefcaseBusiness,
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageCircleMore,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  WINDOW_LABELS,
  toAnalysisWindow,
  toPortfolioWindow,
  type AnalysisWindow,
} from '@/lib/window-mapping';

type WindowValue = AnalysisWindow;
type Position = {
  id: string;
  ticker: string;
  averagePrice: string;
  rollingWindow: WindowValue;
};
type AuthUser = {
  id: string;
  username: string;
  is_active: boolean;
  created_at: string;
};
type DetailState = {
  status: 'loading' | 'ready' | 'error';
  text?: string;
  error?: string;
};
type ChatMessage = { role: 'assistant' | 'user'; text: string };

const STORAGE_KEY = 'stocknub-portfolio-v1';
const MIGRATION_DISMISSED_KEY = 'stocknub-portfolio-migration-dismissed';

async function getStockData(
  action: string,
  ticker: string,
  rollingWindow: WindowValue,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ action, rolling_window: rollingWindow });
  if (ticker) params.set('ticker', ticker);
  const response = await fetch(`/api/stock?${params}`);
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof data.detail === 'string'
        ? data.detail
        : 'Unable to load this analysis.',
    );
  return data;
}

function DetailPanel({
  ticker,
  rollingWindow,
  action,
  title,
  cache,
  setCache,
  expanded,
  onExpandedChange,
  className = '',
}: {
  ticker: string;
  rollingWindow: WindowValue;
  action: 'entry' | 'report' | 'hold';
  title: string;
  cache: Record<string, DetailState>;
  setCache: React.Dispatch<React.SetStateAction<Record<string, DetailState>>>;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
}) {
  const key = `${action}:${ticker}:${rollingWindow}`;
  const detail = cache[key];
  const load = useCallback(async () => {
    if (cache[key]?.status === 'loading' || cache[key]?.status === 'ready')
      return;
    setCache((current) => ({ ...current, [key]: { status: 'loading' } }));
    try {
      const data = await getStockData(action, ticker, rollingWindow);
      const text =
        data.report ??
        data.strategy ??
        data.entry_strategy ??
        data.hold_strategy;
      if (typeof text !== 'string' || !text)
        throw new Error('This strategy has not been published yet.');
      setCache((current) => ({ ...current, [key]: { status: 'ready', text } }));
    } catch (error) {
      setCache((current) => ({
        ...current,
        [key]: {
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Unable to load this analysis.',
        },
      }));
    }
  }, [action, cache, key, rollingWindow, setCache, ticker]);

  useEffect(() => {
    if (expanded && !detail) void load();
  }, [detail, expanded, load]);

  return (
    <Accordion
      value={expanded === undefined ? undefined : expanded ? [key] : []}
      onValueChange={(value) => {
        const isExpanded = value.length > 0;
        onExpandedChange?.(isExpanded);
        if (isExpanded) void load();
      }}
      className={className}
    >
      <AccordionItem
        value={key}
        className="rounded-xl border border-white/8 bg-[#081310] px-4"
      >
        <AccordionTrigger className="min-h-12 no-underline hover:no-underline">
          {title}
        </AccordionTrigger>
        <AccordionContent>
          {detail?.status === 'loading' && (
            <div className="space-y-2 py-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          )}
          {detail?.status === 'error' && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/8 p-3 text-sm text-amber-100">
              <div className="flex gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <p>{detail.error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-amber-200"
                onClick={() => {
                  setCache((c) => {
                    const next = { ...c };
                    delete next[key];
                    return next;
                  });
                  void load();
                }}
              >
                Try again
              </Button>
            </div>
          )}
          {detail?.status === 'ready' && (
            <div className="markdown max-h-[520px] overflow-y-auto pr-2">
              <ReactMarkdown>{detail.text}</ReactMarkdown>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

type AnalysisOption = {
  action: 'entry' | 'hold' | 'report';
  title: string;
};

function AnalysisWorkspace({
  stocks,
  options,
  detailCache,
  setDetailCache,
  emptyLabel,
  prominentSelector = false,
}: {
  stocks: Array<{ ticker: string; rollingWindow: WindowValue; subtitle?: string }>;
  options: [AnalysisOption, AnalysisOption];
  detailCache: Record<string, DetailState>;
  setDetailCache: React.Dispatch<React.SetStateAction<Record<string, DetailState>>>;
  emptyLabel: string;
  prominentSelector?: boolean;
}) {
  const [selectedTicker, setSelectedTicker] = useState('');
  const [openActions, setOpenActions] = useState<
    Array<AnalysisOption['action']>
  >([]);
  const activeTicker = stocks.some((stock) => stock.ticker === selectedTicker)
    ? selectedTicker
    : (stocks[0]?.ticker ?? '');
  const stock = stocks.find((item) => item.ticker === activeTicker);

  if (!stock) return null;

  const toggle = (action: AnalysisOption['action'], isExpanded: boolean) => {
    setOpenActions((current) =>
      isExpanded
        ? [...new Set([...current, action])]
        : current.filter((item) => item !== action),
    );
  };
  const bothOpen = options.every((option) => openActions.includes(option.action));
  const useEvenColumns = bothOpen || openActions.length === 0;

  return (
    <section className="rounded-2xl border border-white/8 bg-card p-5 md:p-6">
      <div
        className={`mb-5 flex flex-col gap-4 ${prominentSelector ? 'items-start' : 'justify-between sm:flex-row sm:items-end'}`}
      >
        {!prominentSelector && (
          <div>
            <Label htmlFor={`stock-select-${options[0].action}`}>Select stock</Label>
            {stock.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">
                {stock.subtitle}
              </p>
            )}
          </div>
        )}
        <Select
          value={activeTicker}
          onValueChange={(value) => value && setSelectedTicker(value)}
        >
          <SelectTrigger
            id={`stock-select-${options[0].action}`}
            className={
              prominentSelector
                ? 'h-auto min-h-16 w-full justify-between rounded-xl border-primary/20 bg-primary/8 px-5 font-heading text-2xl font-bold tracking-[-0.04em] text-foreground hover:bg-primary/12 sm:w-1/4'
                : 'h-11 w-full border-white/10 bg-[#0b1613] sm:w-64'
            }
            aria-label={prominentSelector ? 'Select recommendation stock' : undefined}
          >
            <SelectValue placeholder={emptyLabel} />
          </SelectTrigger>
          <SelectContent>
            {stocks.map((item) => (
              <SelectItem key={item.ticker} value={item.ticker}>
                {item.ticker}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className={`analysis-workspace ${useEvenColumns ? 'analysis-workspace--even' : ''}`}
      >
        {options.map((option) => {
          const isOpen = openActions.includes(option.action);
          return (
            <DetailPanel
              key={`${activeTicker}:${option.action}`}
              ticker={activeTicker}
              rollingWindow={stock.rollingWindow}
              action={option.action}
              title={option.title}
              cache={detailCache}
              setCache={setDetailCache}
              expanded={isOpen}
              onExpandedChange={(next) => toggle(option.action, next)}
              className={isOpen ? 'analysis-panel--active' : 'analysis-panel--compact'}
            />
          );
        })}
      </div>
    </section>
  );
}

function WindowSelect({
  value,
  onChange,
  label,
}: {
  value: WindowValue;
  onChange: (value: WindowValue) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as WindowValue)}
      >
        <SelectTrigger className="h-11 w-full border-white/10 bg-[#0b1613]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="5dd">5–10 trading days</SelectItem>
          <SelectItem value="10dd">10–20 trading days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: AuthUser) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError('');
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(normalizedUsername))
      return setError(
        'Use 3–50 letters, numbers, dots, underscores, or hyphens.',
      );
    if (password.length < 1 || password.length > 128)
      return setError('Enter your password.');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedUsername, password }),
      });
      const data = (await response.json()) as { detail?: string };
      if (!response.ok) throw new Error(data.detail ?? 'Unable to continue.');
      const session = await fetch('/api/auth/session');
      const sessionData = (await session.json()) as {
        user?: AuthUser;
        detail?: string;
      };
      if (!session.ok || !sessionData.user)
        throw new Error(sessionData.detail ?? 'Unable to verify the session.');
      onAuthenticated(sessionData.user);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The account service is unavailable.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <TrendingUp className="size-5" />
          </span>
          <div>
            <p className="font-heading text-xl font-bold tracking-tight">
              StockNub
            </p>
            <p className="text-xs text-muted-foreground">IDX decision desk</p>
          </div>
        </div>
        <section className="rounded-3xl border border-white/10 bg-card p-6 shadow-2xl shadow-black/20 md:p-8">
          <span className="mb-5 grid size-11 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <LockKeyhole className="size-5" />
          </span>
          <h1 className="font-heading text-3xl font-bold tracking-[-0.03em]">
            Welcome back
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sign in to access your private portfolio and research
          </p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-username">Username</Label>
              <Input
                id="auth-username"
                autoComplete="username"
                className="h-11 border-white/10 bg-[#081310]"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value.toLowerCase())
                }
                placeholder="Your Username"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                className="h-11 border-white/10 bg-[#081310]"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your Password"
                maxLength={128}
              />
            </div>
            {error && (
              <div className="flex gap-2 rounded-xl border border-red-400/20 bg-red-400/8 p-3 text-sm text-red-200">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LockKeyhole />
              )}
              {busy ? 'Please wait…' : 'Sign in'}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Dashboard({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const [rollingWindow, setRollingWindow] = useState<WindowValue>('10dd');
  const [tickers, setTickers] = useState<string[]>([]);
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [detailCache, setDetailCache] = useState<Record<string, DetailState>>(
    {},
  );
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioStatus, setPortfolioStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [savingPosition, setSavingPosition] = useState(false);
  const [legacyPositions, setLegacyPositions] = useState<Position[]>([]);
  const [importing, setImporting] = useState(false);
  const [tickerInput, setTickerInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [portfolioWindow, setPortfolioWindow] = useState<WindowValue>('10dd');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [question, setQuestion] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Ask about a recommended stock, its risk factors, or the positions in your portfolio.',
    },
  ]);

  const loadRecommendations = useCallback(async () => {
    setListStatus('loading');
    try {
      const data = await getStockData('recommendations', '', rollingWindow);
      setTickers(Array.isArray(data.tickers) ? data.tickers : []);
      setListStatus('ready');
    } catch {
      setListStatus('error');
    }
  }, [rollingWindow]);

  const loadPortfolio = useCallback(async () => {
    setPortfolioStatus('loading');
    try {
      const response = await fetch('/api/portfolio?offset=0&limit=50');
      if (response.status === 401) return onLogout();
      const data = (await response.json()) as unknown;
      if (!response.ok || !Array.isArray(data))
        throw new Error('Unable to load the portfolio.');
      setPositions(
        data.map((item) => {
          const row = item as {
            id: string;
            ticker: string;
            price: string;
            trading_window: '5-10dd' | '10-20dd';
          };
          return {
            id: row.id,
            ticker: row.ticker,
            averagePrice: row.price,
            rollingWindow: toAnalysisWindow(row.trading_window),
          };
        }),
      );
      setPortfolioStatus('ready');
    } catch {
      setPortfolioStatus('error');
    }
  }, [onLogout]);

  useEffect(() => {
    queueMicrotask(() => void loadRecommendations());
  }, [loadRecommendations]);
  useEffect(() => {
    queueMicrotask(() => void loadPortfolio());
  }, [loadPortfolio]);
  useEffect(() => {
    queueMicrotask(() => {
      if (localStorage.getItem(MIGRATION_DISMISSED_KEY)) return;
      try {
        const saved = JSON.parse(
          localStorage.getItem(STORAGE_KEY) ?? '[]',
        ) as Array<Record<string, unknown>>;
        const valid = saved
          .filter(
            (item) =>
              typeof item.ticker === 'string' &&
              Number(item.averagePrice) > 0 &&
              ['5dd', '10dd'].includes(String(item.rollingWindow)),
          )
          .map((item) => ({
            id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
            ticker: String(item.ticker).toUpperCase(),
            averagePrice: String(item.averagePrice),
            rollingWindow: item.rollingWindow as WindowValue,
          }));
        setLegacyPositions(valid);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    });
  }, []);

  useEffect(() => {
    const modelContext = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options?: object,
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const update = async (input: unknown) => {
      const item = input as Partial<Position>;
      const ticker = String(item.ticker ?? '')
        .trim()
        .toUpperCase();
      const averagePrice = Number(item.averagePrice);
      const window = item.rollingWindow;
      if (
        !/^[A-Z0-9.]{1,12}$/.test(ticker) ||
        !(averagePrice > 0) ||
        !window ||
        !['5dd', '10dd'].includes(window)
      )
        throw new Error(
          'Ticker, positive average price, and rolling window are required.',
        );
      const existing = positions.find((position) => position.ticker === ticker);
      const response = await fetch(
        existing ? `/api/portfolio/${existing.id}` : '/api/portfolio',
        {
          method: existing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker,
            price: String(averagePrice),
            trading_window: toPortfolioWindow(window),
          }),
        },
      );
      if (!response.ok) throw new Error('The position could not be saved.');
      await loadPortfolio();
      return { ticker, averagePrice, rollingWindow: window, status: 'saved' };
    };
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: 'save_portfolio_position',
          title: 'Save portfolio position',
          description: 'Add or update one visible stock portfolio position.',
          inputSchema: {
            type: 'object',
            properties: {
              ticker: { type: 'string' },
              averagePrice: { type: 'number', exclusiveMinimum: 0 },
              rollingWindow: { type: 'string', enum: ['5dd', '10dd'] },
            },
            required: ['ticker', 'averagePrice', 'rollingWindow'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: update,
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [loadPortfolio, positions]);

  const resetForm = () => {
    setTickerInput('');
    setPriceInput('');
    setPortfolioWindow('10dd');
    setEditingId(null);
    setFormError('');
  };
  const savePosition = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const ticker = tickerInput.trim().toUpperCase();
    const averagePrice = Number(priceInput);
    if (!/^[A-Z0-9.]{1,12}$/.test(ticker))
      return setFormError('Enter a valid ticker using letters and numbers.');
    if (!(averagePrice > 0))
      return setFormError('Average price must be greater than zero.');
    const duplicate = positions.find(
      (position) => position.ticker === ticker && position.id !== editingId,
    );
    if (duplicate)
      return setFormError(
        'This ticker is already in your portfolio. Edit the existing position instead.',
      );
    setSavingPosition(true);
    setFormError('');
    try {
      const response = await fetch(
        editingId ? `/api/portfolio/${editingId}` : '/api/portfolio',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker,
            price: priceInput.trim(),
            trading_window: toPortfolioWindow(portfolioWindow),
          }),
        },
      );
      const data =
        response.status === 204
          ? {}
          : ((await response.json()) as { detail?: string });
      if (response.status === 401) return onLogout();
      if (!response.ok)
        throw new Error(data.detail ?? 'Unable to save this position.');
      await loadPortfolio();
      resetForm();
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save this position.',
      );
    } finally {
      setSavingPosition(false);
    }
  };
  const editPosition = (position: Position) => {
    setEditingId(position.id);
    setTickerInput(position.ticker);
    setPriceInput(position.averagePrice);
    setPortfolioWindow(position.rollingWindow);
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deletePosition = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/portfolio/${deleteId}`, {
        method: 'DELETE',
      });
      if (response.status === 401) return onLogout();
      if (!response.ok) throw new Error('Unable to delete this position.');
      if (editingId === deleteId) resetForm();
      await loadPortfolio();
    } catch {
      setFormError('Unable to delete this position. Please try again.');
    } finally {
      setDeleteId(null);
    }
  };

  const importLegacyPortfolio = async () => {
    setImporting(true);
    setFormError('');
    const existingTickers = new Set(
      positions.map((position) => position.ticker),
    );
    let failed = 0;
    for (const position of legacyPositions) {
      if (existingTickers.has(position.ticker)) {
        failed += 1;
        continue;
      }
      const response = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: position.ticker,
          price: position.averagePrice,
          trading_window: toPortfolioWindow(position.rollingWindow),
        }),
      });
      if (!response.ok) failed += 1;
    }
    if (failed === 0) {
      localStorage.removeItem(STORAGE_KEY);
      setLegacyPositions([]);
    } else
      setFormError(
        `${failed} saved position${failed === 1 ? '' : 's'} could not be imported, usually because the ticker already exists.`,
      );
    await loadPortfolio();
    setImporting(false);
  };

  const knownTickers = useMemo(
    () => [...new Set([...tickers, ...positions.map((p) => p.ticker)])],
    [positions, tickers],
  );
  const askAssistant = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || chatBusy) return;
    setQuestion('');
    setMessages((current) => [...current, { role: 'user', text: prompt }]);
    setChatBusy(true);
    const selectedTicker = knownTickers.find((ticker) =>
      new RegExp(`\\b${ticker}\\b`, 'i').test(prompt),
    );
    if (!selectedTicker) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: knownTickers.length
            ? `Name a ticker so I can ground the answer in its report. Available now: ${knownTickers.join(', ')}.`
            : 'No recommendations are available yet. Refresh the signal board and try again.',
        },
      ]);
      setChatBusy(false);
      return;
    }
    const position = positions.find((p) => p.ticker === selectedTicker);
    const window = position?.rollingWindow ?? rollingWindow;
    try {
      const data = await getStockData('report', selectedTicker, window);
      const report = typeof data.report === 'string' ? data.report : '';
      const riskMatch = report.match(
        /## (?:10\. Risk matrix and controls|Risks?[^\n]*)\n([\s\S]*?)(?=\n## |$)/i,
      );
      const summaryMatch = report.match(
        /## (?:11\. Final assessment|Integrated assessment|Final assessment)\n([\s\S]*?)(?=\n## |$)/i,
      );
      const wantsRisk = /risk|downside|stop|loss/i.test(prompt);
      const excerpt =
        (wantsRisk ? riskMatch?.[1] : summaryMatch?.[1]) ??
        report.slice(0, 2400);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: `### ${selectedTicker} · ${WINDOW_LABELS[window]}\n\n${excerpt.trim()}\n\n*Answer grounded in the latest published StockNub report.*`,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text:
            error instanceof Error
              ? error.message
              : 'I could not retrieve that report.',
        },
      ]);
    }
    setChatBusy(false);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#07110f]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <TrendingUp className="size-5" />
            </span>
            <div>
              <p className="font-heading text-lg font-bold tracking-tight">
                StockNub
              </p>
              <p className="text-xs text-muted-foreground">IDX decision desk</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="hidden border-primary/25 bg-primary/10 text-primary sm:flex">
              <span className="mr-1.5 size-1.5 rounded-full bg-primary" />
              {user.username}
            </Badge>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <Tabs
        defaultValue="recommendations"
        className="mx-auto max-w-[1180px] px-5 py-6 md:px-8 md:py-9"
      >
        <TabsList
          className="h-auto w-full justify-start gap-1 rounded-xl border border-white/8 bg-[#101b18] p-1 md:w-fit"
          aria-label="Dashboard sections"
        >
          <TabsTrigger
            value="recommendations"
            className="h-10 flex-1 px-3 md:flex-none md:px-4"
          >
            <BarChart3 />{' '}
            <span className="hidden sm:inline">Recommendations</span>
            <span className="sm:hidden">Signals</span>
          </TabsTrigger>
          <TabsTrigger
            value="portfolio"
            className="h-10 flex-1 px-3 md:flex-none md:px-4"
          >
            <BriefcaseBusiness /> Portfolio
          </TabsTrigger>
          <TabsTrigger
            value="assistant"
            className="h-10 flex-1 px-3 md:flex-none md:px-4"
          >
            <MessageCircleMore /> Assistant
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="pt-7">
          <section>
            <div className="mb-6">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                Signal board
              </p>
              <h1 className="font-heading text-3xl font-bold tracking-[-0.03em] md:text-4xl">
                Recommended stocks
              </h1>

              <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-stretch">
                <Select
                  value={rollingWindow}
                  onValueChange={(value) =>
                    setRollingWindow(value as WindowValue)
                  }
                >
                  <SelectTrigger
                    className="h-auto min-h-24 w-full flex-1 rounded-2xl border-primary/20 bg-primary/8 px-5 py-4 hover:bg-primary/12 md:w-auto"
                    aria-label="Select window in focus"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-4 text-left">
                      <Sparkles className="size-6 shrink-0 text-primary" />
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
                          Window in focus
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                          <p className="font-heading text-3xl font-bold tracking-[-0.04em] text-foreground">
                            {rollingWindow === '5dd' ? '5–10' : '10–20'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Trading Sessions
                          </p>
                        </div>
                      </div>
                      <div className="ml-auto border-l border-primary/20 pl-5 text-right">
                        <strong className="block text-xl text-foreground">
                          {tickers.length}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          Published Signals
                        </span>
                      </div>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5dd">
                      5–10 Trading Sessions
                    </SelectItem>
                    <SelectItem value="10dd">
                      10–20 Trading Sessions
                    </SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex gap-3 md:shrink-0">
                  <Button
                    variant="outline"
                    className="h-auto min-h-20 flex-1 justify-between rounded-2xl border-primary/20 bg-primary/8 px-5 text-left hover:bg-primary/15 md:min-h-24 md:w-44 md:flex-none"
                    aria-label="Refresh recommendations"
                    onClick={() => void loadRecommendations()}
                    disabled={listStatus === 'loading'}
                  >
                    <span>
                      <span className="block font-mono text-xs uppercase tracking-[0.16em] text-primary">
                        Signals
                      </span>
                      <span className="mt-1 block font-heading text-xl font-bold tracking-[-0.03em] text-foreground">
                        Refresh
                      </span>
                    </span>
                    <RefreshCw
                      className={`size-5 text-primary ${listStatus === 'loading' ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </div>
              </div>

              <div className="mt-7">
                {listStatus === 'loading' && (
                  <div className="space-y-3">
                    {[0, 1, 2].map((item) => (
                      <Skeleton key={item} className="h-40 w-full rounded-2xl" />
                    ))}
                  </div>
                )}
                {listStatus === 'error' && (
                  <Empty className="min-h-72 border border-white/10 bg-card">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CircleAlert />
                      </EmptyMedia>
                      <EmptyTitle>Recommendations are unavailable</EmptyTitle>
                      <EmptyDescription>
                        The research service did not respond. Try again in a
                        moment.
                      </EmptyDescription>
                    </EmptyHeader>
                    <Button onClick={() => void loadRecommendations()}>
                      <RefreshCw /> Try again
                    </Button>
                  </Empty>
                )}
                {listStatus === 'ready' && tickers.length === 0 && (
                  <Empty className="min-h-72 border border-white/10 bg-card">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BarChart3 />
                      </EmptyMedia>
                      <EmptyTitle>No signals in this window</EmptyTitle>
                      <EmptyDescription>
                        There are no published recommendations for{' '}
                        {WINDOW_LABELS[rollingWindow]}.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                {listStatus === 'ready' && (
                  <AnalysisWorkspace
                    stocks={tickers.map((ticker) => ({
                      ticker,
                      rollingWindow,
                    }))}
                    options={[
                      { action: 'entry', title: 'Entry Strategy' },
                      { action: 'report', title: 'Raw Analysis' },
                    ]}
                    detailCache={detailCache}
                    setDetailCache={setDetailCache}
                    emptyLabel="Select a recommendation"
                    prominentSelector
                  />
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="portfolio" className="pt-7">
          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Position book
            </p>
            <h1 className="font-heading text-3xl font-bold tracking-[-0.03em] md:text-4xl">
              Your portfolio
            </h1>
          </div>
          {legacyPositions.length > 0 && (
            <div className="mb-5 flex flex-col justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/8 p-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-heading font-bold">
                  Import {legacyPositions.length} position
                  {legacyPositions.length === 1 ? '' : 's'} from this device?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Move your earlier local portfolio into your private account.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    localStorage.setItem(MIGRATION_DISMISSED_KEY, '1');
                    setLegacyPositions([]);
                  }}
                >
                  Not now
                </Button>
                <Button
                  onClick={() => void importLegacyPortfolio()}
                  disabled={importing}
                >
                  {importing ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <WalletCards />
                  )}{' '}
                  Import
                </Button>
              </div>
            </div>
          )}
          <form
            onSubmit={savePosition}
            className="mb-8 rounded-2xl border border-white/8 bg-card p-5 md:p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold">
                  {editingId ? 'Update position' : 'Add a position'}
                </h2>
              </div>
              {editingId && (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel edit
                </Button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="ticker">Stock ticker</Label>
                <Input
                  id="ticker"
                  className="h-11 border-white/10 bg-[#0b1613] uppercase"
                  placeholder="E.g. BNBR"
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  maxLength={12}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="average-price">Average price (IDR)</Label>
                <Input
                  id="average-price"
                  className="h-11 border-white/10 bg-[#0b1613]"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.0001"
                  placeholder="100.0000"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                />
              </div>
              <WindowSelect
                value={portfolioWindow}
                onChange={setPortfolioWindow}
                label="Trading window"
              />
              <Button
                type="submit"
                className="h-11 px-5"
                disabled={savingPosition}
              >
                {savingPosition ? (
                  <LoaderCircle className="animate-spin" />
                ) : editingId ? (
                  <Check />
                ) : (
                  <Plus />
                )}
                {savingPosition
                  ? 'Saving…'
                  : editingId
                    ? 'Update'
                    : 'Add stock'}
              </Button>
            </div>
            {formError && (
              <p className="mt-3 text-sm text-red-300">{formError}</p>
            )}
          </form>

          {portfolioStatus === 'loading' && (
            <Skeleton className="h-52 w-full rounded-2xl" />
          )}
          {portfolioStatus === 'error' && (
            <Empty className="min-h-72 border border-white/10 bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleAlert />
                </EmptyMedia>
                <EmptyTitle>Portfolio is unavailable</EmptyTitle>
                <EmptyDescription>
                  The account service did not respond. Your saved records have
                  not been changed.
                </EmptyDescription>
              </EmptyHeader>
              <Button onClick={() => void loadPortfolio()}>
                <RefreshCw /> Try again
              </Button>
            </Empty>
          )}
          {portfolioStatus === 'ready' && positions.length === 0 && (
            <Empty className="min-h-72 border border-dashed border-white/12 bg-card/60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WalletCards />
                </EmptyMedia>
                <EmptyTitle>Your portfolio is empty</EmptyTitle>
                <EmptyDescription>
                  Add your first stock above to keep its hold strategy and
                  analysis close at hand.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <div className="grid gap-3">
            {positions.map((position) => (
              <article
                key={position.id}
                className="rounded-2xl border border-white/8 bg-card p-5"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4">
                    <span className="grid size-12 place-items-center rounded-xl bg-[#16231f] font-mono text-sm font-bold text-primary">
                      {position.ticker.slice(0, 2)}
                    </span>
                    <div>
                      <h2 className="font-heading text-xl font-bold">
                        {position.ticker}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Average IDR{' '}
                        {Number(position.averagePrice).toLocaleString('id-ID', {
                          maximumFractionDigits: 4,
                        })}{' '}
                        · {WINDOW_LABELS[position.rollingWindow]}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => editPosition(position)}
                    >
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteId(position.id)}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {portfolioStatus === 'ready' && positions.length > 0 && (
            <div className="mt-6">
              <AnalysisWorkspace
                stocks={positions.map((position) => ({
                  ticker: position.ticker,
                  rollingWindow: position.rollingWindow,
                  subtitle: `Average IDR ${Number(position.averagePrice).toLocaleString('id-ID', { maximumFractionDigits: 4 })} · ${WINDOW_LABELS[position.rollingWindow]}`,
                }))}
                options={[
                  { action: 'hold', title: 'Hold strategy' },
                  { action: 'report', title: 'Raw analysis' },
                ]}
                detailCache={detailCache}
                setDetailCache={setDetailCache}
                emptyLabel="Select a portfolio stock"
                prominentSelector
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="assistant" className="pt-7">
          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Research desk
            </p>
            <h1 className="font-heading text-3xl font-bold tracking-[-0.03em] md:text-4xl">
              Analysis assistant
            </h1>
          </div>
          <section className="overflow-hidden rounded-2xl border border-white/8 bg-card">
            <div className="min-h-[420px] space-y-5 p-5 md:p-7">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 md:max-w-[72%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-white/8 bg-[#081310]'}`}
                  >
                    <div className="markdown chat-markdown">
                      <ReactMarkdown>{message.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {chatBusy && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Reading the
                  latest report…
                </div>
              )}
            </div>
            <div className="border-t border-white/8 p-4 md:p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {['What are the risks for BNBR?', 'Summarize BULL'].map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setQuestion(suggestion)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary"
                    >
                      {suggestion}
                    </button>
                  ),
                )}
              </div>
              <form onSubmit={askAssistant} className="flex items-end gap-2">
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about a ticker, risk, or outlook…"
                  className="min-h-12 resize-none border-white/10 bg-[#081310]"
                  aria-label="Question for the research assistant"
                />
                <Button
                  type="submit"
                  size="icon-lg"
                  className="size-12"
                  disabled={!question.trim() || chatBusy}
                  aria-label="Send question"
                >
                  <Send />
                </Button>
              </form>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <footer className="mx-auto flex max-w-[1180px] flex-col gap-2 border-t border-white/8 px-5 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <p>
          For research and education only. Not personalized financial advice
        </p>
        <p className="flex items-center gap-1.5">
          <Clock3 className="size-3.5" /> Analysis may be delayed from live
          market prices
        </p>
      </footer>

      <AlertDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this position?</AlertDialogTitle>
            <AlertDialogDescription className="normal-case">
              This permanently removes the stock from your account portfolio.
              The action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-white">
              Keep position
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void deletePosition()}
            >
              Delete position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<
    'loading' | 'authenticated' | 'anonymous'
  >('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store',
        });
        const data = (await response.json()) as { user?: AuthUser };
        if (response.ok && data.user) {
          setUser(data.user);
          setAuthStatus('authenticated');
        } else setAuthStatus('anonymous');
      } catch {
        setAuthStatus('anonymous');
      }
    });
  }, []);

  const logout = useCallback(() => {
    void fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      setUser(null);
      setAuthStatus('anonymous');
    });
  }, []);

  if (authStatus === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <TrendingUp className="size-5" />
          </span>
          <LoaderCircle className="mx-auto size-5 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            Securing your workspace…
          </p>
        </div>
      </main>
    );
  }
  if (!user || authStatus === 'anonymous')
    return (
      <AuthScreen
        onAuthenticated={(nextUser) => {
          setUser(nextUser);
          setAuthStatus('authenticated');
        }}
      />
    );
  return <Dashboard user={user} onLogout={logout} />;
}
