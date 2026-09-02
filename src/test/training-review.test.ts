import { describe, expect, it } from 'vitest';

import { buildWeeklyTrainingReview, liftProgressSummaries } from '../lib/training/review';
import { buildExport, parseImport } from '../lib/dataTransfer';
import { emptyData, parseStoredData, type BodymakersData } from '../lib/storage';
import { applySessionCompletion, emptyTrainingAdjustments, LIFT_STEP_KG, offsetFor } from '../lib/training/adaptive';
import { shiftDateKey } from '../lib/activity/days';
import type { TrainingSessionLog } from '../lib/training/log';
import type { ActiveProgram, ProgramSession } from '../lib/programLibrary';

const NOW = new Date(2026, 8, 3, 10, 0, 0); // 2026-09-03
const ago = (days: number) => shiftDateKey('2026-09-03', -days);

const activeProgram: ActiveProgram = {
  programId: 'bodymakers-five-by-five',
  startedAt: '2026-08-01T00:00:00.000Z',
  currentWeek: 2, currentDay: 1,
  trainingMaxes: { bench: 80, squat: 100, deadlift: 120 },
  daysPerWeek: 3, durationWeeks: 4, primaryLift: 'squat', completedSessions: 3,
};

const programSession: ProgramSession = {
  week: 1, day: 1, label: 'Day 1', focus: '全身',
  exercises: [{ exerciseId: 'squat', label: 'スクワット', sets: 5, reps: 5, weightKg: 100, percent: 80 }],
};

function squatSession(date: string, weightKg: number, reps: number[], key: string): TrainingSessionLog {
  return {
    id: `${key}:${date}`, date, savedAt: `${date}T10:00:00.000Z`,
    programId: 'bodymakers-five-by-five', week: 1, day: 1, sessionKey: key,
    exercises: [{
      exerciseId: 'squat', label: 'スクワット',
      plannedWeightKg: weightKg, plannedSets: 5, plannedReps: 5,
      sets: reps.map((r) => ({ weightKg, reps: r, done: true })),
    }],
  };
}

function data(patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), ...patch };
}

describe('今週のトレーニング振り返り', () => {
  it('記録もProgramも無ければ、始め方を案内する', () => {
    const review = buildWeeklyTrainingReview(emptyData(), NOW);
    expect(review.hasData).toBe(false);
    expect(review.sessions).toBe(0);
    expect(review.lines[0]!.text).toContain('Program');
  });

  it('Programはあるが今週まだなら、責めずに促す', () => {
    const review = buildWeeklyTrainingReview(data({ activeProgram }), NOW);
    expect(review.hasData).toBe(false);
    expect(review.lines[0]!.text).toContain('1セットから');
    expect(review.lines[0]!.text).not.toMatch(/failed|失敗|サボ|ダメ/);
  });

  it('今週の回数を数える', () => {
    const sessions = [
      squatSession(ago(0), 100, [5, 5, 5, 5, 5], 'k1'),
      squatSession(ago(2), 100, [5, 5, 5, 5, 5], 'k2'),
      squatSession(ago(4), 100, [5, 5, 5, 5, 5], 'k3'),
    ];
    const review = buildWeeklyTrainingReview(data({ trainingSessions: sessions, activeProgram }), NOW);
    expect(review.sessions).toBe(3);
    expect(review.lines[0]!.text).toBe('今週は3回トレーニングしました。');
    expect(review.programPosition).toBe('Week 2 / Day 1');
  });

  it('7日より前の記録は今週に数えない', () => {
    const review = buildWeeklyTrainingReview(
      data({ trainingSessions: [squatSession(ago(10), 100, [5, 5, 5, 5, 5], 'k1')] }),
      NOW,
    );
    expect(review.sessions).toBe(0);
  });

  it('次回どうなるかを添える', () => {
    const adjustments = applySessionCompletion(emptyTrainingAdjustments(), {
      sessionKey: 'k1', date: ago(0), session: programSession,
      log: squatSession(ago(0), 100, [5, 5, 5, 5, 5], 'k1'), outcome: 'completed',
    }).adjustments;

    const review = buildWeeklyTrainingReview(
      data({ trainingSessions: [squatSession(ago(0), 100, [5, 5, 5, 5, 5], 'k1')], trainingAdjustments: adjustments }),
      NOW,
    );
    const text = review.lines.map((line) => line.text).join('');
    expect(text).toContain('スクワット');
    expect(text).toMatch(/\+5kg/);
  });

  it('行は4件までに抑える', () => {
    const sessions = [0, 1, 2].map((d) => squatSession(ago(d), 100, [5, 5, 5, 5, 5], `k${d}`));
    const review = buildWeeklyTrainingReview(data({ trainingSessions: sessions, activeProgram }), NOW);
    expect(review.lines.length).toBeLessThanOrEqual(4);
  });

  it('責める表現を含まない', () => {
    const sessions = [squatSession(ago(0), 100, [5, 2, 0, 0, 0], 'k1')];
    const review = buildWeeklyTrainingReview(data({ trainingSessions: sessions, activeProgram }), NOW);
    const text = review.lines.map((line) => line.text).join('');
    expect(text).not.toMatch(/失敗|弱く|ダメ|もっと頑張|サボ/);
  });
});

