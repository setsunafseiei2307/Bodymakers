import { describe, expect, it } from 'vitest';

import { comparePlanInputs, daysSincePlan, savedAtLabel } from '../lib/diagnosis/rediagnosis';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';
import { normalizePersonalPlan, type PersonalPlanInput, type SavedPersonalPlan } from '../lib/diagnosis/types';

const NOW = new Date(2026, 8, 3, 10, 0, 0); // 2026-09-03

function plan(patch: Partial<SavedPersonalPlan> = {}): SavedPersonalPlan {
  return {
    version: 1,
    createdAt: new Date(2026, 5, 1, 9, 0, 0).toISOString(),
    input: defaultDiagnosisInput(),
    ...patch,
  };
}

function withInput(patch: (input: PersonalPlanInput) => PersonalPlanInput): PersonalPlanInput {
  return patch(defaultDiagnosisInput());
}

describe('前回からの変更点', () => {
  it('何も変えていなければ、変更なしとして扱う', () => {
    expect(comparePlanInputs(defaultDiagnosisInput(), defaultDiagnosisInput())).toEqual([]);
  });

  it('目的の変更を拾う', () => {
    const changes = comparePlanInputs(
      defaultDiagnosisInput(),
      withInput((input) => ({ ...input, goal: 'fat-loss' })),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id: 'goal', label: '目的', before: '健康的な身体', after: '体脂肪を落とす' });
  });

  it('体重と目標体重の変更を拾う', () => {
    const changes = comparePlanInputs(
      defaultDiagnosisInput(),
      withInput((input) => ({
        ...input,
        body: { ...input.body, weightKg: 76.5 },
        targets: { ...input.targets, weightKg: 70 },
      })),
    );
    const ids = changes.map((change) => change.id);
    expect(ids).toContain('weight');
    expect(ids).toContain('targetWeight');
    expect(changes.find((c) => c.id === 'weight')).toMatchObject({ before: '70kg', after: '76.5kg' });
    expect(changes.find((c) => c.id === 'targetWeight')).toMatchObject({ before: '設定なし', after: '70kg' });
  });

  it('トレーニング条件の変更を拾う', () => {
    const changes = comparePlanInputs(
      defaultDiagnosisInput(),
      withInput((input) => ({
        ...input,
        training: { ...input.training, daysPerWeek: 5, sessionMinutes: 90, focus: 'strength', location: 'home' },
      })),
    );
    const byId = Object.fromEntries(changes.map((change) => [change.id, change]));
    expect(byId.daysPerWeek).toMatchObject({ before: '週3日', after: '週5日' });
    expect(byId.sessionMinutes).toMatchObject({ before: '60分', after: '90分' });
    expect(byId.focus).toMatchObject({ before: '健康・体力', after: '重量を伸ばす' });
    expect(byId.location).toMatchObject({ before: 'ジム', after: '自宅' });
  });

  it('複数まとめて変えても、それぞれ1件ずつ出す', () => {
    const changes = comparePlanInputs(
      defaultDiagnosisInput(),
      withInput((input) => ({
        ...input,
        goal: 'muscle',
        body: { ...input.body, weightKg: 80 },
        training: { ...input.training, daysPerWeek: 4 },
      })),
    );
    expect(changes.map((change) => change.id).sort()).toEqual(['daysPerWeek', 'goal', 'weight']);
  });

  it('比べる項目以外を変えても、変更として並べない', () => {
    // 睡眠や飲酒はPlanの形を直接変えないので、この一覧には出さない
    const changes = comparePlanInputs(
      defaultDiagnosisInput(),
      withInput((input) => ({
        ...input,
        lifestyle: { ...input.lifestyle, sleepDuration: 'under5', alcohol: 'daily' },
      })),
    );
    expect(changes).toEqual([]);
  });

  it('どの変更にも、前と後の両方が入っている', () => {
    const changes = comparePlanInputs(
      defaultDiagnosisInput(),
      withInput((input) => ({ ...input, goal: 'strength', training: { ...input.training, daysPerWeek: 1 } })),
    );
    for (const change of changes) {
      expect(change.label.length).toBeGreaterThan(0);
      expect(change.before.length).toBeGreaterThan(0);
      expect(change.after.length).toBeGreaterThan(0);
      expect(change.before).not.toBe(change.after);
    }
  });

  it('断定的・医療的な言い回しを含まない', () => {
    const changes = comparePlanInputs(
      defaultDiagnosisInput(),
      withInput((input) => ({ ...input, goal: 'fat-loss', body: { ...input.body, weightKg: 90 } })),
    );
    const text = changes.map((change) => `${change.label}${change.before}${change.after}`).join('');
    expect(text).not.toMatch(/診断|肥満|痩せすぎ|危険|異常|治療|改善しました|悪化/);
  });
});

describe('前回のPlanの保存日', () => {
  it('保存日を日本語で返す', () => {
    expect(savedAtLabel(plan())).toBe('2026年6月1日');
  });

  it('経過日数を返す', () => {
    expect(daysSincePlan(plan(), NOW)).toBe(94);
  });

  it('同じ日に保存したPlanは0日', () => {
    const today = plan({ createdAt: new Date(2026, 8, 3, 1, 0, 0).toISOString() });
    expect(daysSincePlan(today, NOW)).toBe(0);
  });

  it('読めない日付は null にして、画面を壊さない', () => {
    const broken = plan({ createdAt: 'いつか' });
    expect(savedAtLabel(broken)).toBeNull();
    expect(daysSincePlan(broken, NOW)).toBeNull();
  });

  it('未来の日付は null にする', () => {
    const future = plan({ createdAt: new Date(2027, 0, 1).toISOString() });
    expect(daysSincePlan(future, NOW)).toBeNull();
  });
});

describe('保存schemaとの互換', () => {
  it('比較しても保存内容を書き換えない', () => {
    const previous = plan();
    const before = JSON.stringify(previous);
    comparePlanInputs(previous.input, withInput((input) => ({ ...input, goal: 'muscle' })));
    expect(JSON.stringify(previous)).toBe(before);
  });

  it('比較に使った入力は、そのまま保存できる形のまま', () => {
    const next = withInput((input) => ({ ...input, goal: 'recomp', training: { ...input.training, daysPerWeek: 4 } }));
    comparePlanInputs(defaultDiagnosisInput(), next);
    const saved = normalizePersonalPlan({ version: 1, createdAt: NOW.toISOString(), input: next });
    expect(saved).not.toBeNull();
    expect(saved!.input.goal).toBe('recomp');
    expect(saved!.input.training.daysPerWeek).toBe(4);
  });

  it('既存の保存データから読んだPlanでも比較できる', () => {
    const restored = normalizePersonalPlan({
      version: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
      input: defaultDiagnosisInput(),
    });
    expect(restored).not.toBeNull();
    expect(() => comparePlanInputs(restored!.input, defaultDiagnosisInput())).not.toThrow();
  });
});
