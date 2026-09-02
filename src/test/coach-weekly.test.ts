import { describe, expect, it } from 'vitest';

import { MAX_NARRATIVE_LINES, buildWeeklyCoach } from '../lib/coach';
import { blankLog } from '../lib/activity/today';
import { shiftDateKey } from '../lib/activity/days';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';
import { LIFT_STEP_KG } from '../lib/training/adaptive';
import { resolveNutritionTarget } from '../lib/nutritionAdaptive';
import { emptyData, parseStoredData, type BodymakersData, type DailyLog, type SavedDietPlan } from '../lib/storage';
import type { ActiveProgram } from '../lib/programLibrary';
import type { TrainingSessionLog } from '../lib/training/log';

const NOW = new Date(2026, 8, 3, 10, 0, 0); // 2026-09-03 (木)
const ago = (days: number) => shiftDateKey('2026-09-03', -days);

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: `${date}T10:00:00.000Z`, ...patch };
}
const weighIn = (date: string, weightKg: number) => log(date, { weightKg });
const ateDay = (date: string, kcal: number, weightKg?: number) =>
  log(date, { manualIntake: { kcal, protein: 140 }, nutritionComplete: true, ...(weightKg == null ? {} : { weightKg }) });
const trainedDay = (date: string) => log(date, { doneExercises: ['squat'] });

const dietPlan: SavedDietPlan = {
  createdAt: '2026-07-01T00:00:00.000Z',
  startingWeightKg: 75, targetWeightKg: 70, targetDate: '2026-11-01',
  tdee: 2600, targetCalories: 2400, proteinGrams: 140, fatGrams: 70, carbsGrams: 300,
  dailyKcalGap: -200, mode: 'cut',
};

const activeProgram: ActiveProgram = {
  programId: 'bodymakers-five-by-five',
  startedAt: '2026-08-01T00:00:00.000Z',
  currentWeek: 2, currentDay: 1,
  trainingMaxes: { bench: 80, squat: 100, deadlift: 120 },
  daysPerWeek: 3, durationWeeks: 4, primaryLift: 'squat', completedSessions: 3,
};

function session(date: string, key: string): TrainingSessionLog {
  return {
    id: `${key}:${date}`, date, savedAt: '', programId: 'bodymakers-five-by-five', week: 1, day: 1, sessionKey: key,
    exercises: [{
      exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 100, plannedSets: 5, plannedReps: 5,
      sets: Array.from({ length: 5 }, () => ({ weightKg: 100, reps: 5, done: true })),
    }],
  };
}

/** 今週スクワットが+5kgされた状態の調整履歴。 */
function squatBumped(date = ago(1)) {
  return {
    version: 1 as const,
    lifts: { squat: { offsetKg: 5, consecutiveMisses: 0, reason: 'increase' as const, lastDeltaKg: 5, updatedAt: '', lastSessionKey: 'k1' } },
    history: [{ id: 'k1:squat', date, lift: 'squat' as const, reason: 'increase' as const, deltaKg: 5, offsetKg: 5, sessionKey: 'k1' }],
  };
}

/** 十分な体重測定と、目標に沿った食事記録がある状態。 */
function goodRecords(currentKg: number, previousKg: number): DailyLog[] {
  return [
    ...[0, 1, 2, 3].map((d) => ateDay(ago(d), 2400, currentKg)),
    ...[7, 8, 9, 10].map((d) => weighIn(ago(d), previousKg)),
  ];
}

function data(patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), ...patch };
}

const plan = (goal: 'fat-loss' | 'muscle' | 'recomp') => ({
  version: 1 as const, createdAt: '2026-07-01T00:00:00.000Z', input: { ...defaultDiagnosisInput(), goal },
});

