/**
 * 画面をまたいだ通し確認。
 *
 * 個々のモジュールではなく、「実際にユーザーが辿る順番」で状態が
 * つながっているかを見る。特に、同じ数字が複数の画面で食い違わないこと。
 */

import { describe, expect, it } from 'vitest';

import {
  advanceActiveProgram,
  applyNutritionAdjustment,
  emptyData,
  parseStoredData,
  saveTrainingSession,
  setNutritionComplete,
  savePersonalPlan,
  STORAGE_KEY,
  type BodymakersData,
  type DailyLog,
} from '../lib/storage';
import { blankLog } from '../lib/activity/today';
import { shiftDateKey } from '../lib/activity/days';
import { buildFirstWeekProgress } from '../lib/onboarding';
import { buildWeeklyCoach } from '../lib/coach';
import { monthlyProgress, weeklyHistory } from '../lib/progressHistory';
import { buildExport, parseImport } from '../lib/dataTransfer';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';
import { adjustSession, offsetFor, LIFT_STEP_KG } from '../lib/training/adaptive';
import { draftSessionFromProgram } from '../lib/training/log';
import { resolveNutritionTarget, activeOffsetKcal } from '../lib/nutritionAdaptive';
import { buildWeeklyTrainingReview } from '../lib/training/review';
import { sessionForActiveProgram, type ActiveProgram } from '../lib/programLibrary';
import type { SavedDietPlan } from '../lib/storage';

const NOW = new Date(2026, 8, 3, 10, 0, 0);
const ago = (days: number) => shiftDateKey('2026-09-03', -days);

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: '', ...patch };
}

const dietPlan: SavedDietPlan = {
  createdAt: '2026-07-01T00:00:00.000Z',
  startingWeightKg: 75, targetWeightKg: 70, targetDate: '2026-11-01',
  tdee: 2600, targetCalories: 2400, proteinGrams: 140, fatGrams: 70, carbsGrams: 300,
  dailyKcalGap: -200, mode: 'cut',
};

const activeProgram: ActiveProgram = {
  programId: 'bodymakers-five-by-five',
  startedAt: '2026-08-01T00:00:00.000Z',
  currentWeek: 1, currentDay: 1,
  trainingMaxes: { bench: 80, squat: 100, deadlift: 120 },
  daysPerWeek: 3, durationWeeks: 4, primaryLift: 'squat', completedSessions: 0,
};

function seed(patch: Partial<BodymakersData> = {}) {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), ...patch }));
  return storage;
}
const read = (storage: Storage) => parseStoredData(storage.getItem(STORAGE_KEY));

describe('Scenario A: 新規 → 診断 → Plan → Today → 最初の記録', () => {
  it('段階が順に進み、どこでも次にやることが出る', () => {
    const storage = seed();

    // 何もない状態
    let data = read(storage);
    expect(buildFirstWeekProgress(data, NOW).stage).toBe('new');

    // 診断してPlanを保存
    expect(savePersonalPlan({ version: 1, createdAt: NOW.toISOString(), input: defaultDiagnosisInput() }, storage)).toBe(true);
    data = read(storage);
    expect(buildFirstWeekProgress(data, NOW).stage).toBe('plan-created');
    // Planができれば栄養の目安も出る
    expect(resolveNutritionTarget(data)).not.toBeNull();

    // 最初の記録は1つで足りる（ここでは体重を1つ）
    const withWeight = read(storage);
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...withWeight,
      dailyLogs: [...withWeight.dailyLogs, log('2026-09-03', { weightKg: 72 })],
    }));
    setNutritionComplete('2026-09-03', true, storage);
    data = read(storage);
    const progress = buildFirstWeekProgress(data, NOW);
    expect(progress.stage).toBe('first-action-done');
    expect(progress.steps.filter((step) => step.done)).toHaveLength(2);
    // まだAdaptiveは動かないが、次にやることは出ている
    expect(progress.unlocks.length).toBeGreaterThan(0);
  });
});

describe('Scenario B: トレーニング → 記録 → 完了 → 次回重量 → Record', () => {
  it('記録した内容が次回の提示重量になり、各画面で一致する', () => {
    const storage = seed({ activeProgram });

    const session = sessionForActiveProgram(activeProgram)!;
    const draft = draftSessionFromProgram(activeProgram, session, '2026-09-03');
    const done = {
      ...draft,
      exercises: draft.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set, done: true })),
      })),
    };
    expect(saveTrainingSession(done, storage)).toBe(true);

    const result = advanceActiveProgram('complete', done, storage)!;
    expect(result.source).toBe('sets');

    const data = read(storage);
    expect(offsetFor(data.trainingAdjustments, 'squat')).toBe(LIFT_STEP_KG.squat);

    // Todayが出す重量
    const next = sessionForActiveProgram(data.activeProgram!)!;
    const todayWeight = adjustSession(next, data.trainingAdjustments).exercises
      .find((item) => item.exerciseId === 'squat')?.weightKg;

    // Weekly Coachが出す「今週変わったこと」と一致する
    const coach = buildWeeklyCoach(data, NOW);
    expect(coach.training.changes.find((c) => c.lift === 'squat')?.deltaKg).toBe(LIFT_STEP_KG.squat);
    // 次の1週間のpreviewもTodayと同じ経路
    expect(coach.nextWeek.training).toContain('Week');
    expect(todayWeight).toBeGreaterThan(0);

    // Recordの週次レビューも同じセッション数を見る
    expect(buildWeeklyTrainingReview(data, NOW).sessions).toBe(1);
  });
});

