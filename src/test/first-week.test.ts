import { describe, expect, it } from 'vitest';

import { FIRST_WEEK_DAYS, GAP_DAYS, buildFirstWeekProgress } from '../lib/onboarding';
import { blankLog } from '../lib/activity/today';
import { shiftDateKey } from '../lib/activity/days';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';
import { emptyData, parseStoredData, type BodymakersData, type DailyLog } from '../lib/storage';

const NOW = new Date(2026, 8, 3, 10, 0, 0); // 2026-09-03
const ago = (days: number) => shiftDateKey('2026-09-03', -days);

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: `${date}T10:00:00.000Z`, ...patch };
}
const weighIn = (date: string, weightKg = 72) => log(date, { weightKg });
const trainedDay = (date: string) => log(date, { doneExercises: ['squat'] });
const ateDay = (date: string) => log(date, { manualIntake: { kcal: 2400, protein: 140 }, nutritionComplete: true });

const plan = (createdAt: string) => ({
  version: 1 as const, createdAt, input: defaultDiagnosisInput(),
});

function data(patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), ...patch };
}

describe('使いはじめの段階', () => {
  it('Planも記録も無ければ new', () => {
    const progress = buildFirstWeekProgress(emptyData(), NOW);
    expect(progress.stage).toBe('new');
    expect(progress.isFirstWeek).toBe(true);
    expect(progress.daysSinceStart).toBeNull();
    expect(progress.steps.every((step) => !step.done)).toBe(true);
  });

  it('Planだけなら plan-created', () => {
    const progress = buildFirstWeekProgress(data({ personalPlan: plan(new Date(2026, 8, 3).toISOString()) }), NOW);
    expect(progress.stage).toBe('plan-created');
    expect(progress.steps.find((step) => step.id === 'plan')?.done).toBe(true);
    expect(progress.steps.find((step) => step.id === 'first-record')?.done).toBe(false);
  });

  it('記録が1つあれば first-action-done', () => {
    const progress = buildFirstWeekProgress(data({
      personalPlan: plan(new Date(2026, 8, 3).toISOString()),
      dailyLogs: [weighIn(ago(0))],
    }), NOW);
    expect(progress.stage).toBe('first-action-done');
    expect(progress.activeDays).toBe(1);
  });

  it('種類は問わない。トレーニングでも食事でも体重でも進む', () => {
    for (const entry of [trainedDay(ago(0)), ateDay(ago(0)), weighIn(ago(0))]) {
      const progress = buildFirstWeekProgress(data({
        personalPlan: plan(new Date(2026, 8, 3).toISOString()),
        dailyLogs: [entry],
      }), NOW);
      expect(progress.stage).toBe('first-action-done');
    }
  });

  it('3日ぶんたまると building-history', () => {
    const progress = buildFirstWeekProgress(data({
      personalPlan: plan(new Date(2026, 8, 1).toISOString()),
      dailyLogs: [0, 1, 2].map((d) => weighIn(ago(d))),
    }), NOW);
    expect(progress.stage).toBe('building-history');
    expect(progress.steps.find((step) => step.id === 'few-days')?.done).toBe(true);
  });

  it('7日ぶん観測できたら週のまとめを出せる', () => {
    const progress = buildFirstWeekProgress(data({
      personalPlan: plan(new Date(2026, 7, 28).toISOString()),
      dailyLogs: [0, 2, 4].map((d) => weighIn(ago(d))),
    }), NOW);
    expect(progress.stage).toBe('weekly-review-ready');
    expect(progress.steps.find((step) => step.id === 'weekly-review')?.done).toBe(true);
  });

  it('記録が続いていれば established になり、初週の表示は終わる', () => {
    const progress = buildFirstWeekProgress(data({
      personalPlan: plan(new Date(2026, 7, 20).toISOString()),
      dailyLogs: [0, 1, 2, 3, 4, 5, 6].map((d) => weighIn(ago(d))),
    }), NOW);
    expect(progress.stage).toBe('established');
    expect(progress.isFirstWeek).toBe(false);
  });

  it('Day 2・Day 3でも次にやることが出る', () => {
    for (const days of [1, 2]) {
      const progress = buildFirstWeekProgress(data({
        personalPlan: plan(new Date(2026, 8, 3 - days).toISOString()),
        dailyLogs: [weighIn(ago(days))],
      }), NOW);
      expect(progress.isFirstWeek).toBe(true);
      const next = progress.steps.find((step) => !step.done);
      expect(next?.hint).not.toBeNull();
    }
  });
});

