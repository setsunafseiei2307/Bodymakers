/**
 * 料理の栄養価。
 *
 * 「カツ丼のカロリー」を知りたい人は多いが、成分表に「カツ丼」は無い。
 * そこで、成分表にある食品を組み合わせて1食ぶんを作る。
 *
 * 【この方式にした理由】
 * カロリーやPFCを推測で書くことはしない。数値はすべて成分表の収載値で、
 * 当サイトが決めているのは「何をどれだけ使ったか」だけ。
 * その配合は画面に全部出す。読む人が「うちは卵1個」と思えば、
 * その場で分量を変えて計算し直せる。
 *
 * 揚げ物は、揚げた状態で収載されている食品（とんかつ・天ぷらなど）を使う。
 * 生の材料から吸油量を見積もると、そこが推測になるため。
 */

import { isFiniteNumber } from './format';
import { findFood, type Food, type NutrientKey } from './foods';

export interface DishIngredient {
  /** 成分表の食品番号 */
  foodId: string;
  grams: number;
}

export interface Dish {
  id: string;
  name: string;
  emoji: string;
  /** 1食ぶんの想定（画面に出す） */
  serving: string;
  ingredients: DishIngredient[];
}

/**
 * 収録している料理。
 *
 * 分量は「外食や家庭で出てくる標準的な一人前」を想定した当サイトの決めごと。
 * 店や作り方で変わるため、必ず内訳と一緒に表示する。
 */
export const DISHES: readonly Dish[] = [
  {
    id: 'katsudon',
    name: 'カツ丼',
    emoji: '🍚',
    serving: 'ごはん260g・とんかつ120gの一人前',
    ingredients: [
      { foodId: '01088', grams: 260 }, // ごはん（精白米）
      { foodId: '11276', grams: 120 }, // とんかつ（豚ロース・脂身つき）
      { foodId: '12004', grams: 50 },  // 鶏卵（全卵・生）
      { foodId: '06153', grams: 40 },  // たまねぎ（生）
      { foodId: '17029', grams: 60 },  // めんつゆ（ストレート）
    ],
  },
  {
    id: 'tendon',
    name: '天丼',
    emoji: '🍤',
    serving: 'ごはん260g・えび天2尾ときす天・なす天の一人前',
    ingredients: [
      { foodId: '01088', grams: 260 }, // ごはん（精白米）
      { foodId: '10416', grams: 60 },  // バナメイえび 天ぷら
      { foodId: '10400', grams: 40 },  // きす 天ぷら
      { foodId: '06343', grams: 30 },  // なす 天ぷら
      { foodId: '17029', grams: 40 },  // めんつゆ（ストレート）
    ],
  },
  {
    id: 'oyakodon',
    name: '親子丼',
    emoji: '🍚',
    serving: 'ごはん260g・具180gの一人前',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '18030', grams: 180 }, // 親子丼の具
    ],
  },
  {
    id: 'gyudon',
    name: '牛丼',
    emoji: '🍚',
    serving: 'ごはん260g・具180gの並盛り相当',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '18031', grams: 180 }, // 牛丼の具
    ],
  },
  {
    id: 'karaage-don',
    name: 'から揚げ丼',
    emoji: '🍗',
    serving: 'ごはん260g・から揚げ4個（120g）',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '11289', grams: 120 }, // 鶏もも唐揚げ（皮つき）
    ],
  },
  {
    id: 'curry-rice',
    name: 'カレーライス',
    emoji: '🍛',
    serving: 'ごはん260g・ビーフカレー200gの一人前',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '18001', grams: 200 }, // ビーフカレー
    ],
  },
  {
    id: 'hamburg-set',
    name: 'ハンバーグ定食',
    emoji: '🍽️',
    serving: 'ごはん200g・合いびきハンバーグ150g',
    ingredients: [
      { foodId: '01088', grams: 200 },
      { foodId: '18050', grams: 150 }, // 合いびきハンバーグ
    ],
  },
  {
    id: 'chahan',
    name: 'チャーハン',
    emoji: '🍚',
    serving: '一人前300g',
    ingredients: [{ foodId: '18057', grams: 300 }],
  },
  {
    id: 'gyoza',
    name: 'ぎょうざ 6個',
    emoji: '🥟',
    serving: '1個15gとして6個',
    ingredients: [{ foodId: '18002', grams: 90 }],
  },
  {
    id: 'ramen-shoyu',
    name: 'ラーメン（醤油）',
    emoji: '🍜',
    serving:
      '中華めん230g・チャーシュー30g・半熟卵。スープは成分表に無いため、めんつゆ200gで代用している。実際のラーメンより脂質は少なめに出る',
    ingredients: [
      { foodId: '01048', grams: 230 }, // 中華めん（ゆで）
      { foodId: '11195', grams: 30 },  // 焼き豚（チャーシュー）
      { foodId: '12004', grams: 25 },  // 鶏卵（半熟卵ぶん）
      { foodId: '17029', grams: 200 }, // めんつゆ（ストレート）＝スープの代用
    ],
  },
] as const;

export type DishNutrition = Record<NutrientKey, number>;

export interface DishBreakdownRow {
  food: Food;
  grams: number;
  kcal: number | null;
}

export interface DishResult {
  dish: Dish;
  /** 材料を足し合わせた1食ぶんの成分。未測定のぶんは含まない */
  totals: DishNutrition;
  rows: DishBreakdownRow[];
  /** 未測定だったため合計に入れられなかった成分と件数 */
  missing: Partial<Record<NutrientKey, number>>;
}

const NUTRIENT_KEYS: NutrientKey[] = ['kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt'];

/**
 * 料理1食ぶんの成分を出す。
 * 内訳も一緒に返し、画面で「何をどれだけ使ったか」を必ず出せるようにする。
 */
export function calcDish(dish: Dish): DishResult {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as DishNutrition;
  const missing: Partial<Record<NutrientKey, number>> = {};
  const rows: DishBreakdownRow[] = [];

  for (const ingredient of dish.ingredients) {
    const food = findFood(ingredient.foodId);
    if (food == null || !isFiniteNumber(ingredient.grams) || ingredient.grams < 0) continue;
    const ratio = ingredient.grams / 100;

    for (const key of NUTRIENT_KEYS) {
      const value = food[key];
      if (value == null) missing[key] = (missing[key] ?? 0) + 1;
      else totals[key] += value * ratio;
    }
    rows.push({
      food,
      grams: ingredient.grams,
      kcal: food.kcal == null ? null : food.kcal * ratio,
    });
  }

  return { dish, totals, rows, missing };
}

/** 料理をIDで引く */
export function findDish(id: string): Dish | null {
  return DISHES.find((d) => d.id === id) ?? null;
}

/** すべての料理を計算済みで返す（一覧用） */
export function allDishResults(): DishResult[] {
  return DISHES.map(calcDish);
}
