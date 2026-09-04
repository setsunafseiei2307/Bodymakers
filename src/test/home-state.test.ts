import { describe, expect, it } from 'vitest';

import { FALLBACK_HOME_STATE, resolveHomeState } from '../lib/home/state';
import { blankLog } from '../lib/activity/today';
import { dayActivity } from '../lib/activity/streak';
import { shiftDateKey } from '../lib/activity/days';
import { normalizeDiagnosisDraft, defaultDiagnosisInput, emptySetInputs } from '../lib/diagnosis/draft';
import { visibleQuestions } from '../lib/diagnosis/questions';
import { emptyData, parseStoredData, STORAGE_KEY, type BodymakersData, type DailyLog } from '../lib/storage';
import type { ActiveProgram } from '../lib/programLibrary';

/** 日付依存を避けるため、判定はすべてこの基準日で行う。 */
const NOW = new Date(2026, 8, 2, 10, 0, 0); // 2026-09-02
const ago = (days: number) => shiftDateKey('2026-09-02', -days);

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: `${date}T10:00:00.000Z`, ...patch };
}
const trainingDay = (date: string) => log(date, { doneExercises: ['bench-press'] });

const personalPlan = { version: 1 as const, createdAt: '2026-06-01T00:00:00.000Z', input: defaultDiagnosisInput() };
const activeProgram: ActiveProgram = {
  programId: 'bodymakers-linear',
  startedAt: '2026-08-01T00:00:00.000Z',
  currentWeek: 2, currentDay: 1, trainingMaxes: { squat: 100 },
  daysPerWeek: 3, durationWeeks: 12, primaryLift: 'squat', completedSessions: 4,
};

function data(patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), ...patch };
}

function draft(patch: Record<string, unknown> = {}) {
  return normalizeDiagnosisDraft({
    version: 1,
    savedAt: new Date(2026, 8, 1).toISOString(),
    step: 0,
    questionId: 'sex',
    input: defaultDiagnosisInput(),
    strengthMode: 'oneRm',
    setInputs: emptySetInputs(),
    ...patch,
  }, NOW);
}

describe('STATE判定', () => {
  it('STATE_A: Planなし・診断の途中もなし', () => {
    const state = resolveHomeState(emptyData(), null, NOW);
    expect(state.id).toBe('A');
    expect(state.hasPlan).toBe(false);
    expect(state.hasDraft).toBe(false);
  });

  it('STATE_B: Planなし・診断の途中あり', () => {
    const state = resolveHomeState(emptyData(), draft(), NOW);
    expect(state.id).toBe('B');
    expect(state.hasDraft).toBe(true);
  });

  it('STATE_B: 何問目 / 全何問を取り出せる', () => {
    const state = resolveHomeState(emptyData(), draft({ questionId: 'sex' }), NOW);
    const total = visibleQuestions(defaultDiagnosisInput()).length;
    expect(state.draft).toEqual({ position: 2, total });
  });

  it('STATE_B: 位置を取れない下書きでも、続きがあることは分かる', () => {
    const state = resolveHomeState(emptyData(), draft({ questionId: 'result' }), NOW);
    expect(state.id).toBe('B');
    expect(state.draft).toEqual({ position: null, total: null });
  });

  it('STATE_C: Planあり・直近7日に記録なし', () => {
    const state = resolveHomeState(data({ personalPlan, dailyLogs: [trainingDay(ago(9))] }), null, NOW);
    expect(state.id).toBe('C');
    expect(state.recentlyActive).toBe(false);
  });

  it('STATE_C: Planはあるが記録が一度も無い場合も C', () => {
    expect(resolveHomeState(data({ personalPlan }), null, NOW).id).toBe('C');
  });

  it('STATE_D1: 直近7日に記録あり・今日はまだ', () => {
    const state = resolveHomeState(data({ personalPlan, dailyLogs: [trainingDay(ago(2))] }), null, NOW);
    expect(state.id).toBe('D1');
    expect(state.recentlyActive).toBe(true);
    expect(state.todayActive).toBe(false);
  });

  it('STATE_D2: 今日も記録済み', () => {
    const state = resolveHomeState(data({ personalPlan, dailyLogs: [trainingDay(ago(2)), trainingDay(ago(0))] }), null, NOW);
    expect(state.id).toBe('D2');
    expect(state.todayActive).toBe(true);
  });

  it('実行中ProgramだけでもPlanありとして扱う', () => {
    expect(resolveHomeState(data({ activeProgram }), null, NOW).id).toBe('C');
    expect(resolveHomeState(data({ activeProgram }), null, NOW).hasPlan).toBe(true);
  });

  it('C / D でも診断の途中が残っていれば、そのことが分かる', () => {
    const state = resolveHomeState(data({ personalPlan, dailyLogs: [trainingDay(ago(0))] }), draft(), NOW);
    expect(state.id).toBe('D2');
    expect(state.hasDraft).toBe(true);
  });
});

