import { describe, expect, it } from 'vitest';

import { buildNextSessionPreview, buildSessionFeedback } from '../lib/training/feedback';
import {
  LIFT_STEP_KG,
  adjustSession,
  applySessionCompletion,
  emptyTrainingAdjustments,
  offsetFor,
} from '../lib/training/adaptive';
import { draftSessionFromProgram, previousPerformance, type TrainingSessionLog } from '../lib/training/log';
import { advanceActiveProgram, emptyData, parseStoredData, saveTrainingSession, STORAGE_KEY } from '../lib/storage';
import { sessionForActiveProgram, type ActiveProgram } from '../lib/programLibrary';

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

function seed(patch: Record<string, unknown> = {}) {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), activeProgram, ...patch }));
  return storage;
}

/** 実行中Programの今日のセッションから、実績つきの記録を作る。 */
function loggedSession(active: ActiveProgram, repsPerSet: number[], weightDelta = 0): TrainingSessionLog {
  const session = sessionForActiveProgram(active)!;
  const draft = draftSessionFromProgram(active, session, '2026-09-03');
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((_set, index) => ({
        weightKg: (exercise.plannedWeightKg ?? 0) + weightDelta,
        reps: repsPerSet[index] ?? exercise.plannedReps,
        done: true,
      })),
    })),
  };
}

describe('次回セッションのpreview', () => {
  it('実行中Programが無ければ、推測せずnullを返す', () => {
    expect(buildNextSessionPreview(null, emptyTrainingAdjustments())).toBeNull();
  });

  it('Programから読める内容だけを出す', () => {
    const preview = buildNextSessionPreview(activeProgram, emptyTrainingAdjustments());
    expect(preview).not.toBeNull();
    expect(preview!.week).toBe(1);
    expect(preview!.day).toBe(1);
    expect(preview!.exercises.length).toBeGreaterThan(0);
    expect(preview!.exercises.length).toBeLessThanOrEqual(3);
  });

  it('調整を反映した重量になる', () => {
    const base = buildNextSessionPreview(activeProgram, emptyTrainingAdjustments())!;
    const adjusted = applySessionCompletion(emptyTrainingAdjustments(), {
      sessionKey: 'k1', date: '2026-09-03',
      session: sessionForActiveProgram(activeProgram), log: null, outcome: 'completed',
    }).adjustments;
    const after = buildNextSessionPreview(activeProgram, adjusted)!;

    const baseSquat = base.exercises.find((item) => item.exerciseId === 'squat')!;
    const afterSquat = after.exercises.find((item) => item.exerciseId === 'squat')!;
    expect(afterSquat.weightKg!).toBe(baseSquat.weightKg! + LIFT_STEP_KG.squat);
  });

  it('previewの重量は、実際にTodayが出す重量と一致する（P8-K）', () => {
    const adjustments = applySessionCompletion(emptyTrainingAdjustments(), {
      sessionKey: 'k1', date: '2026-09-03',
      session: sessionForActiveProgram(activeProgram), log: null, outcome: 'completed',
    }).adjustments;

    const preview = buildNextSessionPreview(activeProgram, adjustments)!;
    // Todayが使うのと同じ経路
    const todaySession = adjustSession(sessionForActiveProgram(activeProgram)!, adjustments);

    for (const exercise of preview.exercises) {
      const actual = todaySession.exercises.find((item) => item.exerciseId === exercise.exerciseId)!;
      expect(exercise.weightKg).toBe(actual.weightKg);
    }
  });

  it('保存済みデータから作り直しても、同じpreviewになる（reload後）', () => {
    const storage = seed();
    advanceActiveProgram('complete', loggedSession(activeProgram, [5, 5, 5, 5, 5]), storage);

    const first = parseStoredData(storage.getItem(STORAGE_KEY));
    const a = buildNextSessionPreview(first.activeProgram, first.trainingAdjustments);
    const second = parseStoredData(storage.getItem(STORAGE_KEY));
    const b = buildNextSessionPreview(second.activeProgram, second.trainingAdjustments);
    expect(a).toEqual(b);
  });
});

