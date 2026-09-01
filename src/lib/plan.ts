/**
 * 減量・増量の中長期プラン。
 *
 * 「◯月までに◯kg落としたい」に対して、
 *   ・週あたり何kg・何%動かす必要があるか
 *   ・その速さが文献の推奨範囲に収まっているか
 *   ・収まらないなら、いつまで延ばせば収まるか
 * を返す。1日の摂取カロリーまで落とし込むのは nutrition.ts の仕事で、
 * ここは「期限と体重の関係」だけを扱う。
 *
 * 速さの推奨範囲は体重の割合で持つ。同じ「週1kg」でも、
 * 体重50kgの人と100kgの人ではまったく意味が違うため。
 */

import { isFiniteNumber } from './format';
import { KCAL_PER_KG_FAT } from './nutrition';

export type PlanMode = 'cut' | 'bulk';

/**
 * 速さの判定。推奨帯を基準に4段階で返す。
 *
 * 名前は「できる／できない」ではなく速さの度合いで付ける。
 * 目標を持って来た人に「無理だ」と言い渡す道具にはしない。
 * どの段階でも計算結果は出し、そのうえで何が起きやすいかを添える。
 */
export type PaceVerdict = 'gentle' | 'recommended' | 'fast' | 'aggressive';

export interface PaceBand {
  /** 週あたりの体重変化率(%)の下限 */
  min: number;
  /** 同・上限 */
  max: number;
}

/**
 * 週あたりの体重変化率(%)の推奨範囲。
 *
 * 減量: 除脂肪量（筋肉）の維持を目的とした推奨。
 *   Helms ら (2014) が週0.5〜1%を推奨している。
 * 増量: 脂肪の増加を抑えつつ筋肉を増やす速さ。
 *   Garthe ら (2013) では週0.2%前後の増加で筋:脂肪の比率が良好だった。
 *   ここではそれを含む週0.25〜0.5%を範囲として扱う。
 *
 * どちらも個人差が大きく、絶対的な線ではない。画面では「目安」として出す。
 */
export const PACE_BANDS: Record<PlanMode, PaceBand> = {
  cut: { min: 0.5, max: 1.0 },
  bulk: { min: 0.25, max: 0.5 },
};

/** 推奨帯の上限の何倍までを「速い」とみなすか。これを超えると「かなり攻めた」扱い。 */
const AGGRESSIVE_FACTOR = 1.5;

export const PACE_SOURCES = [
  {
    id: 'helms2014',
    label: '減量ペース',
    citation:
      'Helms, E. R., Aragon, A. A., & Fitschen, P. J. (2014). Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. Journal of the International Society of Sports Nutrition, 11, 20.',
    url: 'https://doi.org/10.1186/1550-2783-11-20',
    note: '除脂肪量を保つには週0.5〜1%の減量が推奨されている',
  },
  {
    id: 'garthe2013',
    label: '増量ペース',
    citation:
      'Garthe, I., Raastad, T., Refsnes, P. E., & Sundgot-Borgen, J. (2013). Effect of nutritional intervention on body composition and performance in elite athletes. European Journal of Sport Science, 13(3), 295-303.',
    url: 'https://doi.org/10.1080/17461391.2011.643923',
    note: '大きな黒字をとった群は脂肪の増加が大きく、筋量の増加は変わらなかった',
  },
  {
    id: 'trexler2014',
    label: '減量中に起きること',
    citation:
      'Trexler, E. T., Smith-Ryan, A. E., & Norton, L. E. (2014). Metabolic adaptation to weight loss: implications for the athlete. Journal of the International Society of Sports Nutrition, 11, 7.',
    url: 'https://doi.org/10.1186/1550-2783-11-7',
    note: '減量が進むと、体重の減少から予想されるより消費カロリーが下がることが報告されている（適応性熱産生）',
  },
] as const;

export interface PlanInput {
  /** 現在の体重(kg) */
  weightKg: number;
  /** 目標体重(kg) */
  targetWeightKg: number;
  /** 目標日までの週数。日付から換算して渡す */
  weeks: number;
}

export interface PlanResult {
  mode: PlanMode;
  /** 目標までの変化量(kg)。絶対値 */
  totalChangeKg: number;
  weeks: number;
  /** 週あたりに必要な変化量(kg)。絶対値 */
  weeklyChangeKg: number;
  /** 週あたりに必要な変化率(%)。絶対値 */
  weeklyPercent: number;
  /**
   * 1日あたりに必要なカロリーの過不足。
   * 減量なら負（赤字）、増量なら正（黒字）。
   */
  dailyKcalGap: number;
  verdict: PaceVerdict;
  /** 推奨帯で進めた場合にかかる週数 */
  recommendedWeeks: { fastest: number; slowest: number };
  /** この期限のまま推奨帯で進めた場合に届く変化量(kg) */
  reachableChangeKg: { min: number; max: number };
  /**
   * 推奨帯で進めた場合の1日あたりの過不足(kcal)。減量なら負。
   *
   * 期限が無理な場合、その期限から出した dailyKcalGap をそのまま
   * 摂取カロリーに変換すると、飢餓状態の数字が「目標」として出てしまう。
   * 画面ではそういうときにこちらを使う。
   */
  recommendedDailyKcalGap: { gentlest: number; steepest: number };
}

