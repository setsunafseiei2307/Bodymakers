/**
 * 「その日、Bodymakersで意味のある記録をしたか」の判定と、その積み上げ。
 *
 * 新しい保存領域は作らない。すでに端末内にある日々の記録と
 * 完了したProgramの履歴だけから数える。ページを開いただけの日は数えない。
 *
 * 継続日数は「続いていることが分かる」ための数字であって、
 * 途切れさせないための仕掛けではない。だから今日まだ記録していなくても、
 * 昨日まで続いていれば継続は途切れていない扱いにする。
 * 1日はまだ終わっていないため。
 */

import type { BodymakersData, DailyLog } from '../storage';
import { dateKey, dateKeyFromISO, daysBetweenKeys, isDateKey, shiftDateKey } from './days';

export interface DayActivity {
  date: string;
  /** 筋トレ・運動の記録があるか。 */
  training: boolean;
  /** 食事・摂取の記録があるか。 */
  nutrition: boolean;
  /** 体重・歩数・睡眠のいずれかを記録したか。 */
  checkIn: boolean;
  /** いずれかがあれば活動日。 */
  active: boolean;
}

export function emptyDayActivity(date: string): DayActivity {
  return { date, training: false, nutrition: false, checkIn: false, active: false };
}

export function hasTraining(log: DailyLog): boolean {
  return log.exercises.length > 0 || log.doneExercises.length > 0 || log.muscles.length > 0;
}

export function hasNutrition(log: DailyLog): boolean {
  return log.meals.length > 0 || log.manualIntake.kcal != null || log.manualIntake.protein != null;
}

export function hasCheckIn(log: DailyLog): boolean {
  return log.weightKg != null || log.steps != null || log.sleepHours != null;
}

/** 1日ぶんの記録を、活動の内訳へ直す。中身が空の記録は活動日にしない。 */
export function dayActivity(log: DailyLog): DayActivity {
  const training = hasTraining(log);
  const nutrition = hasNutrition(log);
  const checkIn = hasCheckIn(log);
  return { date: log.date, training, nutrition, checkIn, active: training || nutrition || checkIn };
}

/**
 * 端末内データ全体から、日付ごとの活動を作る。
 * 完了したProgramの日も、その日のトレーニングとして数える。
 */
export function activityByDate(data: BodymakersData): Map<string, DayActivity> {
  const days = new Map<string, DayActivity>();

  for (const log of data.dailyLogs) {
    if (!isDateKey(log.date)) continue;
    const activity = dayActivity(log);
    if (!activity.active) continue;
    days.set(activity.date, activity);
  }

  for (const program of data.programHistory) {
    const date = dateKeyFromISO(program.completedAt);
    if (date == null) continue;
    const current = days.get(date) ?? emptyDayActivity(date);
    days.set(date, { ...current, training: true, active: true });
  }

  return days;
}

/** 活動日だけを古い順に並べた日付キー。 */
export function activeDateKeys(data: BodymakersData): string[] {
  return [...activityByDate(data).values()]
    .filter((day) => day.active)
    .map((day) => day.date)
    .sort((a, b) => a.localeCompare(b));
}

export interface ActivitySummary {
  todayActive: boolean;
  /**
   * 続いている日数。
   * 今日まだ記録していなくても、昨日まで続いていればその数を保つ。
   */
  currentStreak: number;
  longestStreak: number;
  activeDaysLast7: number;
  activeDaysLast30: number;
  totalActiveDays: number;
  lastActiveDate: string | null;
  firstActiveDate: string | null;
}

function countBackFrom(active: Set<string>, start: string): number {
  let count = 0;
  let cursor = start;
  while (active.has(cursor)) {
    count += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return count;
}

function countWithin(active: Set<string>, today: string, days: number): number {
  let count = 0;
  for (const date of active) {
    const distance = daysBetweenKeys(date, today);
    if (distance >= 0 && distance < days) count += 1;
  }
  return count;
}

function longestRun(sorted: readonly string[]): number {
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of sorted) {
    run = previous != null && daysBetweenKeys(previous, date) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }
  return longest;
}

export function summarizeActivity(data: BodymakersData, now = new Date()): ActivitySummary {
  const today = dateKey(now);
  const dates = activeDateKeys(data);
  const active = new Set(dates);

  const todayActive = active.has(today);
  // 今日がまだでも、昨日まで続いていれば継続中として扱う。
  const currentStreak = todayActive
    ? countBackFrom(active, today)
    : countBackFrom(active, shiftDateKey(today, -1));

  return {
    todayActive,
    currentStreak,
    longestStreak: longestRun(dates),
    activeDaysLast7: countWithin(active, today, 7),
    activeDaysLast30: countWithin(active, today, 30),
    totalActiveDays: dates.length,
    lastActiveDate: dates.at(-1) ?? null,
    firstActiveDate: dates[0] ?? null,
  };
}

/**
 * 継続日数の伝え方。
 * 0日でも「途切れた」「失敗」とは書かない。次に積み上げられることだけを伝える。
 */
export function streakMessage(summary: ActivitySummary): string {
  if (summary.currentStreak <= 0) return '今日からまた積み上げられます。';
  if (summary.todayActive) return `${summary.currentStreak}日続いています。`;
  return `${summary.currentStreak}日続いています。今日の記録でもう1日。`;
}
