import { describe, expect, it } from 'vitest';

import {
  MAX_SETS_PER_EXERCISE,
  TRAINING_SESSION_LIMIT,
  bestForLift,
  draftSessionFromProgram,
  findSessionLog,
  hasRecordedSets,
  liftForExercise,
  normalizeTrainingSession,
  normalizeTrainingSessions,
  recentSessions,
  sessionsForLift,
  strengthTrend,
  summarizeExerciseLog,
  summarizeSession,
  type TrainingSessionLog,
} from '../lib/training/log';
import { emptyData, parseStoredData, saveTrainingSession, STORAGE_KEY } from '../lib/storage';
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
  exercises: [
    { exerciseId: 'squat', label: 'スクワット', sets: 3, reps: 5, weightKg: 100, percent: 80 },
    { exerciseId: 'bent-over-row', label: 'ロウ', sets: 3, reps: 8, weightKg: null, percent: null },
  ],
};

function sessionWith(sets: { weightKg: number; reps: number; done: boolean }[], planned = { weightKg: 100, sets: 3, reps: 5 }): TrainingSessionLog {
  return {
    id: 'k:2026-09-03', date: '2026-09-03', savedAt: '', programId: 'p', week: 1, day: 1, sessionKey: 'k',
    exercises: [{
      exerciseId: 'squat', label: 'スクワット',
      plannedWeightKg: planned.weightKg, plannedSets: planned.sets, plannedReps: planned.reps,
      sets,
    }],
  };
}

describe('種目とBIG3の対応', () => {
  it('BIG3を認識する', () => {
    expect(liftForExercise('squat')).toBe('squat');
    expect(liftForExercise('bench-press')).toBe('bench');
    expect(liftForExercise('deadlift')).toBe('deadlift');
  });

  it('未知の種目はnullにして無視できるようにする', () => {
    expect(liftForExercise('side-raise')).toBeNull();
    expect(liftForExercise('')).toBeNull();
    expect(liftForExercise('まだ無い種目')).toBeNull();
  });
});

describe('予定値からの初期化', () => {
  it('Programの予定がそのまま初期値になる', () => {
    const draft = draftSessionFromProgram(activeProgram, programSession, '2026-09-03');
    expect(draft.sessionKey).toBe('bodymakers-five-by-five:w1d1');
    expect(draft.date).toBe('2026-09-03');
    expect(draft.exercises).toHaveLength(2);

    const squat = draft.exercises[0]!;
    expect(squat.plannedWeightKg).toBe(100);
    expect(squat.plannedSets).toBe(3);
    expect(squat.plannedReps).toBe(5);
    expect(squat.sets).toHaveLength(3);
    // 予定値が最初から入っていて、押すだけで記録できる
    expect(squat.sets.every((set) => set.weightKg === 100 && set.reps === 5 && !set.done)).toBe(true);
  });

  it('重量の無い補助種目も行は作るが、重量は0のまま', () => {
    const draft = draftSessionFromProgram(activeProgram, programSession, '2026-09-03');
    expect(draft.exercises[1]!.plannedWeightKg).toBeNull();
    expect(draft.exercises[1]!.sets[0]!.weightKg).toBe(0);
  });

  it('セット数の多すぎるProgramは上限で止める', () => {
    const many: ProgramSession = { ...programSession, exercises: [{ ...programSession.exercises[0]!, sets: 50 }] };
    expect(draftSessionFromProgram(activeProgram, many, '2026-09-03').exercises[0]!.sets.length).toBe(MAX_SETS_PER_EXERCISE);
  });

  it('押していない下敷きは、記録として扱わない', () => {
    expect(hasRecordedSets(draftSessionFromProgram(activeProgram, programSession, '2026-09-03'))).toBe(false);
    expect(hasRecordedSets(null)).toBe(false);
  });
});

