'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  BarChart3, BriefcaseBusiness, Check, CircleAlert, Clock3, LoaderCircle,
  MessageCircleMore, Pencil, Plus, RefreshCw, Send, Sparkles, Trash2, TrendingUp, WalletCards,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type WindowValue = '5dd' | '10dd';
type Position = { id: string; ticker: string; averagePrice: number; rollingWindow: WindowValue };
type DetailState = { status: 'loading' | 'ready' | 'error'; text?: string; error?: string };
type ChatMessage = { role: 'assistant' | 'user'; text: string };

const WINDOW_LABELS: Record<WindowValue, string> = { '5dd': '5–10 days', '10dd': '10–20 days' };
const STORAGE_KEY = 'stocknub-portfolio-v1';

async function getStockData(action: string, ticker: string, rollingWindow: WindowValue): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ action, rolling_window: rollingWindow });
  if (ticker) params.set('ticker', ticker);
  const response = await fetch(`/api/stock?${params}`);
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Unable to load this analysis.');
  return data;
}

function DetailPanel({ ticker, rollingWindow, action, title, cache, setCache }: {
  ticker: string; rollingWindow: WindowValue; action: 'entry' | 'report' | 'hold'; title: string;
  cache: Record<string, DetailState>; setCache: React.Dispatch<React.SetStateAction<Record<string, DetailState>>>;
}) {
  const key = `${action}:${ticker}:${rollingWindow}`;
  const detail = cache[key];
  const load = useCallback(async () => {
    if (cache[key]?.status === 'loading' || cache[key]?.status === 'ready') return;
    setCache((current) => ({ ...current, [key]: { status: 'loading' } }));
    try {
      const data = await getStockData(action, ticker, rollingWindow);
      const text = data.report ?? data.strategy ?? data.entry_strategy ?? data.hold_strategy;
      if (typeof text !== 'string' || !text) throw new Error('This strategy has not been published yet.');
      setCache((current) => ({ ...current, [key]: { status: 'ready', text } }));
    } catch (error) {
      setCache((current) => ({ ...current, [key]: { status: 'error', error: error instanceof Error ? error.message : 'Unable to load this analysis.' } }));
    }
  }, [action, cache, key, rollingWindow, setCache, ticker]);

  return (
    <Accordion onValueChange={(value) => value.length && void load()}>
      <AccordionItem value={key} className="rounded-xl border border-white/8 bg-[#081310] px-4">
        <AccordionTrigger className="min-h-12 no-underline hover:no-underline">{title}</AccordionTrigger>
        <AccordionContent>
          {detail?.status === 'loading' && <div className="space-y-2 py-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></div>}
          {detail?.status === 'error' && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/8 p-3 text-sm text-amber-100">
              <div className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" /><p>{detail.error}</p></div>
              <Button variant="ghost" size="sm" className="mt-2 text-amber-200" onClick={() => { setCache((c) => { const next = { ...c }; delete next[key]; return next; }); void load(); }}>Try again</Button>
            </div>
          )}
          {detail?.status === 'ready' && <div className="markdown max-h-[520px] overflow-y-auto pr-2"><ReactMarkdown>{detail.text}</ReactMarkdown></div>}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function WindowSelect({ value, onChange, label }: { value: WindowValue; onChange: (value: WindowValue) => void; label: string }) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      <Select value={value} onValueChange={(next) => onChange(next as WindowValue)}>
        <SelectTrigger className="h-11 w-full border-white/10 bg-[#0b1613]"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="5dd">5–10 trading days</SelectItem><SelectItem value="10dd">10–20 trading days</SelectItem></SelectContent>
      </Select>
    </div>
  );
}

