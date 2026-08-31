/** ダイエット計画と日次記録から、ダッシュボード用の進捗を作る純関数。 */

import { isFiniteNumber } from './format';
import type { DailyLog, SavedDietPlan } from './storage';

export interface PlanProgress {
  currentWeightKg: number;
  remainingKg: number;
  progressPercent: number;
  elapsedDays: number;
  remainingDays: number;
  expectedWeightKg: number;
  paceStatus: 'ahead' | 'on-track' | 'behind';
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from: Date, to: Date): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / day));
}

export function latestWeight(logs: readonly DailyLog[], fallback: number): number {
  const found = [...logs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((log) => log.weightKg != null && isFiniteNumber(log.weightKg));
  return found?.weightKg ?? fallback;
}

export function planProgress(
  plan: SavedDietPlan,
  logs: readonly DailyLog[],
  now = new Date(),
): PlanProgress | null {
  const created = new Date(plan.createdAt);
  const target = parseLocalDate(plan.targetDate);
  if (Number.isNaN(created.getTime()) || target == null) return null;

  const totalDays = Math.max(1, daysBetween(created, target));
  const elapsedDays = Math.min(totalDays, daysBetween(created, now));
  const remainingDays = Math.max(0, daysBetween(now, target));
  const currentWeightKg = latestWeight(logs, plan.startingWeightKg);
  const totalChange = plan.targetWeightKg - plan.startingWeightKg;
  const completedChange = currentWeightKg - plan.startingWeightKg;
  const rawProgress = totalChange === 0 ? 100 : (completedChange / totalChange) * 100;
  const progressPercent = Math.max(0, Math.min(100, rawProgress));
  const expectedWeightKg = plan.startingWeightKg + totalChange * (elapsedDays / totalDays);
  const tolerance = 0.5;
  const delta = plan.mode === 'cut'
    ? expectedWeightKg - currentWeightKg
    : currentWeightKg - expectedWeightKg;
  const paceStatus = delta > tolerance ? 'ahead' : delta < -tolerance ? 'behind' : 'on-track';

  return {
    currentWeightKg,
    remainingKg: plan.targetWeightKg - currentWeightKg,
    progressPercent,
    elapsedDays,
    remainingDays,
    expectedWeightKg,
    paceStatus,
  };
}

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export function weightTrend(logs: readonly DailyLog[], limit = 14): WeightPoint[] {
  return logs
    .filter((log): log is DailyLog & { weightKg: number } =>
      log.weightKg != null && isFiniteNumber(log.weightKg),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-Math.max(1, limit))
    .map((log) => ({ date: log.date, weightKg: log.weightKg }));
}
