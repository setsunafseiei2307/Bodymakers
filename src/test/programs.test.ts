import { describe, expect, it } from 'vitest';

import { buildTrainingProgram } from '../lib/programs';

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
