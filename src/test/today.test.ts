import { describe, it, expect } from 'vitest';

import {
  SEDENTARY_FACTOR,
  dayBalance,
  summarizeExercise,
  summarizeIntake,
} from '../lib/today';
import { KCAL_PER_KG_FAT, calcBMR, type BodyInput } from '../lib/nutrition';
import { findFood } from '../lib/foods';

const body: BodyInput = {
  sex: 'male',
  age: 30,
  heightCm: 172,
  weightKg: 70,
  bodyFatPercent: null,
};

describe('summarizeIntake', () => {
  it('食品×グラム数を合計する', () => {
    // ごはん（精白米）156kcal/100g を 300g → 468kcal
    const summary = summarizeIntake([{ foodId: '01088', grams: 300 }]);
    expect(summary.totals.kcal).toBeCloseTo(468, 6);
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].name).toBe('ごはん（精白米）');
  });

  it('複数の食品を足し合わせる', () => {
    const rice = findFood('01088')!;
    const egg = findFood('12004')!;
    const summary = summarizeIntake([
      { foodId: '01088', grams: 150 },
      { foodId: '12004', grams: 100 },
    ]);
    expect(summary.totals.kcal).toBeCloseTo(rice.kcal! * 1.5 + egg.kcal! * 1, 6);
    expect(summary.totals.protein).toBeCloseTo(rice.protein! * 1.5 + egg.protein! * 1, 6);
  });

  it('未測定の成分は0として足さず、件数を数える', () => {
    // 09059「わかめ カットわかめ 水煮の汁」は、たんぱく質と脂質が成分表で未測定
    const waffle = findFood('09059')!;
    expect(waffle.protein, '前提: この食品のたんぱく質は未測定').toBeNull();

    const summary = summarizeIntake([{ foodId: '09059', grams: 100 }]);
    expect(summary.missing.protein).toBe(1);
    expect(summary.missing.fat).toBe(1);
    // 収載されている成分は普通に足される
    expect(summary.totals.carbs).toBeCloseTo(waffle.carbs!, 6);
  });

  it('未測定の食品を混ぜても、測定済みの成分の合計は壊れない', () => {
    const rice = findFood('01088')!;
    const summary = summarizeIntake([
      { foodId: '01088', grams: 100 },
      { foodId: '09059', grams: 100 },
    ]);
    // たんぱく質は、ごはんぶんだけが足され、未測定は1件と記録される
    expect(summary.totals.protein).toBeCloseTo(rice.protein!, 6);
    expect(summary.missing.protein).toBe(1);
  });

  it('存在しない食品や負のグラム数は無視する', () => {
    const summary = summarizeIntake([
      { foodId: '99999', grams: 100 },
      { foodId: '01088', grams: -50 },
    ]);
    expect(summary.items).toHaveLength(0);
    expect(summary.totals.kcal).toBe(0);
  });

  it('空の記録では合計が0', () => {
    expect(summarizeIntake([]).totals.kcal).toBe(0);
  });
});

describe('summarizeExercise', () => {
  it('活動×分を体重ぶんで合計する', () => {
    // 速歩4.0メッツ 30分 70kg → 4.0 × 0.5 × 70 × 1.05 = 147
    const summary = summarizeExercise([{ activityId: 'walk-brisk', minutes: 30 }], 70);
    expect(summary.kcal).toBeCloseTo(147, 6);
    expect(summary.items[0].label).toBe('速歩');
  });

  it('複数の活動を足す', () => {
    const summary = summarizeExercise(
      [
        { activityId: 'walk-brisk', minutes: 30 },
        { activityId: 'run', minutes: 20 },
      ],
      70,
    );
    expect(summary.items).toHaveLength(2);
    expect(summary.kcal).toBeGreaterThan(147);
  });

  it('知らない活動は無視する', () => {
    expect(summarizeExercise([{ activityId: 'unknown', minutes: 30 }], 70).items).toHaveLength(0);
  });
});

describe('dayBalance', () => {
  it('土台は基礎代謝×1.2で、運動ぶんは別に足す（二重に数えない）', () => {
    const bmr = calcBMR(body)!;
    const balance = dayBalance(body, 2000, 300)!;
    expect(balance.baseKcal).toBeCloseTo(bmr * SEDENTARY_FACTOR, 6);
    expect(balance.burnKcal).toBeCloseTo(bmr * SEDENTARY_FACTOR + 300, 6);
  });

  it('摂取が消費を下回れば収支はマイナス', () => {
    const balance = dayBalance(body, 1500, 300)!;
    expect(balance.balanceKcal).toBeLessThan(0);
    expect(balance.monthlyChangeKg).toBeLessThan(0);
  });

  it('1か月の変化は 収支×30÷7200 になる', () => {
    const balance = dayBalance(body, 1800, 200)!;
    expect(balance.monthlyChangeKg).toBeCloseTo((balance.balanceKcal * 30) / KCAL_PER_KG_FAT, 6);
  });

  it('食べすぎればプラスになる', () => {
    const balance = dayBalance(body, 4000, 0)!;
    expect(balance.balanceKcal).toBeGreaterThan(0);
    expect(balance.monthlyChangeKg).toBeGreaterThan(0);
  });

  it('基礎代謝が出せない入力では null', () => {
    expect(dayBalance({ ...body, age: 0 }, 2000, 0)).toBeNull();
  });
});
