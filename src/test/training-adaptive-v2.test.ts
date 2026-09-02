import { describe, expect, it } from 'vitest';

import {
  HOLD_RATIO,
  LIFT_STEP_KG,
  MAX_OFFSET_KG,
  applySessionCompletion,
  emptyTrainingAdjustments,
  evaluateSessionLog,
  evaluationReasonText,
  offsetFor,
  type TrainingAdjustments,
} from '../lib/training/adaptive';
import { advanceActiveProgram, emptyData, parseStoredData, STORAGE_KEY } from '../lib/storage';
import type { TrainingSessionLog } from '../lib/training/log';
import type { ActiveProgram, ProgramSession } from '../lib/programLibrary';

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

const activeProgram: ActiveProgram = {
  programId: 'bodymakers-five-by-five',
  startedAt: '2026-08-01T00:00:00.000Z',
  currentWeek: 1, currentDay: 1,
  trainingMaxes: { bench: 80, squat: 100, deadlift: 120 },
  daysPerWeek: 3, durationWeeks: 4, primaryLift: 'squat', completedSessions: 0,
};

const programSession: ProgramSession = {
  week: 1, day: 1, label: 'Day 1', focus: '全身',
  exercises: [{ exerciseId: 'squat', label: 'スクワット', sets: 5, reps: 5, weightKg: 100, percent: 80 }],
};

/** 5×5の予定に対して、実際の回数を並べたセッションを作る。 */
function squatLog(actualReps: number[], weightKg = 100, sessionKey = 'k1'): TrainingSessionLog {
  return {
    id: `${sessionKey}:2026-09-03`, date: '2026-09-03', savedAt: '', programId: 'p', week: 1, day: 1, sessionKey,
    exercises: [{
      exerciseId: 'squat', label: 'スクワット',
      plannedWeightKg: 100, plannedSets: 5, plannedReps: 5,
      sets: actualReps.map((reps) => ({ weightKg, reps, done: true })),
    }],
  };
}

function apply(state: TrainingAdjustments, log: TrainingSessionLog | null, outcome: 'completed' | 'missed' = 'completed') {
  return applySessionCompletion(state, {
    sessionKey: log?.sessionKey ?? 'k1',
    date: '2026-09-03',
    session: programSession,
    log,
    outcome,
  });
}

