import { describe, expect, it } from 'vitest';

import {
  ADJUSTMENT_HISTORY_LIMIT,
  DELOAD_AFTER_MISSES,
  LIFT_STEP_KG,
  MAX_OFFSET_KG,
  adjustSession,
  adjustedWeightKg,
  adjustmentReasonText,
  adjustmentSummaryLines,
  applySessionOutcome,
  emptyTrainingAdjustments,
  liftsInSession,
  normalizeTrainingAdjustments,
  offsetFor,
  recentAdjustments,
  sessionKeyFor,
  type TrainingAdjustments,
} from '../lib/training/adaptive';
import { advanceActiveProgram, emptyData, parseStoredData, STORAGE_KEY } from '../lib/storage';
import type { ActiveProgram, ProgramSession } from '../lib/programLibrary';
import type { LiftId } from '../lib/strength/standards';

const NOW = new Date(2026, 8, 3, 10, 0, 0);

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
  currentWeek: 1,
  currentDay: 1,
  trainingMaxes: { bench: 80, squat: 100, deadlift: 120 },
  daysPerWeek: 3,
  durationWeeks: 4,
  primaryLift: 'squat',
  completedSessions: 0,
};

const session: ProgramSession = {
  week: 1,
  day: 1,
  label: 'Day 1',
  focus: '全身',
  exercises: [
    { exerciseId: 'squat', label: 'スクワット', sets: 5, reps: 5, weightKg: 85, percent: 85 },
    { exerciseId: 'bench-press', label: 'ベンチプレス', sets: 5, reps: 5, weightKg: 60, percent: 75 },
    // 重量の決まっていない補助種目は調整の対象にしない
    { exerciseId: 'bent-over-row', label: 'ベントオーバーロウ', sets: 3, reps: 8, weightKg: null, percent: null },
  ],
};

const DEFAULT_LIFTS: readonly LiftId[] = ['squat', 'bench'];

function complete(state: TrainingAdjustments, key: string, lifts: readonly LiftId[] = DEFAULT_LIFTS) {
  return applySessionOutcome(state, { sessionKey: key, lifts, outcome: 'completed', date: '2026-09-03' }, NOW);
}
function miss(state: TrainingAdjustments, key: string, lifts: readonly LiftId[] = DEFAULT_LIFTS) {
  return applySessionOutcome(state, { sessionKey: key, lifts, outcome: 'missed', date: '2026-09-03' }, NOW);
}

describe('調整の対象', () => {
  it('重量が決まっているBIG3だけを対象にする', () => {
    expect(liftsInSession(session)).toEqual(['squat', 'bench']);
  });

  it('セッションが無ければ対象なし', () => {
    expect(liftsInSession(null)).toEqual([]);
  });

  it('補助種目だけのセッションは対象なし', () => {
    const accessoryOnly: ProgramSession = {
      ...session,
      exercises: [{ exerciseId: 'side-raise', label: 'サイドレイズ', sets: 3, reps: 12, weightKg: null, percent: null }],
    };
    expect(liftsInSession(accessoryOnly)).toEqual([]);
  });

  it('セッションキーは週と日で変わる', () => {
    expect(sessionKeyFor(activeProgram)).toBe('bodymakers-five-by-five:w1d1');
    expect(sessionKeyFor({ ...activeProgram, currentDay: 2 })).not.toBe(sessionKeyFor(activeProgram));
    expect(sessionKeyFor({ ...activeProgram, currentWeek: 2 })).not.toBe(sessionKeyFor(activeProgram));
  });
});

