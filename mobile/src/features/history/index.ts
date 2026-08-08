/** The record: today's figure, the trend chart, the entries, and one entry. */

export { HistoryScreen } from './HistoryScreen';
export { EntryDetailScreen } from './EntryDetailScreen';
export { HistoryTab } from './HistoryTab';

export { TrendChart, type TrendChartProps } from './TrendChart';
export { TodayHeader, type TodayHeaderProps } from './TodayHeader';
export { EntryRow, type EntryRowProps } from './EntryRow';
export { DayHeader, type DayHeaderProps } from './DayHeader';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { UndoBar, type UndoBarProps } from './UndoBar';

export {
  MAX_BAR_WIDTH,
  MAX_TICKS,
  MIN_BAR_HEIGHT,
  MIN_BAR_WIDTH,
  layoutChart,
  niceMax,
  ticksFor,
  type ChartBar,
  type ChartLayout,
} from './chart';

export {
  HISTORY_LIMIT,
  UNDO_WINDOW_MS,
  groupByDay,
  useHistoryStore,
  type ChartRange,
  type DaySection,
  type HistoryState,
} from './store';

export {
  barDayName,
  dayHeading,
  litresShort,
  litresSpoken,
  longDate,
  parseDayKey,
  previousDayKey,
  quantityText,
  recordedAt,
  shortDate,
  timeOfDay,
  weekdayName,
  weekdayShort,
} from './format';
