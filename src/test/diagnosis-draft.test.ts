import { describe, expect, it } from 'vitest';

import {
  DIAGNOSIS_DRAFT_KEY,
  DIAGNOSIS_STEP_TITLES,
  clearDiagnosisDraft,
  defaultDiagnosisInput,
  draftQuestionId,
  draftStepLabel,
  emptySetInputs,
  normalizeDiagnosisDraft,
  parseDiagnosisDraft,
  readDiagnosisDraft,
  writeDiagnosisDraft,
} from '../lib/diagnosis/draft';
import { RESULT_STEP, visibleQuestions } from '../lib/diagnosis/questions';
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
    questionId: 'experience',
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
    expect(draft?.questionId).toBe('experience');
    expect(draft?.input.goal).toBe('muscle');
    expect(draft?.input.body.weightKg).toBe(82);
    expect(draft?.strengthMode).toBe('set');
    expect(draft?.setInputs.bench).toEqual({ weight: '80', reps: '5' });
    expect(draftQuestionId(draft!)).toBe('experience');
  });

  it('回答を変えるたびに、下書きが上書きされる', () => {
    const storage = memoryStorage();
    writeDiagnosisDraft(draftPayload(), storage);
    expect(readDiagnosisDraft(storage)?.questionId).toBe('experience');

    const input = defaultDiagnosisInput();
    writeDiagnosisDraft(
      { step: 0, questionId: 'sleepDuration', input: { ...input, goal: 'strength' }, strengthMode: 'oneRm', setInputs: emptySetInputs() },
      storage,
    );

    const updated = readDiagnosisDraft(storage);
    expect(updated?.questionId).toBe('sleepDuration');
    expect(updated?.input.goal).toBe('strength');
  });

  it('読み込み直しても同じ位置と回答から再開できる', () => {
    const storage = memoryStorage();
    const input = { ...defaultDiagnosisInput(), goal: 'muscle' as const, targets: { weightKg: 68, lifts: {} } };
    writeDiagnosisDraft({ step: 0, questionId: 'bodySize', input, strengthMode: 'oneRm', setInputs: emptySetInputs() }, storage);

    // 別のセッションとして読み直す
    const reopened = readDiagnosisDraft(storage);
    expect(reopened).not.toBeNull();
    expect(draftQuestionId(reopened!)).toBe('bodySize');
    expect(reopened!.input.targets.weightKg).toBe(68);
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
      questionId: RESULT_STEP,
      input: defaultDiagnosisInput(),
    });
    expect(draftQuestionId(draft!)).toBe(RESULT_STEP);
    expect(draftStepLabel(draft!)).toBe('診断結果');
  });

  it('途中の位置は何問目かが分かる文言になる', () => {
    const draft = normalizeDiagnosisDraft({ version: 1, savedAt: new Date().toISOString(), step: 0, input: {} });
    const total = visibleQuestions(defaultDiagnosisInput()).length;
    expect(draftStepLabel(draft!)).toBe(`1 / ${total}問目`);
  });
});

describe('1問1画面より前の下書きとの互換', () => {
  it('questionId が無い下書きは、章の番号から位置を割り出す', () => {
    const legacy = {
      version: 1,
      savedAt: new Date().toISOString(),
      step: 2,
      input: defaultDiagnosisInput(),
      strengthMode: 'oneRm',
      setInputs: emptySetInputs(),
    };
    const draft = normalizeDiagnosisDraft(legacy);
    expect(draft).not.toBeNull();
    expect(draft!.questionId).toBeNull();
    // step 2 は「筋トレ状況」の章。その最初の質問へ移す。
    expect(draftQuestionId(draft!)).toBe('experience');
  });

  it('旧下書きの回答内容はそのまま引き継ぐ', () => {
    const input = { ...defaultDiagnosisInput(), goal: 'fat-loss' as const, body: { ...defaultDiagnosisInput().body, weightKg: 91 } };
    const draft = normalizeDiagnosisDraft({ version: 1, savedAt: new Date().toISOString(), step: 1, input });
    expect(draft!.input.goal).toBe('fat-loss');
    expect(draft!.input.body.weightKg).toBe(91);
    expect(draftQuestionId(draft!)).toBe('sex');
  });

  it('保存されたIDが今は出ない質問なら、章の番号へ落とす', () => {
    // 目的が health のときは targetWeight を出さない
    const draft = normalizeDiagnosisDraft({
      version: 1,
      savedAt: new Date().toISOString(),
      step: 1,
      questionId: 'targetWeight',
      input: defaultDiagnosisInput(),
    });
    expect(draftQuestionId(draft!)).toBe('sex');
  });

  it('壊れた questionId は無視する', () => {
    for (const questionId of [42, {}, '', 'x'.repeat(200)]) {
      const draft = normalizeDiagnosisDraft({
        version: 1, savedAt: new Date().toISOString(), step: 0, questionId, input: {},
      });
      expect(draft!.questionId).toBeNull();
      expect(draftQuestionId(draft!)).toBe('goal');
    }
  });
});
