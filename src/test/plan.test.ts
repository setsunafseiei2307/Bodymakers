import { describe, it, expect } from 'vitest';

import {
  PACE_BANDS,
  buildPlan,
  judgePace,
  validatePlanInput,
  weeksUntil,
} from '../lib/plan';
import { KCAL_PER_KG_FAT } from '../lib/nutrition';

describe('validatePlanInput', () => {
  it('現実的な入力は通る', () => {
    expect(validatePlanInput({ weightKg: 80, targetWeightKg: 72, weeks: 12 })).toEqual([]);
  });

  it('現在と目標が同じなら弾く', () => {
    const errors = validatePlanInput({ weightKg: 70, targetWeightKg: 70, weeks: 10 });
    expect(errors.map((e) => e.field)).toContain('targetWeightKg');
  });

  it('過去の日付（週数が0以下）は弾く', () => {
    expect(validatePlanInput({ weightKg: 70, targetWeightKg: 65, weeks: 0 })).toHaveLength(1);
  });

  it('範囲外の体重は弾く', () => {
    expect(validatePlanInput({ weightKg: 10, targetWeightKg: 8, weeks: 10 }).length).toBeGreaterThan(0);
    expect(validatePlanInput({ weightKg: 400, targetWeightKg: 380, weeks: 10 }).length).toBeGreaterThan(0);
  });
});

describe('judgePace', () => {
  it('減量は週0.5〜1%が推奨内', () => {
    expect(judgePace(0.3, 'cut')).toBe('gentle');
    expect(judgePace(0.5, 'cut')).toBe('recommended');
    expect(judgePace(1.0, 'cut')).toBe('recommended');
    expect(judgePace(1.3, 'cut')).toBe('fast');
    expect(judgePace(2.0, 'cut')).toBe('aggressive');
  });

  it('増量は減量より狭い範囲になる', () => {
    expect(PACE_BANDS.bulk.max).toBeLessThan(PACE_BANDS.cut.max);
    expect(judgePace(0.3, 'bulk')).toBe('recommended');
    expect(judgePace(0.7, 'bulk')).toBe('fast');
    expect(judgePace(1.2, 'bulk')).toBe('aggressive');
  });
});

describe('buildPlan', () => {
  it('目標体重が今より軽ければ減量として扱う', () => {
    const plan = buildPlan({ weightKg: 80, targetWeightKg: 72, weeks: 16 })!;
    expect(plan.mode).toBe('cut');
    expect(plan.totalChangeKg).toBeCloseTo(8, 5);
    expect(plan.dailyKcalGap).toBeLessThan(0);
  });

  it('目標体重が今より重ければ増量として扱う', () => {
    const plan = buildPlan({ weightKg: 60, targetWeightKg: 64, weeks: 20 })!;
    expect(plan.mode).toBe('bulk');
    expect(plan.dailyKcalGap).toBeGreaterThan(0);
  });

  it('1日の過不足は 体重差×7200 ÷ 日数 になる', () => {
    const plan = buildPlan({ weightKg: 80, targetWeightKg: 76, weeks: 10 })!;
    const expected = (-4 * KCAL_PER_KG_FAT) / (10 * 7);
    expect(plan.dailyKcalGap).toBeCloseTo(expected, 6);
  });

  it('週あたりの変化率は体重に対する割合で出す', () => {
    // 80kg → 76kg を10週。週0.4kg = 体重の0.5%
    const plan = buildPlan({ weightKg: 80, targetWeightKg: 76, weeks: 10 })!;
    expect(plan.weeklyChangeKg).toBeCloseTo(0.4, 6);
    expect(plan.weeklyPercent).toBeCloseTo(0.5, 6);
    expect(plan.verdict).toBe('recommended');
  });

  it('同じ週ペースでも体重が軽い人ほど厳しい判定になる', () => {
    // どちらも週0.8kg減
    const heavy = buildPlan({ weightKg: 100, targetWeightKg: 92, weeks: 10 })!;
    const light = buildPlan({ weightKg: 50, targetWeightKg: 42, weeks: 10 })!;
    expect(heavy.weeklyChangeKg).toBeCloseTo(light.weeklyChangeKg, 6);
    expect(heavy.verdict).toBe('recommended');
    expect(light.verdict).toBe('aggressive');
  });

  it('無理な期限には、推奨ペースで必要な週数を返す', () => {
    const plan = buildPlan({ weightKg: 80, targetWeightKg: 70, weeks: 4 })!;
    expect(plan.verdict).toBe('aggressive');
    // 週1%（0.8kg）で10kg落とすなら12.5週
    expect(plan.recommendedWeeks.fastest).toBeCloseTo(12.5, 5);
    // 週0.5%（0.4kg）なら25週
    expect(plan.recommendedWeeks.slowest).toBeCloseTo(25, 5);
  });

  it('その期限で推奨ペースなら何kg動かせるかを返す', () => {
    const plan = buildPlan({ weightKg: 80, targetWeightKg: 70, weeks: 4 })!;
    expect(plan.reachableChangeKg.max).toBeCloseTo(0.8 * 4, 5);
    expect(plan.reachableChangeKg.min).toBeCloseTo(0.4 * 4, 5);
  });

  it('推奨ペースで進めた場合の1日の過不足も返す', () => {
    // 80kg・減量。週1%＝0.8kg なら 1日 -822kcal、週0.5%＝0.4kg なら -411kcal
    const plan = buildPlan({ weightKg: 80, targetWeightKg: 70, weeks: 4 })!;
    expect(plan.recommendedDailyKcalGap.steepest).toBeCloseTo((-0.8 * KCAL_PER_KG_FAT) / 7, 4);
    expect(plan.recommendedDailyKcalGap.gentlest).toBeCloseTo((-0.4 * KCAL_PER_KG_FAT) / 7, 4);
    // 期限から出した赤字は、推奨ペースの赤字よりずっと大きい
    expect(plan.dailyKcalGap).toBeLessThan(plan.recommendedDailyKcalGap.steepest);
  });

  it('増量では推奨ペースの過不足が正になる', () => {
    const plan = buildPlan({ weightKg: 60, targetWeightKg: 66, weeks: 30 })!;
    expect(plan.recommendedDailyKcalGap.gentlest).toBeGreaterThan(0);
    expect(plan.recommendedDailyKcalGap.steepest).toBeGreaterThan(
      plan.recommendedDailyKcalGap.gentlest,
    );
  });

  it('不正な入力では null を返す', () => {
    expect(buildPlan({ weightKg: 70, targetWeightKg: 70, weeks: 10 })).toBeNull();
    expect(buildPlan({ weightKg: 70, targetWeightKg: 65, weeks: -1 })).toBeNull();
  });
});

describe('weeksUntil', () => {
  it('日付の差を週に直す', () => {
    const today = new Date(2026, 0, 1);
    expect(weeksUntil(new Date(2026, 0, 8), today)).toBeCloseTo(1, 6);
    expect(weeksUntil(new Date(2026, 0, 29), today)).toBeCloseTo(4, 6);
  });

  it('今日以前なら null', () => {
    const today = new Date(2026, 0, 10);
    expect(weeksUntil(new Date(2026, 0, 10), today)).toBeNull();
    expect(weeksUntil(new Date(2026, 0, 1), today)).toBeNull();
  });

  it('月をまたいでも日数で数える', () => {
    // 2026-01-31 → 2026-03-01 は29日
    expect(weeksUntil(new Date(2026, 2, 1), new Date(2026, 0, 31))).toBeCloseTo(29 / 7, 6);
  });
});
