import { describe, expect, it } from 'vitest';

import { buildWeeklySummary, weeklyProgress } from '../lib/activity/weekly';
import { blankLog } from '../lib/activity/today';
import { emptyData, parseStoredData, type BodymakersData, type DailyLog } from '../lib/storage';
import { shiftDateKey } from '../lib/activity/days';
import type { ActiveProgram } from '../lib/programLibrary';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';

/** 日付依存を避けるため、テストはすべてこの基準日を渡す。 */
const NOW = new Date(2026, 8, 2, 10, 0, 0); // 2026-09-02 (水)

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: `${date}T10:00:00.000Z`, ...patch };
}

const trainingDay = (date: string) => log(date, { doneExercises: ['bench-press'] });
const nutritionDay = (date: string) => log(date, { meals: [{ foodId: '01088', grams: 150 }] });

function data(logs: DailyLog[], patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), dailyLogs: logs, ...patch };
}

/** 基準日から n 日前の日付キー。 */
function ago(days: number): string {
  return shiftDateKey('2026-09-02', -days);
}

describe('直近7日の進捗', () => {
  it('今日を最後に、7日ぶんを古い順で返す', () => {
    const week = weeklyProgress(emptyData(), NOW);
    expect(week.days).toHaveLength(7);
    expect(week.days[0]!.date).toBe('2026-08-27');
    expect(week.days.at(-1)!.date).toBe('2026-09-02');
    expect(week.days.at(-1)!.isToday).toBe(true);
    expect(week.days.filter((day) => day.isToday)).toHaveLength(1);
  });

  it('曜日は実際の日付から出す', () => {
    const week = weeklyProgress(emptyData(), NOW);
    // 2026-08-27 は木曜、2026-09-02 は水曜
    expect(week.days[0]!.weekday).toBe('木');
    expect(week.days.at(-1)!.weekday).toBe('水');
  });

  it('記録の無い週は0日', () => {
    const week = weeklyProgress(emptyData(), NOW);
    expect(week.activeDays).toBe(0);
    expect(week.days.every((day) => !day.active)).toBe(true);
  });

  it('記録した日だけを活動日にする', () => {
    const week = weeklyProgress(data([trainingDay(ago(0)), trainingDay(ago(2)), nutritionDay(ago(5))]), NOW);
    expect(week.activeDays).toBe(3);
    expect(week.trainingDays).toBe(2);
    expect(week.nutritionDays).toBe(1);
  });

  it('7日より前の記録は含めない', () => {
    const week = weeklyProgress(data([trainingDay(ago(7)), trainingDay(ago(30))]), NOW);
    expect(week.activeDays).toBe(0);
  });

  it('30日ぶんも同じ関数で出せる', () => {
    const month = weeklyProgress(data([trainingDay(ago(0)), trainingDay(ago(10)), trainingDay(ago(29)), trainingDay(ago(40))]), NOW, 30);
    expect(month.days).toHaveLength(30);
    expect(month.activeDays).toBe(3);
  });
});

