import { describe, it, expect } from 'vitest';
import {
  calcBMR,
  calcMacros,
  leanBodyMass,
  bmi,
  weeksToGoal,
  ACTIVITY_LEVELS,
  GOAL_PRESETS,
  type BodyInput,
} from '../lib/nutrition';

const male: BodyInput = { sex: 'male', age: 35, heightCm: 172, weightKg: 70 };
const female: BodyInput = { sex: 'female', age: 30, heightCm: 160, weightKg: 55 };

describe('calcBMR', () => {
  it('Mifflin-St Jeor が理論値と一致する（男性）', () => {
    // 10*70 + 6.25*172 - 5*35 + 5 = 1605
    expect(calcBMR(male, 'mifflin')).toBeCloseTo(1605, 6);
  });

  it('Mifflin-St Jeor が理論値と一致する（女性）', () => {
    // 10*55 + 6.25*160 - 5*30 - 161 = 1239
    expect(calcBMR(female, 'mifflin')).toBeCloseTo(1239, 6);
  });

  it('同条件なら男性のほうが高く出る', () => {
    const m = calcBMR({ ...male, sex: 'male' })!;
    const f = calcBMR({ ...male, sex: 'female' })!;
    expect(m).toBeGreaterThan(f);
  });

  it('Harris-Benedict も計算できる', () => {
    expect(calcBMR(male, 'harris')).toBeCloseTo(88.362 + 13.397 * 70 + 4.799 * 172 - 5.677 * 35, 6);
  });

  it('Katch-McArdle は体脂肪率が必須', () => {
    expect(calcBMR(male, 'katch')).toBeNull();
    expect(calcBMR({ ...male, bodyFatPercent: 15 }, 'katch')).toBeCloseTo(370 + 21.6 * 59.5, 6);
  });

  it('年齢が上がるほど BMR は下がる', () => {
    const young = calcBMR({ ...male, age: 20 })!;
    const old = calcBMR({ ...male, age: 60 })!;
    expect(old).toBeLessThan(young);
  });

  it('範囲外の入力は null', () => {
    expect(calcBMR({ ...male, age: 0 })).toBeNull();
    expect(calcBMR({ ...male, age: 121 })).toBeNull();
    expect(calcBMR({ ...male, heightCm: 50 })).toBeNull();
    expect(calcBMR({ ...male, heightCm: 261 })).toBeNull();
    expect(calcBMR({ ...male, weightKg: 0 })).toBeNull();
    expect(calcBMR({ ...male, weightKg: 401 })).toBeNull();
  });

  it('NaN / Infinity は null', () => {
    expect(calcBMR({ ...male, weightKg: NaN })).toBeNull();
    expect(calcBMR({ ...male, heightCm: Infinity })).toBeNull();
  });
});

