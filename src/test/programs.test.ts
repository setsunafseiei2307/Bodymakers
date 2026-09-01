import { describe, expect, it } from 'vitest';

import { buildTrainingProgram, programDefaultsFromPersonalPlan, programOneRmFromPersonalPlan } from '../lib/programs';

describe('トレーニングプログラム', () => {
  it('初心者にはセッションごとの線形進歩を出す', () => {
    const plan = buildTrainingProgram({ exercise: 'スクワット', oneRmKg: 100, experience: 'beginner', daysPerWeek: 3, goal: 'strength' });
    expect(plan?.id).toBe('linear');
    expect(plan?.sessions).toHaveLength(12);
    expect(plan?.sessions.every((session) => session.weightKg % 2.5 === 0)).toBe(true);
  });

  it('中級・週3回は週単位の波を出す', () => {
    const plan = buildTrainingProgram({ exercise: 'ベンチプレス', oneRmKg: 120, experience: 'intermediate', daysPerWeek: 3, goal: 'strength' });
    expect(plan?.id).toBe('weekly-wave');
    expect(plan?.sessions.filter((session) => session.week === 4).every((session) => session.label.includes('デロード'))).toBe(true);
  });

  it('異常な入力は計算しない', () => {
    expect(buildTrainingProgram({ exercise: 'スクワット', oneRmKg: 0, experience: 'beginner', daysPerWeek: 3, goal: 'strength' })).toBeNull();
    expect(buildTrainingProgram({ exercise: 'スクワット', oneRmKg: 100, experience: 'beginner', daysPerWeek: 7, goal: 'strength' })).toBeNull();
  });

  it('目的によって中級者の回数設定を変える', () => {
    const strength = buildTrainingProgram({ exercise: 'ベンチプレス', oneRmKg: 100, experience: 'intermediate', daysPerWeek: 3, goal: 'strength' });
    const muscle = buildTrainingProgram({ exercise: 'ベンチプレス', oneRmKg: 100, experience: 'intermediate', daysPerWeek: 3, goal: 'muscle' });
    expect(strength?.sessions[0].reps).toBe(6);
    expect(muscle?.sessions[0].reps).toBe(8);
  });
});


describe('保存済みPlanの初期条件', () => {
  const input = {
    goal: 'strength' as const,
    targets: { weightKg: null, lifts: {} },
    body: { sex: 'male' as const, age: 30, heightCm: 172, weightKg: 70, bodyFatPercent: null },
    training: { experience: 'oneToThree' as const, daysPerWeek: 3 as const, sessionMinutes: 60 as const, location: 'gym' as const, focus: 'strength' as const },
    strength: { bench: 100, squat: 140 },
    food: { mealsPerDay: 3 as const, breakfast: 'daily' as const, protein: 'unknown' as const, vegetables: 'normal' as const, outsideMeals: 'oneToTwo' as const, amount: 'normal' as const },
    lifestyle: { sleepDuration: 'sixToSeven' as const, sleepQuality: 'normal' as const, dailyActivity: 'someWalk' as const, alcohol: 'oneToTwo' as const, smoking: false, stress: 'normal' as const, painOrInjury: false },
  };

  it('トレ歴・週回数・目的とBIG3の1RMを既存Planから再利用する', () => {
    expect(programDefaultsFromPersonalPlan(input)).toEqual({ experience: 'intermediate', daysPerWeek: 3, goal: 'strength' });
    expect(programOneRmFromPersonalPlan(input, 'ベンチプレス')).toBe(100);
    expect(programOneRmFromPersonalPlan(input, 'デッドリフト')).toBeNull();
  });
});