describe('Scenario C: 食事 → 体重 → 完了 → 提案 → 適用 → Today目標', () => {
  it('適用した目標が、すべての画面で同じ値になる', () => {
    const logs = [
      ...[0, 1, 2, 3].map((d) => log(ago(d), { weightKg: 72, manualIntake: { kcal: 2400, protein: 140 }, nutritionComplete: true })),
      ...[7, 8, 9, 10].map((d) => log(ago(d), { weightKg: 72 })),
    ];
    const storage = seed({ dietPlan, dailyLogs: logs });

    // 提案が出る（体重は横ばい、記録は十分）
    let data = read(storage);
    let coach = buildWeeklyCoach(data, NOW);
    expect(coach.nutrition.state).toBe('adjust-down');
    expect(coach.recommendation.id).toBe('apply-nutrition-adjustment');
    // まだ適用されていない
    expect(resolveNutritionTarget(data)!.calories).toBe(2400);

    // 本人が選んで初めて変わる
    const applied = applyNutritionAdjustment(coach.nutrition.candidateKcal, 'test', storage)!;
    expect(applied.calories).toBe(2300);

    data = read(storage);
    const target = resolveNutritionTarget(data)!;
    expect(target.calories).toBe(2300);
    expect(target.baselineCalories).toBe(2400);
    // Planは書き換わっていない
    expect(data.dietPlan!.targetCalories).toBe(2400);

    // Weekly Coachの次週preview・変更一覧も同じ値
    coach = buildWeeklyCoach(data, NOW);
    expect(coach.nextWeek.nutrition).toBe('2300 kcal');
    expect(coach.nutrition.targetCalories).toBe(2300);
    expect(coach.changes.some((c) => c.text.includes('2300'))).toBe(true);
  });
});

describe('Scenario D: Weekly Coach → Record → 次の1週間', () => {
  it('週のまとめと過去の週で、同じ週の数字が一致する', () => {
    const logs = [0, 1, 2].map((d) => log(ago(d), { weightKg: 72, doneExercises: ['squat'], manualIntake: { kcal: 2400, protein: 140 }, nutritionComplete: true }));
    const storage = seed({ dietPlan, activeProgram, dailyLogs: logs });
    const data = read(storage);

    const coach = buildWeeklyCoach(data, NOW);
    const weeks = weeklyHistory(data, { now: NOW });

    expect(weeks[0]!.isCurrentWeek).toBe(true);
    expect(weeks[0]!.nutritionCompleteDays).toBe(coach.nutrition.completedDays);
  });
});

describe('Scenario E: 30日使ったユーザー', () => {
  it('30日の振り返りが週の合計と矛盾しない', () => {
    const days = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];
    const logs = days.map((d) => log(ago(d), { weightKg: 72, doneExercises: ['squat'], manualIntake: { kcal: 2400, protein: 140 }, nutritionComplete: true }));
    const storage = seed({ dietPlan, dailyLogs: logs });
    const data = read(storage);

    const monthly = monthlyProgress(data, NOW);
    expect(monthly.hasEnoughData).toBe(true);
    expect(monthly.activeDays).toBe(days.length);

    // 直近4週の合計は、30日の集計を超えない
    const weeks = weeklyHistory(data, { weeks: 4, now: NOW });
    const weekSum = weeks.reduce((total, week) => total + week.activeDays, 0);
    expect(weekSum).toBeLessThanOrEqual(monthly.activeDays);
  });
});