export default function Home() {
  const [rollingWindow, setRollingWindow] = useState<WindowValue>('10dd');
  const [tickers, setTickers] = useState<string[]>([]);
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detailCache, setDetailCache] = useState<Record<string, DetailState>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioReady, setPortfolioReady] = useState(false);
  const [tickerInput, setTickerInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [portfolioWindow, setPortfolioWindow] = useState<WindowValue>('10dd');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [question, setQuestion] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: 'Ask about a recommended stock, its risk factors, or the positions in your portfolio.' }]);

  const loadRecommendations = useCallback(async () => {
    setListStatus('loading');
    try {
      const data = await getStockData('recommendations', '', rollingWindow);
      setTickers(Array.isArray(data.tickers) ? data.tickers : []);
      setListStatus('ready');
    } catch { setListStatus('error'); }
  }, [rollingWindow]);

  useEffect(() => { queueMicrotask(() => void loadRecommendations()); }, [loadRecommendations]);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setPositions(JSON.parse(saved));
      } catch { /* Ignore malformed device storage. */ }
      setPortfolioReady(true);
    });
  }, []);
  useEffect(() => { if (portfolioReady) localStorage.setItem(STORAGE_KEY, JSON.stringify(positions)); }, [portfolioReady, positions]);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: object, options?: object) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const update = (input: unknown) => {
      const item = input as Partial<Position>;
      const ticker = String(item.ticker ?? '').trim().toUpperCase();
      const averagePrice = Number(item.averagePrice);
      const window = item.rollingWindow;
      if (!/^[A-Z0-9.]{1,12}$/.test(ticker) || !(averagePrice > 0) || !window || !['5dd', '10dd'].includes(window)) throw new Error('Ticker, positive average price, and rolling window are required.');
      setPositions((current) => {
        const existing = current.find((p) => p.ticker === ticker && p.rollingWindow === window);
        if (existing) return current.map((p) => p.id === existing.id ? { ...p, averagePrice } : p);
        return [...current, { id: crypto.randomUUID(), ticker, averagePrice, rollingWindow: window }];
      });
      return { ticker, averagePrice, rollingWindow: window, status: 'saved' };
    };
    void Promise.resolve(modelContext.registerTool({ name: 'save_portfolio_position', title: 'Save portfolio position', description: 'Add or update one visible stock portfolio position.', inputSchema: { type: 'object', properties: { ticker: { type: 'string' }, averagePrice: { type: 'number', exclusiveMinimum: 0 }, rollingWindow: { type: 'string', enum: ['5dd', '10dd'] } }, required: ['ticker', 'averagePrice', 'rollingWindow'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: update }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const resetForm = () => { setTickerInput(''); setPriceInput(''); setPortfolioWindow('10dd'); setEditingId(null); setFormError(''); };
  const savePosition = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const ticker = tickerInput.trim().toUpperCase();
    const averagePrice = Number(priceInput);
    if (!/^[A-Z0-9.]{1,12}$/.test(ticker)) return setFormError('Enter a valid ticker using letters and numbers.');
    if (!(averagePrice > 0)) return setFormError('Average price must be greater than zero.');
    setPositions((current) => {
      const duplicate = current.find((p) => p.ticker === ticker && p.rollingWindow === portfolioWindow && p.id !== editingId);
      if (duplicate) return current.map((p) => p.id === duplicate.id ? { ...p, averagePrice } : p);
      if (editingId) return current.map((p) => p.id === editingId ? { ...p, ticker, averagePrice, rollingWindow: portfolioWindow } : p);
      return [...current, { id: crypto.randomUUID(), ticker, averagePrice, rollingWindow: portfolioWindow }];
    });
    resetForm();
  };
  const editPosition = (position: Position) => { setEditingId(position.id); setTickerInput(position.ticker); setPriceInput(String(position.averagePrice)); setPortfolioWindow(position.rollingWindow); setFormError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const knownTickers = useMemo(() => [...new Set([...tickers, ...positions.map((p) => p.ticker)])], [positions, tickers]);
  const askAssistant = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || chatBusy) return;
    setQuestion(''); setMessages((current) => [...current, { role: 'user', text: prompt }]); setChatBusy(true);
    const selectedTicker = knownTickers.find((ticker) => new RegExp(`\\b${ticker}\\b`, 'i').test(prompt));
    if (!selectedTicker) {
      setMessages((current) => [...current, { role: 'assistant', text: knownTickers.length ? `Name a ticker so I can ground the answer in its report. Available now: ${knownTickers.join(', ')}.` : 'No recommendations are available yet. Refresh the signal board and try again.' }]);
      setChatBusy(false); return;
    }
    const position = positions.find((p) => p.ticker === selectedTicker);
    const window = position?.rollingWindow ?? rollingWindow;
    try {
      const data = await getStockData('report', selectedTicker, window);
      const report = typeof data.report === 'string' ? data.report : '';
      const riskMatch = report.match(/## (?:10\. Risk matrix and controls|Risks?[^\n]*)\n([\s\S]*?)(?=\n## |$)/i);
      const summaryMatch = report.match(/## (?:11\. Final assessment|Integrated assessment|Final assessment)\n([\s\S]*?)(?=\n## |$)/i);
      const wantsRisk = /risk|downside|stop|loss/i.test(prompt);
      const excerpt = (wantsRisk ? riskMatch?.[1] : summaryMatch?.[1]) ?? report.slice(0, 2400);
      setMessages((current) => [...current, { role: 'assistant', text: `### ${selectedTicker} · ${WINDOW_LABELS[window]}\n\n${excerpt.trim()}\n\n*Answer grounded in the latest published StockNub report.*` }]);
    } catch (error) { setMessages((current) => [...current, { role: 'assistant', text: error instanceof Error ? error.message : 'I could not retrieve that report.' }]); }
    setChatBusy(false);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#07110f]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><TrendingUp className="size-5" /></span><div><p className="font-heading text-lg font-bold tracking-tight">StockNub</p><p className="text-xs text-muted-foreground">IDX decision desk</p></div></div>
          <Badge className="border-primary/25 bg-primary/10 text-primary"><span className="mr-1.5 size-1.5 rounded-full bg-primary" />Live research</Badge>
        </div>
      </header>

      <Tabs defaultValue="recommendations" className="mx-auto max-w-[1180px] px-5 py-6 md:px-8 md:py-9">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-xl border border-white/8 bg-[#101b18] p-1 md:w-fit" aria-label="Dashboard sections">
          <TabsTrigger value="recommendations" className="h-10 flex-1 px-3 md:flex-none md:px-4"><BarChart3 /> <span className="hidden sm:inline">Recommendations</span><span className="sm:hidden">Signals</span></TabsTrigger>
          <TabsTrigger value="portfolio" className="h-10 flex-1 px-3 md:flex-none md:px-4"><BriefcaseBusiness /> Portfolio</TabsTrigger>
          <TabsTrigger value="assistant" className="h-10 flex-1 px-3 md:flex-none md:px-4"><MessageCircleMore /> Assistant</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="pt-7">
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div><p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Signal board</p><h1 className="font-heading text-3xl font-bold tracking-[-0.03em] md:text-4xl">Recommended stocks</h1><p className="mt-2 max-w-xl text-base text-muted-foreground">Current research candidates, grouped by your preferred trading horizon.</p></div>
                <div className="flex items-center gap-2">
                  <Select value={rollingWindow} onValueChange={(value) => setRollingWindow(value as WindowValue)}><SelectTrigger className="h-10 min-w-40 border-white/10 bg-[#101b18]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="5dd">5–10 days</SelectItem><SelectItem value="10dd">10–20 days</SelectItem></SelectContent></Select>
                  <Button variant="outline" size="icon-lg" className="border-white/10 bg-[#101b18]" aria-label="Refresh recommendations" onClick={() => void loadRecommendations()} disabled={listStatus === 'loading'}><RefreshCw className={listStatus === 'loading' ? 'animate-spin' : ''} /></Button>
                </div>
              </div>

              {listStatus === 'loading' && <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-40 w-full rounded-2xl" />)}</div>}
              {listStatus === 'error' && <Empty className="min-h-72 border border-white/10 bg-card"><EmptyHeader><EmptyMedia variant="icon"><CircleAlert /></EmptyMedia><EmptyTitle>Recommendations are unavailable</EmptyTitle><EmptyDescription>The research service did not respond. Try again in a moment.</EmptyDescription></EmptyHeader><Button onClick={() => void loadRecommendations()}><RefreshCw /> Try again</Button></Empty>}
              {listStatus === 'ready' && tickers.length === 0 && <Empty className="min-h-72 border border-white/10 bg-card"><EmptyHeader><EmptyMedia variant="icon"><BarChart3 /></EmptyMedia><EmptyTitle>No signals in this window</EmptyTitle><EmptyDescription>There are no published recommendations for {WINDOW_LABELS[rollingWindow]}.</EmptyDescription></EmptyHeader></Empty>}
              {listStatus === 'ready' && <div className="space-y-3">{tickers.map((ticker, index) => (
                <article key={ticker} className="stock-card rounded-2xl border border-white/8 bg-card p-5">
                  <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-[#16231f] font-mono text-sm font-bold text-primary">{ticker.slice(0, 2)}</span><div><h2 className="font-heading text-xl font-bold tracking-tight">{ticker}</h2><p className="mt-1 text-sm text-muted-foreground">IDX · {WINDOW_LABELS[rollingWindow]} window</p></div></div><Badge variant="outline" className="border-primary/25 text-primary">#{String(index + 1).padStart(2, '0')}</Badge></div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2"><DetailPanel ticker={ticker} rollingWindow={rollingWindow} action="entry" title="Entry strategy" cache={detailCache} setCache={setDetailCache} /><DetailPanel ticker={ticker} rollingWindow={rollingWindow} action="report" title="Raw analysis" cache={detailCache} setCache={setDetailCache} /></div>
                </article>
              ))}</div>}
            </div>
            <aside className="h-fit rounded-2xl border border-primary/20 bg-primary/8 p-5 lg:sticky lg:top-24"><Sparkles className="mb-8 size-6 text-primary" /><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Window in focus</p><p className="mt-3 font-heading text-4xl font-bold tracking-[-0.04em]">{rollingWindow === '5dd' ? '5–10' : '10–20'}</p><p className="text-sm text-muted-foreground">trading sessions</p><div className="my-5 h-px bg-primary/20" /><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Published signals</span><strong>{tickers.length}</strong></div><p className="mt-5 text-sm leading-6 text-muted-foreground">Signals are research inputs, not guarantees. Review the full thesis and use position sizing that matches your risk limits.</p></aside>
          </section>
        </TabsContent>

        <TabsContent value="portfolio" className="pt-7">
          <div className="mb-6"><p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Position book</p><h1 className="font-heading text-3xl font-bold tracking-[-0.03em] md:text-4xl">Your portfolio</h1><p className="mt-2 text-base text-muted-foreground">Save an average entry price and attach the right holding horizon.</p></div>
          <form onSubmit={savePosition} className="mb-8 rounded-2xl border border-white/8 bg-card p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="font-heading text-lg font-bold">{editingId ? 'Update position' : 'Add a position'}</h2><p className="mt-1 text-sm text-muted-foreground">Portfolio data is stored on this device.</p></div>{editingId && <Button type="button" variant="ghost" onClick={resetForm}>Cancel edit</Button>}</div>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"><div className="space-y-2"><Label htmlFor="ticker">Stock ticker</Label><Input id="ticker" className="h-11 border-white/10 bg-[#0b1613] uppercase" placeholder="e.g. BNBR" value={tickerInput} onChange={(e) => setTickerInput(e.target.value.toUpperCase())} maxLength={12} /></div><div className="space-y-2"><Label htmlFor="average-price">Average price (IDR)</Label><Input id="average-price" className="h-11 border-white/10 bg-[#0b1613]" type="number" inputMode="decimal" min="0" step="any" placeholder="100" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} /></div><WindowSelect value={portfolioWindow} onChange={setPortfolioWindow} label="Trading window" /><Button type="submit" className="h-11 px-5">{editingId ? <Check /> : <Plus />}{editingId ? 'Update' : 'Add stock'}</Button></div>
            {formError && <p className="mt-3 text-sm text-red-300">{formError}</p>}
          </form>

          {!portfolioReady && <Skeleton className="h-52 w-full rounded-2xl" />}
          {portfolioReady && positions.length === 0 && <Empty className="min-h-72 border border-dashed border-white/12 bg-card/60"><EmptyHeader><EmptyMedia variant="icon"><WalletCards /></EmptyMedia><EmptyTitle>Your portfolio is empty</EmptyTitle><EmptyDescription>Add your first stock above to keep its hold strategy and analysis close at hand.</EmptyDescription></EmptyHeader></Empty>}
          <div className="grid gap-3">{positions.map((position) => (
            <article key={position.id} className="rounded-2xl border border-white/8 bg-card p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-[#16231f] font-mono text-sm font-bold text-primary">{position.ticker.slice(0, 2)}</span><div><h2 className="font-heading text-xl font-bold">{position.ticker}</h2><p className="mt-1 text-sm text-muted-foreground">Average IDR {position.averagePrice.toLocaleString('id-ID')} · {WINDOW_LABELS[position.rollingWindow]}</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => editPosition(position)}><Pencil /> Edit</Button><Button variant="destructive" size="sm" onClick={() => setDeleteId(position.id)}><Trash2 /> Delete</Button></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2"><DetailPanel ticker={position.ticker} rollingWindow={position.rollingWindow} action="hold" title="Hold strategy" cache={detailCache} setCache={setDetailCache} /><DetailPanel ticker={position.ticker} rollingWindow={position.rollingWindow} action="report" title="Raw analysis" cache={detailCache} setCache={setDetailCache} /></div>
            </article>
          ))}</div>
        </TabsContent>

        <TabsContent value="assistant" className="pt-7">
          <div className="mb-6"><p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Research desk</p><h1 className="font-heading text-3xl font-bold tracking-[-0.03em] md:text-4xl">Analysis assistant</h1><p className="mt-2 text-base text-muted-foreground">Ask a focused question and get an answer grounded in the published stock report.</p></div>
          <section className="overflow-hidden rounded-2xl border border-white/8 bg-card"><div className="flex items-center gap-3 border-b border-white/8 px-5 py-4"><span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="size-4" /></span><div><h2 className="font-heading font-bold">StockNub research assistant</h2><p className="text-xs text-muted-foreground">Report-grounded preview · full MCP chat connection pending</p></div></div>
            <div className="min-h-[420px] space-y-5 p-5 md:p-7">{messages.map((message, index) => <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 md:max-w-[72%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-white/8 bg-[#081310]'}`}><div className="markdown chat-markdown"><ReactMarkdown>{message.text}</ReactMarkdown></div></div></div>)}{chatBusy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Reading the latest report…</div>}</div>
            <div className="border-t border-white/8 p-4 md:p-5"><div className="mb-3 flex flex-wrap gap-2">{['What are the risks for BNBR?', 'Summarize BULL'].map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary">{suggestion}</button>)}</div><form onSubmit={askAssistant} className="flex items-end gap-2"><Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about a ticker, risk, or outlook…" className="min-h-12 resize-none border-white/10 bg-[#081310]" aria-label="Question for the research assistant" /><Button type="submit" size="icon-lg" className="size-12" disabled={!question.trim() || chatBusy} aria-label="Send question"><Send /></Button></form></div>
          </section>
        </TabsContent>
      </Tabs>

      <footer className="mx-auto flex max-w-[1180px] flex-col gap-2 border-t border-white/8 px-5 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8"><p>For research and education only. Not personalized financial advice.</p><p className="flex items-center gap-1.5"><Clock3 className="size-3.5" /> Analysis may be delayed from live market prices.</p></footer>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this position?</AlertDialogTitle><AlertDialogDescription>This removes the stock from this device&apos;s portfolio. The action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep position</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setPositions((current) => current.filter((p) => p.id !== deleteId)); if (editingId === deleteId) resetForm(); setDeleteId(null); }}>Delete position</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  );
}
