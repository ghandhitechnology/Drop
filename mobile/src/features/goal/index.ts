export { GoalBar, GOAL_ROW_HEIGHT, type GoalBarProps } from './GoalBar';
export { GoalBlock } from './GoalBlock';
export { GoalScreen } from './GoalScreen';
export { DriverNote, type DriverNoteProps } from './DriverNote';
export {
  MIN_WEEKLY_LITRES,
  MAX_WEEKLY_LITRES,
  STEP_LITRES,
  SUGGESTION_SHARES,
  WEEKS_FOR_BASELINE,
  baselineFrom,
  clampGoal,
  initialGoalValue,
  parseGoalInput,
  progressFor,
  suggestionsFrom,
  type GoalProgress,
  type GoalStatus,
  type GoalSuggestion,
} from './goal';
export { baselineOf, progressOf, parseGoal, useGoalStore, type GoalState } from './store';
export { driverOf, findSwap, type Swap, type WeekDriver } from './suggest';
