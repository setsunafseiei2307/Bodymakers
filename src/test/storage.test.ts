import { describe, expect, it } from 'vitest';

import {
  emptyData,
  localDateKey,
  parseStoredData,
  readData,
  saveStrengthDiagnosis,
  addMealsToToday,
} from '../lib/storage';
import { diagnose } from '../lib/strength/diagnose';
import { snapshotDiagnosis } from '../lib/strength/history';

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

describe('端末内データ', () => {
  it('空・破損・未知バージョンは安全な初期値に戻す', () => {
    expect(parseStoredData(null)).toEqual(emptyData());
    expect(parseStoredData('{broken')).toEqual(emptyData());
    expect(parseStoredData('{"version":99}')).toEqual(emptyData());
  });

  it('日次記録は読み込み時に最大366件へ制限する', () => {
    const dailyLogs = Array.from({ length: 400 }, (_, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    }));
    expect(parseStoredData(JSON.stringify({ version: 1, dailyLogs })).dailyLogs).toHaveLength(366);
  });

  it('欠けた日次記録を安全な既定値で復元する', () => {
    const data = parseStoredData(JSON.stringify({ version: 1, dailyLogs: [{ date: '2026-08-31' }] }));
    expect(data.dailyLogs[0]).toMatchObject({
      meals: [],
      exercises: [],
      manualIntake: { kcal: null, protein: null },
      steps: null,
      sleepHours: null,
    });
  });

  it('既存v1データに筋力項目がなくても内容を失わず復元する', () => {
    const data = parseStoredData(JSON.stringify({
      version: 1,
      profile: null,
      dietPlan: null,
      dailyLogs: [{ date: '2026-08-31', weightKg: 70 }],
    }));
    expect(data.dailyLogs).toHaveLength(1);
    expect(data.strengthProfile).toBeNull();
    expect(data.strengthHistory).toEqual([]);
  });

  it('既存の食事記録を保ち、食事区分を追加できる', () => {
    const storage = memoryStorage();
    storage.setItem('bodymakers:data:v1', JSON.stringify({
      version: 1,
      dailyLogs: [{ date: localDateKey(), meals: [{ foodId: '01088', grams: 100 }] }],
    }));
    expect(addMealsToToday([{ foodId: '12004', grams: 60 }], 'breakfast', storage)).toBe(true);
    const meals = readData(storage).dailyLogs[0]!.meals;
    expect(meals).toEqual([
      { foodId: '01088', grams: 100 },
      { foodId: '12004', grams: 60, mealType: 'breakfast' },
    ]);
  });

  it('筋力診断を履歴と次回入力プロフィールへ保存する', () => {
    const storage = memoryStorage();
    const result = diagnose({
      sex: 'M',
      bodyweightKg: 70,
      lifts: { bench: { weightKg: 80, reps: 5 } },
    })!;
    const snapshot = snapshotDiagnosis(result, '2026-09-01T00:00:00.000Z');
    expect(saveStrengthDiagnosis(snapshot, storage)).toBe(true);

    const saved = readData(storage);
    expect(saved.strengthHistory).toHaveLength(1);
    expect(saved.strengthProfile).toMatchObject({
      sex: 'M',
      bodyweightKg: 70,
      lifts: { bench: { weightKg: 80, reps: 5 } },
    });
    expect(saved.strengthHistory[0]?.lifts[0]?.nextTargetKg % 2.5).toBe(0);
  });

  it('UTCではなく端末のローカル日付を使う', () => {
    expect(localDateKey(new Date(2026, 7, 31, 23, 59))).toBe('2026-08-31');
  });
});