describe('まとめの合成', () => {
  it('記録が無ければデータを集めている状態にする', () => {
    const coach = buildWeeklyCoach(emptyData(), NOW);
    expect(coach.state).toBe('collecting-data');
    expect(coach.hasEnoughData).toBe(false);
    expect(coach.recommendation.id).toBe('keep-recording');
    expect(coach.recommendation.action).toBeNull();
  });

  it('Trainingだけの記録でもまとめられる', () => {
    const coach = buildWeeklyCoach(data({
      activeProgram,
      dailyLogs: [0, 2, 4].map((d) => trainedDay(ago(d))),
      trainingSessions: [session(ago(0), 'k1'), session(ago(2), 'k2')],
    }), NOW);
    expect(coach.training.sessions).toBe(2);
    expect(coach.training.hasData).toBe(true);
    expect(coach.nutrition.hasData).toBe(false);
    expect(coach.state).not.toBe('collecting-data');
  });

  it('Nutritionだけの記録でもまとめられる', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan,
      dailyLogs: goodRecords(72, 72.5),
    }), NOW);
    expect(coach.nutrition.completedDays).toBe(4);
    expect(coach.training.sessions).toBe(0);
    expect(coach.nutrition.hasData).toBe(true);
  });

  it('両方あるときは両方まとめる', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.5),
      trainingSessions: [session(ago(0), 'k1'), session(ago(2), 'k2'), session(ago(4), 'k3')],
    }), NOW);
    expect(coach.training.sessions).toBe(3);
    expect(coach.nutrition.completedDays).toBe(4);
  });

  it('活動日が少なければ、まず記録を集める', () => {
    const coach = buildWeeklyCoach(data({ dietPlan, dailyLogs: [weighIn(ago(0), 72)] }), NOW);
    expect(coach.state).toBe('collecting-data');
  });

  it('順調な週はそのまま続ける', () => {
    // 減量目的で、体重が意図どおり減っている
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingSessions: [session(ago(0), 'k1'), session(ago(2), 'k2')],
    }), NOW);
    expect(coach.state).toBe('on-track');
    expect(coach.recommendation.id).toBe('continue-plan');
    expect(coach.recommendation.action).toBeNull();
  });

  it('重量が動いた週はトレーニングの進行として扱う', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingSessions: [session(ago(0), 'k1')],
      trainingAdjustments: squatBumped(),
    }), NOW);
    expect(coach.state).toBe('training-progressing');
    expect(coach.training.changes).toHaveLength(1);
    expect(coach.training.changes[0]).toMatchObject({ lift: 'squat', deltaKg: LIFT_STEP_KG.squat });
  });

  it('栄養に候補があればそれを最優先で見せる', () => {
    // 減量目的で、記録は十分だが体重が横ばい
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72),
      trainingSessions: [session(ago(0), 'k1')],
      trainingAdjustments: squatBumped(),
    }), NOW);
    expect(coach.nutrition.state).toBe('adjust-down');
    expect(coach.state).toBe('nutrition-review');
    expect(coach.recommendation.id).toBe('apply-nutrition-adjustment');
  });

  it('記録が目標から離れていれば、まず記録を続ける', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan,
      dailyLogs: [
        ...[0, 1, 2, 3].map((d) => ateDay(ago(d), 3400, 72)),
        ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 72)),
      ],
    }), NOW);
    expect(coach.nutrition.state).toBe('consistency-first');
    expect(coach.state).toBe('consistency-first');
    expect(coach.recommendation.id).toBe('keep-recording');
  });
});

