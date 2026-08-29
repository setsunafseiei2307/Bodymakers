/** 食品データの型・検索・分量スケーリング */

import { isFiniteNumber } from './format';
import { FOODS } from './foodData';

export type NutrientKey = 'kcal' | 'protein' | 'fat' | 'carbs' | 'fiber' | 'salt';

export interface Food {
  /** 日本食品標準成分表の食品番号（例: '11227'） */
  id: string;
  /** 検索・表示に使う名前 */
  name: string;
  /** 該当する絵文字が無い食品は null。UI側は絵文字なしで表示する */
  emoji: string | null;
  category: string;
  /** 以下すべて可食部100gあたり。成分表で未測定の項目は null */
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fiber: number | null;
  salt: number | null;
  /** 成分表の収載名。出典を追えるようにそのまま保持する */
  officialName: string;
  /** 成分表で括弧付き（推定値）だった項目 */
  estimated?: NutrientKey[];
}

export { FOODS };

export const FOOD_SOURCE = {
  title: '日本食品標準成分表（八訂）増補2023年',
  publisher: '文部科学省',
  section: '第2章（データ）本表',
  url: 'https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html',
  basis: '可食部100gあたり',
} as const;

/**
 * 検索キーを正規化する。
 * カタカナはひらがなへ寄せ、全角英数は半角へ落とす。
 * 「マグロ」でも「まぐろ」でも同じ食品に当たるようにするため。
 */
export function normalizeQuery(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･]/g, '');
}

/**
 * 表示名に出てくる漢字の読み。
 * 表示名が「鶏むね」でも「とりむね」で引けるようにするために使う。
 * 成分表の収載名（にわとり／うし／ぶた…）だけでは「とりむね」「ぶたばら」のような
 * 実際によく打たれる形が拾えないため。
 *
 * 栄養価そのものではなく検索用のキーワードなので、ここは手で足してよい。
 * 長い語を先に置くこと（「牛乳」を「牛」より先に判定する）。
 */
const READINGS: readonly (readonly [string, readonly string[]])[] = [
  ['牛乳', ['ぎゅうにゅう']],
  ['豆腐', ['とうふ']],
  ['納豆', ['なっとう']],
  ['卵白', ['らんぱく']],
  ['卵黄', ['らんおう']],
  ['砂肝', ['すなぎも']],
  ['小松菜', ['こまつな']],
  ['白菜', ['はくさい']],
  ['枝豆', ['えだまめ']],
  ['大豆', ['だいず']],
  ['玄米', ['げんまい']],
  ['赤身', ['あかみ']],
  ['脂身', ['あぶらみ']],
  ['鶏', ['とり', 'にわとり']],
  ['牛', ['ぎゅう', 'うし']],
  ['豚', ['ぶた']],
  ['卵', ['たまご']],
  ['米', ['こめ']],
  ['魚', ['さかな']],
  ['肉', ['にく']],
  ['皮', ['かわ']],
  ['生', ['なま']],
  ['焼', ['やき']],
  ['干', ['ほし']],
  ['缶', ['かん']],
  ['塩', ['しお']],
  ['油', ['あぶら']],
  ['粉', ['こな']],
  ['豆', ['まめ']],
  ['乳', ['にゅう']],
] as const;

/** 表示名を読みに開いた文字列を作る。「鶏むね」→「とりむね」「にわとりむね」 */
function readingVariants(name: string): string[] {
  const out: string[] = [];
  let merged = name;
  for (const [kanji, readings] of READINGS) {
    if (!name.includes(kanji)) continue;
    for (const reading of readings) {
      out.push(name.split(kanji).join(reading));
    }
    merged = merged.split(kanji).join(readings[0]);
  }
  if (merged !== name) out.push(merged);
  return out;
}

/**
 * 口語・別名から成分表側の語への読み替え。
 * 「しゃけ」で「さけ」を引きたい、といったケースを拾う。
 */
const QUERY_SYNONYMS: readonly (readonly [string, string])[] = [
  ['しゃけ', 'さけ'],
  ['サーモン', 'さけ'],
  ['ツナ', 'まぐろ'],
  ['プロテイン', 'たんぱく'],
  ['チキン', 'とり'],
  ['ポーク', 'ぶた'],
  ['ビーフ', 'ぎゅう'],
  ['エッグ', 'たまご'],
  ['ミルク', 'ぎゅうにゅう'],
  ['ライス', 'ごはん'],
] as const;

/** 1食品ぶんの検索対象文字列。表示名・収載名・読み・カテゴリ・食品番号をまとめて持つ */
function haystack(food: Food): string {
  const parts = [food.name, food.officialName, food.category, food.id, ...readingVariants(food.name)];
  return normalizeQuery(parts.join(' '));
}

const HAYSTACKS = new Map<string, string>(FOODS.map((f) => [f.id, haystack(f)]));