describe('実績からの判定', () => {
  it('予定をすべてこなしたら次へ進む', () => {
    const evaluations = evaluateSessionLog(squatLog([5, 5, 5, 5, 5]));
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]).toMatchObject({ lift: 'squat', outcome: 'completed', ratio: 1, completedReps: 25, plannedTotalReps: 25, source: 'sets' });
  });

  it('あと少し（85%以上）なら据え置きで、未達には数えない', () => {
    // 25回中22回 = 0.88
    const evaluations = evaluateSessionLog(squatLog([5, 5, 5, 4, 3]));
    expect(evaluations[0]!.outcome).toBe('missed');
    expect(evaluations[0]!.partial).toBe(true);
    expect(evaluations[0]!.ratio).toBeGreaterThanOrEqual(HOLD_RATIO);
  });

  it('明確に届かなければ未達として数える', () => {
    // 25回中15回 = 0.6
    const evaluations = evaluateSessionLog(squatLog([5, 5, 5, 0, 0]));
    expect(evaluations[0]!.outcome).toBe('missed');
    expect(evaluations[0]!.partial).toBe(false);
  });

  it('完了ボタンだけでは増量しない（v1との違い）', () => {
    // セッションは「完了」だが、実績は25回中15回
    const result = apply(emptyTrainingAdjustments(), squatLog([5, 5, 5, 0, 0]), 'completed');
    expect(result.source).toBe('sets');
    expect(offsetFor(result.adjustments, 'squat')).toBe(0);
    expect(result.adjustments.lifts.squat?.reason).toBe('hold');
  });

  it('予定どおりできていれば増える', () => {
    const result = apply(emptyTrainingAdjustments(), squatLog([5, 5, 5, 5, 5]));
    expect(result.source).toBe('sets');
    expect(offsetFor(result.adjustments, 'squat')).toBe(LIFT_STEP_KG.squat);
  });

  it('一部未達を続けても、下げには進まない', () => {
    let state = apply(emptyTrainingAdjustments(), squatLog([5, 5, 5, 4, 3], 100, 'k1')).adjustments;
    state = apply(state, squatLog([5, 5, 5, 4, 3], 100, 'k2')).adjustments;
    state = apply(state, squatLog([5, 5, 5, 4, 3], 100, 'k3')).adjustments;
    expect(offsetFor(state, 'squat')).toBe(0);
    expect(state.lifts.squat?.reason).toBe('hold');
  });

  it('明確な未達が続いたら1段階下げる', () => {
    let state = apply(emptyTrainingAdjustments(), squatLog([5, 3, 0, 0, 0], 100, 'k1')).adjustments;
    expect(offsetFor(state, 'squat')).toBe(0);
    state = apply(state, squatLog([5, 3, 0, 0, 0], 100, 'k2')).adjustments;
    expect(offsetFor(state, 'squat')).toBe(-LIFT_STEP_KG.squat);
  });

  it('軽くして回数をこなした日は、達成として扱わない', () => {
    const result = apply(emptyTrainingAdjustments(), squatLog([10, 10, 10, 10, 10], 80));
    expect(offsetFor(result.adjustments, 'squat')).toBe(0);
  });

  it('重量の無い補助種目は判定に入れない', () => {
    const log: TrainingSessionLog = {
      ...squatLog([5, 5, 5, 5, 5]),
      exercises: [{
        exerciseId: 'side-raise', label: 'サイドレイズ',
        plannedWeightKg: null, plannedSets: 3, plannedReps: 12,
        sets: [{ weightKg: 10, reps: 12, done: true }],
      }],
    };
    expect(evaluateSessionLog(log)).toEqual([]);
  });

  it('種目ごとに独立して判定する', () => {
    const log: TrainingSessionLog = {
      ...squatLog([5, 5, 5, 5, 5]),
      exercises: [
        { exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 100, plannedSets: 5, plannedReps: 5, sets: Array.from({ length: 5 }, () => ({ weightKg: 100, reps: 5, done: true })) },
        { exerciseId: 'bench-press', label: 'ベンチ', plannedWeightKg: 60, plannedSets: 5, plannedReps: 5, sets: Array.from({ length: 5 }, () => ({ weightKg: 60, reps: 2, done: true })) },
      ],
    };
    const result = apply(emptyTrainingAdjustments(), log);
    expect(offsetFor(result.adjustments, 'squat')).toBe(LIFT_STEP_KG.squat);
    expect(offsetFor(result.adjustments, 'bench')).toBe(0);
  });
});

describe('v1へのfallback', () => {
  it('実績が無ければ完了/スキップで判定する', () => {
    const result = apply(emptyTrainingAdjustments(), null, 'completed');
    expect(result.source).toBe('session');
    expect(offsetFor(result.adjustments, 'squat')).toBe(LIFT_STEP_KG.squat);
  });

  it('スキップは実績があってもv1の扱いにする', () => {
    const result = apply(emptyTrainingAdjustments(), squatLog([5, 5, 5, 5, 5]), 'missed');
    expect(result.source).toBe('session');
    expect(offsetFor(result.adjustments, 'squat')).toBe(0);
    expect(result.adjustments.lifts.squat?.consecutiveMisses).toBe(1);
  });

  it('旧データ（実績なし）でも動く', () => {
    const legacy = parseStoredData(JSON.stringify({ version: 1, activeProgram }));
    expect(legacy.trainingSessions).toEqual([]);
    const result = applySessionCompletion(legacy.trainingAdjustments, {
      sessionKey: 'k1', date: '2026-09-03', session: programSession, log: null, outcome: 'completed',
    });
    expect(result.source).toBe('session');
    expect(offsetFor(result.adjustments, 'squat')).toBe(LIFT_STEP_KG.squat);
  });

  it('同じセッションを二度渡しても、二度は動かない', () => {
    const once = apply(emptyTrainingAdjustments(), squatLog([5, 5, 5, 5, 5], 100, 'k1')).adjustments;
    const twice = apply(once, squatLog([5, 5, 5, 5, 5], 100, 'k1')).adjustments;
    expect(offsetFor(twice, 'squat')).toBe(LIFT_STEP_KG.squat);
  });

  it('v1のguardはそのまま効いている', () => {
    let state = emptyTrainingAdjustments();
    for (let i = 0; i < 40; i += 1) {
      state = apply(state, squatLog([5, 5, 5, 5, 5], 100, `k${i}`)).adjustments;
    }
    expect(offsetFor(state, 'squat')).toBe(MAX_OFFSET_KG);
  });
});

