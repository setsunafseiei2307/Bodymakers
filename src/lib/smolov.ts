/**
 * Smolov / Smolov Jr. のプログラム生成。
 * 1RM と週ごとの増加量を入れると、日ごとのセット×レップ×重量まで確定させる。
 */

import { isFiniteNumber } from './format';
import { roundToIncrement } from './onerm';

export type SmolovVariant = 'jr' | 'base';

interface DayTemplate {
  label: string;
  sets: number;
  reps: number;
  percent: number;
}

const JR_DAYS: DayTemplate[] = [
  { label: 'Day 1', sets: 6, reps: 6, percent: 70 },
  { label: 'Day 2', sets: 7, reps: 5, percent: 75 },
  { label: 'Day 3', sets: 8, reps: 4, percent: 80 },
  { label: 'Day 4', sets: 10, reps: 3, percent: 85 },
];

const BASE_DAYS: DayTemplate[] = [
  { label: 'Day 1', sets: 4, reps: 9, percent: 70 },
  { label: 'Day 2', sets: 5, reps: 7, percent: 75 },
  { label: 'Day 3', sets: 7, reps: 5, percent: 80 },
  { label: 'Day 4', sets: 10, reps: 3, percent: 85 },
];

export interface SmolovDay {
  label: string;
  sets: number;
  reps: number;
  percent: number;
  weight: number;
  /** その日の総挙上重量（kg） */
  tonnage: number;
  totalReps: number;
}

export interface SmolovWeek {
  week: number;
  label: string;
  note: string;
  /** その週で基準にする最大重量 */
  workingMax: number;
  days: SmolovDay[];
  tonnage: number;
  totalReps: number;
  isTestWeek: boolean;
}

export interface SmolovPlan {
  variant: SmolovVariant;
  oneRM: number;
  increment: number;
  weeks: SmolovWeek[];
  tonnage: number;
  totalReps: number;
}

export interface SmolovOptions {
  /** 週ごとに working max へ加算する重量（kg）。ベンチ 2.5kg / スクワット 5kg が目安 */
  weeklyIncrement?: number;
  /** 最終週をテスト週にするか。false なら4週目も通常トレーニング */
  testWeek?: boolean;
}

const WEEK_NOTES: string[] = [
  '導入週。フォームを崩さず全セット同じ重量でやり切る。',
  '重量が上がる。追い込みすぎずセット間3〜5分。',
  '一番きつい週。睡眠と食事を最優先。',
  '新しい1RMを測定する週。',
];

/**
 * プログラムを生成する。1RM が不正なら null。
 */
export function buildSmolov(
  oneRM: number,
  variant: SmolovVariant = 'jr',
  options: SmolovOptions = {},
): SmolovPlan | null {
  if (!isFiniteNumber(oneRM) || oneRM <= 0) return null;

  const weeklyIncrement = options.weeklyIncrement ?? 2.5;
  const testWeek = options.testWeek ?? true;
  const template = variant === 'jr' ? JR_DAYS : BASE_DAYS;

  const weeks: SmolovWeek[] = [];

  for (let w = 0; w < 4; w++) {
    const isTestWeek = testWeek && w === 3;
    const workingMax = oneRM + weeklyIncrement * w;

    if (isTestWeek) {
      const targetWeight = roundToIncrement(oneRM + weeklyIncrement * 3, 2.5) ?? (oneRM + weeklyIncrement * 3);
      weeks.push({
        week: w + 1,
        label: `Week ${w + 1}`,
        note: WEEK_NOTES[3],
        workingMax,
        days: [
          {
            label: 'Day 1',
            sets: 1,
            reps: 1,
            percent: 100,
            weight: targetWeight,
            tonnage: targetWeight,
            totalReps: 1,
          },
        ],
        tonnage: targetWeight,
        totalReps: 1,
        isTestWeek: true,
      });
      continue;
    }

    const days: SmolovDay[] = template.map((d) => {
      const weight = roundToIncrement((workingMax * d.percent) / 100, 2.5) ?? ((workingMax * d.percent) / 100);
      const totalReps = d.sets * d.reps;
      return {
        label: d.label,
        sets: d.sets,
        reps: d.reps,
        percent: d.percent,
        weight,
        totalReps,
        tonnage: weight * totalReps,
      };
    });

    weeks.push({
      week: w + 1,
      label: `Week ${w + 1}`,
      note: WEEK_NOTES[Math.min(w, 2)],
      workingMax,
      days,
      tonnage: days.reduce((sum, d) => sum + d.tonnage, 0),
      totalReps: days.reduce((s, d) => s + d.totalReps, 0),
      isTestWeek: false,
    });
  }

  return {
    variant,
    oneRM,
    increment: weeklyIncrement,
    weeks,
    tonnage: weeks.reduce((sum, w) => sum + w.tonnage, 0),
    totalReps: weeks.reduce((s, w) => s + w.totalReps, 0),
  };
}

/** プログラムをテキスト化（コピー用） */
export function smolovToText(plan: SmolovPlan, exercise: string): string {
  const title =
    plan.variant === 'jr' ? 'Smolov Jr.（4週）' : 'Smolov ベースサイクル（4週）';
  const lines: string[] = [
    `【${title}】${exercise}`,
    `開始1RM: ${plan.oneRM}kg / 週ごとの増加: +${plan.increment}kg`,
    '',
  ];
  for (const week of plan.weeks) {
    lines.push(`■ ${week.label}${week.isTestWeek ? '（1RMテスト）' : ` — 基準 ${week.workingMax}kg`}`);
    for (const day of week.days) {
      lines.push(
        week.isTestWeek
          ? `  ${day.label}: 新1RM測定（目標 ${day.weight}kg）`
          : `  ${day.label}: ${day.weight}kg × ${day.reps}回 × ${day.sets}セット（${day.percent}%）`,
      );
    }
    lines.push('');
  }
  lines.push(`総挙上重量: ${plan.tonnage.toLocaleString('ja-JP')}kg / 総レップ数: ${plan.totalReps}`);
  return lines.join('\n');
}