/** 別名を成分表側の語に置き換えた検索キーを返す（元の語も残す） */
function expandQuery(q: string): string[] {
  const out = [q];
  for (const [alias, canonical] of QUERY_SYNONYMS) {
    const key = normalizeQuery(alias);
    if (q.includes(key)) out.push(q.split(key).join(normalizeQuery(canonical)));
  }
  return out;
}

export interface SearchOptions {
  /** 返す最大件数。既定は50 */
  limit?: number;
  /** 指定するとそのカテゴリ内だけを検索する */
  category?: string | null;
}

/**
 * 食品を絞り込む。空文字なら空配列を返す（全件を出しても選べないため）。
 * 前方一致 → 表示名に含む → 収載名などに含む、の順に並べる。
 */
export function searchFoods(query: string, options: SearchOptions = {}): Food[] {
  const limit = options.limit ?? 50;
  const pool = options.category ? FOODS.filter((f) => f.category === options.category) : FOODS;
  // 空白で区切られていたら、すべてを含む食品だけを返す（AND検索）。
  // 「とり ささみ」のように、表示名と収載名にまたがる語を繋げて打たれても拾えるようにするため。
  const tokens = (query ?? '')
    .split(/[\s　]+/)
    .map((t) => normalizeQuery(t))
    .filter((t) => t !== '');
  if (tokens.length === 0) return [];

  const scored: { food: Food; rank: number }[] = [];
  for (const food of pool) {
    const name = normalizeQuery(food.name);
    const hay = HAYSTACKS.get(food.id) ?? '';

    let worst = 0;
    let matchedAll = true;
    for (const token of tokens) {
      let rank = Infinity;
      for (const key of expandQuery(token)) {
        if (name.startsWith(key)) rank = Math.min(rank, 0);
        else if (name.includes(key)) rank = Math.min(rank, 1);
        else if (hay.includes(key)) rank = Math.min(rank, 2);
      }
      if (rank === Infinity) {
        matchedAll = false;
        break;
      }
      worst = Math.max(worst, rank);
    }
    if (!matchedAll) continue;
    scored.push({ food, rank: worst });
  }

  scored.sort((a, b) => a.rank - b.rank || a.food.name.length - b.food.name.length);
  return scored.slice(0, Math.max(0, limit)).map((s) => s.food);
}

/** 食品番号で1件引く */
export function findFood(id: string): Food | null {
  return FOODS.find((f) => f.id === id) ?? null;
}

export type ScaledFood = Record<NutrientKey, number | null>;

const NUTRIENT_KEYS: NutrientKey[] = ['kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt'];

/**
 * 指定グラム数ぶんの成分値。収載値は100gあたりなので比例させる。
 * カロリーはPFCから計算し直さない — 成分表のエネルギーは食物繊維やアルコールで
 * 係数が異なり、4/9/4 で再計算すると収載値と合わないため。
 */
export function scaleFood(food: Food, grams: number): ScaledFood | null {
  if (!isFiniteNumber(grams) || grams < 0) return null;
  const ratio = grams / 100;
  const out = {} as ScaledFood;
  for (const key of NUTRIENT_KEYS) {
    const value = food[key];
    out[key] = value == null ? null : value * ratio;
  }
  return out;
}

/** 成分表で推定値だった項目かどうか */
export function isEstimated(food: Food, key: NutrientKey): boolean {
  return food.estimated?.includes(key) ?? false;
}

/**
 * カテゴリを代表する絵文字。一覧から中身を見当づけるための飾りで、
 * 個々の食品の emoji とは独立に選んでいる。
 */
const CATEGORY_EMOJI: Record<string, string> = {
  '穀類・主食': '🍚',
  'いも・でん粉': '🥔',
  '砂糖・甘味': '🍯',
  '豆類': '🫘',
  '種実類': '🥜',
  '野菜類': '🥬',
  '果実類': '🍎',
  'きのこ類': '🍄',
  '藻類': '🍥',
  '魚介類': '🐟',
  '肉類': '🥩',
  '卵類': '🥚',
  '乳類': '🥛',
  '油脂類': '🧈',
  'し好飲料': '🍵',
  '調味料': '🧂',
};

export interface CategorySummary {
  name: string;
  count: number;
  emoji: string | null;
}

/** カテゴリ一覧を件数つきで返す（データに出現する順） */
export function categorySummaries(): CategorySummary[] {
  return foodCategories().map((name) => ({
    name,
    count: FOODS.filter((f) => f.category === name).length,
    emoji: CATEGORY_EMOJI[name] ?? null,
  }));
}

/** 指定カテゴリの食品をすべて返す */
export function foodsInCategory(category: string): Food[] {
  return FOODS.filter((f) => f.category === category);
}

/** カテゴリの一覧（データに出現する順） */
export function foodCategories(): string[] {
  const seen: string[] = [];
  for (const food of FOODS) {
    if (!seen.includes(food.category)) seen.push(food.category);
  }
  return seen;
}
