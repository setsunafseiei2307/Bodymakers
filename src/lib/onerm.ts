/** 1RM（1回挙上できる最大重量）の推定と、%1RM換算 */

import { isFiniteNumber, roundTo } from './format';

export type FormulaName =
  | 'Epley'
  | 'Brzycki'
  | 'Lander'
  | 'Lombardi'
  | "O'Conner"
  | 'Mayhew'
  | 'Wathen';

export interface FormulaResult {
  name: FormulaName;
  value: number;
}

export interface OneRmEstimate {
  /** 全式の平均値。これを画面の主表示に使う */
  average: number;
  /** 式ごとの推定値（大きい順ではなく定義順） */
  results: FormulaResult[];
  /** 推定のばらつき（最大値 − 最小値） */
  spread: number;
  min: number;
  max: number;
}

const FORMULAS: { name: FormulaName; calc: (w: number, r: number) => number }[] = [
  { name: 'Epley', calc: (w, r) => w * (1 + r / 30) },
  { name: 'Brzycki', calc: (w, r) => (w * 36) / (37 - r) },
  { name: 'Lander', calc: (w, r) => (100 * w) / (101.3 - 2.67123 * r) },
  { name: 'Lombardi', calc: (w, r) => w * Math.pow(r, 0.1) },
  { name: "O'Conner", calc: (w, r) => w * (1 + 0.025 * r) },
  { name: 'Mayhew', calc: (w, r) => (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r)) },
  { name: 'Wathen', calc: (w, r) => (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r)) },
];

/** 回数の上限。これを超えると推定誤差が実用に耐えないため計算しない */
export const MAX_REPS = 12;

/**
 * 挙上重量と回数から1RMを推定する。
 * 1回の場合はその重量がそのまま1RMなので、式を通さず weight を返す。
 * 入力が不正（0以下・回数が範囲外）なら null。
 */
export function estimateOneRM(weight: number, reps: number): OneRmEstimate | null {
  if (!isFiniteNumber(weight) || !isFiniteNumber(reps)) return null;
  if (weight <= 0 || reps < 1) return null;
  const r = Math.round(reps);
  if (r > MAX_REPS) return null;

  if (r === 1) {
    const results = FORMULAS.map((f) => ({ name: f.name, value: weight }));
    return { average: weight, results, spread: 0, min: weight, max: weight };
  }

  const results = FORMULAS.map((f) => ({ name: f.name, value: f.calc(weight, r) })).filter((x) =>
    isFiniteNumber(x.value) && x.value > 0,
  );
  if (results.length === 0) return null;

  const values = results.map((x) => x.value);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { average, results, spread: max - min, min, max };
}

/** 一般的な %1RM 換算表（回数 → 1RMに対する割合 %） */
export const REP_PERCENT_TABLE: Record<number, number> = {
  1: 100,
  2: 95,
  3: 93,
  4: 90,
  5: 87,
  6: 85,
  7: 83,
  8: 80,
  9: 77,
  10: 75,
  11: 73,
  12: 70,
};

export interface RepRow {
  reps: number;
  /** 換算表ベースの重量 */
  weight: number;
  percent: number;
}

/**
 * 1RM から各レップ数の目安重量を出す。
 * increment を渡すとその刻みに丸める（例: 2.5kg プレート運用なら 2.5）。
 */
export function repTableFromOneRM(oneRM: number, increment = 0): RepRow[] {
  if (!isFiniteNumber(oneRM) || oneRM <= 0) return [];
  return Object.keys(REP_PERCENT_TABLE)
    .map(Number)
    .sort((a, b) => a - b)
    .map((reps) => {
      const percent = REP_PERCENT_TABLE[reps];
      const raw = (oneRM * percent) / 100;
      return { reps, percent, weight: increment > 0 ? roundTo(raw, increment) : raw };
    });
}

/** 1RM の指定パーセントの重量 */
export function weightAtPercent(oneRM: number, percent: number, increment = 0): number | null {
  if (!isFiniteNumber(oneRM) || oneRM <= 0) return null;
  if (!isFiniteNumber(percent) || percent <= 0) return null;
  const raw = (oneRM * percent) / 100;
  return increment > 0 ? roundTo(raw, increment) : raw;
}

/** ある重量が1RMの何%に当たるか */
export function percentOfOneRM(weight: number, oneRM: number): number | null {
  if (!isFiniteNumber(weight) || !isFiniteNumber(oneRM) || oneRM <= 0) return null;
  return (weight / oneRM) * 100;
}