describe('優先順位と操作の数', () => {
  it('データ不足がいちばん優先される', () => {
    // 重量は動いているが、活動日が足りない
    const coach = buildWeeklyCoach(data({ trainingAdjustments: squatBumped(), dailyLogs: [] }), NOW);
    expect(coach.state).toBe('collecting-data');
  });

  it('どの状態でも、押せる操作は多くても1つ', () => {
    const cases: BodymakersData[] = [
      emptyData(),
      data({ dietPlan, dailyLogs: goodRecords(72, 72.6), activeProgram, trainingSessions: [session(ago(0), 'k1')] }),
      data({ dietPlan, dailyLogs: goodRecords(72, 72), activeProgram, trainingAdjustments: squatBumped(), trainingSessions: [session(ago(0), 'k1')] }),
      data({ dietPlan, dailyLogs: [...[0, 1, 2, 3].map((d) => ateDay(ago(d), 3400, 72)), ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 72))] }),
    ];
    for (const item of cases) {
      const coach = buildWeeklyCoach(item, NOW);
      // action は null か1つ。配列で複数持たせていない。
      expect(coach.recommendation.action === null || typeof coach.recommendation.action.kind === 'string').toBe(true);
    }
  });

  it('TrainingとNutritionが同じ週に動いても、意思決定は1つに絞る', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72),
      trainingSessions: [session(ago(0), 'k1')],
      // 重量はすでに上がっている（自動）＋栄養に候補（要確認）
      trainingAdjustments: squatBumped(),
    }), NOW);

    expect(coach.training.changes.length).toBeGreaterThan(0);
    expect(coach.nutrition.candidateKcal).not.toBe(0);
    // 押してもらうのは栄養の確認だけ。重量については操作を求めない。
    expect(coach.recommendation.id).toBe('apply-nutrition-adjustment');
    expect(coach.recommendation.action?.kind).toBe('nutrition-adjustment');
  });

  it('重量の変化は報告として出し、操作を求めない', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingSessions: [session(ago(0), 'k1')],
      trainingAdjustments: squatBumped(),
    }), NOW);
    expect(coach.state).toBe('training-progressing');
    expect(coach.recommendation.action).toBeNull();
  });
});

describe('recompの扱い', () => {
  it('体重が横ばいでもカロリーの候補を作らない', () => {
    const coach = buildWeeklyCoach(data({
      personalPlan: plan('recomp'), activeProgram,
      dailyLogs: goodRecords(72, 72),
      trainingSessions: [session(ago(0), 'k1')],
      trainingAdjustments: squatBumped(),
    }), NOW);
    expect(coach.nutrition.candidateKcal).toBe(0);
    expect(coach.nutrition.state).toBe('keep');
    expect(coach.recommendation.id).not.toBe('apply-nutrition-adjustment');
  });

  it('トレーニングが進んでいれば、その事実は伝える', () => {
    const coach = buildWeeklyCoach(data({
      personalPlan: plan('recomp'), activeProgram,
      dailyLogs: goodRecords(72, 72),
      trainingSessions: [session(ago(0), 'k1')],
      trainingAdjustments: squatBumped(),
    }), NOW);
    expect(coach.state).toBe('training-progressing');
    expect(coach.narrative.join('')).toContain('スクワット');
  });

  it('記録が足りなければ集めている状態のまま', () => {
    const coach = buildWeeklyCoach(data({ personalPlan: plan('recomp'), dailyLogs: [weighIn(ago(0), 72)] }), NOW);
    expect(coach.state).toBe('collecting-data');
  });
});

describe('今週変わったこと', () => {
  it('重量と食事の変更を並べる', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingSessions: [session(ago(0), 'k1')],
      trainingAdjustments: squatBumped(),
      nutritionAdjustments: {
        version: 1, offsetKcal: -100, planKey: 'diet:cut:2026-07-01T00:00:00.000Z', lastPeriodKey: '',
        history: [{ id: 'n1', date: ago(2), fromCalories: 2400, toCalories: 2300, deltaKcal: -100, reason: 'x', periodKey: '' }],
      },
    }), NOW);
    expect(coach.changes).toHaveLength(2);
    expect(coach.changes.find((c) => c.domain === 'training')?.text).toContain('+5kg');
    expect(coach.changes.find((c) => c.domain === 'nutrition')?.text).toContain('2300');
  });

  it('先週の変更は今週に含めない', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingAdjustments: squatBumped(ago(10)),
    }), NOW);
    expect(coach.changes).toEqual([]);
  });

  it('変化が無い週は空になる', () => {
    const coach = buildWeeklyCoach(data({ dietPlan, dailyLogs: goodRecords(72, 72.6) }), NOW);
    expect(coach.changes).toEqual([]);
  });
});

