/**
 * 今週のまとめ。
 *
 * ここは3つ目のAdaptive engineではない。
 * TrainingとNutritionのエンジンがすでに出した結果を読んで、
 *   ・並べる
 *   ・優先順位をつける
 *   ・次の1手を1つに絞る
 * ことだけをする。判定はどちらのエンジンにも触らずそのまま使う。
 *
 * 「今週」の区切りは src/lib/activity/ の直近7日と同じにする。
 * Training・Nutrition・Activityで週がずれないよう、日付の計算もそこから借りる。
 *
 * 重量が上がったのはエンジンがすでに決めたこと（報告）で、
 * カロリーの変更は本人が選ぶこと（決定）。この2つを混ぜない。
 */

import { dateKey, recentDateKeys } from '../activity/days';
import { weeklyProgress } from '../activity';
import {
  directionFor,
  nutritionAdherence,
  recommendNutrition,
  resolveNutritionTarget,
  weightTrend,
  periodKeyFor,
} from '../nutritionAdaptive';
import type { BodymakersData } from '../storage';
import { LIFT_LABELS } from '../training/adaptive';
import { buildNextSessionPreview } from '../training/feedback';
import { buildWeeklyTrainingReview, liftProgressSummaries } from '../training/review';
import { buildNarrative } from './narrative';
import type {
  CoachChange,
  CoachLiftChange,
  CoachNextWeek,
  CoachNutritionSummary,
  CoachRecommendation,
  CoachState,
  CoachStrengthPoint,
  CoachTrainingSummary,
  WeeklyCoach,
} from './types';

/** 今週のまとめを出すのに最低限ほしい活動日数。 */
export const MIN_ACTIVE_DAYS_FOR_COACH = 2;

function trainingSummary(data: BodymakersData, now: Date): CoachTrainingSummary {
  const review = buildWeeklyTrainingReview(data, now);
  const window = new Set(recentDateKeys(dateKey(now), 7));

  // 今週、実際に次回重量が動いた種目だけを拾う。判定はしない。
  const changes: CoachLiftChange[] = [];
  for (const event of data.trainingAdjustments.history) {
    if (!window.has(event.date) || event.deltaKg === 0) continue;
    if (changes.some((item) => item.lift === event.lift)) continue;
    const toKg = event.offsetKg;
    changes.push({
      lift: event.lift,
      label: LIFT_LABELS[event.lift],
      fromKg: toKg - event.deltaKg,
      toKg,
      deltaKg: event.deltaKg,
    });
  }

  const strength: CoachStrengthPoint[] = liftProgressSummaries(data)
    .filter((item) => item.estimatedOneRmKg != null)
    .slice(0, 3)
    .map((item) => ({
      label: item.label,
      estimatedOneRmKg: item.estimatedOneRmKg!,
      estimatedDeltaKg: item.estimatedDeltaKg,
    }));

  return {
    sessions: review.sessions,
    programPosition: review.programPosition,
    changes: changes.slice(0, 3),
    strength,
    hasData: review.hasData,
  };
}

function nutritionSummary(data: BodymakersData, now: Date): CoachNutritionSummary {
  const target = resolveNutritionTarget(data);
  const trend = weightTrend(data.dailyLogs, now);
  const adherence = nutritionAdherence(data.dailyLogs, target, now);
  // 判定はNutritionエンジンのものをそのまま使う。ここで作り直さない。
  const recommendation = recommendNutrition({
    direction: directionFor(data),
    trend,
    adherence,
    currentCalories: target?.calories ?? null,
    currentOffsetKcal: target?.offsetKcal ?? 0,
    alreadyAdjustedThisPeriod: data.nutritionAdjustments.lastPeriodKey === periodKeyFor(dateKey(now)),
  });

  return {
    completedDays: adherence.completedDays,
    averageCalories: adherence.averageCalories,
    targetCalories: target?.calories ?? null,
    baselineCalories: target?.baselineCalories ?? null,
    offsetKcal: target?.offsetKcal ?? 0,
    weightFromKg: trend.previousAverageKg,
    weightToKg: trend.currentAverageKg,
    weightChangeKg: trend.changeKg,
    state: recommendation.state,
    candidateKcal: recommendation.deltaKcal,
    headline: recommendation.headline,
    detail: recommendation.detail,
    hasData: adherence.enoughData || trend.enoughData,
  };
}

function weeklyChanges(data: BodymakersData, now: Date): CoachChange[] {
  const window = new Set(recentDateKeys(dateKey(now), 7));
  const changes: CoachChange[] = [];

  for (const event of data.trainingAdjustments.history) {
    if (!window.has(event.date) || event.deltaKg === 0) continue;
    if (changes.some((item) => item.id === `training-${event.lift}`)) continue;
    const sign = event.deltaKg > 0 ? '+' : '−';
    changes.push({
      id: `training-${event.lift}`,
      domain: 'training',
      text: `${LIFT_LABELS[event.lift]} ${sign}${Math.abs(event.deltaKg)}kg`,
    });
  }

  for (const event of data.nutritionAdjustments.history) {
    if (!window.has(event.date) || event.deltaKcal === 0) continue;
    changes.push({
      id: `nutrition-${event.id}`,
      domain: 'nutrition',
      text: `食事の目安 ${event.fromCalories} → ${event.toCalories} kcal`,
    });
  }

  return changes.slice(0, 4);
}

