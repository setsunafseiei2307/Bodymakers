/** バーベルのプレート積み計算 */

import { isFiniteNumber } from './format';

export type Unit = 'kg' | 'lb';

export interface PlateSpec {
  weight: number;
  /** IPF規格の色。SVG描画とバッジに使う */
  color: string;
  /** 濃い背景の上に文字を置くか（白文字にするか） */
  light?: boolean;
  /** 相対的な直径（描画用 0〜1） */
  size: number;
}

/** kg プレート（IPFカラー） */
export const KG_PLATES: PlateSpec[] = [
  { weight: 25, color: '#E5322D', size: 1.0 },
  { weight: 20, color: '#0B5FD9', size: 1.0 },
  { weight: 15, color: '#FFC400', light: true, size: 0.94 },
  { weight: 10, color: '#12A150', size: 0.84 },
  { weight: 5, color: '#F2F4F7', light: true, size: 0.7 },
  { weight: 2.5, color: '#E5322D', size: 0.58 },
  { weight: 1.25, color: '#B7C0CC', light: true, size: 0.48 },
  { weight: 0.5, color: '#9AA6B4', light: true, size: 0.4 },
];

/** lb プレート */
export const LB_PLATES: PlateSpec[] = [
  { weight: 45, color: '#0B5FD9', size: 1.0 },
  { weight: 35, color: '#FFC400', light: true, size: 0.9 },
  { weight: 25, color: '#12A150', size: 0.8 },
  { weight: 10, color: '#F2F4F7', light: true, size: 0.66 },
  { weight: 5, color: '#E5322D', size: 0.54 },
  { weight: 2.5, color: '#B7C0CC', light: true, size: 0.44 },
];

export const BAR_OPTIONS: Record<Unit, number[]> = {
  kg: [20, 15, 10, 7.5, 5, 0],
  lb: [45, 35, 25, 15, 0],
};

export interface PlateCount {
  weight: number;
  count: number;
  color: string;
  light: boolean;
  size: number;
}

export interface PlateResult {
  /** 片側に載せるプレート（重い順） */
  perSide: PlateCount[];
  /** 実際に組める合計重量 */
  achieved: number;
  /** 目標との差（achieved - target）。0 ならぴったり */
  diff: number;
  /** 片側に載る重量 */
  perSideWeight: number;
  /** 目標が組めなかった端数 */
  remainder: number;
  /** バーだけで目標を超えている等のエラー */
  error: 'BELOW_BAR' | 'INVALID' | null;
}

/**
 * 目標重量に対して片側に載せるプレートを計算する（重い方から順に載せる貪欲法）。
 * available は「片側に使えるプレートの種類」。同じ重さは無制限にあるものとする。
 */
export function calcPlates(
  target: number,
  bar: number,
  available: PlateSpec[],
  maxPerSide = 8,
): PlateResult {
  const empty: PlateResult = {
    perSide: [],
    achieved: bar,
    diff: 0,
    perSideWeight: 0,
    remainder: 0,
    error: null,
  };

  if (!isFiniteNumber(target) || !isFiniteNumber(bar) || target <= 0 || bar < 0) {
    return { ...empty, achieved: 0, error: 'INVALID' };
  }
  if (target < bar) {
    return { ...empty, achieved: bar, diff: bar - target, error: 'BELOW_BAR' };
  }

  let rest = (target - bar) / 2;
  const sorted = [...available].sort((a, b) => b.weight - a.weight);
  const perSide: PlateCount[] = [];
  let total = 0;

  for (const plate of sorted) {
    if (plate.weight <= 0) continue;
    let count = Math.floor((rest + 1e-9) / plate.weight);
    if (count <= 0) continue;
    const room = maxPerSide - total;
    if (room <= 0) break;
    count = Math.min(count, room);
    perSide.push({
      weight: plate.weight,
      count,
      color: plate.color,
      light: plate.light ?? false,
      size: plate.size,
    });
    total += count;
    rest = Number((rest - count * plate.weight).toFixed(6));
  }

  const perSideWeight = perSide.reduce((sum, p) => sum + p.weight * p.count, 0);
  const achieved = Number((bar + perSideWeight * 2).toFixed(3));

  return {
    perSide,
    achieved,
    diff: Number((achieved - target).toFixed(3)),
    perSideWeight,
    remainder: Number(rest.toFixed(3)),
    error: null,
  };
}

/** 組める重量の一覧（ウォームアップ表などに使う） */
export function loadableWeights(bar: number, available: PlateSpec[], max: number): number[] {
  const step = Math.min(...available.map((p) => p.weight)) * 2;
  const out: number[] = [];
  for (let w = bar; w <= max; w = Number((w + step).toFixed(3))) out.push(w);
  return out;
}

export const LB_PER_KG = 2.2046226218;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}
