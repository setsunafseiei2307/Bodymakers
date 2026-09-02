import { describe, expect, it } from 'vitest';

import {
  DIAGNOSIS_QUESTIONS,
  RESULT_STEP,
  autoAdvances,
  findQuestion,
  interstitialAfter,
  nextQuestionId,
  previousQuestionId,
  questionIdFromLegacyStep,
  questionProgress,
  resolveQuestionId,
  visibleQuestions,
  type ChoiceQuestion,
} from '../lib/diagnosis/questions';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';
import { normalizePersonalPlan, type PersonalPlanInput } from '../lib/diagnosis/types';
import { buildPersonalPlan } from '../lib/diagnosis/plan';

function choice(id: string): ChoiceQuestion {
  const question = findQuestion(id);
  if (question == null || question.kind !== 'choice') throw new Error(`choice question not found: ${id}`);
  return question;
}

/** 最初から最後まで、既定の回答のまま1問ずつ進める。 */
function walkThrough(start: PersonalPlanInput): { visited: string[]; input: PersonalPlanInput } {
  const visited: string[] = [];
  let input = start;
  let current = resolveQuestionId(input, null);
  let guard = 0;
  while (current !== RESULT_STEP && guard < 100) {
    visited.push(current);
    const question = findQuestion(current);
    if (question?.kind === 'choice') input = question.set(input, question.get(input));
    current = nextQuestionId(input, current);
    guard += 1;
  }
  return { visited, input };
}

