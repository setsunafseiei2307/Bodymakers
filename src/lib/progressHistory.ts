/**
 * 過去数週の積み上げと、30日ぶんの振り返り。
 *
 * 週ごとの結果は保存しない。呼ばれるたびに記録から数え直す。
 * そうしておけば、あとから体重や記録を直したときに、
 * 古い集計だけが残って画面と食い違うことがない。
 *
 * 週の区切りは既存の週キー（月曜始まり）をそのまま使う。
 * 別の数え方をここで作らない。
 *
 * 体重や推定1RMの動きを「筋肉が増えた」「脂肪が減った」とは言わない。
 * 記録から数えられた事実だけを並べる。
 */

import { dateKey, daysBetweenKeys, recentDateKeys, shiftDateKey } from './activity/days';
import { dayActivity } from './activity/streak';
import { fmt } from './format';
import { periodKeyFor } from './nutritionAdaptive/target';
import type { BodymakersData } from './storage';
import { LIFT_IDS, LIFT_LABELS } from './training/adaptive';
import { strengthTrend } from './training/log';

/** 週の一覧で見せる週数。 */
export const WEEKLY_HISTORY_WEEKS = 6;
/** 振り返りの期間。 */
export const MONTHLY_WINDOW_DAYS = 30;

export interface WeekSummary {
  /** その週の月曜。 */
  weekKey: string;
  /** 表示用の範囲。 */
  label: string;
  activeDays: number;
  trainingSessions: number;
  nutritionCompleteDays: number;
  /** その週の体重平均。測定が無ければ null。 */
  averageWeightKg: number | null;
  /** その週に調整が起きたか。 */
  adjusted: boolean;
  isCurrentWeek: boolean;
  /** 記録が1つでもあるか。 */
  hasData: boolean;
}

function weekLabel(weekKey: string): string {
  const end = shiftDateKey(weekKey, 6);
  const short = (key: string) => key.slice(5).replace('-', '/');
  return `${short(weekKey)}〜${short(end)}`;
}

/**
 * 直近の数週をまとめる。新しい週が先頭。
 *
 * 記録がまったく無い週も並びを保つために返すが、hasData で区別できるようにする。
 * 0を実績のように見せないため、表示側はここを見る。
 */
export function weeklyHistory(
  data: BodymakersData,
  options: { weeks?: number; now?: Date } = {},
): WeekSummary[] {
  const weeks = Math.max(1, options.weeks ?? WEEKLY_HISTORY_WEEKS);
  const now = options.now ?? new Date();
  const today = dateKey(now);
  const currentWeekKey = periodKeyFor(today);
  if (currentWeekKey === '') return [];

  const summaries: WeekSummary[] = [];
  for (let index = 0; index < weeks; index += 1) {
    const weekKey = shiftDateKey(currentWeekKey, -7 * index);
    const days = new Set(recentDateKeys(shiftDateKey(weekKey, 6), 7));

    let activeDays = 0;
    let nutritionCompleteDays = 0;
    const weights: number[] = [];
    for (const log of data.dailyLogs) {
      if (!days.has(log.date)) continue;
      if (dayActivity(log).active) activeDays += 1;
      if (log.nutritionComplete) nutritionCompleteDays += 1;
      if (log.weightKg != null && Number.isFinite(log.weightKg) && log.weightKg > 20 && log.weightKg < 400) {
        weights.push(log.weightKg);
      }
    }

    const trainingSessions = data.trainingSessions.filter((session) => days.has(session.date)).length;
    const adjusted = data.trainingAdjustments.history.some((event) => days.has(event.date) && event.deltaKg !== 0)
      || data.nutritionAdjustments.history.some((event) => days.has(event.date) && event.deltaKcal !== 0);

    summaries.push({
      weekKey,
      label: weekLabel(weekKey),
      activeDays,
      trainingSessions,
      nutritionCompleteDays,
      averageWeightKg: weights.length === 0
        ? null
        : Math.round((weights.reduce((total, value) => total + value, 0) / weights.length) * 10) / 10,
      adjusted,
      isCurrentWeek: weekKey === currentWeekKey,
      hasData: activeDays > 0 || trainingSessions > 0,
    });
  }

  return summaries;
}