describe('例外時のfail-safe', () => {
  it('壊れたJSONは、保存なしとして A になる', () => {
    expect(resolveHomeState(parseStoredData('{broken'), null, NOW).id).toBe('A');
    expect(resolveHomeState(parseStoredData('null'), null, NOW).id).toBe('A');
    expect(resolveHomeState(parseStoredData('{"version":99}'), null, NOW).id).toBe('A');
  });

  it('想定外のschemaでも例外を投げず A へ倒す', () => {
    const broken = { version: 1 } as unknown as BodymakersData;
    expect(() => resolveHomeState(broken, null, NOW)).not.toThrow();
    expect(resolveHomeState(broken, null, NOW).id).toBe('A');
  });

  it('活動の集計が壊れても A へ倒す', () => {
    // dailyLogs が配列でない、ありえない形
    const broken = { ...emptyData(), personalPlan, dailyLogs: null } as unknown as BodymakersData;
    expect(resolveHomeState(broken, null, NOW)).toEqual(FALLBACK_HOME_STATE);
  });

  it('fail-safeの既定値は STATE_A', () => {
    expect(FALLBACK_HOME_STATE.id).toBe('A');
    expect(FALLBACK_HOME_STATE.hasPlan).toBe(false);
  });
});

describe('活動判定は src/lib/activity をそのまま使う', () => {
  it('Home独自の活動定義を持たない（activityの判定と一致する）', () => {
    // 食事だけの日も、体重だけの日も、activity側では活動日になる
    const meal = log(ago(1), { meals: [{ foodId: '01088', grams: 100 }] });
    const weight = log(ago(1), { weightKg: 70 });
    for (const entry of [meal, weight]) {
      expect(dayActivity(entry).active).toBe(true);
      expect(resolveHomeState(data({ personalPlan, dailyLogs: [entry] }), null, NOW).id).toBe('D1');
    }
  });

  it('中身が空の記録は、activityと同じく活動日にしない', () => {
    const empty = log(ago(1));
    expect(dayActivity(empty).active).toBe(false);
    expect(resolveHomeState(data({ personalPlan, dailyLogs: [empty] }), null, NOW).id).toBe('C');
  });

  it('7日の境目の扱いがactivityと揃っている', () => {
    // 6日前は直近7日に入る / 7日前は入らない
    expect(resolveHomeState(data({ personalPlan, dailyLogs: [trainingDay(ago(6))] }), null, NOW).id).toBe('D1');
    expect(resolveHomeState(data({ personalPlan, dailyLogs: [trainingDay(ago(7))] }), null, NOW).id).toBe('C');
  });
});

describe('Homeは読むだけ', () => {
  function recordingStorage() {
    const values = new Map<string, string>();
    const writes: string[] = [];
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => { writes.push('clear'); values.clear(); },
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { writes.push(`remove:${key}`); values.delete(key); },
      setItem: (key, value) => { writes.push(`set:${key}`); values.set(key, value); },
    };
    return { storage, writes };
  }

  it('STATE判定は保存領域へ書き込まない', () => {
    const { storage, writes } = recordingStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), personalPlan }));
    writes.length = 0;

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    resolveHomeState(stored, draft(), NOW);

    expect(writes).toEqual([]);
  });

  it('Home専用のstorage keyを作らない', () => {
    const source = [
      ...Object.values(import.meta.glob('../lib/home/*.ts', { eager: true, query: '?raw', import: 'default' })),
      ...Object.values(import.meta.glob('../components/react/HomeHero.tsx', { eager: true, query: '?raw', import: 'default' })),
    ] as string[];
    const text = source.join('\n');

    // 既存キー以外の bodymakers: で始まるキーを作っていないこと
    const keys = [...text.matchAll(/'(bodymakers:[^']+)'/g)].map((match) => match[1]);
    for (const key of keys) {
      expect(['bodymakers:data:v1', 'bodymakers:diagnosis:draft:v1']).toContain(key);
    }
    // 書き込みAPIを呼んでいないこと
    expect(text).not.toMatch(/setItem|removeItem|writeData|saveDailyLog|writeDiagnosisDraft/);
  });
});
