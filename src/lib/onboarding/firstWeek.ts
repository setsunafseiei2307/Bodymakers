/**
 * 使いはじめの1週間。
 *
 * Adaptiveは記録が溜まってから動く。つまり Day 0〜3 のユーザーには
 * 体重の傾向も週のまとめも出せない。いちばん離れやすいのがその期間なので、
 * まだ判定できない間でも「いまどこにいて、次に何をすれば進むか」を返す。
 *
 * 新しい保存領域は作らない。Plan・日々の記録・トレーニングの記録から
 * その場で導き出す。だから記録を直せば、この判定もついてくる。
 *
 * 記録が少ないことを「未達」「サボった」とは扱わない。
 */

import { dateKey, daysBetweenKeys, recentDateKeys } from '../activity/days';
import { dayActivity, summarizeActivity } from '../activity/streak';
import { MIN_COMPLETED_NUTRITION_DAYS, MIN_WEIGHT_MEASUREMENTS } from '../nutritionAdaptive';
import type { BodymakersData } from '../storage';

/** 週のまとめを出せるようになる観測日数。 */
export const FIRST_WEEK_DAYS = 7;

/**
 * 使いはじめの段階。
 *
 * 画面の都合で細かく分けず、「次に見せるもの」が変わるところだけで区切る。
 */
export type UserStage =
  /** まだPlanが無い。 */
  | 'new'
  /** Planはできたが、まだ1つも記録していない。 */
  | 'plan-created'
  /** 最初の記録ができた。 */
  | 'first-action-done'
  /** 数日ぶん溜まってきた。 */
  | 'building-history'
  /** 週のまとめを出せる。 */
  | 'weekly-review-ready'
  /** 初週を越えて続いている。 */
  | 'established';

export interface FirstWeekStep {
  id: 'plan' | 'first-record' | 'few-days' | 'weekly-review';
  label: string;
  done: boolean;
  /** まだのときに出す一言。終わっていれば null。 */
  hint: string | null;
}

export interface FirstWeekProgress {
  stage: UserStage;
  /** 初週向けの表示を出すか。越えていれば false。 */
  isFirstWeek: boolean;
  /** 使いはじめてからの日数。まだ記録もPlanも無ければ null。 */
  daysSinceStart: number | null;
  /** これまでの活動日数。 */
  activeDays: number;
  steps: FirstWeekStep[];
  headline: string;
  detail: string;
  /** いま解放されていないものと、その条件。 */
  unlocks: FirstWeekUnlock[];
  /** 数日空けて戻ってきたか。 */
  returningAfterGap: boolean;
}

export interface FirstWeekUnlock {
  id: 'weight-trend' | 'nutrition-review' | 'weekly-review';
  label: string;
  /** 技術的な条件ではなく、次にやることの言い方で書く。 */
  hint: string;
}

/** 何日空いたら「久しぶり」として扱うか。 */
export const GAP_DAYS = 4;

/** いちばん古い記録の日付。Planの作成日も起点として見る。 */
function startDateKey(data: BodymakersData): string | null {
  const dates: string[] = [];
  for (const log of data.dailyLogs) {
    if (dayActivity(log).active) dates.push(log.date);
  }
  for (const session of data.trainingSessions) dates.push(session.date);
  const planDate = data.personalPlan == null ? null : isoToDateKey(data.personalPlan.createdAt);
  if (planDate != null) dates.push(planDate);
  if (dates.length === 0) return null;
  return dates.sort((a, b) => a.localeCompare(b))[0]!;
}

function isoToDateKey(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateKey(date);
}

function buildUnlocks(data: BodymakersData, now: Date): FirstWeekUnlock[] {
  const unlocks: FirstWeekUnlock[] = [];
  const window = new Set(recentDateKeys(dateKey(now), FIRST_WEEK_DAYS));

  const weighIns = data.dailyLogs.filter((log) => log.weightKg != null && window.has(log.date)).length;
  if (weighIns < MIN_WEIGHT_MEASUREMENTS) {
    const missing = MIN_WEIGHT_MEASUREMENTS - weighIns;
    unlocks.push({
      id: 'weight-trend',
      label: '体重の傾向',
      hint: `あと${missing}回ほど体重を記録すると、7日ごとの動きを見られます。`,
    });
  }

  const completed = data.dailyLogs.filter((log) => log.nutritionComplete && window.has(log.date)).length;
  if (completed < MIN_COMPLETED_NUTRITION_DAYS) {
    const missing = MIN_COMPLETED_NUTRITION_DAYS - completed;
    unlocks.push({
      id: 'nutrition-review',
      label: '食事の見直し',
      hint: `あと${missing}日ぶん食事を記録すると、目安を見直せます。`,
    });
  }

  return unlocks;
}

