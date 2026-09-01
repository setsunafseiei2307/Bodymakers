/** 1RM（1回挙上できる最大重量）の推定と、%1RM換算 */

import { isFiniteNumber } from './format';

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

/** RM MAPで回数帯を分けて見せるための表示用区分。推定式の上限とは別に扱う。 */
export type RmDisplayRange = 'standard' | 'extended' | 'reference' | 'high';

export function rmDisplayRange(reps: number): RmDisplayRange {
  if (!Number.isFinite(reps) || reps < 1) return 'high';
  if (reps <= 12) return 'standard';
  if (reps <= 20) return 'extended';
  if (reps <= 30) return 'reference';
  return 'high';
}

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

/** 1RM から各レップ数の目安重量を出す。 */
export function repTableFromOneRM(oneRM: number): RepRow[] {
  if (!isFiniteNumber(oneRM) || oneRM <= 0) return [];
  return Object.keys(REP_PERCENT_TABLE)
    .map(Number)
    .sort((a, b) => a - b)
    .map((reps) => {
      const percent = REP_PERCENT_TABLE[reps];
      const raw = (oneRM * percent) / 100;
      return { reps, percent, weight: raw };
    });
}

/** 1RM の指定パーセントの重量 */
export function weightAtPercent(oneRM: number, percent: number): number | null {
  if (!isFiniteNumber(oneRM) || oneRM <= 0) return null;
  if (!isFiniteNumber(percent) || percent <= 0) return null;
  return (oneRM * percent) / 100;
}

/** ある重量が1RMの何%に当たるか */
export function percentOfOneRM(weight: number, oneRM: number): number | null {
  if (!isFiniteNumber(weight) || !isFiniteNumber(oneRM) || oneRM <= 0) return null;
  return (weight / oneRM) * 100;
}

/** ジムのプレート刻みに合わせて最も近い重量へ丸める。 */
export function roundToIncrement(weight: number, increment = 2.5): number | null {
  if (!isFiniteNumber(weight) || weight <= 0) return null;
  if (!isFiniteNumber(increment) || increment <= 0) return null;
  return Math.round(weight / increment) * increment;
}

/** 目標重量を、実際に組めるプレート刻みまで切り上げる。 */
export function roundUpToIncrement(weight: number, increment = 2.5): number | null {
  if (!isFiniteNumber(weight) || weight <= 0) return null;
  if (!isFiniteNumber(increment) || increment <= 0) return null;
  return Math.ceil((weight - 1e-9) / increment) * increment;
}

export interface WarmupSet {
  percent: number;
  weightKg: number;
  reps: number;
  label: string;
}

/** ワーキング重量へ段階的に近づく、疲労をためにくいウォームアップ例。 */
export function buildWarmupSets(
  workingWeightKg: number,
  barWeightKg = 20,
  increment = 2.5,
): WarmupSet[] {
  if (!isFiniteNumber(workingWeightKg) || workingWeightKg <= 0) return [];
  if (!isFiniteNumber(barWeightKg) || barWeightKg <= 0 || barWeightKg > workingWeightKg) return [];
  const template = [
    { percent: 0, reps: 10, label: '空バー' },
    { percent: 40, reps: 8, label: 'ウォームアップ1' },
    { percent: 55, reps: 5, label: 'ウォームアップ2' },
    { percent: 70, reps: 3, label: 'ウォームアップ3' },
    { percent: 85, reps: 1, label: '最終アップ' },
  ];
  const seen = new Set<number>();
  const result: WarmupSet[] = [];
  for (const item of template) {
    const raw = item.percent === 0 ? barWeightKg : workingWeightKg * (item.percent / 100);
    const rounded = Math.max(barWeightKg, roundToIncrement(raw, increment) ?? raw);
    if (rounded >= workingWeightKg || seen.has(rounded)) continue;
    seen.add(rounded);
    result.push({ ...item, weightKg: rounded });
  }
  return result;
}

export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export interface PlateLoad {
  plateKg: number;
  perSide: number;
}

/** バーベルの目標重量から片側に付ける標準プレートを求める。 */
export function platesPerSide(
  totalWeightKg: number,
  barWeightKg = 20,
  plates: readonly number[] = STANDARD_PLATES_KG,
): PlateLoad[] | null {
  if (!isFiniteNumber(totalWeightKg) || !isFiniteNumber(barWeightKg)) return null;
  if (totalWeightKg < barWeightKg || barWeightKg <= 0) return null;
  let remaining = (totalWeightKg - barWeightKg) / 2;
  const result: PlateLoad[] = [];
  for (const plate of [...plates].sort((a, b) => b - a)) {
    if (!isFiniteNumber(plate) || plate <= 0) continue;
    const count = Math.floor((remaining + 1e-9) / plate);
    if (count > 0) {
      result.push({ plateKg: plate, perSide: count });
      remaining -= plate * count;
    }
  }
  return remaining < 0.01 ? result : null;
}

/**
 * 自重種目で、実際に扱っている重量を求める。
 *
 * 懸垂やディップスは自分の体を持ち上げる種目なので、
 * バーベルと同じ「挙上重量」で比べるには体重を足す必要がある。
 * 加重ベルトを付けているならその重量も足す。
 *
 * ここは足し算だけで、推定は入っていない。
 *
 * なお、腕立て伏せのように体重の一部しか持ち上げない種目では、
 * この式は使えない（何割が乗るかは姿勢で変わり、推測になるため）。
 * そういう種目では体重を足さず、加重ぶんだけを扱う。
 */
export function bodyweightLoad(
  bodyweightKg: number,
  addedKg: number,
): number | null {
  if (!isFiniteNumber(bodyweightKg) || bodyweightKg <= 0) return null;
  if (!isFiniteNumber(addedKg) || addedKg < 0) return null;
  return bodyweightKg + addedKg;
}

/**
 * 自重種目の1RMを、体重＋加重から推定する。
 *
 * 返す値は「体重を含んだ総重量」。
 * 「あと何kg足せるか」を知りたいときは、ここから体重を引く。
 */
export function bodyweightOneRm(
  bodyweightKg: number,
  addedKg: number,
  reps: number,
): OneRmEstimate | null {
  const load = bodyweightLoad(bodyweightKg, addedKg);
  if (load == null) return null;
  return estimateOneRM(load, reps);
}
