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
 * 【素材から組む理由】
 * 成分表には「親子丼の具」「ビーフカレー」のように、調理済みで
 * 収載されている食品もある。それを1行使えば数字は出るが、
 * 「鶏肉が何g入っているのか」が読む人に分からない。
 * だから、素材から組めるものは素材から組む。
 *
 * 例外は揚げ物と炒め物で、こちらは調理済みの収載値を使う。
 * 生の材料から吸油量を見積もると、そこが推測になるため。
 * その場合は composite: true を立てて、画面で理由を説明する。
 */

import { isFiniteNumber } from './format';
import { NUTRIENT_KEYS, findFood, type Food, type NutrientKey } from './foods';

export interface DishIngredient {
  /** 成分表の食品番号 */
  foodId: string;
  grams: number;
}

/** 一覧での並び。ユーザーが探すときの見出しになる。 */
export type DishCategory =
  | '丼もの'
  | '麺類'
  | '定食・洋食'
  | '中華'
  | '軽食・朝食'
  | '高たんぱく';

export interface Dish {
  id: string;
  name: string;
  emoji: string;
  /** Bodymakersが権利を持つ料理画像を将来設定する任意URL。未設定時はemoji表示。 */
  imageUrl?: string;
  category: DishCategory;
  /** 1食ぶんの想定（画面に出す） */
  serving: string;
  /**
   * 調理済みで収載されている食品を使っているか。
   * true のときは素材ごとの内訳が出せないので、画面で理由を説明する。
   */
  composite?: boolean;
  /** composite のときに画面へ出す理由 */
  compositeNote?: string;
  ingredients: readonly DishIngredient[];
}

/**
 * 収録している料理。
 *
 * 分量は「外食や家庭で出てくる標準的な一人前」を想定した当サイトの決めごと。
 * 店や作り方で変わるため、必ず内訳と一緒に表示する。
 */
