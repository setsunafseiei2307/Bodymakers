import { describe, expect, it } from 'vitest';

import {
  BACKUP_KEY,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  EXPORT_SCHEMA,
  buildExport,
  clearBackup,
  exportFileName,
  exportText,
  parseImport,
  readBackup,
  saveBackup,
} from '../lib/dataTransfer';
import { STORAGE_KEY, emptyData, type BodymakersData } from '../lib/storage';

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

function sampleData(): BodymakersData {
  return {
    ...emptyData(),
    profile: { sex: 'male', age: 34, heightCm: 176, weightKg: 78, activity: 'light', trainingDaysPerWeek: 3 },
    dailyLogs: [{
      date: '2026-09-01',
      savedAt: '2026-09-01T10:00:00.000Z',
      weightKg: 78,
      meals: [{ foodId: '01088', grams: 200 }],
      exercises: [],
      muscles: ['胸'],
      doneExercises: ['bench-press'],
      manualIntake: { kcal: null, protein: null },
      steps: 8000,
      sleepHours: 7,
    }],
    recentFoodIds: ['01088'],
  };
}

describe('データの書き出し', () => {
  it('形式・バージョン・書き出し日時とデータ本体を含む', () => {
    const now = new Date('2026-09-02T09:00:00.000Z');
    const payload = buildExport(sampleData(), now);

    expect(payload.format).toBe(EXPORT_FORMAT);
    expect(payload.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(payload.schema).toBe(EXPORT_SCHEMA);
    expect(payload.schema).toBe(STORAGE_KEY);
    expect(payload.exportedAt).toBe('2026-09-02T09:00:00.000Z');
    expect(payload.data.dailyLogs).toHaveLength(1);
  });

  it('書き出したテキストは、そのまま読み込める', () => {
    const result = parseImport(exportText(sampleData()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dailyLogs).toHaveLength(1);
    expect(result.data.profile?.weightKg).toBe(78);
    expect(result.summary.dailyLogs).toBe(1);
  });

  it('ファイル名は日付が入る', () => {
    expect(exportFileName(new Date(2026, 8, 2))).toBe('bodymakers-20260902.json');
  });

  it('秘密情報を持たない項目だけを書き出す', () => {
    const keys = Object.keys(buildExport(emptyData()).data).sort();
    expect(keys).toEqual([
      'activeProgram', 'dailyLogs', 'dietPlan', 'personalPlan', 'profile',
      'programHistory', 'recentFoodIds', 'strengthHistory', 'strengthProfile', 'version',
    ]);
  });
});

describe('正しいデータの読み込み', () => {
  it('包み無しの bodymakers:data:v1 も受け付ける', () => {
    const result = parseImport(JSON.stringify(sampleData()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dailyLogs).toHaveLength(1);
    expect(result.summary.exportedAt).toBeNull();
  });

  it('壊れた項目は落とし、残りは読み込む', () => {
    const payload = buildExport(emptyData());
    const raw = JSON.stringify({
      ...payload,
      data: {
        ...payload.data,
        dailyLogs: [{ date: '2026-09-01' }, { notADate: true }, 'ごみ'],
        activeProgram: { programId: 42 },
      },
    });
    const result = parseImport(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dailyLogs).toHaveLength(1);
    expect(result.data.activeProgram).toBeNull();
  });
});

describe('不正なデータの読み込み', () => {
  it('空・壊れたJSONは理由を返し、例外を投げない', () => {
    for (const raw of ['', '   ', '{broken', '[1,2,3]', '"文字列"', 'null']) {
      const result = parseImport(raw);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('Bodymakers以外のJSONは断る', () => {
    const result = parseImport(JSON.stringify({ format: 'other-app', data: {} }));
    expect(result.ok).toBe(false);
  });

  it('schemaが違うものは断る', () => {
    const raw = JSON.stringify({ ...buildExport(emptyData()), schema: 'bodymakers:data:v9' });
    const result = parseImport(raw);
    expect(result.ok).toBe(false);
  });

  it('新しすぎる形式は断る', () => {
    const raw = JSON.stringify({ ...buildExport(emptyData()), formatVersion: EXPORT_FORMAT_VERSION + 1 });
    const result = parseImport(raw);
    expect(result.ok).toBe(false);
  });

  it('データ本体が欠けているものは断る', () => {
    const withoutData = JSON.stringify({ ...buildExport(emptyData()), data: undefined });
    expect(parseImport(withoutData).ok).toBe(false);

    const wrongVersion = JSON.stringify({ ...buildExport(emptyData()), data: { version: 99 } });
    expect(parseImport(wrongVersion).ok).toBe(false);
  });
});

describe('読み込み前のバックアップ', () => {
  it('現在のデータを別のキーへ退避し、戻せる', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(sampleData()));

    expect(saveBackup(storage)).toBe(true);
    expect(storage.getItem(BACKUP_KEY)).not.toBeNull();
    expect(readBackup(storage)?.dailyLogs).toHaveLength(1);

    // 読み込みで上書きしても、退避したものは残る
    storage.setItem(STORAGE_KEY, JSON.stringify(emptyData()));
    expect(readBackup(storage)?.dailyLogs).toHaveLength(1);

    expect(clearBackup(storage)).toBe(true);
    expect(readBackup(storage)).toBeNull();
  });

  it('保存データが無いときは退避しない', () => {
    const storage = memoryStorage();
    expect(saveBackup(storage)).toBe(false);
    expect(readBackup(storage)).toBeNull();
  });

  it('保存先が無い環境でも失敗させない', () => {
    expect(saveBackup(null)).toBe(false);
    expect(readBackup(null)).toBeNull();
    expect(clearBackup(null)).toBe(false);
  });
});
