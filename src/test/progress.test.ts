import { describe, expect, it } from 'vitest';

import { planProgress, weightTrend } from '../lib/progress';
import type { DailyLog, SavedDietPlan } from '../lib/storage';

const plan: SavedDietPlan = {
  createdAt: '2026-08-01T00:00:00.000Z',
  startingWeightKg: 80,
  targetWeightKg: 70,
  targetDate: '2026-11-09',
  tdee: 2500,
  targetCalories: 2000,
  proteinGrams: 160,
  fatGrams: 55,
  carbsGrams: 215,
  dailyKcalGap: -500,
  mode: 'cut',
};

function log(date: string, weightKg: number | null): DailyLog {
  return {
    date,
    weightKg,
    savedAt: `${date}T12:00:00.000Z`,
    meals: [],
    exercises: [],
    muscles: [],
    doneExercises: [],
    manualIntake: { kcal: null, protein: null },
    steps: null,
    sleepHours: null, nutritionComplete: false,
  };
}

describe('ダイエット進捗', () => {
  it('最新体重から残り・達成率・予定体重を出す', () => {
    const result = planProgress(
      plan,
      [log('2026-08-10', 79), log('2026-09-20', 75)],
      new Date(2026, 8, 20),
    );
    expect(result?.currentWeightKg).toBe(75);
    expect(result?.remainingKg).toBe(-5);
    expect(result?.progressPercent).toBe(50);
    expect(result?.remainingDays).toBeGreaterThan(0);
    expect(result?.expectedWeightKg).toBeLessThan(80);
  });

  it('進捗率は0〜100%に収める', () => {
    expect(planProgress(plan, [log('2026-08-10', 82)], new Date(2026, 7, 10))?.progressPercent).toBe(0);
    expect(planProgress(plan, [log('2026-08-10', 68)], new Date(2026, 10, 9))?.progressPercent).toBe(100);
  });

  it('体重推移は日付順の直近だけ返す', () => {
    expect(weightTrend([log('2026-08-03', 78), log('2026-08-01', 80), log('2026-08-02', 79)], 2))
      .toEqual([
        { date: '2026-08-02', weightKg: 79 },
        { date: '2026-08-03', weightKg: 78 },
      ]);
  });
});
