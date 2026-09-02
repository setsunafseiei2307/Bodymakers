/**
 * 食事と体重の記録から、目標カロリーを見直す。
 *
 * 【栄養はトレーニングより慎重に扱う】
 * 体重は水分や食事のタイミングで1〜2kg簡単に動く。1日の値で目標を変えると、
 * ノイズに反応して増やしたり減らしたりを繰り返すことになる。
 * だからここでは、
 *   ・直近7日の平均 と その前7日の平均 を比べる
 *   ・どちらの窓にも十分な測定回数がある場合だけ判断する
 *   ・記録が足りない期間は「データを集めている」として何も変えない
 * という順で、判断できないときは判断しないことを優先する。
 *
 * 【記録していない日を「食べていない日」にしない】
 * 食品を1つ入れただけの日を1日ぶんの記録として数えると、平均が実際より
 * ずっと低く出る。判定に使うのは、本人が「今日の記録は揃った」と印を付けた日
 * （DailyLog.nutritionComplete）だけにする。
 *
 * 【Planは書き換えない】
 * Trainingと同じ考え方で、Planが出したカロリーはbaselineのまま残し、
 * ここでは offsetKcal だけを持つ。目標を戻すのも、Planを作り直すのも安全にできる。
 *
 * ここは医学的な判断をしない。体重の増減について良い・悪いを言わない。
 */

import { dateKey, daysBetweenKeys, recentDateKeys, shiftDateKey } from '../activity/days';
import type { BodymakersData, DailyLog } from '../storage';
import { summarizeIntake } from '../today';

/** 1回の変更幅。小さく、何度も見直せる大きさにする。 */
export const CALORIE_STEP_KCAL = 100;

/** 積み上がりの上限。Planから大きく離れないための保守的な範囲。 */
export const MAX_OFFSET_KCAL = 300;
export const MIN_OFFSET_KCAL = -300;

/** 片方の窓に必要な体重の測定回数。 */
export const MIN_WEIGHT_MEASUREMENTS = 4;

/** 判定に使う1つの窓の長さ。 */
export const TREND_WINDOW_DAYS = 7;

/** 食事記録が揃ったと印を付けた日が、7日のうち何日必要か。 */
export const MIN_COMPLETED_NUTRITION_DAYS = 4;

/**
 * 目標カロリーにどれだけ近ければ「概ね沿っている」とみなすか。
 * 医学的な基準ではなく、記録が目標に沿っているかを見るための社内の目安。
 */
export const NEAR_TARGET_RATIO = 0.1;

/** 目標に沿っていたと言うために必要な日数。 */
export const MIN_NEAR_TARGET_DAYS = 3;

/**
 * 体重が「ほぼ横ばい」と見なす幅。体重に対する割合で見る。
 * これは推奨される減量速度ではなく、日々のノイズに反応しないための幅。
 */
export const WEIGHT_NOISE_RATIO = 0.004;

/**
 * 目標カロリーを機械的に下回らせない値。target.ts のクランプと同じ。
 *
 * これは「ここまで下げてよい」という値ではない。
 * 計算結果が壊れないための下限であって、健康上の最低量ではない。
 */
export const RESOLVED_CALORIE_FLOOR = 800;

/**
 * 自動の引き下げをやめる位置。
 *
 * 下限まで1段階を切ったら、そこから先は数字をいじらず、
 * Planそのものを見直してもらう。Bodymakersは必要な摂取量を診断しない。
 */
export const LOW_TARGET_STOP_KCAL = RESOLVED_CALORIE_FLOOR + CALORIE_STEP_KCAL;

export interface WeightTrend {
  currentAverageKg: number | null;
  previousAverageKg: number | null;
  changeKg: number | null;
  changePercent: number | null;
  currentCount: number;
  previousCount: number;
  enoughData: boolean;
}