describe('adjustment rule v1', () => {
  it('初回は調整なし（オフセット0）', () => {
    const state = emptyTrainingAdjustments();
    expect(offsetFor(state, 'squat')).toBe(0);
    expect(adjustmentSummaryLines(state)).toEqual([]);
  });

  it('完了したら、次回は1段階上がる', () => {
    const state = complete(emptyTrainingAdjustments(), 'w1d1');
    expect(offsetFor(state, 'squat')).toBe(LIFT_STEP_KG.squat);
    expect(offsetFor(state, 'bench')).toBe(LIFT_STEP_KG.bench);
    expect(state.lifts.squat?.reason).toBe('increase');
  });

  it('上半身と下半身で刻み幅が違う', () => {
    expect(LIFT_STEP_KG.bench).toBe(2.5);
    expect(LIFT_STEP_KG.squat).toBe(5);
    expect(LIFT_STEP_KG.deadlift).toBe(5);
  });

  it('未達1回なら据え置き', () => {
    const state = miss(emptyTrainingAdjustments(), 'w1d1');
    expect(offsetFor(state, 'squat')).toBe(0);
    expect(state.lifts.squat?.reason).toBe('hold');
    expect(state.lifts.squat?.consecutiveMisses).toBe(1);
  });

  it('連続で未達なら1段階下げ、カウントは戻る', () => {
    let state = miss(emptyTrainingAdjustments(), 'w1d1');
    state = miss(state, 'w1d2');
    expect(state.lifts.squat?.reason).toBe('deload');
    expect(offsetFor(state, 'squat')).toBe(-LIFT_STEP_KG.squat);
    expect(state.lifts.squat?.consecutiveMisses).toBe(0);
    expect(DELOAD_AFTER_MISSES).toBe(2);
  });

  it('完了すると未達のカウントが戻る', () => {
    let state = miss(emptyTrainingAdjustments(), 'w1d1');
    state = complete(state, 'w1d2');
    expect(state.lifts.squat?.consecutiveMisses).toBe(0);
    expect(offsetFor(state, 'squat')).toBe(LIFT_STEP_KG.squat);
  });

  it('積み上がりすぎないよう上限で止まる', () => {
    let state = emptyTrainingAdjustments();
    for (let i = 0; i < 40; i += 1) state = complete(state, `w1d${i}`);
    expect(offsetFor(state, 'squat')).toBe(MAX_OFFSET_KG);
    expect(state.lifts.squat?.reason).toBe('hold');
  });

  it('種目ごとに独立して動く', () => {
    let state = applySessionOutcome(emptyTrainingAdjustments(), {
      sessionKey: 'w1d1', lifts: ['squat'], outcome: 'completed', date: '2026-09-01',
    }, NOW);
    state = applySessionOutcome(state, {
      sessionKey: 'w1d2', lifts: ['bench'], outcome: 'missed', date: '2026-09-02',
    }, NOW);
    expect(offsetFor(state, 'squat')).toBe(LIFT_STEP_KG.squat);
    expect(offsetFor(state, 'bench')).toBe(0);
    expect(offsetFor(state, 'deadlift')).toBe(0);
  });

  it('対象の種目が無ければ何も変えない', () => {
    const state = emptyTrainingAdjustments();
    expect(applySessionOutcome(state, { sessionKey: 'w1d1', lifts: [], outcome: 'completed', date: '2026-09-03' }, NOW)).toBe(state);
  });
});

describe('Program自身の週次progressionと二重に足さない', () => {
  it('同じセッションを2回渡しても1回しか動かない', () => {
    const once = complete(emptyTrainingAdjustments(), 'w1d1');
    const twice = complete(once, 'w1d1');
    expect(offsetFor(twice, 'squat')).toBe(LIFT_STEP_KG.squat);
    expect(twice).toBe(once);
  });

  it('別のセッションなら、続けて動く', () => {
    let state = complete(emptyTrainingAdjustments(), 'w1d1');
    state = complete(state, 'w1d2');
    expect(offsetFor(state, 'squat')).toBe(LIFT_STEP_KG.squat * 2);
  });

  it('Programが出した重量は書き換えず、ズレだけを足す', () => {
    const state = complete(emptyTrainingAdjustments(), 'w1d1');
    const adjusted = adjustSession(session, state);
    // 元のセッションはそのまま
    expect(session.exercises[0]!.weightKg).toBe(85);
    // 表示用は Program重量 + ズレ
    expect(adjusted.exercises[0]!.weightKg).toBe(85 + LIFT_STEP_KG.squat);
    expect(adjusted.exercises[1]!.weightKg).toBe(60 + LIFT_STEP_KG.bench);
  });

  it('Programの週が進んで重量が上がっても、ズレは二重に乗らない', () => {
    const state = complete(emptyTrainingAdjustments(), 'w1d1');
    // 翌週、Program自身が90kgへ上げてきた場合
    const nextWeek: ProgramSession = { ...session, week: 2, exercises: [{ ...session.exercises[0]!, weightKg: 90 }] };
    const adjusted = adjustSession(nextWeek, state);
    expect(adjusted.exercises[0]!.weightKg).toBe(90 + LIFT_STEP_KG.squat);
  });

  it('補助種目の重量は触らない', () => {
    const state = complete(emptyTrainingAdjustments(), 'w1d1');
    const adjusted = adjustSession(session, state);
    expect(adjusted.exercises[2]!.weightKg).toBeNull();
  });

  it('調整が無ければセッションの中身は変わらない', () => {
    const adjusted = adjustSession(session, emptyTrainingAdjustments());
    expect(adjusted.exercises[0]).toBe(session.exercises[0]);
  });

  it('下げすぎても軽すぎる重量にはしない', () => {
    expect(adjustedWeightKg(22, 'squat', { version: 1, lifts: { squat: { offsetKg: -40, consecutiveMisses: 0, reason: 'deload', lastDeltaKg: -5, updatedAt: '', lastSessionKey: '' } }, history: [] })).toBe(20);
  });
});