describe('実績のまとめ', () => {
  it('予定どおりできた場合、達成率が1になる', () => {
    const log = sessionWith([
      { weightKg: 100, reps: 5, done: true },
      { weightKg: 100, reps: 5, done: true },
      { weightKg: 100, reps: 5, done: true },
    ]);
    const performance = summarizeExerciseLog(log.exercises[0]!);
    expect(performance.completedReps).toBe(15);
    expect(performance.plannedTotalReps).toBe(15);
    expect(performance.ratio).toBe(1);
    expect(performance.completedSets).toBe(3);
    expect(performance.topSet).toEqual({ weightKg: 100, reps: 5, done: true });
  });

  it('一部しかできなかった場合、達成率が下がる', () => {
    const performance = summarizeExerciseLog(sessionWith([
      { weightKg: 100, reps: 5, done: true },
      { weightKg: 100, reps: 5, done: true },
      { weightKg: 100, reps: 3, done: true },
    ]).exercises[0]!);
    expect(performance.completedReps).toBe(13);
    expect(performance.ratio).toBeCloseTo(13 / 15);
  });

  it('押していないセットは実績に数えない', () => {
    const performance = summarizeExerciseLog(sessionWith([
      { weightKg: 100, reps: 5, done: true },
      { weightKg: 100, reps: 5, done: false },
      { weightKg: 100, reps: 5, done: false },
    ]).exercises[0]!);
    expect(performance.completedReps).toBe(5);
    expect(performance.completedSets).toBe(1);
  });

  it('予定より軽くしたセットは、達成として数えない', () => {
    const performance = summarizeExerciseLog(sessionWith([
      { weightKg: 100, reps: 5, done: true },
      { weightKg: 80, reps: 8, done: true },
      { weightKg: 80, reps: 8, done: true },
    ]).exercises[0]!);
    // 予定重量以上は1セットだけ
    expect(performance.completedReps).toBe(5);
    expect(performance.completedSets).toBe(1);
    // ただし一番重かったセットは記録として残る
    expect(performance.topSet?.weightKg).toBe(100);
  });

  it('予定より重くしたセットは達成として数える', () => {
    const performance = summarizeExerciseLog(sessionWith([
      { weightKg: 105, reps: 5, done: true },
      { weightKg: 105, reps: 5, done: true },
      { weightKg: 105, reps: 5, done: true },
    ]).exercises[0]!);
    expect(performance.completedReps).toBe(15);
    expect(performance.topSet?.weightKg).toBe(105);
  });

  it('複数の種目をまとめて出せる', () => {
    const log: TrainingSessionLog = {
      ...sessionWith([{ weightKg: 100, reps: 5, done: true }]),
      exercises: [
        { exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 100, plannedSets: 1, plannedReps: 5, sets: [{ weightKg: 100, reps: 5, done: true }] },
        { exerciseId: 'bench-press', label: 'ベンチ', plannedWeightKg: 60, plannedSets: 1, plannedReps: 5, sets: [{ weightKg: 60, reps: 5, done: true }] },
      ],
    };
    const summary = summarizeSession(log);
    expect(summary).toHaveLength(2);
    expect(summary.map((item) => item.lift)).toEqual(['squat', 'bench']);
  });
});

