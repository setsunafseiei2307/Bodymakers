import { describe, expect, it } from 'vitest';

import { buildExport, parseImport, summarize } from '../lib/dataTransfer';
import { blankLog } from '../lib/activity/today';
import { emptyData, type BodymakersData, type DailyLog } from '../lib/storage';
import type { TrainingSessionLog } from '../lib/training/log';

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: '', ...patch };
}

const session: TrainingSessionLog = {
  id: 's1', date: '2026-09-01', savedAt: '', programId: 'p', week: 1, day: 1, sessionKey: 'k',
  exercises: [{ exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 100, plannedSets: 5, plannedReps: 5, sets: [{ weightKg: 100, reps: 5, done: true }] }],
};

function rich(): BodymakersData {
  return {
    ...emptyData(),
    dailyLogs: [
      log('2026-08-28', { weightKg: 72 }),
      log('2026-09-01', { weightKg: 72, nutritionComplete: true }),
      log('2026-09-02', { nutritionComplete: true }),
    ],
    trainingSessions: [session],
    trainingAdjustments: {
      version: 1,
      lifts: { squat: { offsetKg: 5, consecutiveMisses: 0, reason: 'increase', lastDeltaKg: 5, updatedAt: '', lastSessionKey: 'k' } },
      history: [],
    },
    nutritionAdjustments: { version: 1, offsetKcal: -100, planKey: 'k', lastPeriodKey: '', history: [] },
  };
}

describe('読み込む前の内訳', () => {
  it('何が入っているかを数える', () => {
    const summary = summarize(rich());
    expect(summary.dailyLogs).toBe(3);
    expect(summary.trainingSessions).toBe(1);
    expect(summary.nutritionCompleteDays).toBe(2);
    expect(summary.hasTrainingAdjustments).toBe(true);
    expect(summary.hasNutritionAdjustment).toBe(true);
  });

  it('記録の期間を出す', () => {
    const summary = summarize(rich());
    expect(summary.firstDate).toBe('2026-08-28');
    expect(summary.lastDate).toBe('2026-09-02');
  });

  it('空のデータでも壊れない', () => {
    const summary = summarize(emptyData());
    expect(summary.dailyLogs).toBe(0);
    expect(summary.firstDate).toBeNull();
    expect(summary.hasTrainingAdjustments).toBe(false);
  });

  it('書き出したファイルから内訳を読み取れる', () => {
    const result = parseImport(JSON.stringify(buildExport(rich(), new Date('2026-09-03T00:00:00.000Z'))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.trainingSessions).toBe(1);
    expect(result.summary.nutritionCompleteDays).toBe(2);
    expect(result.summary.exportedAt).toBe('2026-09-03T00:00:00.000Z');
  });

  it('内訳を読んでも、元のデータは変わらない', () => {
    const original = rich();
    const snapshot = JSON.stringify(original);
    summarize(original);
    parseImport(JSON.stringify(buildExport(original)));
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('旧形式の書き出しでも内訳を出せる', () => {
    const legacy = {
      format: 'bodymakers-export', formatVersion: 1, schema: 'bodymakers:data:v1',
      exportedAt: '2026-06-01T00:00:00.000Z', app: 'Bodymakers',
      data: { version: 1, dailyLogs: [{ date: '2026-06-01', weightKg: 70 }] },
    };
    const result = parseImport(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.dailyLogs).toBe(1);
    expect(result.summary.trainingSessions).toBe(0);
    expect(result.summary.nutritionCompleteDays).toBe(0);
    expect(result.summary.hasTrainingAdjustments).toBe(false);
  });

  it('壊れたファイルは内訳を作らず、理由を返す', () => {
    for (const raw of ['{broken', '', 'null', '[]', JSON.stringify({ format: 'other' })]) {
      const result = parseImport(raw);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('巨大な想定外のオブジェクトでも落ちない', () => {
    const huge = { format: 'bodymakers-export', formatVersion: 1, schema: 'bodymakers:data:v1', data: { version: 1, dailyLogs: Array.from({ length: 5000 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, weightKg: 70 })) } };
    const result = parseImport(JSON.stringify(huge));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 上限で切り詰められている
    expect(result.data.dailyLogs.length).toBeLessThanOrEqual(366);
  });

  it('知らない項目が混ざっていても読み込める', () => {
    const withExtra = {
      format: 'bodymakers-export', formatVersion: 1, schema: 'bodymakers:data:v1',
      exportedAt: '2026-09-03T00:00:00.000Z', app: 'Bodymakers', futureField: { anything: true },
      data: { version: 1, dailyLogs: [{ date: '2026-09-01', weightKg: 70 }], unknownField: 'x' },
    };
    const result = parseImport(JSON.stringify(withExtra));
    expect(result.ok).toBe(true);
  });
});
