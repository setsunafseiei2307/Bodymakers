/**
 * 今週のトレーニングの振り返り。
 *
 * 活動日の数え方は src/lib/activity/ が持っているものをそのまま使う。
 * ここで数え直さない。
 *
 * 出すのは記録から言えることだけ。できなかったことを責める言い方はしない。
 */

import { recentDateKeys, dateKey } from '../activity/days';
import { fmt } from '../format';
import type { BodymakersData } from '../storage';
import { LIFT_IDS, LIFT_LABELS, adjustmentReasonText } from './adaptive';
import { sessionsForLift, strengthTrend } from './log';

export interface TrainingReviewLine {
  id: string;
  text: string;
}

export interface WeeklyTrainingReview {
  /** 直近7日に記録したセッション数。 */
  sessions: number;
  /** Programの進行位置。実行中でなければ null。 */
  programPosition: string | null;
  lines: TrainingReviewLine[];
  hasData: boolean;
}

/**
 * 直近7日のトレーニングをまとめる。
 * 行が多くなりすぎないよう4件まで。
 */
export function buildWeeklyTrainingReview(data: BodymakersData, now = new Date()): WeeklyTrainingReview {
  const window = new Set(recentDateKeys(dateKey(now), 7));
  const sessions = data.trainingSessions.filter((session) => window.has(session.date));
  const program = data.activeProgram;
  const programPosition = program == null ? null : `Week ${program.currentWeek} / Day ${program.currentDay}`;

  const lines: TrainingReviewLine[] = [];

  if (sessions.length === 0) {
    lines.push({
      id: 'none',
      text: program == null
        ? 'まだ今週のトレーニング記録がありません。Programを選ぶと、今日のメニューが決まります。'
        : '今週はまだ記録がありません。1セットからで大丈夫です。',
    });
    return { sessions: 0, programPosition, lines, hasData: false };
  }

  lines.push({ id: 'sessions', text: `今週は${sessions.length}回トレーニングしました。` });

  // 種目ごとに、次回どうなるかを短く伝える。
  for (const lift of LIFT_IDS) {
    if (lines.length >= 4) break;
    const recent = sessionsForLift(sessions, lift, 5);
    if (recent.length === 0) continue;
    const reason = adjustmentReasonText(lift, data.trainingAdjustments.lifts[lift]);
    if (reason != null) {
      lines.push({ id: `lift-${lift}`, text: reason });
      continue;
    }
    const top = recent[0]!.performance.topSet;
    if (top != null) {
      lines.push({
        id: `lift-${lift}`,
        text: `${LIFT_LABELS[lift]}は${fmt(top.weightKg, 1)}kg × ${top.reps}回まで記録しています。`,
      });
    }
  }

  return { sessions: sessions.length, programPosition, lines: lines.slice(0, 4), hasData: true };
}

export interface LiftProgressSummary {
  lift: string;
  label: string;
  /** 直近の完了セット。 */
  latestWeightKg: number | null;
  latestReps: number | null;
  latestDate: string | null;
  /** 推定1RMの直近値と、その前との差。 */
  estimatedOneRmKg: number | null;
  estimatedDeltaKg: number | null;
  /** 次回の重量が変わる理由。 */
  reason: string | null;
}

/**
 * BIG3それぞれの「前回どうで、次はどうなるか」。
 * 推定1RMは既存の計算をそのまま使う。
 */
export function liftProgressSummaries(data: BodymakersData): LiftProgressSummary[] {
  const summaries: LiftProgressSummary[] = [];
  for (const lift of LIFT_IDS) {
    const trend = strengthTrend(data.trainingSessions, lift, 10);
    if (trend.length === 0) continue;
    const latest = trend.at(-1)!;
    const previous = trend.length >= 2 ? trend.at(-2)! : null;
    const delta = latest.estimatedOneRmKg != null && previous?.estimatedOneRmKg != null
      ? Math.round((latest.estimatedOneRmKg - previous.estimatedOneRmKg) * 10) / 10
      : null;
    summaries.push({
      lift,
      label: LIFT_LABELS[lift],
      latestWeightKg: latest.weightKg,
      latestReps: latest.reps,
      latestDate: latest.date,
      estimatedOneRmKg: latest.estimatedOneRmKg,
      estimatedDeltaKg: delta,
      reason: adjustmentReasonText(lift, data.trainingAdjustments.lifts[lift]),
    });
  }
  return summaries;
}