describe('完了後のまとめ', () => {
  function completeWith(repsPerSet: number[], weightDelta = 0, action: 'complete' | 'skip' = 'complete') {
    const storage = seed();
    const log = weightDelta === 0 && repsPerSet.length === 0
      ? null
      : loggedSession(activeProgram, repsPerSet, weightDelta);
    const finishedKey = `${activeProgram.programId}:w1d1`;
    const result = advanceActiveProgram(action, log, storage)!;
    return buildSessionFeedback({
      log,
      evaluations: result.evaluations,
      adjustments: result.adjustments,
      sessionKey: finishedKey,
      source: result.source,
      skipped: action === 'skip',
      programCompleted: result.completed,
      nextActiveProgram: result.activeProgram,
    });
  }

  it('予定どおりできたら、次回が上がったことを伝える', () => {
    const feedback = completeWith([5, 5, 5, 5, 5]);
    expect(feedback.source).toBe('sets');
    expect(feedback.headline).toContain('完了');

    const squat = feedback.exercises.find((item) => item.lift === 'squat')!;
    expect(squat.deltaKg).toBe(LIFT_STEP_KG.squat);
    expect(squat.nextWeightKg).not.toBeNull();
    expect(squat.reason).toContain('+5kg');
  });

  it('一部未達なら、据え置きだと伝える', () => {
    const feedback = completeWith([5, 5, 5, 4, 3]);
    const squat = feedback.exercises.find((item) => item.lift === 'squat')!;
    expect(squat.deltaKg).toBe(0);
    expect(squat.reason).toContain('もう一度');
  });

  it('下げるときは、整えるための調整として伝える', () => {
    const storage = seed();
    // 1回目の明確な未達
    advanceActiveProgram('complete', loggedSession(activeProgram, [5, 2, 0, 0, 0]), storage);
    const afterFirst = parseStoredData(storage.getItem(STORAGE_KEY));
    // 2回目
    const next = afterFirst.activeProgram!;
    const log = loggedSession(next, [5, 2, 0, 0, 0]);
    const finishedKey = `${next.programId}:w${next.currentWeek}d${next.currentDay}`;
    const result = advanceActiveProgram('complete', log, storage)!;

    const feedback = buildSessionFeedback({
      log, evaluations: result.evaluations, adjustments: result.adjustments,
      sessionKey: finishedKey, source: result.source, skipped: false,
      programCompleted: result.completed, nextActiveProgram: result.activeProgram,
    });

    const squat = feedback.exercises.find((item) => item.lift === 'squat')!;
    expect(squat.deltaKg).toBeLessThan(0);
    expect(squat.reason).toContain('整えやすい重量');
  });

  it('どの文言も責める言い方をしない', () => {
    for (const reps of [[5, 5, 5, 5, 5], [5, 5, 5, 4, 3], [5, 2, 0, 0, 0], [0, 0, 0, 0, 0]]) {
      const feedback = completeWith(reps);
      const text = [feedback.headline, ...feedback.exercises.map((item) => item.reason ?? '')].join('');
      expect(text).not.toMatch(/失敗|ダメ|弱く|サボ|できませんでした|もっと頑張/);
    }
  });

  it('スキップしたときも、次から続けられると伝える', () => {
    const feedback = completeWith([5, 5, 5, 5, 5], 0, 'skip');
    expect(feedback.skipped).toBe(true);
    expect(feedback.headline).toContain('次回から続けられます');
    expect(feedback.headline).not.toMatch(/失敗|ダメ/);
  });

  it('まとめの理由は、Adaptiveの判定と矛盾しない（P8-L）', () => {
    const storage = seed();
    const log = loggedSession(activeProgram, [5, 5, 5, 5, 5]);
    const result = advanceActiveProgram('complete', log, storage)!;
    const feedback = buildSessionFeedback({
      log, evaluations: result.evaluations, adjustments: result.adjustments,
      sessionKey: `${activeProgram.programId}:w1d1`, source: result.source,
      skipped: false, programCompleted: result.completed, nextActiveProgram: result.activeProgram,
    });

    const squat = feedback.exercises.find((item) => item.lift === 'squat')!;
    // まとめに出した次回重量が、保存された調整から作った実際の提示と一致する
    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    const todaySession = adjustSession(sessionForActiveProgram(stored.activeProgram!)!, stored.trainingAdjustments);
    const actual = todaySession.exercises.find((item) => item.exerciseId === 'squat')!;
    expect(squat.nextWeightKg).toBe(actual.weightKg);
    expect(squat.deltaKg).toBe(offsetFor(stored.trainingAdjustments, 'squat'));
  });

  it('セット記録が無い完了でも、まとめは作れる', () => {
    const storage = seed();
    const result = advanceActiveProgram('complete', null, storage)!;
    const feedback = buildSessionFeedback({
      log: null, evaluations: result.evaluations, adjustments: result.adjustments,
      sessionKey: `${activeProgram.programId}:w1d1`, source: result.source,
      skipped: false, programCompleted: result.completed, nextActiveProgram: result.activeProgram,
    });
    expect(feedback.source).toBe('session');
    expect(feedback.exercises).toEqual([]);
    expect(feedback.headline.length).toBeGreaterThan(0);
    expect(feedback.next).not.toBeNull();
  });

  it('Programを終えたら、やり切ったことを伝える', () => {
    const storage = memoryStorage();
    const last: ActiveProgram = { ...activeProgram, currentWeek: 4, currentDay: 3 };
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), activeProgram: last }));
    const result = advanceActiveProgram('complete', null, storage)!;
    const feedback = buildSessionFeedback({
      log: null, evaluations: result.evaluations, adjustments: result.adjustments,
      sessionKey: 'k', source: result.source, skipped: false,
      programCompleted: result.completed, nextActiveProgram: result.activeProgram,
    });
    expect(feedback.programCompleted).toBe(true);
    expect(feedback.headline).toContain('やり切りました');
    // Programが終わっていれば、次回は推測しない
    expect(feedback.next).toBeNull();
  });
});