export interface PlanError {
  field: 'weightKg' | 'targetWeightKg' | 'weeks';
  message: string;
}

const MIN_WEIGHT = 30;
const MAX_WEIGHT = 300;
const MAX_WEEKS = 260; // 5年。これ以上先の計画は目安として意味を持たない

/** 入力の検証。問題が無ければ空配列を返す。 */
export function validatePlanInput(input: Partial<PlanInput>): PlanError[] {
  const errors: PlanError[] = [];
  const { weightKg, targetWeightKg, weeks } = input;

  if (!isFiniteNumber(weightKg) || weightKg < MIN_WEIGHT || weightKg > MAX_WEIGHT) {
    errors.push({ field: 'weightKg', message: `${MIN_WEIGHT}〜${MAX_WEIGHT}kg の範囲で入力してください。` });
  }
  if (
    !isFiniteNumber(targetWeightKg) ||
    targetWeightKg < MIN_WEIGHT ||
    targetWeightKg > MAX_WEIGHT
  ) {
    errors.push({
      field: 'targetWeightKg',
      message: `${MIN_WEIGHT}〜${MAX_WEIGHT}kg の範囲で入力してください。`,
    });
  }
  if (!isFiniteNumber(weeks) || weeks <= 0 || weeks > MAX_WEEKS) {
    errors.push({ field: 'weeks', message: '今日より先の日付を、5年以内で選んでください。' });
  }
  if (
    isFiniteNumber(weightKg) &&
    isFiniteNumber(targetWeightKg) &&
    Math.abs(targetWeightKg - weightKg) < 0.1
  ) {
    errors.push({ field: 'targetWeightKg', message: '現在の体重と目標体重が同じです。' });
  }
  return errors;
}

/** 速さを推奨帯と比べて判定する。 */
export function judgePace(weeklyPercent: number, mode: PlanMode): PaceVerdict {
  const band = PACE_BANDS[mode];
  if (weeklyPercent < band.min) return 'gentle';
  if (weeklyPercent <= band.max) return 'recommended';
  if (weeklyPercent <= band.max * AGGRESSIVE_FACTOR) return 'fast';
  return 'aggressive';
}

/**
 * 計画を組み立てる。入力が不正なら null（呼ぶ前に validatePlanInput で確かめること）。
 */
export function buildPlan(input: PlanInput): PlanResult | null {
  if (validatePlanInput(input).length > 0) return null;

  const { weightKg, targetWeightKg, weeks } = input;
  const diff = targetWeightKg - weightKg;
  const mode: PlanMode = diff < 0 ? 'cut' : 'bulk';
  const totalChangeKg = Math.abs(diff);

  const weeklyChangeKg = totalChangeKg / weeks;
  const weeklyPercent = (weeklyChangeKg / weightKg) * 100;

  // 体重1kgの増減に必要なカロリーは、脂肪1kgぶんで見積もる。
  // 増量では増える分に筋肉と水分が含まれるため、実際にはこれより少なくて済むことが多い。
  const dailyKcalGap = ((diff * KCAL_PER_KG_FAT) / weeks) / 7;

  const band = PACE_BANDS[mode];
  const maxWeeklyKg = (weightKg * band.max) / 100;
  const minWeeklyKg = (weightKg * band.min) / 100;
  const sign = mode === 'cut' ? -1 : 1;

  return {
    mode,
    totalChangeKg,
    weeks,
    weeklyChangeKg,
    weeklyPercent,
    dailyKcalGap,
    verdict: judgePace(weeklyPercent, mode),
    recommendedWeeks: {
      fastest: totalChangeKg / maxWeeklyKg,
      slowest: totalChangeKg / minWeeklyKg,
    },
    reachableChangeKg: {
      min: minWeeklyKg * weeks,
      max: maxWeeklyKg * weeks,
    },
    recommendedDailyKcalGap: {
      gentlest: (sign * minWeeklyKg * KCAL_PER_KG_FAT) / 7,
      steepest: (sign * maxWeeklyKg * KCAL_PER_KG_FAT) / 7,
    },
  };
}

/** 今日から目標日までの週数。日付の差を7で割るだけ。 */
export function weeksUntil(target: Date, today: Date = new Date()): number | null {
  const t = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const n = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  const days = (t - n) / 86_400_000;
  if (days <= 0) return null;
  return days / 7;
}
