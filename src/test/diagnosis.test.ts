import { describe, expect, it } from 'vitest';

import { buildPersonalPlan } from '../lib/diagnosis/plan';
import { diagnosePersonalPlan } from '../lib/diagnosis/score';
import type { PersonalPlanInput } from '../lib/diagnosis/types';

function input(overrides: Partial<PersonalPlanInput> = {}): PersonalPlanInput {
  return {
    goal: 'muscle',
    targets: { weightKg: 75, lifts: { bench: 100 } },
    body: { sex: 'male', age: 30, heightCm: 172, weightKg: 70, bodyFatPercent: null },
    training: { experience: 'threeToSix', daysPerWeek: 3, sessionMinutes: 60, location: 'gym', focus: 'hypertrophy' },
    strength: { bench: 80, squat: 100, deadlift: 120 },
    food: { mealsPerDay: 3, breakfast: 'daily', protein: 'everyMeal', vegetables: 'normal', outsideMeals: 'oneToTwo', amount: 'normal' },
    lifestyle: { sleepDuration: 'sevenToEight', sleepQuality: 'good', dailyActivity: 'someWalk', alcohol: 'oneToTwo', smoking: false, stress: 'normal', painOrInjury: false },
    ...overrides,
  };
}

describe('段階式診断', () => {
  it('5軸と、入力に根拠を持つTOP 3を返す', () => {
    const result = diagnosePersonalPlan(input());
    expect(result.axes.map((axis) => axis.id)).toEqual(['body', 'strength', 'training', 'nutrition', 'recovery']);
    expect(result.axes.every((axis) => axis.score >= 0 && axis.score <= 100 && axis.reasons.length > 0)).toBe(true);
    expect(result.priorities).toHaveLength(3);
    expect(result.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'weight', difference: '+5.0kg' }), expect.objectContaining({ id: 'bench', difference: '+20.0kg' })]));
  });

  it('目標により同じ食事量の重みを変える', () => {
    const food = { mealsPerDay: 3 as const, breakfast: 'daily' as const, protein: 'everyMeal' as const, vegetables: 'normal' as const, outsideMeals: 'oneToTwo' as const, amount: 'veryLow' as const };
    const muscle = diagnosePersonalPlan(input({ goal: 'muscle', food })).axes.find((axis) => axis.id === 'nutrition')!;
    const fatLoss = diagnosePersonalPlan(input({ goal: 'fat-loss', food })).axes.find((axis) => axis.id === 'nutrition')!;
    expect(muscle.score).toBeLessThan(fatLoss.score);
  });

  it('目的に合わせ、睡眠・頻度・たんぱく質を改善候補にする', () => {
    const result = diagnosePersonalPlan(input({
      goal: 'strength',
      training: { experience: 'none', daysPerWeek: 1, sessionMinutes: 30, location: 'home', focus: 'strength' },
      strength: {},
      food: { mealsPerDay: 1, breakfast: 'rarely', protein: 'rarely', vegetables: 'low', outsideMeals: 'daily', amount: 'unknown' },
      lifestyle: { sleepDuration: 'under5', sleepQuality: 'poor', dailyActivity: 'desk', alcohol: 'daily', smoking: false, stress: 'high', painOrInjury: false },
    }));
    expect(result.priorities.map((item) => item.id)).toEqual(expect.arrayContaining(['protein', 'sleep', 'frequency']));
    expect(result.axes.find((axis) => axis.id === 'training')!.score).toBeLessThan(60);
  });
});

describe('12週間Plan', () => {
  it('既存のPFC計算を使い、週の頻度ぶんのメニューを作る', () => {
    const result = buildPersonalPlan(input({ training: { experience: 'oneToThree', daysPerWeek: 4, sessionMinutes: 60, location: 'gym', focus: 'hypertrophy' } }));
    expect(result.phases).toHaveLength(3);
    expect(result.workouts).toHaveLength(4);
    expect(result.workouts[0]?.exerciseIds.length).toBeGreaterThan(0);
    expect(result.nutrition).toMatchObject({ calories: expect.any(Number), protein: expect.any(Number), fat: expect.any(Number), carbs: expect.any(Number) });
    expect(result.todayWorkout).not.toBeNull();
  });
});
