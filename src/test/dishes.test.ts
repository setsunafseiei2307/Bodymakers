import { describe, it, expect } from 'vitest';

import { DISHES, allDishResults, calcDish, findDish } from '../lib/dishes';
import { findFood } from '../lib/foods';

describe('料理データ', () => {
  it('IDと名前が重複していない', () => {
    expect(new Set(DISHES.map((d) => d.id)).size).toBe(DISHES.length);
    expect(new Set(DISHES.map((d) => d.name)).size).toBe(DISHES.length);
  });

  it('材料はすべて成分表に実在し、カロリーが収載されている', () => {
    for (const dish of DISHES) {
      expect(dish.ingredients.length, dish.name).toBeGreaterThan(0);
      for (const ingredient of dish.ingredients) {
        const food = findFood(ingredient.foodId);
        expect(food, `${dish.name}: 食品番号 ${ingredient.foodId} が見つからない`).not.toBeNull();
        expect(food?.kcal, `${dish.name}: ${food?.name} のカロリーが未収載`).not.toBeNull();
        expect(ingredient.grams, `${dish.name}: ${food?.name} のグラム数`).toBeGreaterThan(0);
      }
    }
  });

  it('1食ぶんの想定が全ての料理に書いてある', () => {
    // 配合を伏せたまま数字だけ出さないための決まり
    for (const dish of DISHES) {
      expect(dish.serving.length, dish.name).toBeGreaterThan(0);
    }
  });
});

describe('calcDish', () => {
  /**
   * 献立そのものではなく、足し算のしかたを検査する。
   * 材料を組み替えても壊れないよう、期待値は料理の材料から計算する。
   * （収録レシピを直書きすると、レシピを直すたびにテストが落ちる）
   */
  function sumOf(dishId: string, key: 'kcal' | 'protein' | 'fat' | 'carbs'): number {
    const dish = findDish(dishId)!;
    return dish.ingredients.reduce((total, ingredient) => {
      const food = findFood(ingredient.foodId)!;
      const value = food[key];
      return value == null ? total : total + (value * ingredient.grams) / 100;
    }, 0);
  }

  it('材料のカロリーを足し合わせる', () => {
    const result = calcDish(findDish('oyakodon')!);
    expect(result.totals.kcal).toBeCloseTo(sumOf('oyakodon', 'kcal'), 6);
  });

  it('内訳を材料の数だけ返す', () => {
    const dish = findDish('katsudon')!;
    const result = calcDish(dish);
    expect(result.rows).toHaveLength(dish.ingredients.length);
    expect(result.rows.map((r) => r.grams)).toEqual(dish.ingredients.map((i) => i.grams));
  });

  it('たんぱく質・脂質・炭水化物も同じように足す', () => {
    const result = calcDish(findDish('gyudon')!);
    expect(result.totals.protein).toBeCloseTo(sumOf('gyudon', 'protein'), 6);
    expect(result.totals.fat).toBeCloseTo(sumOf('gyudon', 'fat'), 6);
    expect(result.totals.carbs).toBeCloseTo(sumOf('gyudon', 'carbs'), 6);
  });

  it('材料が多い料理でも、内訳の合計が総計と一致する', () => {
    for (const dishId of ['katsudon', 'curry-rice', 'omurice', 'tuna-onigiri-set']) {
      const result = calcDish(findDish(dishId)!);
      const rowSum = result.rows.reduce((total, row) => total + (row.kcal ?? 0), 0);
      expect(result.totals.kcal, dishId).toBeCloseTo(rowSum, 6);
    }
  });

  it('すべての料理でカロリーが正の値になる', () => {
    for (const result of allDishResults()) {
      expect(result.totals.kcal, result.dish.name).toBeGreaterThan(0);
    }
  });

  it('現実的な範囲のカロリーに収まっている', () => {
    // 150〜1,500kcal を外れたら、分量か材料の選び方を間違えている。
    // 下限が低めなのは、ぎょうざのような副菜も収録しているため
    for (const result of allDishResults()) {
      expect(result.totals.kcal, `${result.dish.name} が範囲外`).toBeGreaterThan(150);
      expect(result.totals.kcal, `${result.dish.name} が範囲外`).toBeLessThan(1500);
    }
  });

  it('存在しない材料は無視して壊れない', () => {
    const result = calcDish({
      id: 'test',
      name: 'テスト',
      emoji: '🍚',
      category: '丼もの',
      serving: 'テスト',
      ingredients: [{ foodId: '99999', grams: 100 }, { foodId: '01088', grams: 100 }],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.totals.kcal).toBeCloseTo(findFood('01088')!.kcal!, 6);
  });
});
