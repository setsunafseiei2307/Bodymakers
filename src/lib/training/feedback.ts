/**
 * トレーニングを終えた直後に返す言葉と、次回の予定。
 *
 * 終わった瞬間にユーザーが知りたいのは3つだけ。
 *   1. 今日どうだったか
 *   2. Bodymakersが何を判断したか
 *   3. 次に何をすればいいか
 *
 * 分析画面は作らない。振り返りはRecordの役目で、ここは「次へ渡す」ためのもの。
 *
 * 判定そのものは adaptive.ts が持っている。ここでは判定結果を読んで
 * 文にするだけで、重量を決め直したりはしない。
 */

import { fmt } from '../format';
import { adjustSession, evaluationReasonText, offsetFor, type LiftEvaluation, type TrainingAdjustments } from './adaptive';
import { sessionForActiveProgram, type ActiveProgram } from '../programLibrary';
import { liftForExercise, summarizeSession, type TrainingSessionLog } from './log';
import type { LiftId } from '../strength/standards';

export interface NextSessionExercise {
  exerciseId: string;
  label: string;
  /** 次回の提示重量。Program重量に調整を足したもの。 */
  weightKg: number | null;
  sets: number;
  reps: number;
  /** 前回から動いた量。0なら据え置き。 */
  deltaKg: number;
}

export interface NextSessionPreview {
  label: string;
  focus: string;
  week: number;
  day: number;
  /** 主な種目。多すぎると読まれないので3件まで。 */
  exercises: NextSessionExercise[];
  /** 表示しきれなかった種目の数。 */
  more: number;
}

/**
 * 次回のセッション。
 *
 * 実行中Programから読めるものだけを出す。読めない場合は null を返して、
 * 推測でそれらしい予定を作らない。
 *
 * ここで使う重量は Today が出すものとまったく同じ経路
 * （sessionForActiveProgram → adjustSession）なので、
 * preview と実際の提示がずれることはない。
 */
export function buildNextSessionPreview(
  active: ActiveProgram | null,
  adjustments: TrainingAdjustments,
  /** 直前のセッションで動いた量を種目ごとに引き当てるための情報。 */
  deltaByLift: Partial<Record<LiftId, number>> = {},
): NextSessionPreview | null {
  if (active == null) return null;
  const base = sessionForActiveProgram(active);
  if (base == null) return null;
  const session = adjustSession(base, adjustments);

  const exercises = session.exercises.slice(0, 3).map((exercise) => {
    const lift = liftForExercise(exercise.exerciseId);
    return {
      exerciseId: exercise.exerciseId,
      label: exercise.label,
      weightKg: exercise.weightKg,
      sets: exercise.sets,
      reps: exercise.reps,
      deltaKg: lift == null ? 0 : deltaByLift[lift] ?? 0,
    };
  });

  return {
    label: session.label,
    focus: session.focus,
    week: session.week,
    day: session.day,
    exercises,
    more: Math.max(0, session.exercises.length - exercises.length),
  };
}

export interface FeedbackExercise {
  exerciseId: string;
  label: string;
  lift: LiftId | null;
  completedSets: number;
  plannedSets: number;
  completedReps: number;
  plannedTotalReps: number;
  /** その種目の次回重量。読めなければ null。 */
  nextWeightKg: number | null;
  /** 次回に向けて動いた量。 */
  deltaKg: number;
  /** なぜそうなったか。1文。 */
  reason: string | null;
}

export interface SessionFeedback {
  /** 完了したセットの合計。 */
  totalCompletedSets: number;
  /** 記録した種目。 */
  exercises: FeedbackExercise[];
  /** 上に出す一言。 */
  headline: string;
  /** 実績から判断したか、完了ボタンだけで判断したか。 */
  source: 'sets' | 'session';
  /** スキップした場合。 */
  skipped: boolean;
  programCompleted: boolean;
  next: NextSessionPreview | null;
}

