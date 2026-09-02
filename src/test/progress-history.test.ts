import { describe, expect, it } from 'vitest';

import {
  MONTHLY_WINDOW_DAYS,
  WEEKLY_HISTORY_WEEKS,
  monthlyProgress,
  weeklyHistory,
} from '../lib/progressHistory';
import { blankLog } from '../lib/activity/today';
import { shiftDateKey } from '../lib/activity/days';
import { periodKeyFor } from '../lib/nutritionAdaptive';
import { emptyData, parseStoredData, type BodymakersData, type DailyLog } from '../lib/storage';
import type { TrainingSessionLog } from '../lib/training/log';

const NOW = new Date(2026, 8, 3, 10, 0, 0); // 2026-09-03 (木)
const ago = (days: number) => shiftDateKey('2026-09-03', -days);

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: '', ...patch };
}
const weighIn = (date: string, weightKg = 72) => log(date, { weightKg });
const fullDay = (date: string, weightKg = 72) =>
  log(date, { weightKg, doneExercises: ['squat'], manualIntake: { kcal: 2400, protein: 140 }, nutritionComplete: true });

function session(date: string, weightKg = 100): TrainingSessionLog {
  return {
    id: `s:${date}`, date, savedAt: '', programId: 'p', week: 1, day: 1, sessionKey: `k:${date}`,
    exercises: [{
      exerciseId: 'squat', label: 'スクワット', plannedWeightKg: weightKg, plannedSets: 5, plannedReps: 5,
      sets: Array.from({ length: 5 }, () => ({ weightKg, reps: 5, done: true })),
    }],
  };
}

function data(patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), ...patch };
}

describe('週ごとの積み上げ', () => {
  it('既定の週数ぶん返し、新しい週が先頭', () => {
    const weeks = weeklyHistory(emptyData(), { now: NOW });
    expect(weeks).toHaveLength(WEEKLY_HISTORY_WEEKS);
    expect(weeks[0]!.isCurrentWeek).toBe(true);
    expect(weeks[0]!.weekKey > weeks[1]!.weekKey).toBe(true);
  });

  it('既存の週キー（月曜始まり）をそのまま使う', () => {
    const weeks = weeklyHistory(emptyData(), { now: NOW });
    expect(weeks[0]!.weekKey).toBe(periodKeyFor('2026-09-03'));
    expect(weeks[0]!.weekKey).toBe('2026-08-31');
    // 1つ前は7日前の月曜
    expect(weeks[1]!.weekKey).toBe('2026-08-24');
  });

  it('その週の記録だけを数える', () => {
    const weeks = weeklyHistory(data({
      dailyLogs: [fullDay(ago(0)), fullDay(ago(1)), fullDay(ago(9))],
      trainingSessions: [session(ago(0)), session(ago(9))],
    }), { now: NOW });

    expect(weeks[0]!.activeDays).toBe(2);
    expect(weeks[0]!.trainingSessions).toBe(1);
    expect(weeks[0]!.nutritionCompleteDays).toBe(2);
    expect(weeks[1]!.activeDays).toBe(1);
  });

  it('記録の無い週は0を実績のように見せない', () => {
    const weeks = weeklyHistory(data({ dailyLogs: [fullDay(ago(0))] }), { now: NOW });
    expect(weeks[0]!.hasData).toBe(true);
    expect(weeks[1]!.hasData).toBe(false);
    expect(weeks[1]!.activeDays).toBe(0);
  });

  it('その週の体重平均を出す', () => {
    const weeks = weeklyHistory(data({ dailyLogs: [weighIn(ago(0), 72), weighIn(ago(1), 73)] }), { now: NOW });
    expect(weeks[0]!.averageWeightKg).toBe(72.5);
    expect(weeks[1]!.averageWeightKg).toBeNull();
  });

  it('調整があった週が分かる', () => {
    const weeks = weeklyHistory(data({
      dailyLogs: [fullDay(ago(0))],
      trainingAdjustments: {
        version: 1, lifts: {},
        history: [{ id: 'a', date: ago(0), lift: 'squat', reason: 'increase', deltaKg: 5, offsetKg: 5, sessionKey: 'k' }],
      },
    }), { now: NOW });
    expect(weeks[0]!.adjusted).toBe(true);
    expect(weeks[1]!.adjusted).toBe(false);
  });

  it('週数を指定できる', () => {
    expect(weeklyHistory(emptyData(), { weeks: 8, now: NOW })).toHaveLength(8);
    expect(weeklyHistory(emptyData(), { weeks: 1, now: NOW })).toHaveLength(1);
  });

  it('月をまたいでも週がずれない', () => {
    const weeks = weeklyHistory(data({ dailyLogs: [fullDay('2026-08-31'), fullDay('2026-09-01')] }), { now: NOW });
    // 8/31(月)と9/1(火)は同じ週
    expect(weeks[0]!.activeDays).toBe(2);
  });

  it('年をまたいでも週がずれない', () => {
    const newYear = new Date(2026, 0, 1, 10, 0, 0); // 木曜
    const weeks = weeklyHistory(data({ dailyLogs: [fullDay('2025-12-29'), fullDay('2026-01-01')] }), { now: newYear });
    // 12/29(月)〜1/4 が同じ週
    expect(weeks[0]!.weekKey).toBe('2025-12-29');
    expect(weeks[0]!.activeDays).toBe(2);
  });

  it('同じ日が重なっても壊れない', () => {
    const weeks = weeklyHistory(data({ dailyLogs: [fullDay(ago(0)), fullDay(ago(0))] }), { now: NOW });
    expect(weeks[0]!.activeDays).toBeGreaterThan(0);
  });

  it('まばらな記録でも数えられる', () => {
    const weeks = weeklyHistory(data({ dailyLogs: [fullDay(ago(0)), fullDay(ago(14)), fullDay(ago(30))] }), { now: NOW });
    expect(weeks.filter((week) => week.hasData)).toHaveLength(3);
  });
});