describe('質問表', () => {
  it('IDが重複していない', () => {
    const ids = DIAGNOSIS_QUESTIONS.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('選択肢の値は、既存schemaが受け付ける値に収まる', () => {
    let input = defaultDiagnosisInput();
    for (const question of DIAGNOSIS_QUESTIONS) {
      if (question.kind !== 'choice') continue;
      for (const option of question.options) {
        input = question.set(input, option.value);
        // すべての選択肢で、保存できるPlanになり続けること
        const saved = normalizePersonalPlan({ version: 1, createdAt: '2026-09-02T00:00:00.000Z', input });
        expect(saved, `${question.id}=${option.value}`).not.toBeNull();
      }
    }
  });

  it('どの選択肢を選んでも、Plan生成が落ちない', () => {
    let input = defaultDiagnosisInput();
    for (const question of DIAGNOSIS_QUESTIONS) {
      if (question.kind !== 'choice') continue;
      for (const option of question.options) {
        input = question.set(input, option.value);
        expect(() => buildPersonalPlan(input)).not.toThrow();
      }
    }
  });

  it('選択式は自動で次へ進み、痛みの確認と数値入力は止まる', () => {
    expect(autoAdvances(choice('goal'))).toBe(true);
    expect(autoAdvances(choice('sex'))).toBe(true);
    expect(autoAdvances(choice('painOrInjury'))).toBe(false);
    expect(autoAdvances(findQuestion('age')!)).toBe(false);
    expect(autoAdvances(findQuestion('bodySize')!)).toBe(false);
    expect(autoAdvances(findQuestion('strength')!)).toBe(false);
  });
});

describe('1問ずつの進行', () => {
  it('最初から最後まで1問ずつ進み、最後に結果へ着く', () => {
    const { visited } = walkThrough(defaultDiagnosisInput());
    expect(visited[0]).toBe('goal');
    expect(new Set(visited).size).toBe(visited.length);
    expect(visited.length).toBe(visibleQuestions(defaultDiagnosisInput()).length);
    expect(nextQuestionId(defaultDiagnosisInput(), visited.at(-1)!)).toBe(RESULT_STEP);
  });

  it('目的によって出る質問が変わる', () => {
    const base = defaultDiagnosisInput();
    const goal = choice('goal');

    const health = visibleQuestions(goal.set(base, 'health')).map((question) => question.id);
    expect(health).not.toContain('targetWeight');
    expect(health).not.toContain('targetLifts');

    const muscle = visibleQuestions(goal.set(base, 'muscle')).map((question) => question.id);
    expect(muscle).toContain('targetWeight');
    expect(muscle).not.toContain('targetLifts');

    const strength = visibleQuestions(goal.set(base, 'strength')).map((question) => question.id);
    expect(strength).toContain('targetLifts');
    expect(strength).not.toContain('targetWeight');
  });

  it('目的を変えると、次に進む先も変わる', () => {
    const base = defaultDiagnosisInput();
    const goal = choice('goal');
    expect(nextQuestionId(goal.set(base, 'muscle'), 'goal')).toBe('targetWeight');
    expect(nextQuestionId(goal.set(base, 'strength'), 'goal')).toBe('targetLifts');
    expect(nextQuestionId(goal.set(base, 'health'), 'goal')).toBe('sex');
  });
});

describe('戻る操作', () => {
  it('前の質問へ戻れる', () => {
    const input = choice('goal').set(defaultDiagnosisInput(), 'health');
    expect(previousQuestionId(input, 'sex')).toBe('goal');
    expect(previousQuestionId(input, 'age')).toBe('sex');
  });

  it('最初の質問からは戻らない', () => {
    expect(previousQuestionId(defaultDiagnosisInput(), 'goal')).toBeNull();
  });

  it('結果画面からは最後の質問へ戻る', () => {
    const input = defaultDiagnosisInput();
    const last = visibleQuestions(input).at(-1)!.id;
    expect(previousQuestionId(input, RESULT_STEP)).toBe(last);
  });

  it('戻ってもう一度進んでも、同じ順路になる', () => {
    const input = choice('goal').set(defaultDiagnosisInput(), 'muscle');
    const forward = nextQuestionId(input, 'sex');
    expect(previousQuestionId(input, forward)).toBe('sex');
  });
});

describe('進捗の算出', () => {
  it('実際に出す質問数から数える', () => {
    const input = choice('goal').set(defaultDiagnosisInput(), 'health');
    const total = visibleQuestions(input).length;
    const first = questionProgress(input, 'goal');
    expect(first.position).toBe(1);
    expect(first.total).toBe(total);
    expect(first.percent).toBe(Math.round((1 / total) * 100));
  });

  it('質問が増える目的では、合計も増える', () => {
    const base = defaultDiagnosisInput();
    const goal = choice('goal');
    const health = questionProgress(goal.set(base, 'health'), 'goal').total;
    const muscle = questionProgress(goal.set(base, 'muscle'), 'goal').total;
    expect(muscle).toBe(health + 1);
  });

  it('進むほど割合が増え、100を超えない', () => {
    const input = defaultDiagnosisInput();
    const questions = visibleQuestions(input);
    let previous = 0;
    for (const question of questions) {
      const progress = questionProgress(input, question.id);
      expect(progress.percent).toBeGreaterThanOrEqual(previous);
      expect(progress.percent).toBeLessThanOrEqual(100);
      previous = progress.percent;
    }
    expect(questionProgress(input, RESULT_STEP).percent).toBe(100);
  });

  it('知らないIDでも壊れず、1問目として扱う', () => {
    expect(questionProgress(defaultDiagnosisInput(), 'unknown-question').position).toBe(1);
  });
});

describe('途中の声かけ', () => {
  it('4分の1・半分・4分の3の地点でだけ出す', () => {
    const input = defaultDiagnosisInput();
    const questions = visibleQuestions(input);
    const shown = questions
      .map((question, index) => ({ index: index + 1, feedback: interstitialAfter(input, question.id) }))
      .filter((item) => item.feedback != null);

    expect(shown).toHaveLength(3);
    expect(shown.map((item) => item.feedback!.id)).toEqual(['quarter', 'half', 'three-quarters']);
    const total = questions.length;
    expect(shown.map((item) => item.index)).toEqual([
      Math.round(total * 0.25), Math.round(total * 0.5), Math.round(total * 0.75),
    ]);
  });

  it('最後の質問の直後には出さない', () => {
    const input = defaultDiagnosisInput();
    const last = visibleQuestions(input).at(-1)!.id;
    expect(interstitialAfter(input, last)).toBeNull();
  });

  it('知らないIDでは出さない', () => {
    expect(interstitialAfter(defaultDiagnosisInput(), 'unknown-question')).toBeNull();
  });

  it('回答に沿った文面になり、結果を断定しない', () => {
    const input = { ...defaultDiagnosisInput(), training: { ...defaultDiagnosisInput().training, daysPerWeek: 5 as const } };
    const questions = visibleQuestions(input);
    const half = questions
      .map((question) => interstitialAfter(input, question.id))
      .find((feedback) => feedback?.id === 'half');

    expect(half).toBeDefined();
    expect(half!.lines.join('')).toContain('週5日');
    for (const feedback of ['quarter', 'half', 'three-quarters']) {
      const item = questions.map((q) => interstitialAfter(input, q.id)).find((f) => f?.id === feedback);
      expect(item!.title.length).toBeGreaterThan(0);
      // 診断結果や健康状態を言い切らないこと
      expect(item!.lines.join('')).not.toMatch(/診断結果|健康です|異常/);
    }
  });
});

describe('位置の復元', () => {
  it('保存されたIDが今も出る質問なら、その位置を使う', () => {
    const input = choice('goal').set(defaultDiagnosisInput(), 'muscle');
    expect(resolveQuestionId(input, 'targetWeight')).toBe('targetWeight');
  });

  it('今は出ない質問や未知のIDは、最初の質問へ戻す', () => {
    const health = choice('goal').set(defaultDiagnosisInput(), 'health');
    expect(resolveQuestionId(health, 'targetWeight')).toBe('goal');
    expect(resolveQuestionId(health, 'no-such-question')).toBe('goal');
    expect(resolveQuestionId(health, null)).toBe('goal');
    expect(resolveQuestionId(health, '')).toBe('goal');
  });

  it('結果画面の位置はそのまま残る', () => {
    expect(resolveQuestionId(defaultDiagnosisInput(), RESULT_STEP)).toBe(RESULT_STEP);
  });

  it('旧形式の章番号から、その章の最初の質問へ移す', () => {
    const input = defaultDiagnosisInput();
    expect(questionIdFromLegacyStep(input, 0)).toBe('goal');
    expect(questionIdFromLegacyStep(input, 1)).toBe('sex');
    expect(questionIdFromLegacyStep(input, 2)).toBe('experience');
    expect(questionIdFromLegacyStep(input, 3)).toBe('strength');
    expect(questionIdFromLegacyStep(input, 4)).toBe('mealsPerDay');
    expect(questionIdFromLegacyStep(input, 5)).toBe('sleepDuration');
    expect(questionIdFromLegacyStep(input, 6)).toBe(RESULT_STEP);
  });

  it('壊れた章番号でも最初の質問へ落とす', () => {
    const input = defaultDiagnosisInput();
    expect(questionIdFromLegacyStep(input, -1)).toBe('goal');
    expect(questionIdFromLegacyStep(input, 1.5)).toBe('goal');
    expect(questionIdFromLegacyStep(input, Number.NaN)).toBe('goal');
  });
});