describe('解放条件の伝え方', () => {
  it('体重の測定が足りなければ、あと何回かを伝える', () => {
    const progress = buildFirstWeekProgress(data({ dailyLogs: [weighIn(ago(0))] }), NOW);
    const unlock = progress.unlocks.find((item) => item.id === 'weight-trend');
    expect(unlock?.hint).toContain('あと3回');
  });

  it('食事の記録が足りなければ、あと何日かを伝える', () => {
    const progress = buildFirstWeekProgress(data({ dailyLogs: [ateDay(ago(0))] }), NOW);
    const unlock = progress.unlocks.find((item) => item.id === 'nutrition-review');
    expect(unlock?.hint).toContain('あと3日');
  });

  it('そろっていれば、その案内は出さない', () => {
    const progress = buildFirstWeekProgress(data({
      dailyLogs: [0, 1, 2, 3].map((d) => log(ago(d), { weightKg: 72, manualIntake: { kcal: 2400, protein: 140 }, nutritionComplete: true })),
    }), NOW);
    expect(progress.unlocks).toEqual([]);
  });

  it('技術的な言い方をしない', () => {
    const progress = buildFirstWeekProgress(data({ dailyLogs: [weighIn(ago(0))] }), NOW);
    const text = progress.unlocks.map((item) => item.hint).join('');
    expect(text).not.toMatch(/enoughData|MIN_|ratio|threshold|null/);
  });
});

describe('責めない', () => {
  it('どの段階でも否定的な言い方をしない', () => {
    const cases: BodymakersData[] = [
      emptyData(),
      data({ personalPlan: plan(new Date(2026, 8, 3).toISOString()) }),
      data({ personalPlan: plan(new Date(2026, 7, 20).toISOString()), dailyLogs: [weighIn(ago(10))] }),
      data({ dailyLogs: [0, 1, 2].map((d) => weighIn(ago(d))) }),
    ];
    for (const item of cases) {
      const progress = buildFirstWeekProgress(item, NOW);
      const text = [progress.headline, progress.detail, ...progress.steps.map((s) => s.hint ?? '')].join('');
      expect(text).not.toMatch(/未達|サボ|失敗|ダメ|できていません|遅れて|怠/);
    }
  });
});

describe('久しぶりに戻ってきた場合', () => {
  it('途切れたことを主役にしない', () => {
    const progress = buildFirstWeekProgress(data({
      personalPlan: plan(new Date(2026, 7, 1).toISOString()),
      dailyLogs: [0, 1, 2].map((d) => weighIn(ago(d + GAP_DAYS))),
    }), NOW);
    expect(progress.returningAfterGap).toBe(true);
    expect(progress.headline).toBe('おかえりなさい');
    expect(progress.detail).toContain('今日からまた');
    expect(progress.detail).not.toMatch(/途切れ|失敗|リセット/);
  });

  it('昨日まで記録していれば、久しぶり扱いにしない', () => {
    const progress = buildFirstWeekProgress(data({
      personalPlan: plan(new Date(2026, 7, 1).toISOString()),
      dailyLogs: [0, 1].map((d) => weighIn(ago(d))),
    }), NOW);
    expect(progress.returningAfterGap).toBe(false);
  });

  it('一度も記録が無い人は久しぶり扱いにしない', () => {
    expect(buildFirstWeekProgress(emptyData(), NOW).returningAfterGap).toBe(false);
  });
});

describe('壊れたデータでも落ちない', () => {
  it('旧schemaでも段階を出せる', () => {
    const legacy = parseStoredData(JSON.stringify({
      version: 1,
      dailyLogs: [{ date: ago(1), weightKg: 72 }],
    }));
    expect(() => buildFirstWeekProgress(legacy, NOW)).not.toThrow();
    expect(buildFirstWeekProgress(legacy, NOW).stage).toBe('first-action-done');
  });

  it('壊れたJSONでも落ちない', () => {
    for (const raw of ['{broken', 'null', '{"version":99}']) {
      expect(() => buildFirstWeekProgress(parseStoredData(raw), NOW)).not.toThrow();
    }
  });

  it('日付が抜けていても数えられる', () => {
    const progress = buildFirstWeekProgress(data({
      personalPlan: plan(new Date(2026, 7, 28).toISOString()),
      dailyLogs: [weighIn(ago(0)), weighIn(ago(3)), weighIn(ago(6))],
    }), NOW);
    expect(progress.activeDays).toBe(3);
    expect(progress.daysSinceStart).toBeGreaterThanOrEqual(FIRST_WEEK_DAYS - 1);
  });
});