describe('次の1週間', () => {
  it('Programと栄養の目標を出す', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingSessions: [session(ago(0), 'k1')],
    }), NOW);
    expect(coach.nextWeek.training).toContain('Week 2');
    expect(coach.nextWeek.nutrition).toBe('2400 kcal');
    expect(coach.nextWeek.focus.length).toBeGreaterThan(0);
  });

  it('Programが無ければ推測しない', () => {
    const coach = buildWeeklyCoach(data({ dietPlan, dailyLogs: goodRecords(72, 72.6) }), NOW);
    expect(coach.nextWeek.training).toBeNull();
  });

  it('調整が適用されていれば、その目標を出す', () => {
    const base = data({
      dietPlan, dailyLogs: goodRecords(72, 72.6),
      nutritionAdjustments: { version: 1, offsetKcal: -100, planKey: 'diet:cut:2026-07-01T00:00:00.000Z', lastPeriodKey: '', history: [] },
    });
    expect(resolveNutritionTarget(base)!.calories).toBe(2300);
    expect(buildWeeklyCoach(base, NOW).nextWeek.nutrition).toBe('2300 kcal');
  });
});

describe('文章', () => {
  it('2〜3文に収める', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingSessions: [session(ago(0), 'k1'), session(ago(2), 'k2')],
      trainingAdjustments: squatBumped(),
    }), NOW);
    expect(coach.narrative.length).toBeGreaterThanOrEqual(1);
    expect(coach.narrative.length).toBeLessThanOrEqual(MAX_NARRATIVE_LINES);
  });

  it('進んだこと・状態・次にすること の順で並ぶ', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingSessions: [session(ago(0), 'k1'), session(ago(2), 'k2')],
      trainingAdjustments: squatBumped(),
    }), NOW);
    expect(coach.narrative[0]).toContain('トレーニング');
    expect(coach.narrative[1]).toContain('食事の記録');
    expect(coach.narrative.at(-1)).toContain('Plan');
  });

  it('数字が要約と食い違わない', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72.6),
      trainingSessions: [session(ago(0), 'k1'), session(ago(2), 'k2')],
    }), NOW);
    expect(coach.narrative[0]).toContain(`${coach.training.sessions}回`);
    expect(coach.narrative[1]).toContain(`${coach.nutrition.completedDays}日`);
  });

  it('記録が無い週でも弱い画面にしない', () => {
    const coach = buildWeeklyCoach(emptyData(), NOW);
    expect(coach.narrative.length).toBeGreaterThan(0);
    expect(coach.narrative.join('')).toContain('始められます');
  });

  it('どの状態でも責める表現を含まない', () => {
    const cases: BodymakersData[] = [
      emptyData(),
      data({ dietPlan, dailyLogs: goodRecords(72, 72) }),
      data({ dietPlan, dailyLogs: goodRecords(72, 72.6), activeProgram, trainingSessions: [session(ago(0), 'k1')] }),
      data({ dietPlan, dailyLogs: [...[0, 1, 2, 3].map((d) => ateDay(ago(d), 3400, 72)), ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 72))] }),
      data({ personalPlan: plan('muscle'), dailyLogs: goodRecords(72, 72) }),
    ];
    for (const item of cases) {
      const coach = buildWeeklyCoach(item, NOW);
      const text = [coach.headline, ...coach.narrative, coach.recommendation.label, coach.recommendation.detail].join('');
      expect(text).not.toMatch(/ダメ|失敗|怠け|食べすぎ|運動不足|もっと頑張|痩せませんでした|サボ/);
    }
  });
});