describe('calcMacros', () => {
  it('TDEE = BMR × 活動係数', () => {
    const r = calcMacros(male, 1.55, 0)!;
    expect(r.tdee).toBeCloseTo(r.bmr * 1.55, 6);
    expect(r.targetCalories).toBeCloseTo(r.tdee, 6);
  });

  it('減量設定で目標カロリーが TDEE を下回る', () => {
    const r = calcMacros(male, 1.55, -0.2)!;
    expect(r.targetCalories).toBeLessThan(r.tdee);
    expect(r.weeklyWeightChangeKg).toBeLessThan(0);
  });

  it('増量設定で目標カロリーが TDEE を上回る', () => {
    const r = calcMacros(male, 1.55, 0.1)!;
    expect(r.targetCalories).toBeGreaterThan(r.tdee);
    expect(r.weeklyWeightChangeKg).toBeGreaterThan(0);
  });

  it('PFC の合計カロリーが目標カロリーと一致する', () => {
    const r = calcMacros(male, 1.55, -0.15)!;
    const sum = r.protein.kcal + r.fat.kcal + r.carbs.kcal;
    expect(sum).toBeCloseTo(r.targetCalories, 4);
  });

  it('PFC の割合の合計が 100% になる', () => {
    const r = calcMacros(male, 1.55, 0)!;
    expect(r.protein.percent + r.fat.percent + r.carbs.percent).toBeCloseTo(100, 4);
  });

  it('タンパク質は体重×指定g で決まる', () => {
    const r = calcMacros(male, 1.55, 0, 'mifflin', { proteinPerKg: 2.2 })!;
    expect(r.protein.grams).toBeCloseTo(70 * 2.2, 6);
    expect(r.protein.kcal).toBeCloseTo(70 * 2.2 * 4, 6);
  });

  it('脂質は下限（体重×minFatPerKg）を割り込まない', () => {
    const r = calcMacros(male, 1.2, -0.4, 'mifflin', { fatPercent: 5, minFatPerKg: 0.8 })!;
    expect(r.fat.grams).toBeGreaterThanOrEqual(70 * 0.8 - 1e-9);
  });

  it('基礎代謝を下回る設定では警告が出る', () => {
    const r = calcMacros(male, 1.2, -0.6)!;
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('通常設定では警告が出ない', () => {
    const r = calcMacros(male, 1.55, -0.15)!;
    expect(r.warnings).toHaveLength(0);
  });

  it('炭水化物は 0 未満にならない', () => {
    const r = calcMacros(male, 1.2, -0.7, 'mifflin', { proteinPerKg: 3.5, fatPercent: 40 })!;
    expect(r.carbs.grams).toBeGreaterThanOrEqual(0);
    expect(r.carbs.kcal).toBeGreaterThanOrEqual(0);
  });

  it('活動係数が不正なら null', () => {
    expect(calcMacros(male, 0, 0)).toBeNull();
    expect(calcMacros(male, -1, 0)).toBeNull();
    expect(calcMacros(male, NaN, 0)).toBeNull();
  });

  it('体格が不正なら null', () => {
    expect(calcMacros({ ...male, weightKg: 0 }, 1.55, 0)).toBeNull();
  });
});

describe('leanBodyMass / bmi', () => {
  it('除脂肪体重が正しい', () => {
    expect(leanBodyMass(70, 15)).toBeCloseTo(59.5, 6);
    expect(leanBodyMass(70, 0)).toBeCloseTo(70, 6);
  });

  it('体脂肪率が範囲外なら null', () => {
    expect(leanBodyMass(70, -1)).toBeNull();
    expect(leanBodyMass(70, 100)).toBeNull();
    expect(leanBodyMass(0, 15)).toBeNull();
  });

  it('BMI が正しい（70kg / 172cm ≒ 23.66）', () => {
    expect(bmi(70, 172)).toBeCloseTo(70 / 1.72 ** 2, 6);
  });

  it('BMI の不正入力は null', () => {
    expect(bmi(0, 172)).toBeNull();
    expect(bmi(70, 0)).toBeNull();
  });
});

describe('weeksToGoal', () => {
  it('週あたりの変化量から週数を出す', () => {
    expect(weeksToGoal(80, 75, -0.5)).toBeCloseTo(10, 6);
  });

  it('方向が逆・0 なら null', () => {
    expect(weeksToGoal(80, 75, 0.5)).toBeNull();
    expect(weeksToGoal(80, 75, 0)).toBeNull();
  });

  it('すでに目標到達なら 0 週', () => {
    expect(weeksToGoal(75, 75, -0.5)).toBe(0);
  });
});

describe('プリセット定義の健全性', () => {
  it('活動レベルは 1.0 以上で昇順', () => {
    const f = ACTIVITY_LEVELS.map((a) => a.factor);
    expect(Math.min(...f)).toBeGreaterThanOrEqual(1);
    expect([...f].sort((a, b) => a - b)).toEqual(f);
  });

  it('目標プリセットに減量・維持・増量が揃っている', () => {
    const ratios = GOAL_PRESETS.map((g) => g.ratio);
    expect(ratios.some((r) => r < 0)).toBe(true);
    expect(ratios.some((r) => r === 0)).toBe(true);
    expect(ratios.some((r) => r > 0)).toBe(true);
  });

  it('全プリセットのタンパク質量が現実的な範囲', () => {
    for (const g of GOAL_PRESETS) {
      expect(g.protein).toBeGreaterThan(1);
      expect(g.protein).toBeLessThan(4);
    }
  });
});