describe('30日の振り返り', () => {
  it('記録が無ければ、まだまとめないと伝える', () => {
    const progress = monthlyProgress(emptyData(), NOW);
    expect(progress.hasEnoughData).toBe(false);
    expect(progress.activeDays).toBe(0);
    expect(progress.narrative[0]).toContain('記録がたまると');
  });

  it('3日程度ではまだまとめない', () => {
    const progress = monthlyProgress(data({ dailyLogs: [0, 1, 2].map((d) => fullDay(ago(d))) }), NOW);
    expect(progress.hasEnoughData).toBe(false);
    expect(progress.narrative[0]).toContain('3日記録');
  });

  it('十分たまれば数字を出す', () => {
    const days = [0, 2, 4, 6, 8, 10, 12, 14];
    const progress = monthlyProgress(data({
      dailyLogs: days.map((d) => fullDay(ago(d))),
      trainingSessions: days.slice(0, 5).map((d) => session(ago(d))),
    }), NOW);
    expect(progress.hasEnoughData).toBe(true);
    expect(progress.activeDays).toBe(8);
    expect(progress.trainingSessions).toBe(5);
    expect(progress.nutritionCompleteDays).toBe(8);
    expect(progress.narrative[0]).toContain('8日記録');
  });

  it('30日より前は数えない', () => {
    const progress = monthlyProgress(data({
      dailyLogs: [...[0, 2, 4, 6].map((d) => fullDay(ago(d))), fullDay(ago(MONTHLY_WINDOW_DAYS + 5))],
    }), NOW);
    expect(progress.activeDays).toBe(4);
  });

  it('ちょうど29日・30日の境目を正しく扱う', () => {
    expect(monthlyProgress(data({ dailyLogs: [fullDay(ago(29))] }), NOW).activeDays).toBe(1);
    expect(monthlyProgress(data({ dailyLogs: [fullDay(ago(30))] }), NOW).activeDays).toBe(0);
  });

  it('次回重量の積み上げを文に入れる', () => {
    const days = [0, 2, 4, 6, 8, 10, 12];
    const progress = monthlyProgress(data({
      dailyLogs: days.map((d) => fullDay(ago(d))),
      trainingSessions: days.map((d) => session(ago(d))),
      trainingAdjustments: {
        version: 1,
        lifts: { squat: { offsetKg: 15, consecutiveMisses: 0, reason: 'increase', lastDeltaKg: 5, updatedAt: '', lastSessionKey: 'k' } },
        history: [],
      },
    }), NOW);
    expect(progress.liftOffsets).toEqual([{ label: 'スクワット', offsetKg: 15 }]);
    expect(progress.narrative.join('')).toContain('15kg');
  });

  it('体重は前半と後半の平均で比べる。単日では見ない', () => {
    const progress = monthlyProgress(data({
      dailyLogs: [
        ...[0, 2, 4].map((d) => fullDay(ago(d), 71)),
        ...[16, 18, 20].map((d) => fullDay(ago(d), 73)),
      ],
    }), NOW);
    expect(progress.weightFromKg).toBe(73);
    expect(progress.weightToKg).toBe(71);
    expect(progress.weightChangeKg).toBe(-2);
  });

  it('身体の中で何が起きたかは言わない', () => {
    const days = [0, 2, 4, 6, 8, 10];
    const progress = monthlyProgress(data({
      dailyLogs: days.map((d) => fullDay(ago(d), 70)),
      trainingSessions: days.map((d) => session(ago(d))),
    }), NOW);
    const text = progress.narrative.join('');
    expect(text).not.toMatch(/筋肉が増え|脂肪が減|痩せ|太っ|成功|失敗/);
  });

  it('文は4つまで', () => {
    const days = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];
    const progress = monthlyProgress(data({
      dailyLogs: days.map((d) => fullDay(ago(d), 70 + (d % 3))),
      trainingSessions: days.map((d) => session(ago(d))),
    }), NOW);
    expect(progress.narrative.length).toBeLessThanOrEqual(4);
  });
});