/**
 * 今週の状態を1つに決める。
 *
 * 上から順に見る。データが足りないことがいちばん優先で、
 * 次が記録の量、そのあとにTrainingとNutritionの中身を見る。
 */
function resolveState(input: {
  activeDays: number;
  training: CoachTrainingSummary;
  nutrition: CoachNutritionSummary;
}): CoachState {
  if (input.activeDays < MIN_ACTIVE_DAYS_FOR_COACH) return 'collecting-data';
  if (!input.training.hasData && !input.nutrition.hasData) return 'collecting-data';

  if (input.nutrition.state === 'plan-review') return 'plan-review';
  if (input.nutrition.state === 'adjust-down' || input.nutrition.state === 'adjust-up') return 'nutrition-review';
  if (input.training.changes.length > 0) return 'training-progressing';
  if (input.nutrition.state === 'consistency-first') return 'consistency-first';
  if (input.nutrition.state === 'collecting-data' && !input.training.hasData) return 'collecting-data';
  return 'on-track';
}

/**
 * 来週の1手。原則1つだけ。
 *
 * 重量が上がったことは、エンジンがすでに決めた結果なので操作を求めない。
 * 押してもらうのは、本人が決める必要があるとき（カロリーの候補）だけ。
 */
function resolveRecommendation(state: CoachState, nutrition: CoachNutritionSummary): CoachRecommendation {
  switch (state) {
    case 'collecting-data':
      return {
        id: 'keep-recording',
        label: 'まず記録を続けます',
        detail: 'あと数日ぶん記録がそろうと、今週の傾向をまとめられます。',
        action: null,
      };
    case 'consistency-first':
      return {
        id: 'keep-recording',
        label: '今の目標のまま、記録を続けます',
        detail: '目標を変えるより、いまの目安に沿った日を増やすほうが変化が分かりやすくなります。',
        action: null,
      };
    case 'nutrition-review':
      return {
        id: 'apply-nutrition-adjustment',
        label: `食事の目安を${nutrition.candidateKcal > 0 ? '+' : '−'}${Math.abs(nutrition.candidateKcal)}kcal調整する候補があります`,
        detail: '今の目標のまま続けることもできます。選んだときだけ変わります。',
        action: { kind: 'nutrition-adjustment', label: '今週の栄養を見る' },
      };
    case 'plan-review':
      return {
        id: 'review-plan',
        label: 'Planを見直しましょう',
        detail: '今の目安はすでに低い値です。これ以上は自動で調整せず、診断から作り直せます。',
        action: { kind: 'open-plan', label: 'Planを見る' },
      };
    case 'training-progressing':
    case 'on-track':
    default:
      return {
        id: 'continue-plan',
        label: '次の1週間も、今のPlanで進めます',
        detail: '記録が続いているので、いまの組み立てのまま続けられます。',
        action: null,
      };
  }
}

function resolveNextWeek(data: BodymakersData, nutrition: CoachNutritionSummary, recommendation: CoachRecommendation): CoachNextWeek {
  const preview = buildNextSessionPreview(data.activeProgram, data.trainingAdjustments);
  return {
    training: preview == null
      ? null
      : `Week ${preview.week} / Day ${preview.day}・${preview.label}`,
    nutrition: nutrition.targetCalories == null ? null : `${nutrition.targetCalories} kcal`,
    focus: recommendation.label,
  };
}

const HEADLINES: Record<CoachState, string> = {
  'collecting-data': '今週から記録を集めています',
  'consistency-first': '今週は記録を優先',
  'training-progressing': 'トレーニングは進んでいます',
  'nutrition-review': '食事の目安に候補があります',
  'plan-review': 'Planを見直すタイミングです',
  'on-track': '今週は順調です',
};

/**
 * 今週のまとめ。
 *
 * 保存はしない。呼ばれるたびに、そのときの記録から作り直す。
 * 途中で体重や記録を直しても、古いまとめが残って食い違うことがない。
 */
export function buildWeeklyCoach(data: BodymakersData, now = new Date()): WeeklyCoach {
  const week = weeklyProgress(data, now, 7);
  const training = trainingSummary(data, now);
  const nutrition = nutritionSummary(data, now);
  const state = resolveState({ activeDays: week.activeDays, training, nutrition });
  const recommendation = resolveRecommendation(state, nutrition);

  return {
    state,
    headline: HEADLINES[state],
    narrative: buildNarrative({ state, training, nutrition, activeDays: week.activeDays }),
    training,
    nutrition,
    changes: weeklyChanges(data, now),
    recommendation,
    nextWeek: resolveNextWeek(data, nutrition, recommendation),
    hasEnoughData: state !== 'collecting-data',
  };
}
