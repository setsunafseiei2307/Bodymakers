import { describe, expect, it } from 'vitest';

import { emptyData, localDateKey, parseStoredData } from '../lib/storage';

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

  it('UTCではなく端末のローカル日付を使う', () => {
    expect(localDateKey(new Date(2026, 7, 31, 23, 59))).toBe('2026-08-31');
  });
});