describe('前回実績の参照', () => {
  it('前回の重量と回数を返す', () => {
    const sessions: TrainingSessionLog[] = [{
      id: 'a', date: '2026-08-27', savedAt: '', programId: 'p', week: 1, day: 1, sessionKey: 'k1',
      exercises: [{
        exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 70, plannedSets: 5, plannedReps: 5,
        sets: [
          { weightKg: 70, reps: 5, done: true },
          { weightKg: 70, reps: 5, done: true },
          { weightKg: 70, reps: 5, done: true },
          { weightKg: 70, reps: 5, done: true },
          { weightKg: 70, reps: 4, done: true },
        ],
      }],
    }];
    const last = previousPerformance(sessions, 'squat');
    expect(last).toEqual({ date: '2026-08-27', weightKg: 70, reps: [5, 5, 5, 5, 4] });
  });

  it('いま記録中のセッションは前回として出さない', () => {
    const sessions: TrainingSessionLog[] = [{
      id: 'a', date: '2026-09-03', savedAt: '', programId: 'p', week: 1, day: 1, sessionKey: 'today',
      exercises: [{ exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 70, plannedSets: 1, plannedReps: 5, sets: [{ weightKg: 70, reps: 5, done: true }] }],
    }];
    expect(previousPerformance(sessions, 'squat', 'today')).toBeNull();
  });

  it('押していないセットしかない日は飛ばす', () => {
    const sessions: TrainingSessionLog[] = [
      { id: 'a', date: '2026-08-20', savedAt: '', programId: 'p', week: 1, day: 1, sessionKey: 'k1',
        exercises: [{ exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 60, plannedSets: 1, plannedReps: 5, sets: [{ weightKg: 60, reps: 5, done: true }] }] },
      { id: 'b', date: '2026-08-27', savedAt: '', programId: 'p', week: 1, day: 2, sessionKey: 'k2',
        exercises: [{ exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 70, plannedSets: 1, plannedReps: 5, sets: [{ weightKg: 70, reps: 5, done: false }] }] },
    ];
    expect(previousPerformance(sessions, 'squat')?.date).toBe('2026-08-20');
  });

  it('記録が無ければnull', () => {
    expect(previousPerformance([], 'squat')).toBeNull();
  });

  it('いちばん多く使った重量を代表にする（ウォームアップに引っぱられない）', () => {
    const sessions: TrainingSessionLog[] = [{
      id: 'a', date: '2026-08-27', savedAt: '', programId: 'p', week: 1, day: 1, sessionKey: 'k1',
      exercises: [{
        exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 100, plannedSets: 5, plannedReps: 5,
        sets: [
          { weightKg: 40, reps: 10, done: true },
          { weightKg: 100, reps: 5, done: true },
          { weightKg: 100, reps: 5, done: true },
          { weightKg: 100, reps: 5, done: true },
        ],
      }],
    }];
    expect(previousPerformance(sessions, 'squat')?.weightKg).toBe(100);
  });
});

