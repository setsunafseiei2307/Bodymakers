import { resolveNutritionTarget } from './nutritionAdaptive/target';
import { summarizeIntake } from './today';
import type { BodymakersData, DailyLog } from './storage';

export interface WeeklyRecordSummary {
  weekStart: string;
  weekEnd: string;
  workoutDays: number;
  mealRecordDays: number;
  sleepRecordDays: number;
  proteinTargetDays: number | null;
  proteinTargetGrams: number | null;
  activeProgramCompletedSessions: number | null;
  activeProgramTotalSessions: number | null;
  latestWeightKg: number | null;
  previousWeightKg: number | null;
}

function dateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function weekWindow(today = new Date()): { start: string; end: string } {
  const date = new Date(today);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  const start = dateKey(date);
  date.setDate(date.getDate() + 6);
  return { start, end: dateKey(date) };
}

function hasWorkout(log: DailyLog): boolean {
  return log.exercises.length > 0 || log.doneExercises.length > 0 || log.muscles.length > 0;
}

/** 目標は共通の resolver から取る。画面ごとに別計算にしない。 */
function proteinTarget(data: BodymakersData): number | null {
  return resolveNutritionTarget(data)?.protein ?? null;
}

export function buildWeeklyRecordSummary(data: BodymakersData, today = new Date()): WeeklyRecordSummary {
  const { start, end } = weekWindow(today);
  const logs = data.dailyLogs.filter((log) => log.date >= start && log.date <= end);
  const target = proteinTarget(data);
  const weights = [...data.dailyLogs].filter((log) => log.weightKg != null).sort((a, b) => b.date.localeCompare(a.date));
  const program = data.activeProgram;
  return {
    weekStart: start,
    weekEnd: end,
    workoutDays: logs.filter(hasWorkout).length,
    mealRecordDays: logs.filter((log) => log.meals.length > 0 || log.manualIntake.kcal != null || log.manualIntake.protein != null).length,
    sleepRecordDays: logs.filter((log) => log.sleepHours != null).length,
    proteinTargetDays: target == null ? null : logs.filter((log) => (log.manualIntake.protein ?? summarizeIntake(log.meals).totals.protein) >= target).length,
    proteinTargetGrams: target,
    activeProgramCompletedSessions: program?.completedSessions ?? null,
    activeProgramTotalSessions: program ? program.daysPerWeek * program.durationWeeks : null,
    latestWeightKg: weights[0]?.weightKg ?? null,
    previousWeightKg: weights[1]?.weightKg ?? null,
  };
}
