/**
 * APIを使わない食事の自由入力パーサー。
 *
 * 料理辞書・食品成分表の部分一致・数量だけを扱う。画像やAIで判定したように見せず、
 * 解釈できなかった語と、標準量を置いた箇所を必ず返す。
 */

import { DISHES } from './dishes';
import { normalizeQuery, searchFoods } from './foods';
import type { MealEntry } from './today';

export interface MealTextResult {
  meals: MealEntry[];
  matched: string[];
  unmatched: string[];
  assumptions: string[];
}

const ALIASES: Record<string, string> = {
  '白米': 'ごはん（精白米）',
  'ご飯': 'ごはん（精白米）',
  'ごはん': 'ごはん（精白米）',
  '卵': '鶏卵（全卵・生）',
  'たまご': '鶏卵（全卵・生）',
  '納豆': '納豆（糸引き）',
  'コンビニおにぎり': 'おにぎり',
  'おむすび': 'おにぎり',
};

const UNIT_GRAMS: Record<string, number> = {
  '卵': 50,
  'たまご': 50,
  '納豆': 50,
  'おにぎり': 100,
  'コンビニおにぎり': 100,
};

function splitItems(input: string): string[] {
  return input
    .replace(/(?:朝食|昼食|夕食|朝|昼|夜|間食)[：:]?/g, ' ')
    .split(/[、,，＋+\n]|\s+と\s*|と(?=[^う])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function quantityOf(text: string): { amount: number | null; unit: string | null } {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|グラム|個|杯|枚|本|パック|食)/i);
  if (!match) return { amount: null, unit: null };
  return { amount: Number(match[1]), unit: match[2]?.toLowerCase() ?? null };
}

function strippedName(text: string): string {
  return text
    .replace(/(\d+(?:\.\d+)?)\s*(?:kg|g|グラム|個|杯|枚|本|パック|食)/gi, '')
    .replace(/(?:大盛り|小盛り|少なめ|普通盛り|普通)/g, '')
    .trim();
}

export function parseMealText(input: string): MealTextResult {
  const result: MealTextResult = { meals: [], matched: [], unmatched: [], assumptions: [] };

  for (const raw of splitItems(input)) {
    const quantity = quantityOf(raw);
    const name = strippedName(raw);
    const normalized = normalizeQuery(name);
    if (normalized === '') continue;

    const dish = normalized.length >= 3 ? DISHES.find((item) => {
      const dishName = normalizeQuery(item.name);
      return normalized.includes(dishName) || dishName.includes(normalized);
    }) : undefined;
    if (dish) {
      const servingCount = quantity.amount ?? 1;
      const sizeMultiplier = raw.includes('大盛り') ? 1.3 : raw.includes('小盛り') || raw.includes('少なめ') ? 0.8 : 1;
      const multiplier = servingCount * sizeMultiplier;
      result.meals.push(...dish.ingredients.map((item) => ({
        foodId: item.foodId,
        grams: Math.round(item.grams * multiplier * 10) / 10,
      })));
      result.matched.push(`${dish.name}${multiplier === 1 ? '' : ` × ${multiplier}`}`);
      if (sizeMultiplier !== 1) {
        result.assumptions.push(`${dish.name}の「${raw.includes('大盛り') ? '大盛り' : '小盛り'}」を標準量の${sizeMultiplier}倍として計算`);
      }
      continue;
    }

    const alias = Object.entries(ALIASES).find(([key]) => normalized.includes(normalizeQuery(key)));
    const searchName = alias?.[1] ?? name;
    const food = searchFoods(searchName, { limit: 1, commonOnly: true })[0];
    if (!food) {
      result.unmatched.push(raw);
      continue;
    }

    let grams: number;
    if (quantity.amount != null && quantity.unit && /^(?:g|グラム)$/.test(quantity.unit)) {
      grams = quantity.amount;
    } else if (quantity.amount != null && quantity.unit === 'kg') {
      grams = quantity.amount * 1000;
    } else {
      const unitKey = Object.keys(UNIT_GRAMS).find((key) => normalized.includes(normalizeQuery(key)));
      const perUnit = unitKey ? UNIT_GRAMS[unitKey] : 100;
      grams = (quantity.amount ?? 1) * perUnit;
      result.assumptions.push(`${raw}は1${quantity.unit ?? '単位'}あたり${perUnit}gとして計算`);
    }
    result.meals.push({ foodId: food.id, grams });
    result.matched.push(`${food.name} ${grams}g`);
  }

  return result;
}