export interface Milestone {
  id: string;
  label: string;
  /** 達成した日。 */
  date: string;
}

export interface MonthlyProgress {
  /** 観測できた日数。使いはじめて間もなければ30より小さい。 */
  observedDays: number;
  activeDays: number;
  trainingSessions: number;
  nutritionCompleteDays: number;
  /** 期間の最初と最後の体重平均。 */
  weightFromKg: number | null;
  weightToKg: number | null;
  weightChangeKg: number | null;
  /** BIG3の推定1RMの動き。 */
  strength: { label: string; fromKg: number; toKg: number; deltaKg: number }[];
  /** 次回重量が動いた合計。 */
  liftOffsets: { label: string; offsetKg: number }[];
  adjustments: number;
  milestones: Milestone[];
  narrative: string[];
  /** 30日の振り返りを出せるだけの記録があるか。 */
  hasEnoughData: boolean;
}

/** 記録から確実に言えるものだけを節目にする。 */
function buildMilestones(data: BodymakersData): Milestone[] {
  const milestones: Milestone[] = [];

  const sessions = [...data.trainingSessions].sort((a, b) => a.date.localeCompare(b.date));
  if (sessions.length > 0) {
    milestones.push({ id: 'first-training', label: '最初のトレーニングを記録', date: sessions[0]!.date });
  }
  if (sessions.length >= 10) {
    milestones.push({ id: 'ten-sessions', label: 'トレーニング10回', date: sessions[9]!.date });
  }

  const activeDates = data.dailyLogs
    .filter((log) => dayActivity(log).active)
    .map((log) => log.date)
    .sort((a, b) => a.localeCompare(b));
  if (activeDates.length >= 30) {
    milestones.push({ id: 'thirty-active-days', label: '記録した日が30日', date: activeDates[29]! });
  }

  for (const program of data.programHistory) {
    milestones.push({ id: `program-${program.programId}`, label: 'Programを完走', date: program.completedAt.slice(0, 10) });
  }

  return milestones.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
}

function averageWeight(data: BodymakersData, dates: Set<string>): number | null {
  const values = data.dailyLogs
    .filter((log) => dates.has(log.date) && log.weightKg != null && Number.isFinite(log.weightKg) && log.weightKg > 20 && log.weightKg < 400)
    .map((log) => log.weightKg as number);
  if (values.length === 0) return null;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}

/**
 * この30日で何が積み上がったか。
 *
 * 出すのは数えられたことだけ。体重や推定1RMの動きから、
 * 身体の中で何が起きたかは判断しない。
 */