function usableWeight(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 20 && value < 400;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * 直近7日と、その前7日の体重平均を比べる。
 *
 * 保存済みの体重は書き換えず、毎回その場で数え直す。
 * 過去の記録を直したときも、古い集計が残って食い違うことがない。
 */
export function weightTrend(logs: readonly DailyLog[], now = new Date()): WeightTrend {
  const today = dateKey(now);
  const currentWindow = new Set(recentDateKeys(today, TREND_WINDOW_DAYS));
  const previousWindow = new Set(recentDateKeys(shiftDateKey(today, -TREND_WINDOW_DAYS), TREND_WINDOW_DAYS));

  // 同じ日が複数あっても1つに寄せる。未来日と読めない日付は使わない。
  const byDate = new Map<string, number>();
  for (const log of logs) {
    if (!usableWeight(log.weightKg)) continue;
    if (daysBetweenKeys(log.date, today) < 0) continue;
    byDate.set(log.date, log.weightKg);
  }

  const current: number[] = [];
  const previous: number[] = [];
  for (const [date, weightKg] of byDate) {
    if (currentWindow.has(date)) current.push(weightKg);
    else if (previousWindow.has(date)) previous.push(weightKg);
  }

  const currentAverageKg = average(current);
  const previousAverageKg = average(previous);
  const enoughData = current.length >= MIN_WEIGHT_MEASUREMENTS && previous.length >= MIN_WEIGHT_MEASUREMENTS;
  const changeKg = currentAverageKg != null && previousAverageKg != null
    ? Math.round((currentAverageKg - previousAverageKg) * 100) / 100
    : null;

  return {
    currentAverageKg: currentAverageKg == null ? null : Math.round(currentAverageKg * 100) / 100,
    previousAverageKg: previousAverageKg == null ? null : Math.round(previousAverageKg * 100) / 100,
    changeKg,
    changePercent: changeKg != null && previousAverageKg != null && previousAverageKg > 0
      ? Math.round((changeKg / previousAverageKg) * 10000) / 100
      : null,
    currentCount: current.length,
    previousCount: previous.length,
    enoughData,
  };
}

/** 体重がほぼ動いていないと見なすか。 */
export function isFlat(trend: WeightTrend): boolean {
  if (trend.changeKg == null || trend.currentAverageKg == null) return true;
  return Math.abs(trend.changeKg) < trend.currentAverageKg * WEIGHT_NOISE_RATIO;
}

export interface NutritionAdherence {
  /** 「記録が揃った」と印を付けた日の数。 */
  completedDays: number;
  averageCalories: number | null;
  averageProtein: number | null;
  targetCalories: number | null;
  targetProtein: number | null;
  daysNearCalorieTarget: number;
  daysMeetingProteinTarget: number;
  enoughData: boolean;
  /** 記録が概ね目標に沿っていたか。 */
  onTrack: boolean;
}

/** その日の摂取。手入力があればそれを優先する。 */
export function caloriesForLog(log: DailyLog): { kcal: number; protein: number } {
  const totals = summarizeIntake(log.meals).totals;
  return {
    kcal: log.manualIntake.kcal ?? totals.kcal,
    protein: log.manualIntake.protein ?? totals.protein,
  };
}

/**
 * 直近7日の食事記録が、目標にどれだけ沿っていたか。
 *
 * 数えるのは本人が「揃った」と印を付けた日だけ。
 * 入れ忘れた日を低摂取の日として混ぜない。
 */
export function nutritionAdherence(
  logs: readonly DailyLog[],
  target: { calories: number; protein: number } | null,
  now = new Date(),
): NutritionAdherence {
  const today = dateKey(now);
  const window = new Set(recentDateKeys(today, TREND_WINDOW_DAYS));
  const completed = logs.filter((log) => log.nutritionComplete && window.has(log.date));

  const intakes = completed.map(caloriesForLog);
  const averageCalories = average(intakes.map((item) => item.kcal));
  const averageProtein = average(intakes.map((item) => item.protein));

  const daysNearCalorieTarget = target == null ? 0 : intakes.filter(
    (item) => Math.abs(item.kcal - target.calories) <= target.calories * NEAR_TARGET_RATIO,
  ).length;
  const daysMeetingProteinTarget = target == null ? 0 : intakes.filter((item) => item.protein >= target.protein).length;

  const enoughData = completed.length >= MIN_COMPLETED_NUTRITION_DAYS;

  return {
    completedDays: completed.length,
    averageCalories: averageCalories == null ? null : Math.round(averageCalories),
    averageProtein: averageProtein == null ? null : Math.round(averageProtein),
    targetCalories: target?.calories ?? null,
    targetProtein: target?.protein ?? null,
    daysNearCalorieTarget,
    daysMeetingProteinTarget,
    enoughData,
    onTrack: enoughData && daysNearCalorieTarget >= MIN_NEAR_TARGET_DAYS,
  };
}

/* ==========================================================================
   目標の見直し
   ========================================================================== */

export type NutritionDirection = 'cut' | 'bulk' | 'maintain';

/**
 * 目標が体重をどちらへ動かそうとしているか。
 * 推測はせず、保存されている goal と dietPlan.mode だけから決める。
 */
export function directionFor(data: BodymakersData): NutritionDirection {
  const goal = data.personalPlan?.input.goal;
  if (goal === 'fat-loss') return 'cut';
  if (goal === 'muscle') return 'bulk';
  // recomp / strength / health は体重の増減だけでは判断できないので触らない。
  if (goal != null) return 'maintain';
  if (data.dietPlan?.mode === 'cut') return 'cut';
  if (data.dietPlan?.mode === 'bulk') return 'bulk';
  return 'maintain';
}

export type NutritionRecommendationState =
  /** 判断に足りるデータがまだない。 */
  | 'collecting-data'
  /** このまま続ける。 */
  | 'keep'
  /** 目標より記録が離れている。まず記録を揃える。 */
  | 'consistency-first'
  /** 目標がすでに低く、これ以上は自動で下げない。 */
  | 'plan-review'
  | 'adjust-down'
  | 'adjust-up';

export interface NutritionRecommendation {
  state: NutritionRecommendationState;
  /** 提案する変更量。提案が無ければ0。 */
  deltaKcal: number;
  /** 提案を適用したときの目標。 */
  nextCalories: number | null;
  headline: string;
  detail: string;
  /** あと何日ぶん記録すれば判断できるか。分からなければ null。 */
  needsMoreDays: number | null;
}

function clampOffset(value: number): number {
  return Math.max(MIN_OFFSET_KCAL, Math.min(MAX_OFFSET_KCAL, Math.round(value)));
}

/**
 * 次にどうするかの提案。
 *
 * 提案を出すのは、体重の傾向と食事の記録がどちらも十分そろっていて、
 * かつ目標の向きへほとんど動いていないときだけ。
 * ここでは保存も適用もしない。決めるのは本人。
 */
export function recommendNutrition(input: {
  direction: NutritionDirection;
  trend: WeightTrend;
  adherence: NutritionAdherence;
  currentCalories: number | null;
  currentOffsetKcal: number;
  /** この期間ですでに調整済みなら、続けて調整しない。 */
  alreadyAdjustedThisPeriod: boolean;
}): NutritionRecommendation {
  const { trend, adherence, currentCalories } = input;

  if (currentCalories == null) {
    return {
      state: 'collecting-data',
      deltaKcal: 0,
      nextCalories: null,
      headline: 'まず栄養の目安を作りましょう',
      detail: '診断でPlanを作ると、1日の目安が決まります。',
      needsMoreDays: null,
    };
  }

  // 体重の記録が足りない
  if (!trend.enoughData) {
    const missing = Math.max(
      MIN_WEIGHT_MEASUREMENTS - trend.currentCount,
      MIN_WEIGHT_MEASUREMENTS - trend.previousCount,
    );
    return {
      state: 'collecting-data',
      deltaKcal: 0,
      nextCalories: currentCalories,
      headline: 'データを集めています',
      detail: `あと${Math.max(1, missing)}回ほど体重を記録すると、7日ごとの傾向を確認できます。`,
      needsMoreDays: Math.max(1, missing),
    };
  }

  // 食事の記録が足りない
  if (!adherence.enoughData) {
    const missing = MIN_COMPLETED_NUTRITION_DAYS - adherence.completedDays;
    return {
      state: 'collecting-data',
      deltaKcal: 0,
      nextCalories: currentCalories,
      headline: 'データを集めています',
      detail: `あと${Math.max(1, missing)}日ぶん食事の記録がそろうと、目標を見直せます。`,
      needsMoreDays: Math.max(1, missing),
    };
  }

  // 記録はあるが、目標から離れている
  if (!adherence.onTrack) {
    return {
      state: 'consistency-first',
      deltaKcal: 0,
      nextCalories: currentCalories,
      headline: '今の目標をもう1週間続けます',
      detail: '目標を変えるより、いまの目安に沿った日を増やすほうが変化が分かりやすくなります。',
      needsMoreDays: null,
    };
  }

  if (input.direction === 'maintain') {
    return {
      state: 'keep',
      deltaKcal: 0,
      nextCalories: currentCalories,
      headline: '今週はこのまま続けます',
      detail: '今の目的では、体重の増減だけで目安を動かさない方針にしています。',
      needsMoreDays: null,
    };
  }

  if (input.alreadyAdjustedThisPeriod) {
    return {
      state: 'keep',
      deltaKcal: 0,
      nextCalories: currentCalories,
      headline: '今週はこのまま続けます',
      detail: '今週はすでに目安を調整しています。次の7日間の記録を見てから、また見直します。',
      needsMoreDays: null,
    };
  }

  const flat = isFlat(trend);
  const movingAsIntended = trend.changeKg != null
    && (input.direction === 'cut' ? trend.changeKg < 0 : trend.changeKg > 0);

  if (!flat && movingAsIntended) {
    return {
      state: 'keep',
      deltaKcal: 0,
      nextCalories: currentCalories,
      headline: '今週はこのまま続けます',
      detail: '記録は十分そろっていて、体重も目的の向きへ動いています。',
      needsMoreDays: null,
    };
  }

  // ほぼ横ばい、または目的と逆に動いている。小さく試す候補を出す。
  const step = input.direction === 'cut' ? -CALORIE_STEP_KCAL : CALORIE_STEP_KCAL;

  /*
   * すでに低い目標から、さらに自動で下げない。
   * ここで止めるのは計算の下限に近いからであって、
   * その値が健康上どうかを判断しているわけではない。
   */
  if (step < 0 && currentCalories + step <= LOW_TARGET_STOP_KCAL) {
    return {
      state: 'plan-review',
      deltaKcal: 0,
      nextCalories: currentCalories,
      headline: 'これ以上の自動調整は行いません',
      detail: '今の目安はすでに低い値です。数字を下げ続けるより、診断からPlanを見直してください。',
      needsMoreDays: null,
    };
  }
  const nextOffset = clampOffset(input.currentOffsetKcal + step);
  const deltaKcal = nextOffset - input.currentOffsetKcal;

  if (deltaKcal === 0) {
    return {
      state: 'keep',
      deltaKcal: 0,
      nextCalories: currentCalories,
      headline: '今週はこのまま続けます',
      detail: 'Planの目安から調整できる範囲の端まで来ています。目安を作り直すなら、診断からやり直せます。',
      needsMoreDays: null,
    };
  }

  return {
    state: deltaKcal < 0 ? 'adjust-down' : 'adjust-up',
    deltaKcal,
    nextCalories: currentCalories + deltaKcal,
    headline: `小さく調整する候補があります（${deltaKcal > 0 ? '+' : '−'}${Math.abs(deltaKcal)}kcal）`,
    detail: '直近2週間の体重と食事の記録をもとにした候補です。今の目標のまま続けることもできます。',
    needsMoreDays: null,
  };
}
