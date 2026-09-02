/**
 * 今週を2〜3文で言う。
 *
 * 全部は説明しない。順番は
 *   1. 進んだこと
 *   2. いまの状態
 *   3. 次にすること
 * とし、言えることが無ければその文は出さない。
 *
 * 文はすべて記録から機械的に組み立てる。外部APIには送らない。
 * できなかったことを責める言い方はしない。
 */

import { fmt } from '../format';
import type { CoachNutritionSummary, CoachState, CoachTrainingSummary } from './types';

/** 出す文の上限。読み切れる量に保つ。 */
export const MAX_NARRATIVE_LINES = 3;

function trainingLine(training: CoachTrainingSummary): string | null {
  if (training.sessions === 0) return null;
  if (training.changes.length === 0) return `今週は${training.sessions}回トレーニングしました。`;

  const names = training.changes
    .filter((change) => change.deltaKg > 0)
    .map((change) => change.label);
  if (names.length === 0) {
    return `今週は${training.sessions}回トレーニングし、次回の重量を整え直しました。`;
  }
  return `今週は${training.sessions}回トレーニングでき、${names.join('と')}の次回重量が上がりました。`;
}

function nutritionLine(nutrition: CoachNutritionSummary): string | null {
  if (nutrition.completedDays === 0) return null;
  const parts = [`食事の記録は${nutrition.completedDays}日ありました`];
  if (nutrition.weightChangeKg != null && nutrition.weightFromKg != null && nutrition.weightToKg != null) {
    const change = nutrition.weightChangeKg;
    const moved = Math.abs(change) >= 0.05;
    parts.push(moved
      ? `体重の7日平均は${fmt(nutrition.weightFromKg, 1)} → ${fmt(nutrition.weightToKg, 1)}kgです`
      : '体重の7日平均はほぼ同じです');
  }
  return `${parts.join('。')}。`;
}

function closingLine(state: CoachState, nutrition: CoachNutritionSummary): string | null {
  switch (state) {
    case 'collecting-data':
      return 'あと数日ぶん記録がそろうと、Bodymakersが今週の傾向をまとめます。';
    case 'consistency-first':
      return '今週は目標を変えず、記録を続けましょう。';
    case 'nutrition-review':
      return `食事の目安を${nutrition.candidateKcal > 0 ? '+' : '−'}${Math.abs(nutrition.candidateKcal)}kcal試す候補があります。今のまま続けることもできます。`;
    case 'plan-review':
      return 'これ以上の自動調整は行いません。Planの見直しから進めてください。';
    case 'training-progressing':
    case 'on-track':
    default:
      return '次の1週間も、今のPlanで進めます。';
  }
}

export function buildNarrative(input: {
  state: CoachState;
  training: CoachTrainingSummary;
  nutrition: CoachNutritionSummary;
  activeDays: number;
}): string[] {
  const lines: string[] = [];

  const training = trainingLine(input.training);
  if (training != null) lines.push(training);

  const nutrition = nutritionLine(input.nutrition);
  if (nutrition != null) lines.push(nutrition);

  // 何も言えることが無い週は、いま何が起きているかだけ伝える。
  if (lines.length === 0) {
    lines.push(input.activeDays === 0
      ? '今週はまだ記録がありません。1つ記録するところから始められます。'
      : `今週は${input.activeDays}日ぶん記録がありました。`);
  }

  const closing = closingLine(input.state, input.nutrition);
  if (closing != null && lines.length < MAX_NARRATIVE_LINES) lines.push(closing);

  return lines.slice(0, MAX_NARRATIVE_LINES);
}