describe('種目ごとの進捗', () => {
  it('直近の実績と推定1RMの変化を出す', () => {
    const sessions = [
      squatSession(ago(7), 100, [5, 5, 5, 5, 5], 'k1'),
      squatSession(ago(0), 105, [5, 5, 5, 5, 5], 'k2'),
    ];
    const summaries = liftProgressSummaries(data({ trainingSessions: sessions }));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.label).toBe('スクワット');
    expect(summaries[0]!.latestWeightKg).toBe(105);
    expect(summaries[0]!.estimatedOneRmKg).toBeGreaterThan(105);
    expect(summaries[0]!.estimatedDeltaKg).toBeGreaterThan(0);
  });

  it('1回だけの記録では前回比を出さない', () => {
    const summaries = liftProgressSummaries(data({ trainingSessions: [squatSession(ago(0), 100, [5], 'k1')] }));
    expect(summaries[0]!.estimatedDeltaKg).toBeNull();
  });

  it('記録が無ければ空になる', () => {
    expect(liftProgressSummaries(emptyData())).toEqual([]);
  });
});

describe('書き出しと読み込み', () => {
  it('実績と調整を書き出して読み込むと、同じ状態に戻る', () => {
    const sessions = [
      squatSession(ago(7), 100, [5, 5, 5, 5, 5], 'k1'),
      squatSession(ago(0), 105, [5, 5, 5, 4, 4], 'k2'),
    ];
    const adjustments = applySessionCompletion(emptyTrainingAdjustments(), {
      sessionKey: 'k1', date: ago(7), session: programSession, log: sessions[0]!, outcome: 'completed',
    }).adjustments;

    const original = data({ trainingSessions: sessions, trainingAdjustments: adjustments, activeProgram });
    const round = parseImport(JSON.stringify(buildExport(original)));

    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.data.trainingSessions).toEqual(sessions);
    expect(round.data.trainingAdjustments).toEqual(adjustments);
    expect(offsetFor(round.data.trainingAdjustments, 'squat')).toBe(LIFT_STEP_KG.squat);
    // 読み込んだデータからも同じ振り返りが作れる
    expect(buildWeeklyTrainingReview(round.data, NOW).sessions).toBe(1);
  });

  it('実績を持たない古い書き出しも読み込める', () => {
    const legacy = {
      format: 'bodymakers-export', formatVersion: 1, schema: 'bodymakers:data:v1',
      exportedAt: '2026-08-01T00:00:00.000Z', app: 'Bodymakers',
      data: { version: 1, dailyLogs: [{ date: '2026-08-01', weightKg: 70 }] },
    };
    const result = parseImport(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trainingSessions).toEqual([]);
    expect(result.data.trainingAdjustments).toEqual(emptyTrainingAdjustments());
  });

  it('壊れた実績を含む書き出しでも、安全に読み込める', () => {
    const raw = JSON.stringify({
      format: 'bodymakers-export', formatVersion: 1, schema: 'bodymakers:data:v1',
      exportedAt: '2026-09-03T00:00:00.000Z', app: 'Bodymakers',
      data: {
        ...emptyData(),
        trainingSessions: [
          'ごみ',
          { date: '2026-09-01', sessionKey: 'k', exercises: [{ exerciseId: 'squat', sets: [{ weightKg: 100, reps: 5, done: true }] }] },
          { nope: true },
        ],
        trainingAdjustments: { version: 99 },
      },
    });
    const result = parseImport(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trainingSessions).toHaveLength(1);
    expect(result.data.trainingAdjustments).toEqual(emptyTrainingAdjustments());
  });

  it('保存して読み直しても実績が保たれる', () => {
    const sessions = [squatSession(ago(0), 100, [5, 5, 5, 5, 5], 'k1')];
    const round = parseStoredData(JSON.stringify(data({ trainingSessions: sessions })));
    expect(round.trainingSessions).toEqual(sessions);
  });
});
