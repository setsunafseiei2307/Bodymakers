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
  it('材料のカロリーを足し合わせる', () => {
    // 親子丼 = ごはん260g + 親子丼の具180g
    const rice = findFood('01088')!;
    const topping = findFood('18030')!;
    const result = calcDish(findDish('oyakodon')!);
    expect(result.totals.kcal).toBeCloseTo(rice.kcal! * 2.6 + topping.kcal! * 1.8, 6);
  });

  it('内訳を材料の数だけ返す', () => {
    const result = calcDish(findDish('katsudon')!);
    expect(result.rows).toHaveLength(5);
    expect(result.rows.map((r) => r.grams)).toEqual([260, 120, 50, 40, 60]);
  });

  it('たんぱく質・脂質・炭水化物も同じように足す', () => {
    const rice = findFood('01088')!;
    const topping = findFood('18031')!;
    const result = calcDish(findDish('gyudon')!);
    expect(result.totals.protein).toBeCloseTo(rice.protein! * 2.6 + topping.protein! * 1.8, 6);
    expect(result.totals.fat).toBeCloseTo(rice.fat! * 2.6 + topping.fat! * 1.8, 6);
    expect(result.totals.carbs).toBeCloseTo(rice.carbs! * 2.6 + topping.carbs! * 1.8, 6);
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
      serving: 'テスト',
      ingredients: [{ foodId: '99999', grams: 100 }, { foodId: '01088', grams: 100 }],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.totals.kcal).toBeCloseTo(findFood('01088')!.kcal!, 6);
  });
});