const STAGE_COPY: Record<UserStage, { headline: string; detail: string }> = {
  new: {
    headline: 'まずは現在地から',
    detail: '約2〜3分の診断で、今日やることと食事の目安が決まります。',
  },
  'plan-created': {
    headline: 'Planができました',
    detail: '今日ひとつ記録すると、Bodymakersがあなたに合わせはじめます。トレーニングでも食事でも体重でも大丈夫です。',
  },
  'first-action-done': {
    headline: '最初の記録ができました',
    detail: '今日はここまでで十分です。続けるほど、次の提案が自分向けになります。',
  },
  'building-history': {
    headline: 'データが溜まってきました',
    detail: 'もう少し記録がそろうと、週ごとの傾向をまとめられます。',
  },
  'weekly-review-ready': {
    headline: '最初のWeekly Reviewが見られます',
    detail: '今週の記録から、トレーニングと食事のまとめが出せるようになりました。',
  },
  established: {
    headline: '記録が積み上がっています',
    detail: '今週のまとめと、次の1週間の方針を確認できます。',
  },
};

/**
 * いまどの段階か。
 *
 * 「全部やらないと次へ進めない」形にはしない。
 * 記録が1つでもあれば first-action-done へ進む。
 */
export function buildFirstWeekProgress(data: BodymakersData, now = new Date()): FirstWeekProgress {
  const today = dateKey(now);
  const activity = summarizeActivity(data, now);
  const hasPlan = data.personalPlan != null || data.activeProgram != null || data.dietPlan != null;
  const start = startDateKey(data);
  const daysSinceStart = start == null ? null : Math.max(0, daysBetweenKeys(start, today));
  const observedDays = daysSinceStart == null ? 0 : Math.min(FIRST_WEEK_DAYS, daysSinceStart + 1);

  const hasFirstRecord = activity.totalActiveDays > 0;
  const hasFewDays = activity.totalActiveDays >= 3;
  const weeklyReady = observedDays >= FIRST_WEEK_DAYS && activity.totalActiveDays >= 3;

  let stage: UserStage;
  if (!hasPlan && !hasFirstRecord) stage = 'new';
  else if (!hasFirstRecord) stage = 'plan-created';
  else if (weeklyReady) stage = activity.totalActiveDays >= 7 ? 'established' : 'weekly-review-ready';
  else if (hasFewDays) stage = 'building-history';
  else stage = 'first-action-done';

  // 初週の表示は、7日ぶん観測できるまで。越えたら通常の画面へ渡す。
  const isFirstWeek = stage !== 'established' && observedDays < FIRST_WEEK_DAYS + 1;

  const steps: FirstWeekStep[] = [
    {
      id: 'plan',
      label: 'Planをつくる',
      done: hasPlan,
      hint: hasPlan ? null : '診断からはじめられます。',
    },
    {
      id: 'first-record',
      label: '最初の記録',
      done: hasFirstRecord,
      hint: hasFirstRecord ? null : 'トレーニング・食事・体重のどれか1つで大丈夫です。',
    },
    {
      id: 'few-days',
      label: '数日ぶんのデータ',
      done: hasFewDays,
      hint: hasFewDays ? null : `あと${Math.max(1, 3 - activity.totalActiveDays)}日記録すると、傾向が見えはじめます。`,
    },
    {
      id: 'weekly-review',
      label: '最初のWeekly Review',
      done: weeklyReady,
      hint: weeklyReady ? null : `あと${Math.max(1, FIRST_WEEK_DAYS - observedDays)}日ぶんで、週のまとめを出せます。`,
    },
  ];

  // 久しぶりに戻ってきた人。途切れたことは主役にしない。
  const gap = activity.lastActiveDate == null ? 0 : daysBetweenKeys(activity.lastActiveDate, today);
  const returningAfterGap = activity.totalActiveDays > 0 && gap >= GAP_DAYS;

  const copy = returningAfterGap
    ? { headline: 'おかえりなさい', detail: 'これまでの記録は残っています。今日からまた積み上げられます。' }
    : STAGE_COPY[stage];

  return {
    stage,
    isFirstWeek,
    daysSinceStart,
    activeDays: activity.totalActiveDays,
    steps,
    headline: copy.headline,
    detail: copy.detail,
    unlocks: buildUnlocks(data, now),
    returningAfterGap,
  };
}
