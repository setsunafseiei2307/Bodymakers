import { describe, expect, it } from 'vitest';

import {
  activeDateKeys,
  dayActivity,
  streakMessage,
  summarizeActivity,
} from '../lib/activity/streak';
import { blankLog, todayProgress } from '../lib/activity/today';
import { emptyData, parseStoredData, type BodymakersData, type DailyLog } from '../lib/storage';
import type { ActiveProgram } from '../lib/programLibrary';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';

/** 日付依存を避けるため、テストはすべてこの基準日を渡す。 */
const NOW = new Date(2026, 8, 2, 10, 0, 0); // 2026-09-02 (水)

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: `${date}T10:00:00.000Z`, ...patch };
}

const trainingDay = (date: string) => log(date, { doneExercises: ['bench-press'] });
const nutritionDay = (date: string) => log(date, { meals: [{ foodId: '01088', grams: 150 }] });
const checkInDay = (date: string) => log(date, { weightKg: 72 });

function data(logs: DailyLog[], patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), dailyLogs: logs, ...patch };
}

const activeProgram: ActiveProgram = {
  programId: 'bodymakers-linear',
  startedAt: '2026-08-01T00:00:00.000Z',
  currentWeek: 2,
  currentDay: 1,
  trainingMaxes: { squat: 100 },
  daysPerWeek: 3,
  durationWeeks: 12,
  primaryLift: 'squat',
  completedSessions: 4,
};

describe('活動日の判定', () => {
  it('中身のない記録は活動日にしない', () => {
    expect(dayActivity(blankLog('2026-09-02')).active).toBe(false);
    expect(activeDateKeys(data([blankLog('2026-09-02')]))).toEqual([]);
  });

  it('トレーニングだけでも活動日になる', () => {
    const activity = dayActivity(trainingDay('2026-09-02'));
    expect(activity).toMatchObject({ training: true, nutrition: false, checkIn: false, active: true });
  });

  it('食事だけでも活動日になる', () => {
    const activity = dayActivity(nutritionDay('2026-09-02'));
    expect(activity).toMatchObject({ training: false, nutrition: true, checkIn: false, active: true });
  });

  it('体重・歩数・睡眠のどれかでも活動日になる', () => {
    expect(dayActivity(checkInDay('2026-09-02')).checkIn).toBe(true);
    expect(dayActivity(log('2026-09-02', { steps: 8000 })).active).toBe(true);
    expect(dayActivity(log('2026-09-02', { sleepHours: 7 })).active).toBe(true);
  });

  it('手入力のカロリー・たんぱく質も食事の記録として数える', () => {
    expect(dayActivity(log('2026-09-02', { manualIntake: { kcal: 2000, protein: null } })).nutrition).toBe(true);
    expect(dayActivity(log('2026-09-02', { manualIntake: { kcal: null, protein: 120 } })).nutrition).toBe(true);
  });

  it('複数のカテゴリを記録した日は、すべて立つ', () => {
    const activity = dayActivity(log('2026-09-02', {
      doneExercises: ['squat'], meals: [{ foodId: '01088', grams: 100 }], weightKg: 70,
    }));
    expect(activity).toMatchObject({ training: true, nutrition: true, checkIn: true, active: true });
  });

  it('完了したProgramの日も、その日のトレーニングとして数える', () => {
    const completedAt = new Date(2026, 8, 1, 20, 0).toISOString();
    const summary = summarizeActivity(data([], { programHistory: [{ ...activeProgram, completedAt }] }), NOW);
    expect(summary.totalActiveDays).toBe(1);
    expect(summary.lastActiveDate).toBe('2026-09-01');
  });

  it('壊れた日付の記録は数えない', () => {
    expect(activeDateKeys(data([trainingDay('こわれた')]))).toEqual([]);
  });
});

