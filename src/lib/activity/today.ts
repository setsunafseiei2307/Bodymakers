/**
 * 「今日どこまでやったか」。
 *
 * 出す項目は、その人が実際に持っているものだけにする。
 * Planも実行中Programも無い人に、架空のタスクを並べて未達に見せない。
 *
 * Todayの最上部にある「今日の一手」とは役割を分ける。
 * あちらは次の1アクション、こちらは今日の埋まり具合。
 * そのためここのリンクはすべて補助的な扱いにする。
 */

import { buildPersonalPlan } from '../diagnosis/plan';
import type { BodymakersData, DailyLog } from '../storage';
import { hasCheckIn, hasNutrition, hasTraining } from './streak';

export type TodayTaskId = 'training' | 'nutrition' | 'checkIn';

export interface TodayTask {
  id: TodayTaskId;
  label: string;
  done: boolean;
  /** 未完了のときに出す短い説明。 */
  hint: string;
  /** 未完了のときの行き先。Primary CTAとは競合させない補助動線。 */
  href: string;
  action: string;
}

export interface TodayProgress {
  tasks: TodayTask[];
  done: number;
  total: number;
  /** 0〜100。バーの幅に使う。 */
  percent: number;
  allDone: boolean;
}

/** 今日の記録が無い状態を表す、空の1日。 */
export function blankLog(date: string): DailyLog {
  return {
    date,
    savedAt: '',
    weightKg: null,
    meals: [],
    exercises: [],
    muscles: [],
    doneExercises: [],
    manualIntake: { kcal: null, protein: null },
    steps: null,
    sleepHours: null,
    nutritionComplete: false,
  };
}

function hasNutritionTarget(data: BodymakersData): boolean {
  if (data.dietPlan != null) return true;
  if (data.personalPlan == null) return false;
  return buildPersonalPlan(data.personalPlan.input).nutrition != null;
}

/**
 * 今日出す項目を決める。
 * - Training: 実行中ProgramかPersonal Planがある人だけ
 * - Nutrition: 1日の栄養の目安を持っている人だけ
 * - Check-in: 誰でも記録できるので常に出す
 */
export function todayProgress(data: BodymakersData, log: DailyLog): TodayProgress {
  const tasks: TodayTask[] = [];

  if (data.activeProgram != null || data.personalPlan != null) {
    tasks.push({
      id: 'training',
      label: 'Training',
      done: hasTraining(log),
      hint: data.activeProgram != null ? '今日のセッションを記録する' : '今日動いたことを記録する',
      href: '#workout',
      action: '記録する',
    });
  }

  if (hasNutritionTarget(data)) {
    tasks.push({
      id: 'nutrition',
      label: 'Nutrition',
      done: hasNutrition(log),
      hint: '食べたものを記録する',
      href: '#quick-record',
      action: '記録する',
    });
  }

  tasks.push({
    id: 'checkIn',
    label: 'Check-in',
    done: hasCheckIn(log),
    hint: '体重・歩数・睡眠のどれかを記録する',
    href: '#quick-record',
    action: '記録する',
  });

  const done = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  return {
    tasks,
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    allDone: total > 0 && done === total,
  };
}