/**
 * 下げたときの言い方。
 *
 * できなかったことを責めない。重量を下げるのは失敗の結果ではなく、
 * 回数とフォームを揃えるための調整だと伝える。
 */
function deloadText(label: string, step: number): string {
  return `${label}は次回、フォームと回数を整えやすい重量（−${fmt(step, 1)}kg）にします。`;
}

function headlineFor(source: 'sets' | 'session', skipped: boolean, completedSets: number, programCompleted: boolean): string {
  if (programCompleted) return 'プログラムを最後までやり切りました。';
  if (skipped) return 'このDayはスキップしました。次回から続けられます。';
  if (source === 'sets' && completedSets > 0) return `今日のトレーニング完了。${completedSets}セット記録しました。`;
  return '今日のトレーニングを完了しました。';
}

/**
 * 終了直後のまとめ。
 *
 * 数字は「今日やったこと」と「次回どうなるか」に絞る。
 * 判定理由は adaptive の説明をそのまま使うので、
 * Todayに出る重量と食い違うことがない。
 */
export function buildSessionFeedback(input: {
  log: TrainingSessionLog | null;
  evaluations: readonly LiftEvaluation[];
  /** 判定を反映したあとの調整。 */
  adjustments: TrainingAdjustments;
  /** いま終えたセッションのキー。履歴から動いた量を引くのに使う。 */
  sessionKey: string;
  source: 'sets' | 'session';
  skipped: boolean;
  programCompleted: boolean;
  /** 進んだあとの実行中Program。次回の予定に使う。 */
  nextActiveProgram: ActiveProgram | null;
}): SessionFeedback {
  // 今回のセッションで動いた量を、種目ごとに引き当てる。
  const deltaByLift: Partial<Record<LiftId, number>> = {};
  for (const event of input.adjustments.history) {
    if (event.sessionKey === input.sessionKey) deltaByLift[event.lift] = event.deltaKg;
  }

  const next = buildNextSessionPreview(input.nextActiveProgram, input.adjustments, deltaByLift);
  const nextWeightByExercise = new Map<string, number | null>();
  for (const exercise of next?.exercises ?? []) nextWeightByExercise.set(exercise.exerciseId, exercise.weightKg);

  const performances = input.log == null ? [] : summarizeSession(input.log);
  const evaluationByLift = new Map<LiftId, LiftEvaluation>();
  for (const evaluation of input.evaluations) evaluationByLift.set(evaluation.lift, evaluation);

  const exercises: FeedbackExercise[] = performances
    .filter((performance) => performance.completedSets > 0 || performance.topSet != null)
    .map((performance) => {
      const lift = performance.lift;
      const evaluation = lift == null ? undefined : evaluationByLift.get(lift);
      const deltaKg = lift == null ? 0 : deltaByLift[lift] ?? 0;
      let reason: string | null = null;
      if (evaluation != null) {
        reason = deltaKg < 0 && lift != null
          ? deloadText(performance.label, Math.abs(deltaKg))
          : evaluationReasonText(evaluation, deltaKg);
      }
      return {
        exerciseId: performance.exerciseId,
        label: performance.label,
        lift,
        completedSets: performance.completedSets,
        plannedSets: input.log?.exercises.find((item) => item.exerciseId === performance.exerciseId)?.plannedSets ?? 0,
        completedReps: performance.completedReps,
        plannedTotalReps: performance.plannedTotalReps,
        nextWeightKg: nextWeightByExercise.get(performance.exerciseId)
          ?? (lift == null || performance.plannedWeightKg == null
            ? null
            : performance.plannedWeightKg + offsetFor(input.adjustments, lift)),
        deltaKg,
        reason,
      };
    });

  const totalCompletedSets = performances.reduce(
    (total, performance) => total + performance.completedSets,
    0,
  );

  return {
    totalCompletedSets,
    exercises,
    headline: headlineFor(input.source, input.skipped, totalCompletedSets, input.programCompleted),
    source: input.source,
    skipped: input.skipped,
    programCompleted: input.programCompleted,
    next,
  };
}