describe('節目', () => {
  it('最初のトレーニングを覚えている', () => {
    const progress = monthlyProgress(data({ trainingSessions: [session(ago(5)), session(ago(2))] }), NOW);
    expect(progress.milestones.find((item) => item.id === 'first-training')?.date).toBe(ago(5));
  });

  it('10回に届いたら節目にする', () => {
    const sessions = Array.from({ length: 12 }, (_, index) => session(ago(20 - index)));
    const progress = monthlyProgress(data({ trainingSessions: sessions }), NOW);
    expect(progress.milestones.some((item) => item.id === 'ten-sessions')).toBe(true);
  });

  it('届いていない節目は出さない', () => {
    const progress = monthlyProgress(data({ trainingSessions: [session(ago(1))] }), NOW);
    expect(progress.milestones.some((item) => item.id === 'ten-sessions')).toBe(false);
    expect(progress.milestones.some((item) => item.id === 'thirty-active-days')).toBe(false);
  });

  it('記録が無ければ節目も無い', () => {
    expect(monthlyProgress(emptyData(), NOW).milestones).toEqual([]);
  });

  it('数が多くても4件までに抑える', () => {
    const sessions = Array.from({ length: 12 }, (_, index) => session(ago(30 - index)));
    const activeDays = Array.from({ length: 40 }, (_, index) => fullDay(ago(index)));
    const progress = monthlyProgress(data({
      trainingSessions: sessions,
      dailyLogs: activeDays,
      programHistory: [{
        programId: 'bodymakers-linear', startedAt: '', currentWeek: 4, currentDay: 3, trainingMaxes: {},
        daysPerWeek: 3, durationWeeks: 4, primaryLift: 'squat', completedSessions: 12,
        completedAt: '2026-08-20T00:00:00.000Z',
      }],
    }), NOW);
    expect(progress.milestones.length).toBeLessThanOrEqual(4);
  });
});

describe('壊れたデータでも落ちない', () => {
  it('旧schemaでも数えられる', () => {
    const legacy = parseStoredData(JSON.stringify({
      version: 1, dailyLogs: [{ date: ago(0), weightKg: 72 }, { date: ago(2), weightKg: 72.5 }],
    }));
    expect(() => weeklyHistory(legacy, { now: NOW })).not.toThrow();
    expect(() => monthlyProgress(legacy, NOW)).not.toThrow();
    expect(weeklyHistory(legacy, { now: NOW })[0]!.activeDays).toBe(2);
  });

  it('壊れたJSONでも落ちない', () => {
    for (const raw of ['{broken', 'null', '{"version":99}']) {
      const broken = parseStoredData(raw);
      expect(() => weeklyHistory(broken, { now: NOW })).not.toThrow();
      expect(() => monthlyProgress(broken, NOW)).not.toThrow();
    }
  });

  it('おかしな体重は平均に混ぜない', () => {
    const weeks = weeklyHistory(data({
      dailyLogs: [
        weighIn(ago(0), 72),
        log(ago(1), { weightKg: Number.NaN }),
        log(ago(2), { weightKg: 9999 }),
      ],
    }), { now: NOW });
    expect(weeks[0]!.averageWeightKg).toBe(72);
  });
});