describe('壊れた記録への耐性', () => {
  it('セッションとして読めないものはnullにする', () => {
    for (const broken of [null, 'ごみ', 42, [], {}, { date: '2026-09-03' }, { sessionKey: 'k' }]) {
      expect(normalizeTrainingSession(broken)).toBeNull();
    }
  });

  it('中身の無いセッションは残さない', () => {
    expect(normalizeTrainingSession({ date: '2026-09-03', sessionKey: 'k', exercises: [] })).toBeNull();
  });

  it('壊れたセットは落として、読めるものだけ残す', () => {
    const restored = normalizeTrainingSession({
      date: '2026-09-03', sessionKey: 'k',
      exercises: [{
        exerciseId: 'squat',
        sets: [
          { weightKg: 100, reps: 5, done: true },
          { weightKg: Number.NaN, reps: 5, done: true },
          { weightKg: Number.POSITIVE_INFINITY, reps: 5, done: true },
          { weightKg: -50, reps: 5, done: true },
          { weightKg: 99999, reps: 5, done: true },
          { weightKg: 100, reps: -3, done: true },
          { weightKg: 100, reps: 5.5, done: true },
          { weightKg: 100, reps: 9999, done: true },
          'ごみ',
        ],
      }],
    });
    expect(restored).not.toBeNull();
    expect(restored!.exercises[0]!.sets).toEqual([{ weightKg: 100, reps: 5, done: true }]);
  });

  it('項目が欠けていても既定値で埋める', () => {
    const restored = normalizeTrainingSession({
      date: '2026-09-03', sessionKey: 'k',
      exercises: [{ exerciseId: 'squat', sets: [{ weightKg: 100, reps: 5, done: true }] }],
    });
    expect(restored!.exercises[0]!.label).toBe('squat');
    expect(restored!.exercises[0]!.plannedWeightKg).toBeNull();
    expect(restored!.exercises[0]!.plannedSets).toBe(0);
    expect(restored!.week).toBe(1);
  });

  it('未知の種目でも落とさず残す', () => {
    const restored = normalizeTrainingSession({
      date: '2026-09-03', sessionKey: 'k',
      exercises: [{ exerciseId: 'まだ無い種目', sets: [{ weightKg: 40, reps: 10, done: true }] }],
    });
    expect(restored!.exercises[0]!.exerciseId).toBe('まだ無い種目');
    expect(summarizeExerciseLog(restored!.exercises[0]!).lift).toBeNull();
  });

  it('一覧は日付順に並べ、上限で打ち切る', () => {
    const many = Array.from({ length: TRAINING_SESSION_LIMIT + 50 }, (_, index) => ({
      id: `s${index}`, date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`, sessionKey: `k${index}`,
      exercises: [{ exerciseId: 'squat', sets: [{ weightKg: 100, reps: 5, done: true }] }],
    }));
    const restored = normalizeTrainingSessions(many);
    expect(restored.length).toBe(TRAINING_SESSION_LIMIT);
    expect(restored[0]!.date <= restored.at(-1)!.date).toBe(true);
  });

  it('同じidが重なっていたら、後のものを残す', () => {
    const restored = normalizeTrainingSessions([
      { id: 'same', date: '2026-09-03', sessionKey: 'k', exercises: [{ exerciseId: 'squat', sets: [{ weightKg: 100, reps: 5, done: true }] }] },
      { id: 'same', date: '2026-09-03', sessionKey: 'k', exercises: [{ exerciseId: 'squat', sets: [{ weightKg: 110, reps: 5, done: true }] }] },
    ]);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.exercises[0]!.sets[0]!.weightKg).toBe(110);
  });

  it('一覧でないものは空配列にする', () => {
    for (const broken of [null, 'ごみ', 42, {}]) expect(normalizeTrainingSessions(broken)).toEqual([]);
  });
});

describe('筋力の伸び', () => {
  const sessions: TrainingSessionLog[] = [
    { ...sessionWith([{ weightKg: 100, reps: 5, done: true }]), id: 'a', date: '2026-08-20', sessionKey: 'k1' },
    { ...sessionWith([{ weightKg: 105, reps: 5, done: true }]), id: 'b', date: '2026-08-27', sessionKey: 'k2' },
    { ...sessionWith([{ weightKg: 110, reps: 5, done: true }]), id: 'c', date: '2026-09-03', sessionKey: 'k3' },
  ];

  it('推定1RMを時系列で出す', () => {
    const trend = strengthTrend(sessions, 'squat');
    expect(trend).toHaveLength(3);
    expect(trend[0]!.weightKg).toBe(100);
    expect(trend.at(-1)!.weightKg).toBe(110);
    // 既存の1RM計算を通しているので、実重量より大きい推定になる
    expect(trend.at(-1)!.estimatedOneRmKg).toBeGreaterThan(110);
    // 伸びている
    expect(trend.at(-1)!.estimatedOneRmKg!).toBeGreaterThan(trend[0]!.estimatedOneRmKg!);
  });

  it('記録が無ければ空になる', () => {
    expect(strengthTrend([], 'squat')).toEqual([]);
    expect(strengthTrend(sessions, 'bench')).toEqual([]);
  });

  it('最高記録を出す', () => {
    const best = bestForLift(sessions, 'squat');
    expect(best?.bestWeightKg).toBe(110);
    expect(best?.bestWeightDate).toBe('2026-09-03');
    expect(best?.bestEstimatedOneRmKg).toBeGreaterThan(110);
  });

  it('記録の無い種目の最高記録はnull', () => {
    expect(bestForLift(sessions, 'deadlift')).toBeNull();
    expect(bestForLift([], 'squat')).toBeNull();
  });

  it('押していないセットは最高記録に数えない', () => {
    const notDone = [{ ...sessionWith([{ weightKg: 200, reps: 1, done: false }]), id: 'x', date: '2026-09-04', sessionKey: 'k4' }];
    expect(bestForLift(notDone, 'squat')).toBeNull();
  });

  it('種目ごとの直近セッションを新しい順で出す', () => {
    const found = sessionsForLift(sessions, 'squat', 2);
    expect(found).toHaveLength(2);
    expect(found[0]!.session.date).toBe('2026-09-03');
  });

  it('直近のセッションを新しい順で出す', () => {
    expect(recentSessions(sessions, 2).map((item) => item.date)).toEqual(['2026-09-03', '2026-08-27']);
    expect(recentSessions([], 3)).toEqual([]);
  });

  it('セッションキーで保存済みの記録を探せる', () => {
    expect(findSessionLog(sessions, 'k2')?.id).toBe('b');
    expect(findSessionLog(sessions, 'ない')).toBeNull();
  });
});

describe('保存', () => {
  it('押した実績を保存し、読み直せる', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(emptyData()));

    const log = sessionWith([{ weightKg: 100, reps: 5, done: true }]);
    expect(saveTrainingSession(log, storage)).toBe(true);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.trainingSessions).toHaveLength(1);
    expect(stored.trainingSessions[0]!.exercises[0]!.sets[0]!.weightKg).toBe(100);
    expect(stored.trainingSessions[0]!.savedAt).not.toBe('');
  });

  it('何も押していない記録は保存しない', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(emptyData()));
    expect(saveTrainingSession(sessionWith([{ weightKg: 100, reps: 5, done: false }]), storage)).toBe(false);
    expect(parseStoredData(storage.getItem(STORAGE_KEY)).trainingSessions).toEqual([]);
  });

  it('同じセッションを保存し直すと上書きされる', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(emptyData()));

    saveTrainingSession(sessionWith([{ weightKg: 100, reps: 5, done: true }]), storage);
    saveTrainingSession(sessionWith([
      { weightKg: 100, reps: 5, done: true },
      { weightKg: 100, reps: 5, done: true },
    ]), storage);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.trainingSessions).toHaveLength(1);
    expect(stored.trainingSessions[0]!.exercises[0]!.sets).toHaveLength(2);
  });

  it('この項目が無い旧データでも読める', () => {
    const legacy = parseStoredData(JSON.stringify({ version: 1, dailyLogs: [{ date: '2026-09-01' }] }));
    expect(legacy.trainingSessions).toEqual([]);
  });
});
