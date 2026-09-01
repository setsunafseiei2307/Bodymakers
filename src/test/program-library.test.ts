import { describe, expect, it } from 'vitest';

import {
  PROGRAM_LIBRARY,
  generateLibraryProgram,
  recommendPrograms,
  sessionForActiveProgram,
  validateProgramDefinition,
  type ActiveProgram,
} from '../lib/programLibrary';
import type { PersonalPlanInput } from '../lib/diagnosis/types';

function plan(overrides: Partial<PersonalPlanInput> = {}): PersonalPlanInput {
  return {
    goal: 'strength',
    targets: { weightKg: null, lifts: {} },
    body: { sex: 'male', age: 30, heightCm: 172, weightKg: 70, bodyFatPercent: null },
    training: { experience: 'none', daysPerWeek: 3, sessionMinutes: 60, location: 'gym', focus: 'strength' },
    strength: { bench: 100, squat: 140, deadlift: 170 },
    food: { mealsPerDay: 3, breakfast: 'daily', protein: 'everyMeal', vegetables: 'normal', outsideMeals: 'oneToTwo', amount: 'normal' },
    lifestyle: { sleepDuration: 'sevenToEight', sleepQuality: 'good', dailyActivity: 'someWalk', alcohol: 'none', smoking: false, stress: 'normal', painOrInjury: false },
    ...overrides,
  };
}

describe('PROGRAM LIBRARY', () => {
  it('すべてのProgram定義を検証でき、5/3/1は紹介枠に留める', () => {
    expect(PROGRAM_LIBRARY).toHaveLength(9);
    expect(PROGRAM_LIBRARY.every(validateProgramDefinition)).toBe(true);
    expect(PROGRAM_LIBRARY.find((item) => item.id === 'wendler-531-reference')?.implementationType).toBe('reference');
  });

  it('診断の頻度・目的・経験から生成可能な上位3本を推薦する', () => {
    const recommendations = recommendPrograms(plan());
    expect(recommendations).toHaveLength(3);
    expect(recommendations.map((item) => item.definition.id)).toContain('bodymakers-linear');
    expect(recommendations.every((item) => item.reasons.length > 0)).toBe(true);
  });

  it('痛みがある診断ではSmolov Jr.をおすすめから外す', () => {
    const input = plan({ training: { experience: 'overThree', daysPerWeek: 4, sessionMinutes: 90, location: 'gym', focus: 'strength' }, lifestyle: { sleepDuration: 'sevenToEight', sleepQuality: 'good', dailyActivity: 'someWalk', alcohol: 'none', smoking: false, stress: 'normal', painOrInjury: true } });
    expect(recommendPrograms(input).map((item) => item.definition.id)).not.toContain('smolov-jr');
  });

  it('生成Programは保存済み1RMを2.5kg刻みの重量へ変換する', () => {
    const generated = generateLibraryProgram('bodymakers-five-by-five', { bench: 100, squat: 140, deadlift: 170 });
    expect(generated).not.toBeNull();
    const weighted = generated?.weeks.flatMap((session) => session.exercises).filter((exercise) => exercise.weightKg != null) ?? [];
    expect(weighted.length).toBeGreaterThan(0);
    expect(weighted.every((exercise) => (exercise.weightKg! * 10) % 25 === 0)).toBe(true);
  });

  it('activeProgramは現在のWeekとDayをToday向けセッションへ接続する', () => {
    const active: ActiveProgram = { programId: 'bodymakers-five-by-five', startedAt: '2026-09-02T00:00:00.000Z', currentWeek: 2, currentDay: 2, trainingMaxes: { bench: 100, squat: 140, deadlift: 170 }, daysPerWeek: 3, durationWeeks: 6, primaryLift: 'bench', completedSessions: 4 };
    expect(sessionForActiveProgram(active)).toMatchObject({ week: 2, day: 2, label: '5×5 B' });
  });
});
