/**
 * カロリーを「食べ物いくつぶん」で言い換える。
 *
 * 「320kcal」と言われても多いのか少ないのか分からない。
 * 「ごはん茶碗2杯ぶん」なら一瞬で伝わる。
 *
 * 【数字の出どころ】
 * カロリーは食品成分表の収載値（100gあたり）をそのまま使う。
 * 1食ぶんのグラム数だけは当サイトの決めごとなので、画面に必ず併記して、
 * 「何をどれだけと見なしたか」が読む人に分かるようにする。
 * グラム数を伏せたまま「ごはん2杯」とだけ出すのはしない。
 */

import { findFood, type Food } from './foods';
import { isFiniteNumber } from './format';

export interface PortionDefinition {
  foodId: string;
  /** 「ごはん 茶碗1杯」など、画面に出す呼び方 */
  label: string;
  /** 1食ぶんとみなすグラム数。当サイトの決めごと */
  grams: number;
  /** グラム数の根拠・但し書き */
  note: string;
}

/**
 * 換算に使う食べ物。
 *
 * 誰でも大きさを想像できるものだけを選ぶ。
 * 「ささみ100g」のような、量を想像しにくいものは入れない。
 */
export const PORTIONS: readonly PortionDefinition[] = [
  { foodId: '01088', label: 'ごはん 茶碗1杯', grams: 150, note: '茶碗1杯を150gとした場合' },
  { foodId: '01026', label: '食パン 6枚切り1枚', grams: 60, note: '6枚切り1枚を60gとした場合' },
  { foodId: '01111', label: 'おにぎり 1個', grams: 110, note: '1個を110gとした場合' },
  { foodId: '07107', label: 'バナナ 1本', grams: 100, note: '可食部100gとした場合' },
  { foodId: '16006', label: 'ビール 350ml缶 1本', grams: 350, note: '350mlを350gとした場合' },
  { foodId: '16053', label: 'コーラ 500ml 1本', grams: 500, note: '500mlを500gとした場合' },
  { foodId: '15116', label: '板チョコ 1枚', grams: 50, note: '1枚を50gとした場合' },
  { foodId: '15103', label: 'ポテトチップス 1袋', grams: 60, note: '1袋を60gとした場合' },
  { foodId: '11289', label: 'から揚げ 1個', grams: 30, note: '1個を30gとした場合' },
] as const;

export interface FoodEquivalent {
  /** 換算に使った食品（成分表の収載値つき） */
  food: Food;
  label: string;
  grams: number;
  note: string;
  /** 1食ぶんのカロリー */
  kcalPerPortion: number;
  /** 与えられたカロリーが何食ぶんにあたるか */
  portions: number;
}

/**
 * カロリーを食べ物の個数に言い換える。
 *
 * カロリーが未収載の食品は結果に含めない（推測で埋めない）。
 */
export function foodEquivalents(kcal: number): FoodEquivalent[] {
  if (!isFiniteNumber(kcal) || kcal < 0) return [];

  const out: FoodEquivalent[] = [];
  for (const portion of PORTIONS) {
    const food = findFood(portion.foodId);
    if (food == null || food.kcal == null) continue;

    const kcalPerPortion = (food.kcal * portion.grams) / 100;
    if (kcalPerPortion <= 0) continue;

    out.push({
      food,
      label: portion.label,
      grams: portion.grams,
      note: portion.note,
      kcalPerPortion,
      portions: kcal / kcalPerPortion,
    });
  }
  return out;
}

/**
 * 一番ぴんとくる1件を選ぶ。
 *
 * 「0.3杯」も「27杯」も量が想像できないので、
 * 個数が1〜4の範囲に収まるものを優先し、無ければ1に近いものを返す。
 */
export function bestFoodEquivalent(kcal: number): FoodEquivalent | null {
  const all = foodEquivalents(kcal);
  if (all.length === 0) return null;

  const inRange = all.filter((e) => e.portions >= 1 && e.portions <= 4);
  const pool = inRange.length > 0 ? inRange : all;
  return pool.reduce((best, item) =>
    Math.abs(Math.log(item.portions)) < Math.abs(Math.log(best.portions)) ? item : best,
  );
}
