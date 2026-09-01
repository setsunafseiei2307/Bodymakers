import { describe, it, expect } from 'vitest';

import { ACTIVITIES, activityGroups, burnedKcal, findActivity, minutesForKcal } from '../lib/mets';
import { PORTIONS, bestFoodEquivalent, foodEquivalents } from '../lib/foodEquivalent';
import { findFood } from '../lib/foods';

describe('メッツ表', () => {
  it('IDが重複していない', () => {
    const ids = ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('メッツ値はすべて正の数', () => {
    for (const a of ACTIVITIES) {
      expect(a.mets, a.label).toBeGreaterThan(0);
      expect(Number.isFinite(a.mets)).toBe(true);
    }
  });

  it('出典の表にある値をそのまま持っている', () => {
    // 厚生労働省「健康づくりのための身体活動基準2013」参考資料の記載値
    expect(findActivity('walk-normal')?.mets).toBe(3.0);
    expect(findActivity('walk-brisk')?.mets).toBe(4.0);
    expect(findActivity('jog-slow')?.mets).toBe(6.0);
    expect(findActivity('run')?.mets).toBe(8.3);
    expect(findActivity('swim-crawl')?.mets).toBe(8.3);
    expect(findActivity('aerobics')?.mets).toBe(7.0);
    expect(findActivity('stand')?.mets).toBe(2.0);
  });

  it('用途別のまとまりは全活動を漏れなく含む', () => {
    const total = activityGroups().reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(ACTIVITIES.length);
  });
});

describe('burnedKcal', () => {
  it('メッツ×時間×体重×1.05 で計算する', () => {
    // 3.0メッツ・60分・70kg → 3.0 × 1 × 70 × 1.05 = 220.5
    expect(burnedKcal(3.0, 60, 70)).toBeCloseTo(220.5, 6);
    // 30分なら半分
    expect(burnedKcal(3.0, 30, 70)).toBeCloseTo(110.25, 6);
  });

  it('体重が重いほど消費が大きい', () => {
    expect(burnedKcal(4.0, 30, 90)!).toBeGreaterThan(burnedKcal(4.0, 30, 60)!);
  });

  it('0分なら0kcal', () => {
    expect(burnedKcal(3.0, 0, 70)).toBe(0);
  });

  it('不正な値では null', () => {
    expect(burnedKcal(0, 30, 70)).toBeNull();
    expect(burnedKcal(3, -1, 70)).toBeNull();
    expect(burnedKcal(3, 30, 0)).toBeNull();
    expect(burnedKcal(Number.NaN, 30, 70)).toBeNull();
  });
});

describe('minutesForKcal', () => {
  it('burnedKcal と往復して同じ値になる', () => {
    const kcal = burnedKcal(4.0, 45, 68)!;
    expect(minutesForKcal(4.0, kcal, 68)).toBeCloseTo(45, 6);
  });

  it('強度が高いほど短い時間で済む', () => {
    expect(minutesForKcal(8.3, 300, 70)!).toBeLessThan(minutesForKcal(3.0, 300, 70)!);
  });
});

describe('カロリーの食べ物換算', () => {
  it('換算に使う食品はすべて成分表に存在する', () => {
    for (const p of PORTIONS) {
      const food = findFood(p.foodId);
      expect(food, `食品番号 ${p.foodId}（${p.label}）が見つからない`).not.toBeNull();
      expect(food?.kcal, `${p.label} のカロリーが未収載`).not.toBeNull();
    }
  });

  it('1食ぶんのカロリーは 収載値×グラム数÷100 になる', () => {
    // ごはん（精白米）156kcal/100g × 150g = 234kcal
    const rice = foodEquivalents(1000).find((e) => e.food.id === '01088')!;
    expect(rice.kcalPerPortion).toBeCloseTo(234, 6);
    expect(rice.portions).toBeCloseTo(1000 / 234, 6);
  });

  it('グラム数の但し書きを必ず持っている', () => {
    for (const e of foodEquivalents(500)) {
      expect(e.note.length, e.label).toBeGreaterThan(0);
      expect(e.grams).toBeGreaterThan(0);
    }
  });

  it('0kcal でも壊れない', () => {
    expect(foodEquivalents(0).every((e) => e.portions === 0)).toBe(true);
  });

  it('負の値では空になる', () => {
    expect(foodEquivalents(-100)).toEqual([]);
  });

  it('代表の1件は個数が想像できる範囲を選ぶ', () => {
    // ごはん1杯ぶん（234kcal）くらいなら、1〜4個に収まるものが選ばれる
    const best = bestFoodEquivalent(234)!;
    expect(best.portions).toBeGreaterThanOrEqual(1);
    expect(best.portions).toBeLessThanOrEqual(4);
  });

  it('極端に小さいカロリーでも1件は返す', () => {
    expect(bestFoodEquivalent(5)).not.toBeNull();
  });
});
