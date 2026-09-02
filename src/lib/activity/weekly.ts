/**
 * 直近7日間の進捗と、その週の振り返り。
 *
 * 文章はすべて端末内の記録から機械的に組み立てる。外部APIには送らない。
 * 出すのは「数えられたこと」だけ。足りない項目は黙って省き、推測で埋めない。
 *
 * 体重や食事について、良い・悪いの評価や健康上の判断はしない。
 * 事実だけを並べて、続けるかどうかは本人が決められるようにする。
 */

import { fmt } from '../format';
import type { BodymakersData } from '../storage';
import { dateFromKey, dateKey, daysBetweenKeys, recentDateKeys, shiftDateKey, weekdayLabel } from './days';
import { activityByDate, emptyDayActivity, type DayActivity } from './streak';

/** 週の傾向を出すのに必要な観測日数。 */
export const WEEKLY_INSIGHT_DAYS = 7;

export interface WeekDay extends DayActivity {
  /** 曜日の1文字表記。 */
  weekday: string;
  isToday: boolean;
}

export interface WeeklyProgress {
  days: WeekDay[];
  activeDays: number;
  trainingDays: number;
  nutritionDays: number;
  checkInDays: number;
  total: number;
}

/** 今日で終わる直近7日ぶんの進捗。カレンダーの週ではなく、今日から数えた7日。 */
export function weeklyProgress(data: BodymakersData, now = new Date(), length = 7): WeeklyProgress {
  const today = dateKey(now);
  const byDate = activityByDate(data);
  const days: WeekDay[] = recentDateKeys(today, length).map((date) => {
    const activity = byDate.get(date) ?? emptyDayActivity(date);
    return { ...activity, weekday: weekdayLabel(date), isToday: date === today };
  });
  return {
    days,
    activeDays: days.filter((day) => day.active).length,
    trainingDays: days.filter((day) => day.training).length,
    nutritionDays: days.filter((day) => day.nutrition).length,
    checkInDays: days.filter((day) => day.checkIn).length,
    total: days.length,
  };
}

export interface WeeklySummaryLine {
  id: string;
  text: string;
}

export interface WeeklySummary {
  activeDays: number;
  /** 1つ前の7日間の活動日数。比べられない場合は null。 */
  previousActiveDays: number | null;
  /** 7日ぶん観測できているか。 */
  hasEnoughData: boolean;
  /** 傾向が見えるまであと何日か。 */
  daysUntilInsight: number;
  lines: WeeklySummaryLine[];
}

function weightDeltaLine(data: BodymakersData, now: Date): WeeklySummaryLine | null {
  const today = dateKey(now);
  const weights = data.dailyLogs
    .filter((log): log is typeof log & { weightKg: number } => log.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = weights.at(-1);
  if (latest == null) return null;

  // 7日前ちょうどが無いこともあるので、7〜13日前のいちばん新しい記録と比べる。
  const earlier = weights.filter((log) => {
    const distance = daysBetweenKeys(log.date, today);
    return distance >= 7 && distance <= 13;
  }).at(-1);
  if (earlier == null || earlier.date === latest.date) return null;

  const delta = latest.weightKg - earlier.weightKg;
  if (Math.abs(delta) < 0.05) {
    return { id: 'weight', text: `体重は${daysBetweenKeys(earlier.date, latest.date)}日前とほぼ同じです。` };
  }
  const sign = delta > 0 ? '+' : '−';
  return {
    id: 'weight',
    text: `体重は${daysBetweenKeys(earlier.date, latest.date)}日前から ${sign}${fmt(Math.abs(delta), 1)}kg です。`,
  };
}

function trainingLine(data: BodymakersData, current: WeeklyProgress): WeeklySummaryLine | null {
  if (current.trainingDays === 0) return null;
  const planned = data.activeProgram?.daysPerWeek ?? data.personalPlan?.input.training.daysPerWeek ?? null;
  if (planned == null) {
    return { id: 'training', text: `トレーニングは今週${current.trainingDays}日記録しました。` };
  }
  return {
    id: 'training',
    text: `トレーニングは予定${planned}回に対して${current.trainingDays}回記録しました。`,
  };
}

function nutritionLine(current: WeeklyProgress, previous: WeeklyProgress | null): WeeklySummaryLine | null {
  if (current.nutritionDays === 0) return null;
  if (previous == null) {
    return { id: 'nutrition', text: `食事は今週${current.nutritionDays}日記録しました。` };
  }
  const delta = current.nutritionDays - previous.nutritionDays;
  if (delta > 0) return { id: 'nutrition', text: `食事記録は先週より${delta}日多い${current.nutritionDays}日です。` };
  if (delta < 0) return { id: 'nutrition', text: `食事記録は先週より${Math.abs(delta)}日少ない${current.nutritionDays}日です。` };
  return { id: 'nutrition', text: `食事記録は先週と同じ${current.nutritionDays}日です。` };
}

/**
 * 直近7日の振り返り。
 * 観測が7日に満たないうちは、評価ではなく「あと何日で見えてくるか」を伝える。
 */
export function buildWeeklySummary(data: BodymakersData, now = new Date()): WeeklySummary {
  const today = dateKey(now);
  const current = weeklyProgress(data, now, 7);

  const byDate = activityByDate(data);
  const activeDates = [...byDate.values()].filter((day) => day.active).map((day) => day.date).sort();
  const firstActive = activeDates[0] ?? null;

  const observedDays = firstActive == null ? 0 : Math.min(WEEKLY_INSIGHT_DAYS, daysBetweenKeys(firstActive, today) + 1);
  const hasEnoughData = observedDays >= WEEKLY_INSIGHT_DAYS;
  const daysUntilInsight = Math.max(0, WEEKLY_INSIGHT_DAYS - observedDays);

  // 先週と比べられるのは、14日ぶん観測できているときだけ。
  const canCompare = firstActive != null && daysBetweenKeys(firstActive, today) + 1 >= 14;
  // 日付キーから正午のDateを作り直す。夏時間の日でも7日ちょうど戻せる。
  const previousEnd = dateFromKey(shiftDateKey(today, -7));
  const previous = canCompare && previousEnd != null ? weeklyProgress(data, previousEnd, 7) : null;

  const lines: WeeklySummaryLine[] = [];
  if (!hasEnoughData) {
    lines.push({
      id: 'more-data',
      text: firstActive == null
        ? '今日の記録から始めると、7日後に週の傾向が見えてきます。'
        : `あと${daysUntilInsight}日記録すると、週の傾向が見えてきます。`,
    });
    if (current.activeDays > 0) {
      lines.push({ id: 'active-days', text: `直近7日では${current.activeDays}日記録しています。` });
    }
    return {
      activeDays: current.activeDays,
      previousActiveDays: previous?.activeDays ?? null,
      hasEnoughData,
      daysUntilInsight,
      lines,
    };
  }

  lines.push({ id: 'active-days', text: `直近7日で${current.activeDays}日記録しました。` });
  const training = trainingLine(data, current);
  if (training) lines.push(training);
  const nutrition = nutritionLine(current, previous);
  if (nutrition) lines.push(nutrition);
  const weight = weightDeltaLine(data, now);
  if (weight) lines.push(weight);

  return {
    activeDays: current.activeDays,
    previousActiveDays: previous?.activeDays ?? null,
    hasEnoughData,
    daysUntilInsight,
    // 読みきれる量に抑える。
    lines: lines.slice(0, 4),
  };
}