describe('理由の表示', () => {
  it('上がった理由を出す', () => {
    const state = complete(emptyTrainingAdjustments(), 'w1d1');
    expect(adjustmentReasonText('squat', state.lifts.squat)).toBe('スクワットは前回のセッションを完了したので、次回は+5kgです。');
  });

  it('据え置きの理由を出す', () => {
    const state = miss(emptyTrainingAdjustments(), 'w1d1');
    expect(adjustmentReasonText('squat', state.lifts.squat)).toBe('スクワットは次回も同じ重量でもう一度です。');
  });

  it('下げた理由を出す', () => {
    let state = miss(emptyTrainingAdjustments(), 'w1d1');
    state = miss(state, 'w1d2');
    expect(adjustmentReasonText('squat', state.lifts.squat)).toBe('スクワットは同じ重量が続いたので、次回は−5kgで組み直します。');
  });

  it('調整前は理由を出さない', () => {
    expect(adjustmentReasonText('squat', undefined)).toBeNull();
  });

  it('責める言い方をしない', () => {
    let state = miss(emptyTrainingAdjustments(), 'w1d1');
    state = miss(state, 'w1d2');
    const text = adjustmentSummaryLines(state).join('');
    expect(text).not.toMatch(/失敗|サボ|できていません|未達成|残念|落ちました/);
  });

  it('文は3件までに抑える', () => {
    const state = applySessionOutcome(emptyTrainingAdjustments(), {
      sessionKey: 'w1d1', lifts: ['squat', 'bench', 'deadlift'], outcome: 'completed', date: '2026-09-03',
    }, NOW);
    expect(adjustmentSummaryLines(state)).toHaveLength(3);
  });
});

describe('調整の履歴', () => {
  it('調整のたびに履歴が残る', () => {
    let state = complete(emptyTrainingAdjustments(), 'w1d1');
    state = miss(state, 'w1d2');
    expect(state.history).toHaveLength(4);
    expect(state.history[0]).toMatchObject({ lift: 'squat', reason: 'increase', deltaKg: LIFT_STEP_KG.squat });
  });

  it('新しい順で取り出せる', () => {
    let state = complete(emptyTrainingAdjustments(), 'w1d1', ['squat']);
    state = miss(state, 'w1d2', ['squat']);
    const recent = recentAdjustments(state, 2);
    expect(recent[0]!.reason).toBe('hold');
    expect(recent[1]!.reason).toBe('increase');
  });

  it('履歴は上限で打ち切る', () => {
    let state = emptyTrainingAdjustments();
    for (let i = 0; i < 30; i += 1) state = complete(state, `w1d${i}`, ['squat']);
    expect(state.history.length).toBeLessThanOrEqual(ADJUSTMENT_HISTORY_LIMIT);
  });
});