describe('継続日数', () => {
  it('データが無ければすべて0', () => {
    const summary = summarizeActivity(emptyData(), NOW);
    expect(summary).toMatchObject({
      todayActive: false, currentStreak: 0, longestStreak: 0,
      activeDaysLast7: 0, activeDaysLast30: 0, totalActiveDays: 0,
      lastActiveDate: null, firstActiveDate: null,
    });
  });

  it('今日だけの記録は1日', () => {
    const summary = summarizeActivity(data([trainingDay('2026-09-02')]), NOW);
    expect(summary.todayActive).toBe(true);
    expect(summary.currentStreak).toBe(1);
    expect(summary.longestStreak).toBe(1);
    expect(summary.activeDaysLast7).toBe(1);
  });

  it('今日を含む連続した記録を数える', () => {
    const summary = summarizeActivity(
      data(['2026-08-31', '2026-09-01', '2026-09-02'].map(trainingDay)),
      NOW,
    );
    expect(summary.currentStreak).toBe(3);
    expect(summary.longestStreak).toBe(3);
  });

  it('今日まだ記録していなくても、昨日まで続いていれば途切れない', () => {
    const summary = summarizeActivity(
      data(['2026-08-31', '2026-09-01'].map(nutritionDay)),
      NOW,
    );
    expect(summary.todayActive).toBe(false);
    expect(summary.currentStreak).toBe(2);
  });

  it('2日以上空くと継続は0に戻る', () => {
    const summary = summarizeActivity(
      data(['2026-08-28', '2026-08-29'].map(trainingDay)),
      NOW,
    );
    expect(summary.currentStreak).toBe(0);
    expect(summary.longestStreak).toBe(2);
  });

  it('最長の連続は、途中に空白があっても正しく出る', () => {
    const summary = summarizeActivity(
      data([
        ...['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(trainingDay),
        ...['2026-09-01', '2026-09-02'].map(trainingDay),
      ]),
      NOW,
    );
    expect(summary.longestStreak).toBe(4);
    expect(summary.currentStreak).toBe(2);
  });

  it('月をまたいでも連続として数える', () => {
    const summary = summarizeActivity(
      data(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'].map(checkInDay)),
      NOW,
    );
    expect(summary.currentStreak).toBe(4);
  });

  it('年をまたいでも連続として数える', () => {
    const newYear = new Date(2026, 0, 1, 9, 0);
    const summary = summarizeActivity(
      data(['2025-12-30', '2025-12-31', '2026-01-01'].map(checkInDay)),
      newYear,
    );
    expect(summary.currentStreak).toBe(3);
  });

  it('直近7日・30日の活動日を数える', () => {
    const dates = [
      '2026-09-02', '2026-09-01', '2026-08-30', // 7日以内
      '2026-08-20', '2026-08-10', // 30日以内
      '2026-06-01', // 30日より前
    ];
    const summary = summarizeActivity(data(dates.map(trainingDay)), NOW);
    expect(summary.activeDaysLast7).toBe(3);
    expect(summary.activeDaysLast30).toBe(5);
    expect(summary.totalActiveDays).toBe(6);
  });

  it('未来の日付は直近の集計に含めない', () => {
    const summary = summarizeActivity(data([trainingDay('2026-09-10'), trainingDay('2026-09-02')]), NOW);
    expect(summary.activeDaysLast7).toBe(1);
  });
});

describe('継続日数の伝え方', () => {
  it('0日でも否定的な言い方をしない', () => {
    const message = streakMessage(summarizeActivity(emptyData(), NOW));
    expect(message).toBe('今日からまた積み上げられます。');
    expect(message).not.toMatch(/途切れ|失敗|リセット|台無し/);
  });

  it('続いているときは日数を伝える', () => {
    const summary = summarizeActivity(data(['2026-09-01', '2026-09-02'].map(trainingDay)), NOW);
    expect(streakMessage(summary)).toContain('2日');
  });

  it('今日まだのときも、責めずに次の記録へ促す', () => {
    const summary = summarizeActivity(data([trainingDay('2026-09-01')]), NOW);
    const message = streakMessage(summary);
    expect(message).toContain('1日続いています');
    expect(message).not.toMatch(/途切れ|失敗/);
  });
});

describe('今日の進捗', () => {
  it('Planも実行中Programも無い人には、架空のタスクを出さない', () => {
    const progress = todayProgress(emptyData(), blankLog('2026-09-02'));
    expect(progress.tasks.map((task) => task.id)).toEqual(['checkIn']);
    expect(progress.done).toBe(0);
    expect(progress.total).toBe(1);
  });

  it('実行中ProgramがあるとTrainingを判定する', () => {
    const progress = todayProgress(data([], { activeProgram }), blankLog('2026-09-02'));
    expect(progress.tasks.map((task) => task.id)).toContain('training');
  });

  it('Personal Planがあると Training と Nutrition を判定する', () => {
    const personalPlan = { version: 1 as const, createdAt: '2026-08-01T00:00:00.000Z', input: defaultDiagnosisInput() };
    const progress = todayProgress(data([], { personalPlan }), blankLog('2026-09-02'));
    expect(progress.tasks.map((task) => task.id)).toEqual(['training', 'nutrition', 'checkIn']);
  });

  it('記録した項目が完了になり、割合が上がる', () => {
    const personalPlan = { version: 1 as const, createdAt: '2026-08-01T00:00:00.000Z', input: defaultDiagnosisInput() };
    const current = data([], { personalPlan });

    const none = todayProgress(current, blankLog('2026-09-02'));
    expect(none.done).toBe(0);
    expect(none.percent).toBe(0);
    expect(none.allDone).toBe(false);

    const some = todayProgress(current, log('2026-09-02', { doneExercises: ['squat'], weightKg: 70 }));
    expect(some.done).toBe(2);
    expect(some.total).toBe(3);
    expect(some.percent).toBe(67);

    const all = todayProgress(current, log('2026-09-02', {
      doneExercises: ['squat'], meals: [{ foodId: '01088', grams: 100 }], weightKg: 70,
    }));
    expect(all.done).toBe(3);
    expect(all.allDone).toBe(true);
    expect(all.percent).toBe(100);
  });

  it('未完了の項目には行き先が入っている', () => {
    const progress = todayProgress(data([], { activeProgram }), blankLog('2026-09-02'));
    for (const task of progress.tasks) {
      expect(task.href.length).toBeGreaterThan(0);
      expect(task.action.length).toBeGreaterThan(0);
    }
  });
});

describe('既存 bodymakers:data:v1 との互換', () => {
  it('項目の欠けた古い保存データでも集計できる', () => {
    // activeProgram・programHistory・recentFoodIds が無い時代の形
    const legacy = parseStoredData(JSON.stringify({
      version: 1,
      profile: { sex: 'male', age: 30, heightCm: 170, weightKg: 70, activity: 'light', trainingDaysPerWeek: 3 },
      dailyLogs: [
        { date: '2026-09-01', weightKg: 70 },
        { date: '2026-09-02', meals: [{ foodId: '01088', grams: 100 }] },
      ],
    }));

    const summary = summarizeActivity(legacy, NOW);
    expect(summary.currentStreak).toBe(2);
    expect(summary.activeDaysLast7).toBe(2);
    expect(() => todayProgress(legacy, blankLog('2026-09-02'))).not.toThrow();
  });

  it('空の保存データでも例外を投げない', () => {
    const empty = parseStoredData(null);
    expect(() => summarizeActivity(empty, NOW)).not.toThrow();
    expect(() => todayProgress(empty, blankLog('2026-09-02'))).not.toThrow();
  });
});