export function monthlyProgress(data: BodymakersData, now = new Date()): MonthlyProgress {
  const today = dateKey(now);
  const window = new Set(recentDateKeys(today, MONTHLY_WINDOW_DAYS));

  const activeDates = data.dailyLogs
    .filter((log) => dayActivity(log).active)
    .map((log) => log.date)
    .sort((a, b) => a.localeCompare(b));
  const firstActive = activeDates[0] ?? null;
  const observedDays = firstActive == null
    ? 0
    : Math.min(MONTHLY_WINDOW_DAYS, daysBetweenKeys(firstActive, today) + 1);

  const activeDays = activeDates.filter((date) => window.has(date)).length;
  const trainingSessions = data.trainingSessions.filter((session) => window.has(session.date)).length;
  const nutritionCompleteDays = data.dailyLogs.filter((log) => log.nutritionComplete && window.has(log.date)).length;

  // 期間の前半と後半で体重の平均を比べる。単日では見ない。
  const firstHalf = new Set(recentDateKeys(shiftDateKey(today, -Math.floor(MONTHLY_WINDOW_DAYS / 2)), Math.floor(MONTHLY_WINDOW_DAYS / 2)));
  const secondHalf = new Set(recentDateKeys(today, Math.floor(MONTHLY_WINDOW_DAYS / 2)));
  const weightFromKg = averageWeight(data, firstHalf);
  const weightToKg = averageWeight(data, secondHalf);
  const weightChangeKg = weightFromKg != null && weightToKg != null
    ? Math.round((weightToKg - weightFromKg) * 10) / 10
    : null;

  const strength: MonthlyProgress['strength'] = [];
  for (const lift of LIFT_IDS) {
    const points = strengthTrend(data.trainingSessions, lift, 60)
      .filter((point) => window.has(point.date) && point.estimatedOneRmKg != null);
    if (points.length < 2) continue;
    const from = points[0]!.estimatedOneRmKg!;
    const to = points.at(-1)!.estimatedOneRmKg!;
    if (to === from) continue;
    strength.push({ label: LIFT_LABELS[lift], fromKg: from, toKg: to, deltaKg: Math.round((to - from) * 10) / 10 });
  }

  const liftOffsets = LIFT_IDS
    .map((lift) => ({ label: LIFT_LABELS[lift], offsetKg: data.trainingAdjustments.lifts[lift]?.offsetKg ?? 0 }))
    .filter((item) => item.offsetKg !== 0);

  const adjustments = data.trainingAdjustments.history.filter((event) => window.has(event.date) && event.deltaKg !== 0).length
    + data.nutritionAdjustments.history.filter((event) => window.has(event.date) && event.deltaKcal !== 0).length;

  const hasEnoughData = observedDays >= 7 && activeDays >= 3;

  return {
    observedDays,
    activeDays,
    trainingSessions,
    nutritionCompleteDays,
    weightFromKg,
    weightToKg,
    weightChangeKg,
    strength: strength.slice(0, 3),
    liftOffsets,
    adjustments,
    milestones: buildMilestones(data),
    narrative: buildMonthlyNarrative({
      observedDays, activeDays, trainingSessions, nutritionCompleteDays,
      weightFromKg, weightToKg, weightChangeKg, liftOffsets, hasEnoughData,
    }),
    hasEnoughData,
  };
}

/** 最大4文。数えられたことだけを並べる。 */
function buildMonthlyNarrative(input: {
  observedDays: number;
  activeDays: number;
  trainingSessions: number;
  nutritionCompleteDays: number;
  weightFromKg: number | null;
  weightToKg: number | null;
  weightChangeKg: number | null;
  liftOffsets: { label: string; offsetKg: number }[];
  hasEnoughData: boolean;
}): string[] {
  if (!input.hasEnoughData) {
    return input.activeDays === 0
      ? ['記録がたまると、この30日で何が積み上がったかをまとめます。']
      : [`これまでに${input.activeDays}日記録しています。もう少し続くと、30日の振り返りを出せます。`];
  }

  const lines: string[] = [`この30日で${input.activeDays}日記録しました。`];

  if (input.trainingSessions > 0) {
    const raised = input.liftOffsets.filter((item) => item.offsetKg > 0);
    lines.push(raised.length > 0
      ? `トレーニングは${input.trainingSessions}回、${raised.map((item) => `${item.label}の次回重量は${fmt(item.offsetKg, 1)}kg`).join('、')}上がっています。`
      : `トレーニングは${input.trainingSessions}回記録しています。`);
  }

  if (input.nutritionCompleteDays > 0) {
    lines.push(`食事は${input.nutritionCompleteDays}日記録できています。`);
  }

  if (input.weightChangeKg != null && Math.abs(input.weightChangeKg) >= 0.1 && input.weightFromKg != null && input.weightToKg != null) {
    lines.push(`体重の平均は${fmt(input.weightFromKg, 1)}kgから${fmt(input.weightToKg, 1)}kgです。`);
  }

  return lines.slice(0, 4);
}
