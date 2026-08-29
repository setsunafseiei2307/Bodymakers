/**
 * RPE（主観的運動強度）換算。
 * RPE10 = あと0回、RPE9 = あと1回、RPE8 = あと2回…という定義。
 *
 * 換算表は「限界までの残り回数」が同じなら同じ強度になる、という構造を持つ。
 * つまり (レップ数 - 1) と (10 - RPE) を足した位置の値を引けばよいので、
 * 表を2次元で持たず1本の数列として保持する。
 */

import { isFiniteNumber, roundTo } from './format';

/** index = (reps - 1) * 2 + (10 - rpe) * 2 に対応する %1RM */
const PERCENT_SEQUENCE = [
  100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4,
  76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.2,
];

export const RPE_VALUES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6] as const;
export const RPE_MAX_REPS = 12;

/** 指定のレップ数・RPE が 1RM の何%に当たるか。範囲外なら null */
export function rpePercent(reps: number, rpe: number): number | null {
  if (!isFiniteNumber(reps) || !isFiniteNumber(rpe)) return null;
  const r = Math.round(reps);
  if (r < 1 || r > RPE_MAX_REPS) return null;
  if (rpe < 6 || rpe > 10) return null;
  // RPE は 0.5 刻みのみ有効
  if (Math.abs(rpe * 2 - Math.round(rpe * 2)) > 1e-9) return null;

  const index = (r - 1) * 2 + Math.round((10 - rpe) * 2);
  const value = PERCENT_SEQUENCE[index];
  return value == null ? null : value;
}

/** 実施した重量・レップ数・RPE から 1RM を推定する */
export function oneRmFromRpe(weight: number, reps: number, rpe: number): number | null {
  if (!isFiniteNumber(weight) || weight <= 0) return null;
  const percent = rpePercent(reps, rpe);
  if (percent == null) return null;
  return (weight * 100) / percent;
}

/**
 * 推定1RMから「このレップ数・このRPEでやるなら何kgか」を出す。
 * increment を渡すとプレート刻みに丸める。
 */
export function weightForRepsAtRpe(
  oneRM: number,
  reps: number,
  rpe: number,
  increment = 0,
): number | null {
  if (!isFiniteNumber(oneRM) || oneRM <= 0) return null;
  const percent = rpePercent(reps, rpe);
  if (percent == null) return null;
  const raw = (oneRM * percent) / 100;
  return increment > 0 ? roundTo(raw, increment) : raw;
}

export interface RpeMatrixCell {
  reps: number;
  rpe: number;
  percent: number;
  weight: number | null;
}

/** 画面表示用の換算表を作る（行=RPE、列=レップ数） */
export function buildRpeMatrix(
  oneRM: number | null,
  maxReps = 8,
  increment = 0,
): RpeMatrixCell[][] {
  const repList = Array.from({ length: Math.min(maxReps, RPE_MAX_REPS) }, (_, i) => i + 1);
  return RPE_VALUES.map((rpe) =>
    repList.map((reps) => {
      const percent = rpePercent(reps, rpe) ?? 0;
      const weight =
        oneRM && oneRM > 0
          ? increment > 0
            ? roundTo((oneRM * percent) / 100, increment)
            : (oneRM * percent) / 100
          : null;
      return { reps, rpe, percent, weight };
    }),
  );
}
