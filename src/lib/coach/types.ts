/**
 * 今週のまとめの型。
 *
 * ここに判定は入れない。TrainingとNutritionのエンジンがすでに出した結果を
 * まとめて持つための入れ物にする。
 */

import type { NutritionRecommendationState } from '../nutritionAdaptive';

/**
 * 今週の状態。
 *
 * 増やしすぎない。画面の都合で細かく分けず、
 * 「次に何をするか」が変わるところだけを分ける。
 */
export type CoachState =
  /** 判断に足りるデータがまだない。 */
  | 'collecting-data'
  /** 記録は続いているが、まだ量が足りない。 */
  | 'consistency-first'
  /** 重量が動いた週。 */
  | 'training-progressing'
  /** 食事の目標に、本人が選べる候補がある。 */
  | 'nutrition-review'
  /** 自動の調整では対応しない。Planを見直す。 */
  | 'plan-review'
  /** そのまま続けてよい。 */
  | 'on-track';

export interface CoachLiftChange {
  lift: string;
  label: string;
  fromKg: number;
  toKg: number;
  deltaKg: number;
}

export interface CoachStrengthPoint {
  label: string;
  estimatedOneRmKg: number;
  estimatedDeltaKg: number | null;
}

export interface CoachTrainingSummary {
  sessions: number;
  programPosition: string | null;
  /** 今週、次回重量が動いた種目。多くても3件。 */
  changes: CoachLiftChange[];
  /** 推定1RMの動き。数値は推定であることを文言側で必ず添える。 */
  strength: CoachStrengthPoint[];
  hasData: boolean;
}

export interface CoachNutritionSummary {
  completedDays: number;
  averageCalories: number | null;
  targetCalories: number | null;
  baselineCalories: number | null;
  offsetKcal: number;
  weightFromKg: number | null;
  weightToKg: number | null;
  weightChangeKg: number | null;
  /** Nutritionエンジンがそのまま返した状態。ここでは判定し直さない。 */
  state: NutritionRecommendationState;
  /** 本人が選べる候補。無ければ0。 */
  candidateKcal: number;
  headline: string;
  detail: string;
  hasData: boolean;
}

/** 今週、Bodymakersの中で変わったこと。 */
export interface CoachChange {
  id: string;
  domain: 'training' | 'nutrition';
  text: string;
}

export type CoachRecommendationId =
  | 'continue-plan'
  | 'keep-recording'
  | 'apply-nutrition-adjustment'
  | 'review-plan';

export interface CoachRecommendation {
  id: CoachRecommendationId;
  label: string;
  detail: string;
  /**
   * 押せる操作。原則1つだけ。
   * 情報だけで足りるときは null にして、ボタンを増やさない。
   */
  action: { kind: 'nutrition-adjustment' | 'open-plan' | 'open-today'; label: string } | null;
}

export interface CoachNextWeek {
  training: string | null;
  nutrition: string | null;
  focus: string;
}

export interface WeeklyCoach {
  state: CoachState;
  /** 一言で今週を表す。 */
  headline: string;
  /** 2〜3文。全部は説明しない。 */
  narrative: string[];
  training: CoachTrainingSummary;
  nutrition: CoachNutritionSummary;
  changes: CoachChange[];
  recommendation: CoachRecommendation;
  nextWeek: CoachNextWeek;
  /** 週のまとめを出せるだけのデータがあるか。 */
  hasEnoughData: boolean;
}