describe('読み込み直しへの強さ', () => {
  it('1セット押して読み込み直しても、実績が残る（P7）', () => {
    const storage = seed();
    const draft = draftSessionFromProgram(activeProgram, sessionForActiveProgram(activeProgram)!, '2026-09-03');
    const oneSet: TrainingSessionLog = {
      ...draft,
      exercises: draft.exercises.map((exercise, index) => index === 0
        ? { ...exercise, sets: exercise.sets.map((set, i) => (i === 0 ? { ...set, done: true } : set)) }
        : exercise),
    };
    expect(saveTrainingSession(oneSet, storage)).toBe(true);

    const reloaded = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(reloaded.trainingSessions).toHaveLength(1);
    expect(reloaded.trainingSessions[0]!.exercises[0]!.sets[0]!.done).toBe(true);
  });

  it('重量を直して押し直しても、直した値が残る', () => {
    const storage = seed();
    const draft = draftSessionFromProgram(activeProgram, sessionForActiveProgram(activeProgram)!, '2026-09-03');
    const edited: TrainingSessionLog = {
      ...draft,
      exercises: draft.exercises.map((exercise, index) => index === 0
        ? { ...exercise, sets: exercise.sets.map((set) => ({ ...set, weightKg: 92.5, reps: 4, done: true })) }
        : exercise),
    };
    saveTrainingSession(edited, storage);

    const reloaded = parseStoredData(storage.getItem(STORAGE_KEY));
    const sets = reloaded.trainingSessions[0]!.exercises[0]!.sets;
    expect(sets.every((set) => set.weightKg === 92.5 && set.reps === 4)).toBe(true);
  });

  it('完了を二度処理しても、offsetは二重に動かない（P8-G）', () => {
    const storage = seed();
    const log = loggedSession(activeProgram, [5, 5, 5, 5, 5]);
    advanceActiveProgram('complete', log, storage);
    const after = offsetFor(parseStoredData(storage.getItem(STORAGE_KEY)).trainingAdjustments, 'squat');

    // 同じセッションの記録をもう一度渡しても、キーが同じなので動かない
    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    const again = applySessionCompletion(stored.trainingAdjustments, {
      sessionKey: log.sessionKey, date: '2026-09-03',
      session: sessionForActiveProgram(activeProgram), log, outcome: 'completed',
    });
    expect(offsetFor(again.adjustments, 'squat')).toBe(after);
  });
});
