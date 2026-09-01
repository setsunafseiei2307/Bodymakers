import { describe, expect, it } from 'vitest';
import { buildWeeklyRecordSummary, weekWindow } from '../lib/record';
import { emptyData } from '../lib/storage';

describe('record summary', () => {
  it('starts the week on Monday', () => {
    expect(weekWindow(new Date(2026, 8, 2))).toEqual({ start: '2026-08-31', end: '2026-09-06' });
  });

  it('counts only records in the current week without changing saved data', () => {
    const data = emptyData();
    data.dailyLogs = [
      { date: '2026-09-01', savedAt: '', weightKg: 70, meals: [{ foodId: '01001', grams: 100 }], exercises: [], muscles: [], doneExercises: ['bench-press'], manualIntake: { kcal: null, protein: null }, steps: null, sleepHours: 7 },
      { date: '2026-08-28', savedAt: '', weightKg: 71, meals: [], exercises: [], muscles: [], doneExercises: [], manualIntake: { kcal: null, protein: null }, steps: null, sleepHours: null },
    ];
    data.dietPlan = { createdAt: '', startingWeightKg: 70, targetWeightKg: 68, targetDate: '2026-10-01', tdee: 2200, targetCalories: 1800, proteinGrams: 100, fatGrams: 50, carbsGrams: 200, dailyKcalGap: 400, mode: 'cut' };
    data.activeProgram = { programId: 'bodymakers-linear', startedAt: '', currentWeek: 1, currentDay: 2, trainingMaxes: {}, daysPerWeek: 3, durationWeeks: 4, primaryLift: 'bench', completedSessions: 2 };
    expect(buildWeeklyRecordSummary(data, new Date(2026, 8, 2))).toMatchObject({ workoutDays: 1, mealRecordDays: 1, sleepRecordDays: 1, proteinTargetDays: 0, proteinTargetGrams: 100, activeProgramCompletedSessions: 2, activeProgramTotalSessions: 12, latestWeightKg: 70, previousWeightKg: 71 });
  });
});