describe('低すぎる目標への安全側の扱い', () => {
  const lowPlan: SavedDietPlan = { ...dietPlan, targetCalories: 900, proteinGrams: 100, fatGrams: 30, carbsGrams: 60 };

  it('すでに低い目標から、さらに下げる候補を出さない', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan: lowPlan,
      dailyLogs: [
        ...[0, 1, 2, 3].map((d) => ateDay(ago(d), 900, 72)),
        ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 72)),
      ],
    }), NOW);
    expect(coach.nutrition.state).toBe('plan-review');
    expect(coach.nutrition.candidateKcal).toBe(0);
    expect(coach.state).toBe('plan-review');
    expect(coach.recommendation.id).toBe('review-plan');
  });

  it('危険だとは言わず、Planの見直しへ回す', () => {
    const coach = buildWeeklyCoach(data({
      dietPlan: lowPlan,
      dailyLogs: [
        ...[0, 1, 2, 3].map((d) => ateDay(ago(d), 900, 72)),
        ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 72)),
      ],
    }), NOW);
    const text = [coach.headline, ...coach.narrative, coach.recommendation.detail].join('');
    expect(text).not.toMatch(/危険|病気|栄養失調|健康を害/);
    expect(text).toContain('Plan');
  });
});

describe('壊れたデータでも落ちない', () => {
  it('旧schemaのデータでまとめられる', () => {
    const legacy = parseStoredData(JSON.stringify({
      version: 1,
      dailyLogs: [{ date: ago(0), weightKg: 70 }, { date: ago(1), weightKg: 70.2 }],
      dietPlan,
    }));
    expect(() => buildWeeklyCoach(legacy, NOW)).not.toThrow();
    const coach = buildWeeklyCoach(legacy, NOW);
    expect(coach.nutrition.completedDays).toBe(0);
  });

  it('壊れたJSONからでも落ちない', () => {
    for (const raw of ['{broken', 'null', '{"version":99}']) {
      expect(() => buildWeeklyCoach(parseStoredData(raw), NOW)).not.toThrow();
    }
  });

  it('目標が壊れていてもNaNを出さない', () => {
    const broken = parseStoredData(JSON.stringify({
      version: 1,
      dietPlan: { ...dietPlan, targetCalories: Number.NaN },
      dailyLogs: [ateDay(ago(0), 2000, 72)],
    }));
    const coach = buildWeeklyCoach(broken, NOW);
    if (coach.nutrition.targetCalories != null) {
      expect(Number.isFinite(coach.nutrition.targetCalories)).toBe(true);
    }
  });

  it('月・年をまたいでも今週の範囲がずれない', () => {
    const newYear = new Date(2026, 0, 1, 10, 0, 0);
    const logs = [
      ateDay('2025-12-30', 2400, 72), ateDay('2025-12-31', 2400, 72),
      ateDay('2026-01-01', 2400, 72), ateDay('2025-12-29', 2400, 72),
    ];
    const coach = buildWeeklyCoach(data({ dietPlan, dailyLogs: logs }), newYear);
    expect(coach.nutrition.completedDays).toBe(4);
  });
});

describe('既存エンジンを変えていない', () => {
  it('まとめを作っても、保存された調整は変わらない', () => {
    const original = data({
      dietPlan, activeProgram,
      dailyLogs: goodRecords(72, 72),
      trainingAdjustments: squatBumped(),
      nutritionAdjustments: { version: 1, offsetKcal: -100, planKey: 'diet:cut:2026-07-01T00:00:00.000Z', lastPeriodKey: '', history: [] },
    });
    const snapshot = JSON.stringify(original);
    buildWeeklyCoach(original, NOW);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('Nutritionエンジンの判定をそのまま使う', () => {
    const item = data({ dietPlan, dailyLogs: goodRecords(72, 72) });
    const coach = buildWeeklyCoach(item, NOW);
    // engine が返した state をそのまま持っている
    expect(['adjust-down', 'adjust-up', 'keep', 'consistency-first', 'collecting-data', 'plan-review'])
      .toContain(coach.nutrition.state);
    expect(coach.nutrition.headline.length).toBeGreaterThan(0);
  });
});