describe('週次サマリー', () => {
  const personalPlan = { version: 1 as const, createdAt: '2026-06-01T00:00:00.000Z', input: defaultDiagnosisInput() };
  const activeProgram: ActiveProgram = {
    programId: 'bodymakers-linear',
    startedAt: '2026-08-01T00:00:00.000Z',
    currentWeek: 2, currentDay: 1, trainingMaxes: { squat: 100 },
    daysPerWeek: 3, durationWeeks: 12, primaryLift: 'squat', completedSessions: 4,
  };

  it('記録が無いときは、始め方を案内する', () => {
    const summary = buildWeeklySummary(emptyData(), NOW);
    expect(summary.hasEnoughData).toBe(false);
    expect(summary.activeDays).toBe(0);
    expect(summary.daysUntilInsight).toBe(7);
    expect(summary.lines[0]!.text).toContain('7日後');
  });

  it('データが足りないうちは、あと何日かを伝える', () => {
    const summary = buildWeeklySummary(data([trainingDay(ago(2)), trainingDay(ago(0))]), NOW);
    expect(summary.hasEnoughData).toBe(false);
    // 3日ぶん観測できているので、あと4日
    expect(summary.daysUntilInsight).toBe(4);
    expect(summary.lines[0]!.text).toContain('あと4日');
    expect(summary.lines.some((line) => line.text.includes('2日'))).toBe(true);
  });

  it('7日ぶん観測できたら傾向を出す', () => {
    const logs = [0, 1, 3, 5, 6].map((days) => trainingDay(ago(days)));
    const summary = buildWeeklySummary(data(logs), NOW);
    expect(summary.hasEnoughData).toBe(true);
    expect(summary.activeDays).toBe(5);
    expect(summary.lines[0]!.text).toBe('直近7日で5日記録しました。');
  });

  it('予定回数があれば、それと比べて出す', () => {
    const logs = [0, 2, 4, 6].map((days) => trainingDay(ago(days)));
    const summary = buildWeeklySummary(data(logs, { activeProgram }), NOW);
    const training = summary.lines.find((line) => line.id === 'training');
    expect(training?.text).toBe('トレーニングは予定3回に対して4回記録しました。');
  });

  it('予定が無ければ、回数だけを出す', () => {
    const logs = [0, 2, 6].map((days) => trainingDay(ago(days)));
    const summary = buildWeeklySummary(data(logs), NOW);
    expect(summary.lines.find((line) => line.id === 'training')?.text).toBe('トレーニングは今週3日記録しました。');
  });

  it('先週ぶんを observe しきれていれば、先週と比べる', () => {
    // 先週の窓（7〜13日前）が丸ごと観測できている必要がある
    const thisWeek = [0, 1, 2, 3].map((days) => nutritionDay(ago(days)));
    const lastWeek = [7, 8, 13].map((days) => nutritionDay(ago(days)));
    const summary = buildWeeklySummary(data([...thisWeek, ...lastWeek]), NOW);
    expect(summary.previousActiveDays).toBe(3);
    expect(summary.lines.find((line) => line.id === 'nutrition')?.text).toBe('食事記録は先週より1日多い4日です。');
  });

  it('先週より少ない週も、責めずに事実だけ書く', () => {
    const thisWeek = [0].map((days) => nutritionDay(ago(days)));
    const lastWeek = [7, 8, 13].map((days) => nutritionDay(ago(days)));
    const summary = buildWeeklySummary(data([...thisWeek, ...lastWeek]), NOW);
    const nutrition = summary.lines.find((line) => line.id === 'nutrition');
    expect(nutrition?.text).toBe('食事記録は先週より2日少ない1日です。');
    expect(nutrition?.text).not.toMatch(/減って|サボ|失敗|悪い/);
  });

  it('先週と同じ日数なら、そう書く', () => {
    const logs = [...[0, 1].map((d) => nutritionDay(ago(d))), ...[7, 13].map((d) => nutritionDay(ago(d)))];
    const summary = buildWeeklySummary(data(logs), NOW);
    expect(summary.lines.find((line) => line.id === 'nutrition')?.text).toBe('食事記録は先週と同じ2日です。');
  });

  it('先週の窓を観測しきれていなければ、比べない', () => {
    // 10日前が最初の記録。先週の窓の一部しか見えていないので比べない。
    const logs = [...[0, 1].map((d) => nutritionDay(ago(d))), nutritionDay(ago(10))];
    const summary = buildWeeklySummary(data(logs), NOW);
    expect(summary.previousActiveDays).toBeNull();
    expect(summary.lines.find((line) => line.id === 'nutrition')?.text).toBe('食事は今週2日記録しました。');
  });

  it('比べられないときは先週の値を出さない', () => {
    const summary = buildWeeklySummary(data([0, 1, 2, 3, 4, 5, 6].map((d) => nutritionDay(ago(d)))), NOW);
    expect(summary.previousActiveDays).toBeNull();
    expect(summary.lines.find((line) => line.id === 'nutrition')?.text).toBe('食事は今週7日記録しました。');
  });

  it('体重は7日前と比べて、事実だけ書く', () => {
    const logs = [
      log(ago(8), { weightKg: 72.4 }),
      log(ago(0), { weightKg: 72.0 }),
    ];
    const summary = buildWeeklySummary(data(logs), NOW);
    const weight = summary.lines.find((line) => line.id === 'weight');
    expect(weight?.text).toContain('−0.4kg');
    // 速度や良し悪しの評価をしない
    expect(weight?.text).not.toMatch(/ペース|順調|速すぎ|理想|危険/);
  });

  it('比べる体重が無ければ、体重の行を出さない', () => {
    const summary = buildWeeklySummary(data([log(ago(0), { weightKg: 72 }), trainingDay(ago(8))]), NOW);
    expect(summary.lines.find((line) => line.id === 'weight')).toBeUndefined();
  });

  it('行は4つまでに抑える', () => {
    const logs = [
      ...[0, 1, 2, 3, 4, 5, 6].map((d) => log(ago(d), { doneExercises: ['squat'], meals: [{ foodId: '01088', grams: 100 }], weightKg: 71 })),
      ...[7, 8, 9].map((d) => log(ago(d), { meals: [{ foodId: '01088', grams: 100 }], weightKg: 72 })),
    ];
    const summary = buildWeeklySummary(data(logs, { activeProgram, personalPlan }), NOW);
    expect(summary.lines.length).toBeLessThanOrEqual(4);
    expect(summary.hasEnoughData).toBe(true);
  });

  it('医療的な判断や断定的な評価をしない', () => {
    const logs = [
      ...[0, 1, 2, 3, 4, 5, 6].map((d) => log(ago(d), { doneExercises: ['squat'], weightKg: 70 })),
      log(ago(8), { weightKg: 74 }),
    ];
    const summary = buildWeeklySummary(data(logs), NOW);
    const text = summary.lines.map((line) => line.text).join('');
    expect(text).not.toMatch(/診断|病気|健康的|痩せすぎ|肥満|危険|異常|治療/);
  });
});

describe('既存データとの互換', () => {
  it('古い保存形式でも週次サマリーを作れる', () => {
    const legacy = parseStoredData(JSON.stringify({
      version: 1,
      dailyLogs: [
        { date: ago(0), weightKg: 70 },
        { date: ago(3), meals: [{ foodId: '01088', grams: 100 }] },
      ],
    }));
    expect(() => buildWeeklySummary(legacy, NOW)).not.toThrow();
    expect(weeklyProgress(legacy, NOW).activeDays).toBe(2);
  });

  it('空データでも例外を投げない', () => {
    expect(() => buildWeeklySummary(parseStoredData(null), NOW)).not.toThrow();
    expect(() => weeklyProgress(parseStoredData('{broken'), NOW)).not.toThrow();
  });
});
