export type AnalysisWindow = '5dd' | '10dd';
export type PortfolioWindow = '5-10dd' | '10-20dd';

export const WINDOW_LABELS: Record<AnalysisWindow, string> = {
  '5dd': '5–10 days',
  '10dd': '10–20 days',
};

export const toPortfolioWindow = (value: AnalysisWindow): PortfolioWindow =>
  value === '5dd' ? '5-10dd' : '10-20dd';

export const toAnalysisWindow = (value: PortfolioWindow): AnalysisWindow =>
  value === '5-10dd' ? '5dd' : '10dd';
