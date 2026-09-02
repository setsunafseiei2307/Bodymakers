/**
 * 2回目以降の診断。
 *
 * 一度Planを作った人がもう一度診断を開くと、前回の回答が最初から入っている。
 * ただ入っているだけだと、
 *
 *   ・これは前回の自分の答えなのか、初期値なのか
 *   ・保存したら今のPlanはどうなるのか
 *
 * が分からない。ここでは前回のPlanと今回の入力を突き合わせて、
 * 「どこが変わったか」を言葉にするための計算だけを持つ。
 *
 * 保存する形式は変えない。SavedPersonalPlan をそのまま読むだけで、
 * 比較の結果は端末内に保存しない。
 */

import type { PersonalPlanInput, SavedPersonalPlan } from './types';

export interface PlanChange {
  id: string;
  label: string;
  before: string;
  after: string;
}

const GOAL_LABELS: Record<PersonalPlanInput['goal'], string> = {
  muscle: '筋肉を増やす',
  'fat-loss': '体脂肪を落とす',
  recomp: '筋肉を残して絞る',
  strength: '力を強くする',
  health: '健康的な身体',
};

const FOCUS_LABELS: Record<PersonalPlanInput['training']['focus'], string> = {
  hypertrophy: '身体を大きく',
  strength: '重量を伸ばす',
  both: '両方',
  health: '健康・体力',
};

const LOCATION_LABELS: Record<PersonalPlanInput['training']['location'], string> = {
  gym: 'ジム',
  home: '自宅',
  both: '両方',
};

function weightText(value: number | null): string {
  return value == null ? '設定なし' : `${Math.round(value * 10) / 10}kg`;
}

/**
 * 前回と今回で、本人が見て意味の分かる項目だけを比べる。
 *
 * 細かい違いまで全部並べると読む気が失せるので、
 * Planの形が実際に変わる項目に絞っている。
 */
export function comparePlanInputs(
  previous: PersonalPlanInput,
  next: PersonalPlanInput,
): PlanChange[] {
  const changes: PlanChange[] = [];

  if (previous.goal !== next.goal) {
    changes.push({
      id: 'goal',
      label: '目的',
      before: GOAL_LABELS[previous.goal] ?? previous.goal,
      after: GOAL_LABELS[next.goal] ?? next.goal,
    });
  }

  if (previous.body.weightKg !== next.body.weightKg) {
    changes.push({
      id: 'weight',
      label: '体重',
      before: weightText(previous.body.weightKg),
      after: weightText(next.body.weightKg),
    });
  }

  if (previous.targets.weightKg !== next.targets.weightKg) {
    changes.push({
      id: 'targetWeight',
      label: '目標体重',
      before: weightText(previous.targets.weightKg),
      after: weightText(next.targets.weightKg),
    });
  }

  if (previous.training.daysPerWeek !== next.training.daysPerWeek) {
    changes.push({
      id: 'daysPerWeek',
      label: '週の頻度',
      before: `週${previous.training.daysPerWeek}日`,
      after: `週${next.training.daysPerWeek}日`,
    });
  }

  if (previous.training.sessionMinutes !== next.training.sessionMinutes) {
    changes.push({
      id: 'sessionMinutes',
      label: '1回の時間',
      before: `${previous.training.sessionMinutes}分`,
      after: `${next.training.sessionMinutes}分`,
    });
  }

  if (previous.training.focus !== next.training.focus) {
    changes.push({
      id: 'focus',
      label: '重視すること',
      before: FOCUS_LABELS[previous.training.focus] ?? previous.training.focus,
      after: FOCUS_LABELS[next.training.focus] ?? next.training.focus,
    });
  }

  if (previous.training.location !== next.training.location) {
    changes.push({
      id: 'location',
      label: '場所',
      before: LOCATION_LABELS[previous.training.location] ?? previous.training.location,
      after: LOCATION_LABELS[next.training.location] ?? next.training.location,
    });
  }

  return changes;
}

/** 前回のPlanをいつ保存したか。読めなければ null。 */
export function savedAtLabel(plan: SavedPersonalPlan): string | null {
  const date = new Date(plan.createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 前回のPlanから何日たったか。読めなければ null。 */
export function daysSincePlan(plan: SavedPersonalPlan, now = new Date()): number | null {
  const date = new Date(plan.createdAt);
  if (Number.isNaN(date.getTime())) return null;
  const day = 24 * 60 * 60 * 1000;
  const diff = Math.floor((now.getTime() - date.getTime()) / day);
  return diff < 0 ? null : diff;
}