describe('Scenario F: 書き出し → 別環境 → 読み込み', () => {
  it('すべての状態が復元され、導出結果も一致する', () => {
    const logs = [
      ...[0, 1, 2, 3].map((d) => log(ago(d), { weightKg: 72, manualIntake: { kcal: 2400, protein: 140 }, nutritionComplete: true })),
      ...[7, 8, 9, 10].map((d) => log(ago(d), { weightKg: 72.5 })),
    ];
    const source = seed({ dietPlan, activeProgram, dailyLogs: logs });

    // トレーニングも記録して調整を作る
    const session = sessionForActiveProgram(activeProgram)!;
    const draft = draftSessionFromProgram(activeProgram, session, ago(1));
    advanceActiveProgram('complete', {
      ...draft,
      exercises: draft.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: true })) })),
    }, source);
    applyNutritionAdjustment(-100, 'test', source);

    const before = read(source);
    const beforeCoach = buildWeeklyCoach(before, NOW);

    // まっさらな環境へ読み込む
    const fresh = seed();
    const result = parseImport(JSON.stringify(buildExport(before)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    fresh.setItem(STORAGE_KEY, JSON.stringify(result.data));

    const after = read(fresh);
    expect(after.trainingSessions).toEqual(before.trainingSessions);
    expect(after.trainingAdjustments).toEqual(before.trainingAdjustments);
    expect(after.nutritionAdjustments).toEqual(before.nutritionAdjustments);
    expect(resolveNutritionTarget(after)!.calories).toBe(resolveNutritionTarget(before)!.calories);

    // 導出結果も一致する
    const afterCoach = buildWeeklyCoach(after, NOW);
    expect(afterCoach.state).toBe(beforeCoach.state);
    expect(afterCoach.nextWeek).toEqual(beforeCoach.nextWeek);
    expect(monthlyProgress(after, NOW).activeDays).toBe(monthlyProgress(before, NOW).activeDays);
  });
});

describe('Scenario G: 再診断 → 新しいPlan', () => {
  it('古い栄養の調整は効かなくなり、トレーニングの記録は残る', () => {
    const storage = seed({
      personalPlan: { version: 1, createdAt: '2026-07-01T00:00:00.000Z', input: { ...defaultDiagnosisInput(), goal: 'fat-loss' } },
      activeProgram,
    });

    // トレーニングの記録と調整を作る
    const session = sessionForActiveProgram(activeProgram)!;
    const draft = draftSessionFromProgram(activeProgram, session, ago(1));
    advanceActiveProgram('complete', {
      ...draft,
      exercises: draft.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: true })) })),
    }, storage);
    applyNutritionAdjustment(-100, 'test', storage);

    const before = read(storage);
    expect(activeOffsetKcal(before)).toBe(-100);
    const trainingBefore = before.trainingAdjustments;
    const sessionsBefore = before.trainingSessions;

    // 診断をやり直す（createdAtが変わり、目的も変わる）
    savePersonalPlan({
      version: 1, createdAt: '2026-09-03T00:00:00.000Z',
      input: { ...defaultDiagnosisInput(), goal: 'muscle' },
    }, storage);

    const after = read(storage);
    // 古い調整は効かない
    expect(activeOffsetKcal(after)).toBe(0);
    expect(resolveNutritionTarget(after)!.offsetKcal).toBe(0);
    // トレーニング側はそのまま残る
    expect(after.trainingAdjustments).toEqual(trainingBefore);
    expect(after.trainingSessions).toEqual(sessionsBefore);
  });
});

describe('空の状態でも、どの画面も壊れない', () => {
  it('Planなし・記録なしでも全部の導出が動く', () => {
    const data = emptyData();
    expect(() => buildFirstWeekProgress(data, NOW)).not.toThrow();
    expect(() => buildWeeklyCoach(data, NOW)).not.toThrow();
    expect(() => weeklyHistory(data, { now: NOW })).not.toThrow();
    expect(() => monthlyProgress(data, NOW)).not.toThrow();
    expect(resolveNutritionTarget(data)).toBeNull();
  });

  it('長く使っても、集計が現実的な時間で終わる', () => {
    const logs = Array.from({ length: 366 }, (_, index) => log(shiftDateKey('2026-09-03', -index), {
      weightKg: 70 + (index % 5) * 0.2,
      doneExercises: ['squat'],
      nutritionComplete: index % 2 === 0,
    }));
    const sessions = Array.from({ length: 200 }, (_, index) => ({
      id: `s${index}`, date: shiftDateKey('2026-09-03', -index), savedAt: '',
      programId: 'p', week: 1, day: 1, sessionKey: `k${index}`,
      exercises: [{ exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 100, plannedSets: 5, plannedReps: 5, sets: [{ weightKg: 100, reps: 5, done: true }] }],
    }));
    const data: BodymakersData = { ...emptyData(), dietPlan, dailyLogs: logs, trainingSessions: sessions };

    const started = Date.now();
    buildWeeklyCoach(data, NOW);
    monthlyProgress(data, NOW);
    weeklyHistory(data, { weeks: 8, now: NOW });
    buildFirstWeekProgress(data, NOW);
    // 1年ぶんでも十分速いこと。厳密な性能測定ではなく、
    // O(n^2) 級の劣化が入っていないかの歯止め。
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