export const DISHES: readonly Dish[] = [
  // ---------- 丼もの ----------
  {
    id: 'katsudon',
    name: 'カツ丼',
    emoji: '🍚',
    category: '丼もの',
    serving: 'ごはん260g・とんかつ120gの一人前',
    ingredients: [
      { foodId: '01088', grams: 260 }, // ごはん（精白米）
      { foodId: '11276', grams: 120 }, // とんかつ（豚ロース・脂身つき）
      { foodId: '12004', grams: 50 }, //  鶏卵（全卵・生）
      { foodId: '06153', grams: 40 }, //  たまねぎ（生）
      { foodId: '17029', grams: 60 }, //  めんつゆ（ストレート）
    ],
  },
  {
    id: 'tendon',
    name: '天丼',
    emoji: '🍤',
    category: '丼もの',
    serving: 'ごはん260g・えび天2尾ときす天・なす天の一人前',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '10416', grams: 60 }, // えびの天ぷら
      { foodId: '10400', grams: 40 }, // きすの天ぷら
      { foodId: '06343', grams: 30 }, // なすの天ぷら
      { foodId: '17029', grams: 40 },
    ],
  },
  {
    id: 'oyakodon',
    name: '親子丼',
    emoji: '🍚',
    category: '丼もの',
    serving: 'ごはん260g・鶏もも80g・卵1個の一人前',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '11221', grams: 80 }, //  鶏もも（若どり・皮つき・生）
      { foodId: '12004', grams: 60 }, //  鶏卵（全卵・生）1個
      { foodId: '06153', grams: 50 }, //  たまねぎ（生）
      { foodId: '06226', grams: 10 }, //  長ねぎ（生）
      { foodId: '17029', grams: 80 }, //  めんつゆ（ストレート）
    ],
  },
  {
    id: 'gyudon',
    name: '牛丼',
    emoji: '🍚',
    category: '丼もの',
    serving: 'ごはん260g・牛ばら80gの並盛り相当',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '11074', grams: 80 }, //  牛ばら（輸入・脂身つき）
      { foodId: '06153', grams: 60 }, //  たまねぎ（生）
      { foodId: '17029', grams: 60 }, //  めんつゆ（ストレート）
      { foodId: '03003', grams: 5 }, //   上白糖
    ],
  },
  {
    id: 'butadon',
    name: '豚丼',
    emoji: '🍚',
    category: '丼もの',
    serving: 'ごはん260g・豚ロース100gの一人前',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '11123', grams: 100 }, // 豚ロース（脂身つき・生）
      { foodId: '06153', grams: 50 },
      { foodId: '17007', grams: 15 }, //  しょうゆ（濃口）
      { foodId: '16025', grams: 15 }, //  本みりん
    ],
  },
  {
    id: 'karaagedon',
    name: 'から揚げ丼',
    emoji: '🍗',
    category: '丼もの',
    serving: 'ごはん260g・から揚げ4個（120g）',
    composite: true,
    compositeNote:
      'から揚げは揚げた状態で成分表に収載されている値を使っています。生の鶏肉から吸油量を見積もると、そこが推測になるためです。',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '11289', grams: 120 }, // 鶏もも唐揚げ（皮つき）
    ],
  },
  {
    id: 'tekkadon',
    name: 'まぐろ丼',
    emoji: '🐟',
    category: '丼もの',
    serving: 'ごはん260g・まぐろ赤身100g',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '10253', grams: 100 }, // まぐろ（本まぐろ赤身・生）
      { foodId: '17007', grams: 15 },
      { foodId: '09004', grams: 1 }, //   焼きのり
    ],
  },
  {
    id: 'tamagokakegohan',
    name: '卵かけごはん',
    emoji: '🥚',
    category: '丼もの',
    serving: 'ごはん180g・卵1個',
    ingredients: [
      { foodId: '01088', grams: 180 },
      { foodId: '12004', grams: 60 },
      { foodId: '17007', grams: 5 },
    ],
  },
  {
    id: 'nattougohan',
    name: '納豆ごはん',
    emoji: '🫘',
    category: '丼もの',
    serving: 'ごはん180g・納豆1パック（45g）',
    ingredients: [
      { foodId: '01088', grams: 180 },
      { foodId: '04046', grams: 45 }, //  納豆（糸引き）
      { foodId: '17007', grams: 5 },
    ],
  },

  // ---------- 麺類 ----------
  {
    id: 'ramen-shoyu',
    name: 'ラーメン（醤油）',
    emoji: '🍜',
    category: '麺類',
    serving: '中華めん230g・チャーシュー30g・半熟卵',
    composite: true,
    compositeNote:
      'ラーメンのスープは成分表に収載がないため、めんつゆで代用しています。実際の店のスープより脂質は少なめに出ます。',
    ingredients: [
      { foodId: '01048', grams: 230 }, // 中華めん（ゆで）
      { foodId: '11195', grams: 30 }, //  焼き豚（チャーシュー）
      { foodId: '12004', grams: 25 },
      { foodId: '06152', grams: 20 }, //  めんま
      { foodId: '06226', grams: 10 },
      { foodId: '17029', grams: 200 },
    ],
  },
  {
    id: 'kake-udon',
    name: 'かけうどん',
    emoji: '🍲',
    category: '麺類',
    serving: 'ゆでうどん250g・つゆ300g',
    ingredients: [
      { foodId: '01039', grams: 250 }, // うどん（ゆで）
      { foodId: '17029', grams: 300 },
      { foodId: '06226', grams: 10 },
    ],
  },
  {
    id: 'kitsune-udon',
    name: 'きつねうどん',
    emoji: '🍲',
    category: '麺類',
    serving: 'ゆでうどん250g・油揚げ25g',
    ingredients: [
      { foodId: '01039', grams: 250 },
      { foodId: '04040', grams: 25 }, //  油揚げ
      { foodId: '17029', grams: 300 },
      { foodId: '06226', grams: 10 },
    ],
  },
  {
    id: 'zaru-soba',
    name: 'ざるそば',
    emoji: '🍜',
    category: '麺類',
    serving: 'ゆでそば250g・つゆ50g',
    ingredients: [
      { foodId: '01128', grams: 250 }, // そば（ゆで）
      { foodId: '17029', grams: 50 },
      { foodId: '09004', grams: 1 },
      { foodId: '06226', grams: 5 },
    ],
  },
  {
    id: 'meat-sauce-pasta',
    name: 'ミートソースパスタ',
    emoji: '🍝',
    category: '麺類',
    serving: 'ゆでスパゲッティ250g・ソース150g',
    ingredients: [
      { foodId: '01064', grams: 250 }, // スパゲッティ（ゆで）
      { foodId: '17033', grams: 150 }, // ミートソース
      { foodId: '14006', grams: 5 }, //   サラダ油（調合油）
    ],
  },
  {
    id: 'peperoncino',
    name: 'ペペロンチーノ',
    emoji: '🍝',
    category: '麺類',
    serving: 'ゆでスパゲッティ250g・オリーブ油大さじ1',
    ingredients: [
      { foodId: '01064', grams: 250 },
      { foodId: '14006', grams: 12 }, //  サラダ油（調合油）大さじ1
      { foodId: '06226', grams: 10 },
    ],
  },

  // ---------- 定食・洋食 ----------
  {
    id: 'curry-rice',
    name: 'カレーライス',
    emoji: '🍛',
    category: '定食・洋食',
    serving: 'ごはん260g・牛肉60g・ルウ20gの一人前',
    ingredients: [
      { foodId: '01088', grams: 260 },
      { foodId: '11032', grams: 60 }, //  牛かた（乳用肥育・赤身）
      { foodId: '02017', grams: 60 }, //  じゃがいも（生）
      { foodId: '06212', grams: 40 }, //  にんじん（皮つき・生）
      { foodId: '06153', grams: 60 },
      { foodId: '17051', grams: 20 }, //  カレールウ
    ],
  },
  {
    id: 'hamburg-teishoku',
    name: 'ハンバーグ定食',
    emoji: '🍽️',
    category: '定食・洋食',
    serving: 'ごはん200g・ハンバーグ150g・サラダ',
    composite: true,
    compositeNote:
      'ハンバーグは焼いた状態で成分表に収載されている値を使っています。焼くときの油の残り方を見積もると、そこが推測になるためです。',
    ingredients: [
      { foodId: '01088', grams: 200 },
      { foodId: '18050', grams: 150 }, // ハンバーグ（合いびき）
      { foodId: '06061', grams: 40 }, //  キャベツ（生）
      { foodId: '06182', grams: 30 }, //  トマト（生）
      { foodId: '17036', grams: 15 }, //  トマトケチャップ
    ],
  },
  {
    id: 'shogayaki-teishoku',
    name: '生姜焼き定食',
    emoji: '🍽️',
    category: '定食・洋食',
    serving: 'ごはん200g・豚ロース120g・キャベツ',
    ingredients: [
      { foodId: '01088', grams: 200 },
      { foodId: '11123', grams: 120 }, // 豚ロース（脂身つき・生）
      { foodId: '06061', grams: 60 },
      { foodId: '17007', grams: 15 },
      { foodId: '16025', grams: 10 },
      { foodId: '14006', grams: 6 },
    ],
  },
  {
    id: 'saba-teishoku',
    name: '焼き魚定食（さば）',
    emoji: '🐟',
    category: '定食・洋食',
    serving: 'ごはん200g・焼きさば80g・みそ汁',
    ingredients: [
      { foodId: '01088', grams: 200 },
      { foodId: '10156', grams: 80 }, //  さば（焼き）
      { foodId: '17045', grams: 12 }, //  みそ（淡色辛みそ）
      { foodId: '04032', grams: 30 }, //  木綿豆腐
      { foodId: '09039', grams: 5 }, //   わかめ（原藻・生）
    ],
  },
  {
    id: 'omurice',
    name: 'オムライス',
    emoji: '🍳',
    category: '定食・洋食',
    serving: 'ごはん230g・卵2個・鶏肉50g',
    ingredients: [
      { foodId: '01088', grams: 230 },
      { foodId: '12004', grams: 110 }, // 鶏卵（全卵・生）2個
      { foodId: '11221', grams: 50 },
      { foodId: '06153', grams: 40 },
      { foodId: '17036', grams: 30 },
      { foodId: '14017', grams: 10 }, //  バター（有塩）
    ],
  },
  {
    id: 'ebi-fry-teishoku',
    name: 'えびフライ定食',
    emoji: '🍤',
    category: '定食・洋食',
    serving: 'ごはん200g・えびフライ3本（90g）',
    composite: true,
    compositeNote:
      'えびフライは揚げた状態で成分表に収載されている値を使っています。',
    ingredients: [
      { foodId: '01088', grams: 200 },
      { foodId: '18020', grams: 90 }, //  えびフライ
      { foodId: '06061', grams: 50 },
      { foodId: '17042', grams: 12 }, //  マヨネーズ（全卵型）
    ],
  },

  // ---------- 中華 ----------
  {
    id: 'chahan',
    name: 'チャーハン',
    emoji: '🍚',
    category: '中華',
    serving: '一人前300g',
    composite: true,
    compositeNote:
      'チャーハンは炒めた状態で成分表に収載されている値を使っています。炒め油の量を見積もると、そこが推測になるためです。',
    ingredients: [{ foodId: '18057', grams: 300 }],
  },
  {
    id: 'gyoza',
    name: 'ぎょうざ 6個',
    emoji: '🥟',
    category: '中華',
    serving: '1個15gとして6個',
    composite: true,
    compositeNote:
      'ぎょうざは焼いた状態で成分表に収載されている値を使っています。皮と具の比率や焼き油の量は店や家庭で大きく変わります。',
    ingredients: [{ foodId: '18002', grams: 90 }],
  },
  {
    id: 'mabo-tofu',
    name: '麻婆豆腐',
    emoji: '🌶️',
    category: '中華',
    serving: '木綿豆腐200g・豚ひき肉60g',
    ingredients: [
      { foodId: '04032', grams: 200 }, // 木綿豆腐
      { foodId: '11163', grams: 60 }, //  豚ひき肉（生）
      { foodId: '06226', grams: 20 },
      { foodId: '14002', grams: 8 }, //   ごま油
      { foodId: '17007', grams: 10 },
    ],
  },

  // ---------- 軽食・朝食 ----------
  {
    id: 'toast-egg',
    name: 'トーストと目玉焼き',
    emoji: '🍞',
    category: '軽食・朝食',
    serving: '食パン6枚切り1枚・卵1個・バター',
    ingredients: [
      { foodId: '01026', grams: 60 }, //  食パン（角形）
      { foodId: '12004', grams: 60 },
      { foodId: '14017', grams: 8 },
      { foodId: '14006', grams: 4 },
    ],
  },
  {
    id: 'ham-sandwich',
    name: 'ハムサンド',
    emoji: '🥪',
    category: '軽食・朝食',
    serving: '食パン2枚・ロースハム3枚',
    ingredients: [
      { foodId: '01026', grams: 120 },
      { foodId: '11176', grams: 45 }, //  ロースハム
      { foodId: '06312', grams: 15 }, //  レタス（生）
      { foodId: '06065', grams: 20 }, //  きゅうり（生）
      { foodId: '17042', grams: 12 },
    ],
  },
  {
    id: 'tuna-onigiri-set',
    name: 'ツナマヨおにぎりとみそ汁',
    emoji: '🍙',
    category: '軽食・朝食',
    serving: 'ごはん110g・ツナ20g・みそ汁',
    ingredients: [
      { foodId: '01088', grams: 110 },
      { foodId: '10263', grams: 20 }, //  ツナ缶（油漬・ライト）
      { foodId: '17042', grams: 8 },
      { foodId: '09004', grams: 1 },
      { foodId: '17045', grams: 12 },
      { foodId: '04032', grams: 30 },
    ],
  },
  {
    id: 'yogurt-banana',
    name: 'ヨーグルトとバナナ',
    emoji: '🍌',
    category: '軽食・朝食',
    serving: 'ヨーグルト150g・バナナ1本',
    ingredients: [
      { foodId: '13025', grams: 150 }, // ヨーグルト（全脂無糖）
      { foodId: '07107', grams: 100 }, // バナナ
    ],
  },

  // ---------- 高たんぱくメニュー ----------
  {
    id: 'chicken-breast-rice',
    name: '鶏むねとごはん',
    emoji: '💪',
    category: '高たんぱく',
    serving: 'ごはん200g・鶏むね（皮なし・焼き）150g',
    ingredients: [
      { foodId: '01088', grams: 200 },
      { foodId: '11288', grams: 150 }, // 鶏むね（若どり・皮なし・焼き）
      { foodId: '06263', grams: 80 }, //  ブロッコリー（生）
    ],
  },
  {
    id: 'salmon-rice',
    name: '焼き鮭とごはん',
    emoji: '🍣',
    category: '高たんぱく',
    serving: 'ごはん200g・焼き鮭100g',
    ingredients: [
      { foodId: '01088', grams: 200 },
      { foodId: '10136', grams: 100 }, // さけ（しろさけ・焼き）
      { foodId: '06267', grams: 60 }, //  ほうれん草（生）
    ],
  },
  {
    id: 'protein-breakfast',
    name: 'ゆで卵3個と納豆',
    emoji: '🥚',
    category: '高たんぱく',
    serving: 'ゆで卵3個・納豆1パック',
    ingredients: [
      { foodId: '12005', grams: 150 }, // ゆで卵 3個
      { foodId: '04046', grams: 45 },
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

/** カテゴリの並び順（画面の見出しの順） */
export const DISH_CATEGORIES: readonly DishCategory[] = [
  '丼もの',
  '麺類',
  '定食・洋食',
  '中華',
  '軽食・朝食',
  '高たんぱく',
];

/** カテゴリごとに料理をまとめる（一覧の見出し用） */
export function dishesByCategory(): { category: DishCategory; dishes: Dish[] }[] {
  return DISH_CATEGORIES.map((category) => ({
    category,
    dishes: DISHES.filter((dish) => dish.category === category),
  })).filter((group) => group.dishes.length > 0);
}
