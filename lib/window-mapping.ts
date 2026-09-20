// API identifiers are shared by analysis reports and Organizer portfolios.
export type AnalysisWindow = '5dd' | '10dd';

export const WINDOW_LABELS: Record<AnalysisWindow, string> = {
  '5dd': '5 trading sessions',
  '10dd': '10 trading sessions',
};

export const isAnalysisWindow = (value: unknown): value is AnalysisWindow =>
  value === '5dd' || value === '10dd';
