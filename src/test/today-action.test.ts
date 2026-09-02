import { describe, expect, it } from 'vitest';

import { resolveTodayAction, type TodayActionInput } from '../lib/todayAction';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';
import type { ActiveProgram, ProgramSession } from '../lib/programLibrary';
import type { SavedPersonalPlan } from '../lib/diagnosis/types';

const plan: SavedPersonalPlan = {
  version: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  input: defaultDiagnosisInput(),
};

const program: ActiveProgram = {
  programId: 'bodymakers-linear',
  startedAt: '2026-09-01T00:00:00.000Z',
  currentWeek: 2,
  currentDay: 1,
  trainingMaxes: { squat: 100 },
  daysPerWeek: 3,
  durationWeeks: 12,
  primaryLift: 'squat',
  completedSessions: 3,
};

const session: ProgramSession = {
  week: 2,
  day: 1,
  label: 'Week 2 Day 1',
  focus: 'スクワット中心',
  exercises: [{ exerciseId: 'squat', label: 'スクワット', sets: 3, reps: 5, weightKg: 85, percent: 85 }],
};

function input(overrides: Partial<TodayActionInput> = {}): TodayActionInput {
  return {
    activeProgram: null,
    activeProgramName: null,
    activeProgramSession: null,
    personalPlan: null,
    planWorkoutLabel: null,
    trainedToday: false,
    ateToday: false,
    ...overrides,
  };
}

describe('今日の一手', () => {
  it('Planが無いときは診断を出す', () => {
    const action = resolveTodayAction(input());
    expect(action.kind).toBe('diagnosis');
    expect(action.cta.href).toBe('/start');
  });

  it('PlanはあるがProgramが無いときはProgram選択を出す', () => {
    const action = resolveTodayAction(input({ personalPlan: plan }));
    expect(action.kind).toBe('program-select');
    expect(action.cta.href).toBe('/tools/programs');
  });

  it('Planの今日の予定があれば、Program選択の説明に含める', () => {
    const action = resolveTodayAction(input({ personalPlan: plan, planWorkoutLabel: '上半身の日' }));
    expect(action.kind).toBe('program-select');
    expect(action.detail).toContain('上半身の日');
  });

  it('実行中Programに今日のセッションがあれば、それを最優先で出す', () => {
    const action = resolveTodayAction(input({
      personalPlan: plan,
      activeProgram: program,
      activeProgramName: 'Starting Strength Style',
      activeProgramSession: session,
    }));
    expect(action.kind).toBe('workout');
    expect(action.title).toBe('Week 2 Day 1');
    expect(action.detail).toContain('Week 2 / Day 1');
    expect(action.cta.href).toBe('#active-program');
  });

  it('Planが無くても、実行中Programがあればトレーニングを優先する', () => {
    const action = resolveTodayAction(input({
      activeProgram: program,
      activeProgramName: 'Starting Strength Style',
      activeProgramSession: session,
    }));
    expect(action.kind).toBe('workout');
  });

  it('今日のトレーニングを記録済みなら、次の行動へ切り替える', () => {
    const done = resolveTodayAction(input({
      activeProgram: program,
      activeProgramName: 'Starting Strength Style',
      activeProgramSession: session,
      trainedToday: true,
    }));
    expect(done.kind).toBe('workout-done');
    expect(done.cta.href).toBe('#quick-record');
    expect(done.detail).toContain('食事');

    const alsoAte = resolveTodayAction(input({
      activeProgram: program,
      activeProgramName: 'Starting Strength Style',
      activeProgramSession: session,
      trainedToday: true,
      ateToday: true,
    }));
    expect(alsoAte.kind).toBe('workout-done');
    expect(alsoAte.cta.label).toBe('今日の記録を保存する');
  });

  it('今日のセッションを読み出せないときはProgramの確認へ誘導する', () => {
    const action = resolveTodayAction(input({
      activeProgram: program,
      activeProgramName: null,
      activeProgramSession: null,
    }));
    expect(action.kind).toBe('program-check');
    expect(action.cta.href).toBe('/tools/programs');
  });

  it('どの状態でも、見出し・本文・CTAが空にならない', () => {
    const cases: TodayActionInput[] = [
      input(),
      input({ personalPlan: plan }),
      input({ activeProgram: program, activeProgramSession: session, activeProgramName: 'P' }),
      input({ activeProgram: program, activeProgramSession: session, activeProgramName: 'P', trainedToday: true }),
      input({ activeProgram: program }),
    ];
    for (const item of cases) {
      const action = resolveTodayAction(item);
      expect(action.heading.length).toBeGreaterThan(0);
      expect(action.title.length).toBeGreaterThan(0);
      expect(action.detail.length).toBeGreaterThan(0);
      expect(action.cta.label.length).toBeGreaterThan(0);
      expect(action.cta.href.length).toBeGreaterThan(0);
    }
  });
});