describe('理由の説明', () => {
  it('実績の数字を入れて説明する', () => {
    const evaluations = evaluateSessionLog(squatLog([5, 5, 5, 5, 5]));
    expect(evaluationReasonText(evaluations[0]!, 5)).toBe('スクワットは目標25回中25回を完了したので、次回は+5kgです。');
  });

  it('一部未達は、責めずに据え置きと伝える', () => {
    const evaluations = evaluateSessionLog(squatLog([5, 5, 5, 4, 3]));
    const text = evaluationReasonText(evaluations[0]!, 0);
    expect(text).toBe('スクワットは目標25回中22回でした。次回も同じ重量でもう一度です。');
    expect(text).not.toMatch(/失敗|できませんでした|弱く|ダメ|頑張りましょう/);
  });

  it('下げるときも整えるという言い方にする', () => {
    const evaluations = evaluateSessionLog(squatLog([5, 3, 0, 0, 0]));
    const text = evaluationReasonText(evaluations[0]!, -5);
    expect(text).toContain('整えます');
    expect(text).not.toMatch(/失敗|弱く|ダメ/);
  });

  it('実績が無いときも説明できる', () => {
    const text = evaluationReasonText(
      { lift: 'bench', outcome: 'completed', ratio: null, completedReps: 0, plannedTotalReps: 0, source: 'session', partial: false },
      2.5,
    );
    expect(text).toBe('ベンチプレスはセッションを完了したので、次回は+2.5kgです。');
  });
});

describe('Record → 保存 → 次回への反映（実績あり）', () => {
  function seed() {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), activeProgram }));
    return storage;
  }

  it('実績を渡して完了すると、実績も調整もまとめて保存される', () => {
    const storage = seed();
    const log = squatLog([5, 5, 5, 5, 5], 100, 'bodymakers-five-by-five:w1d1');
    const result = advanceActiveProgram('complete', log, storage);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('sets');

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.trainingSessions).toHaveLength(1);
    expect(offsetFor(stored.trainingAdjustments, 'squat')).toBe(LIFT_STEP_KG.squat);
    expect(stored.activeProgram?.currentDay).toBe(2);
  });

  it('実績が届いていなければ、増量しないまま次へ進む', () => {
    const storage = seed();
    const log = squatLog([5, 5, 0, 0, 0], 100, 'bodymakers-five-by-five:w1d1');
    const result = advanceActiveProgram('complete', log, storage);

    expect(result!.source).toBe('sets');
    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(offsetFor(stored.trainingAdjustments, 'squat')).toBe(0);
    expect(stored.trainingSessions).toHaveLength(1);
  });

  it('先に保存した実績があれば、完了時にそれを読む', () => {
    const storage = seed();
    const log = squatLog([5, 5, 5, 5, 5], 100, 'bodymakers-five-by-five:w1d1');
    // 押しながら途中保存されている状態
    const data = parseStoredData(storage.getItem(STORAGE_KEY));
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...data, trainingSessions: [log] }));

    const result = advanceActiveProgram('complete', null, storage);
    expect(result!.source).toBe('sets');
    expect(offsetFor(result!.adjustments, 'squat')).toBe(LIFT_STEP_KG.squat);
  });

  it('実績が無ければ従来どおり完了で増える', () => {
    const storage = seed();
    const result = advanceActiveProgram('complete', null, storage);
    expect(result!.source).toBe('session');
    expect(offsetFor(result!.adjustments, 'squat')).toBe(LIFT_STEP_KG.squat);
  });

  it('既存の食事・体重の記録は壊さない', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...emptyData(), activeProgram,
      dailyLogs: [{ date: '2026-09-01', weightKg: 70, meals: [{ foodId: '01088', grams: 100 }], exercises: [], muscles: [], doneExercises: [], manualIntake: { kcal: null, protein: null }, steps: null, sleepHours: null }],
      recentFoodIds: ['01088'],
    }));

    advanceActiveProgram('complete', squatLog([5, 5, 5, 5, 5], 100, 'bodymakers-five-by-five:w1d1'), storage);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.dailyLogs[0]!.meals).toHaveLength(1);
    expect(stored.recentFoodIds).toEqual(['01088']);
  });

  it('Programを完了しても実績は残る', () => {
    const storage = memoryStorage();
    const last: ActiveProgram = { ...activeProgram, currentWeek: 4, currentDay: 3 };
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), activeProgram: last }));

    const result = advanceActiveProgram('complete', squatLog([5, 5, 5, 5, 5], 100, 'bodymakers-five-by-five:w4d3'), storage);
    expect(result!.completed).toBe(true);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.activeProgram).toBeNull();
    expect(stored.programHistory).toHaveLength(1);
    expect(stored.trainingSessions).toHaveLength(1);
  });
});