describe('保存データとの互換', () => {
  it('この項目が無い旧データは、空の調整として読める', () => {
    const legacy = parseStoredData(JSON.stringify({
      version: 1,
      dailyLogs: [{ date: '2026-09-01', weightKg: 70 }],
    }));
    expect(legacy.trainingAdjustments).toEqual(emptyTrainingAdjustments());
  });

  it('壊れた調整データでも既定値へ倒す', () => {
    for (const broken of ['ごみ', 42, null, [], { version: 9 }, { version: 1, lifts: 'x', history: 'y' }]) {
      expect(normalizeTrainingAdjustments(broken)).toEqual(emptyTrainingAdjustments());
    }
  });

  it('型違いの項目は落として、読めるものだけ残す', () => {
    const restored = normalizeTrainingAdjustments({
      version: 1,
      lifts: {
        squat: { offsetKg: 5, consecutiveMisses: 1, reason: 'increase', lastDeltaKg: 5, updatedAt: 'x', lastSessionKey: 'k' },
        bench: { offsetKg: 'たくさん' },
        unknownLift: { offsetKg: 10 },
      },
      history: [
        { id: 'a', date: '2026-09-01', lift: 'squat', reason: 'increase', deltaKg: 5, offsetKg: 5, sessionKey: 'k' },
        { lift: 'nope', deltaKg: 1, offsetKg: 1 },
        'ごみ',
      ],
    });
    expect(restored.lifts.squat?.offsetKg).toBe(5);
    expect(restored.lifts.bench).toBeUndefined();
    expect(restored.history).toHaveLength(1);
  });

  it('範囲外のオフセットは丸める', () => {
    const restored = normalizeTrainingAdjustments({
      version: 1,
      lifts: { squat: { offsetKg: 9999 }, bench: { offsetKg: -9999 } },
      history: [],
    });
    expect(restored.lifts.squat?.offsetKg).toBe(MAX_OFFSET_KG);
    expect(restored.lifts.bench?.offsetKg).toBe(-MAX_OFFSET_KG);
  });

  it('保存して読み直しても同じ内容になる', () => {
    const state = complete(emptyTrainingAdjustments(), 'w1d1');
    const round = parseStoredData(JSON.stringify({ ...emptyData(), trainingAdjustments: state }));
    expect(round.trainingAdjustments).toEqual(state);
  });

  it('元の調整データを書き換えない', () => {
    const before = emptyTrainingAdjustments();
    const snapshot = JSON.stringify(before);
    complete(before, 'w1d1');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('Record → 保存 → 次回のTodayへ反映', () => {
  it('完了を記録すると、調整が保存される', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), activeProgram }));

    const result = advanceActiveProgram('complete', storage);
    expect(result).not.toBeNull();
    expect(result!.adjustments.lifts.squat?.reason).toBe('increase');

    // 保存されている
    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(offsetFor(stored.trainingAdjustments, 'squat')).toBeGreaterThan(0);
    // 次のDayへ進んでいる
    expect(stored.activeProgram?.currentDay).toBe(2);
  });

  it('スキップを記録すると据え置きになる', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), activeProgram }));

    advanceActiveProgram('skip', storage);
    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(offsetFor(stored.trainingAdjustments, 'squat')).toBe(0);
    expect(stored.trainingAdjustments.lifts.squat?.consecutiveMisses).toBe(1);
  });

  it('連続でスキップすると、次回の提示重量が下がる', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), activeProgram }));

    advanceActiveProgram('skip', storage);
    advanceActiveProgram('skip', storage);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(offsetFor(stored.trainingAdjustments, 'squat')).toBeLessThan(0);
    const adjusted = adjustSession(session, stored.trainingAdjustments);
    expect(adjusted.exercises[0]!.weightKg).toBeLessThan(session.exercises[0]!.weightKg!);
  });

  it('実行中Programが無ければ、何も記録しない', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(emptyData()));
    expect(advanceActiveProgram('complete', storage)).toBeNull();
  });

  it('食事や体重などの既存データは壊さない', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...emptyData(),
      activeProgram,
      dailyLogs: [{ date: '2026-09-01', weightKg: 70, meals: [{ foodId: '01088', grams: 100 }], exercises: [], muscles: [], doneExercises: [], manualIntake: { kcal: null, protein: null }, steps: null, sleepHours: null }],
      recentFoodIds: ['01088'],
    }));

    advanceActiveProgram('complete', storage);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.dailyLogs).toHaveLength(1);
    expect(stored.dailyLogs[0]!.meals).toHaveLength(1);
    expect(stored.recentFoodIds).toEqual(['01088']);
  });
});
