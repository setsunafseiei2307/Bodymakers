import { describe, expect, it } from 'vitest';

import {
  DIAGNOSIS_DRAFT_KEY,
  DIAGNOSIS_STEP_TITLES,
  clearDiagnosisDraft,
  defaultDiagnosisInput,
  draftStepLabel,
  emptySetInputs,
  normalizeDiagnosisDraft,
  parseDiagnosisDraft,
  readDiagnosisDraft,
  writeDiagnosisDraft,
} from '../lib/diagnosis/draft';
import { STORAGE_KEY, emptyData, parseStoredData } from '../lib/storage';

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

function draftPayload() {
  const input = defaultDiagnosisInput();
  return {
    step: 2,
    input: { ...input, goal: 'muscle' as const, body: { ...input.body, weightKg: 82 } },
    strengthMode: 'set' as const,
    setInputs: { ...emptySetInputs(), bench: { weight: '80', reps: '5' } },
  };
}

describe('診断の途中保存', () => {
  it('回答を保存し、そのまま復元できる', () => {
    const storage = memoryStorage();
    expect(writeDiagnosisDraft(draftPayload(), storage)).toBe(true);

    const draft = readDiagnosisDraft(storage);
    expect(draft?.step).toBe(2);
    expect(draft?.input.goal).toBe('muscle');
    expect(draft?.input.body.weightKg).toBe(82);
    expect(draft?.strengthMode).toBe('set');
    expect(draft?.setInputs.bench).toEqual({ weight: '80', reps: '5' });
  });

  it('正式な保存データとは別のキーを使い、既存データを壊さない', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), dailyLogs: [{ date: '2026-09-01' }] }));

    writeDiagnosisDraft(draftPayload(), storage);

    expect(storage.getItem(DIAGNOSIS_DRAFT_KEY)).not.toBeNull();
    expect(parseStoredData(storage.getItem(STORAGE_KEY)).dailyLogs).toHaveLength(1);
  });

  it('下書きを消しても、正式な保存データは残る', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(emptyData()));
    writeDiagnosisDraft(draftPayload(), storage);

    expect(clearDiagnosisDraft(storage)).toBe(true);
    expect(readDiagnosisDraft(storage)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('保存先が無い環境では書き込みも読み込みも失敗させない', () => {
    expect(writeDiagnosisDraft(draftPayload(), null)).toBe(false);
    expect(readDiagnosisDraft(null)).toBeNull();
    expect(clearDiagnosisDraft(null)).toBe(false);
  });
});

describe('壊れた下書きへの耐性', () => {
  it('空・壊れたJSON・未知の形は下書き無しとして扱う', () => {
    expect(parseDiagnosisDraft(null)).toBeNull();
    expect(parseDiagnosisDraft('')).toBeNull();
    expect(parseDiagnosisDraft('{broken')).toBeNull();
    expect(parseDiagnosisDraft('"文字列"')).toBeNull();
    expect(parseDiagnosisDraft('[]')).toBeNull();
    expect(normalizeDiagnosisDraft(null)).toBeNull();
    expect(normalizeDiagnosisDraft({ version: 2, savedAt: new Date().toISOString() })).toBeNull();
    expect(normalizeDiagnosisDraft({ version: 1 })).toBeNull();
    expect(normalizeDiagnosisDraft({ version: 1, savedAt: 'いつか' })).toBeNull();
  });

  it('古すぎる下書きは「前回の続き」として出さない', () => {
    const now = new Date('2026-09-02T00:00:00.000Z');
    const old = { version: 1, savedAt: '2026-01-01T00:00:00.000Z', step: 1, input: defaultDiagnosisInput() };
    expect(normalizeDiagnosisDraft(old, now)).toBeNull();

    const recent = { ...old, savedAt: '2026-09-01T00:00:00.000Z' };
    expect(normalizeDiagnosisDraft(recent, now)).not.toBeNull();
  });

  it('項目が欠けていても既定値で復元し、例外を投げない', () => {
    const draft = normalizeDiagnosisDraft({ version: 1, savedAt: new Date().toISOString() });
    expect(draft).not.toBeNull();
    expect(draft?.step).toBe(0);
    expect(draft?.input).toEqual(defaultDiagnosisInput());
    expect(draft?.strengthMode).toBe('oneRm');
    expect(draft?.setInputs).toEqual(emptySetInputs());
  });

  it('値が型違い・範囲外でも既定値へ落とす', () => {
    const draft = normalizeDiagnosisDraft({
      version: 1,
      savedAt: new Date().toISOString(),
      step: 99,
      input: {
        goal: 'unknown-goal',
        targets: { weightKg: 'おもい', lifts: { bench: Number.POSITIVE_INFINITY, squat: 9999 } },
        body: { sex: 'other', age: Number.NaN, heightCm: '170', weightKg: -5, bodyFatPercent: 200 },
        training: { experience: 42, daysPerWeek: 9, sessionMinutes: 7, location: null, focus: [] },
        strength: 'なし',
        food: { mealsPerDay: 0, breakfast: 'often', protein: null, vegetables: 1, outsideMeals: '', amount: {} },
        lifestyle: { sleepDuration: 3, sleepQuality: null, dailyActivity: '', alcohol: 0, smoking: 'yes', stress: [], painOrInjury: 1 },
      },
      strengthMode: 'magic',
      setInputs: { bench: { weight: 100, reps: null }, squat: 'x' },
    });

    expect(draft).not.toBeNull();
    expect(draft?.step).toBe(0);
    expect(draft?.input).toEqual(defaultDiagnosisInput());
    expect(draft?.strengthMode).toBe('oneRm');
    expect(draft?.setInputs).toEqual(emptySetInputs());
  });

  it('入力途中の空欄（0）は、そのまま復元する', () => {
    const input = defaultDiagnosisInput();
    const draft = normalizeDiagnosisDraft({
      version: 1,
      savedAt: new Date().toISOString(),
      step: 1,
      input: { ...input, body: { ...input.body, age: 0, weightKg: 0 } },
    });
    expect(draft?.input.body.age).toBe(0);
    expect(draft?.input.body.weightKg).toBe(0);
  });

  it('結果画面まで進んだ下書きも保持する', () => {
    const draft = normalizeDiagnosisDraft({
      version: 1,
      savedAt: new Date().toISOString(),
      step: DIAGNOSIS_STEP_TITLES.length,
      input: defaultDiagnosisInput(),
    });
    expect(draft?.step).toBe(DIAGNOSIS_STEP_TITLES.length);
    expect(draftStepLabel(draft!)).toBe('診断結果');
  });

  it('途中のステップは何番目かが分かる文言になる', () => {
    const draft = normalizeDiagnosisDraft({ version: 1, savedAt: new Date().toISOString(), step: 0, input: {} });
    expect(draftStepLabel(draft!)).toBe(`1 / ${DIAGNOSIS_STEP_TITLES.length}・${DIAGNOSIS_STEP_TITLES[0]}`);
  });
});
