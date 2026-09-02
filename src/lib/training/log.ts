/**
 * 実際にやったセットの記録。
 *
 * これまで残っていたのは「その種目をやったか」「セッションを完了したか」だけで、
 * 何kgを何回できたかは残っていなかった。それだと次回の重量を決める根拠が弱い。
 *
 * ここでは、予定（planned）と実績（actual）を分けて持つ。
 * 予定はProgramが出した値、実績は本人がその場で押した値。
 * この2つを分けておかないと、「完了ボタンを押した」と
 * 「予定どおりできた」を区別できない。
 *
 * 保存先は既存の bodymakers:data:v1 の中。新しいキーは作らない。
 */

import { estimateOneRM } from '../onerm';
import type { ActiveProgram, ProgramSession } from '../programLibrary';
import type { LiftId } from '../strength/standards';

/** 残すセッション数。1年ぶんの週3〜4回を目安にした上限。 */
export const TRAINING_SESSION_LIMIT = 200;
/** 1種目あたりのセット数の上限。 */
export const MAX_SETS_PER_EXERCISE = 12;

/** Programの種目IDと、調整の単位になるBIG3の対応。 */
const EXERCISE_TO_LIFT: Readonly<Record<string, LiftId>> = {
  'bench-press': 'bench',
  squat: 'squat',
  deadlift: 'deadlift',
};

export function liftForExercise(exerciseId: string): LiftId | null {
  return EXERCISE_TO_LIFT[exerciseId] ?? null;
}

export interface TrainingSetLog {
  /** 実際に扱った重量。 */
  weightKg: number;
  /** 実際にできた回数。 */
  reps: number;
  /** 本人が「できた」を押したか。押していないセットは実績に数えない。 */
  done: boolean;
}

export interface TrainingExerciseLog {
  exerciseId: string;
  label: string;
  /** Programが出した予定。判定はこれと実績を比べて行う。 */
  plannedWeightKg: number | null;
  plannedSets: number;
  plannedReps: number;
  sets: TrainingSetLog[];
}

export interface TrainingSessionLog {
  /** セッションを一意に指す。同じ日に同じセッションを二度残さない。 */
  id: string;
  date: string;
  savedAt: string;
  programId: string;
  week: number;
  day: number;
  /** Adaptiveの二重反映を防ぐキー。adaptive側と同じ形。 */
  sessionKey: string;
  exercises: TrainingExerciseLog[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 重量の正気チェック。NaN・Infinity・負の値・極端な値を通さない。 */
function safeWeight(value: unknown): number | null {
  if (!finite(value)) return null;
  if (value <= 0 || value > 1000) return null;
  return Math.round(value * 2) / 2;
}

/** 回数の正気チェック。 */
function safeReps(value: unknown): number | null {
  if (!finite(value)) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100) return null;
  return value;
}

function safeCount(value: unknown, max: number): number {
  if (!finite(value) || !Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, max);
}

function normalizeSet(value: unknown): TrainingSetLog | null {
  if (!isRecord(value)) return null;
  const weightKg = safeWeight(value.weightKg);
  const reps = safeReps(value.reps);
  if (weightKg == null || reps == null) return null;
  return { weightKg, reps, done: value.done === true };
}

function normalizeExerciseLog(value: unknown): TrainingExerciseLog | null {
  if (!isRecord(value) || typeof value.exerciseId !== 'string' || value.exerciseId === '') return null;
  const sets = Array.isArray(value.sets)
    ? value.sets.map(normalizeSet).filter((set): set is TrainingSetLog => set != null).slice(0, MAX_SETS_PER_EXERCISE)
    : [];
  return {
    exerciseId: value.exerciseId,
    label: typeof value.label === 'string' && value.label !== '' ? value.label : value.exerciseId,
    plannedWeightKg: safeWeight(value.plannedWeightKg),
    plannedSets: safeCount(value.plannedSets, MAX_SETS_PER_EXERCISE),
    plannedReps: safeCount(value.plannedReps, 100),
    sets,
  };
}

export function normalizeTrainingSession(value: unknown): TrainingSessionLog | null {
  if (!isRecord(value)) return null;
  if (typeof value.date !== 'string' || typeof value.sessionKey !== 'string') return null;
  const exercises = Array.isArray(value.exercises)
    ? value.exercises.map(normalizeExerciseLog).filter((item): item is TrainingExerciseLog => item != null)
    : [];
  // 中身の無いセッションは残さない。
  if (exercises.length === 0) return null;
  const week = finite(value.week) ? Math.max(1, Math.floor(value.week)) : 1;
  const day = finite(value.day) ? Math.max(1, Math.floor(value.day)) : 1;
  return {
    id: typeof value.id === 'string' && value.id !== '' ? value.id : `${value.sessionKey}:${value.date}`,
    date: value.date,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
    programId: typeof value.programId === 'string' ? value.programId : '',
    week,
    day,
    sessionKey: value.sessionKey,
    exercises,
  };
}

/** 保存されていたセッション一覧を読み戻す。古い順に並べ、上限で打ち切る。 */
export function normalizeTrainingSessions(value: unknown): TrainingSessionLog[] {
  if (!Array.isArray(value)) return [];
  const sessions = value
    .map(normalizeTrainingSession)
    .filter((session): session is TrainingSessionLog => session != null);
  // 同じセッションが二重に入っていたら、後から来たものを残す。
  const byId = new Map<string, TrainingSessionLog>();
  for (const session of sessions) byId.set(session.id, session);
  return [...byId.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(-TRAINING_SESSION_LIMIT);
}

/**
 * Programのセッションから、記録用の初期値を作る。
 * 予定値をそのまま入れておき、違ったときだけ本人が直す。
 */
export function draftSessionFromProgram(
  active: ActiveProgram,
  session: ProgramSession,
  date: string,
): TrainingSessionLog {
  const sessionKey = `${active.programId}:w${active.currentWeek}d${active.currentDay}`;
  return {
    id: `${sessionKey}:${date}`,
    date,
    savedAt: '',
    programId: active.programId,
    week: active.currentWeek,
    day: active.currentDay,
    sessionKey,
    exercises: session.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      label: exercise.label,
      plannedWeightKg: exercise.weightKg,
      plannedSets: exercise.sets,
      plannedReps: exercise.reps,
      sets: Array.from({ length: Math.min(exercise.sets, MAX_SETS_PER_EXERCISE) }, () => ({
        weightKg: exercise.weightKg ?? 0,
        reps: exercise.reps,
        done: false,
      })),
    })),
  };
}

/** 「できた」を押したセットが1つでもあるか。 */
export function hasRecordedSets(session: TrainingSessionLog | null): boolean {
  if (session == null) return false;
  return session.exercises.some((exercise) => exercise.sets.some((set) => set.done));
}

/** 記録として保存する価値があるか。重量の無い補助種目だけの記録も残す。 */
export function isWorthSaving(session: TrainingSessionLog): boolean {
  return hasRecordedSets(session);
}

export interface ExercisePerformance {
  exerciseId: string;
  lift: LiftId | null;
  label: string;
  plannedWeightKg: number | null;
  plannedTotalReps: number;
  /** 予定重量以上でこなせた回数の合計。 */
  completedReps: number;
  /** 完了したセット数。 */
  completedSets: number;
  /** 予定に対する達成率。予定が無ければ null。 */
  ratio: number | null;
  /** その日いちばん重かった、完了済みセット。 */
  topSet: TrainingSetLog | null;
}

/**
 * 1種目ぶんの実績をまとめる。
 *
 * 達成回数は「予定の重量以上でできた回数」だけを数える。
 * 軽くして回数をこなした日を、予定どおりできた日と同じには扱わない。
 */
export function summarizeExerciseLog(exercise: TrainingExerciseLog): ExercisePerformance {
  const doneSets = exercise.sets.filter((set) => set.done);
  const planned = exercise.plannedWeightKg;
  const atOrAbovePlan = planned == null ? doneSets : doneSets.filter((set) => set.weightKg >= planned);
  const completedReps = atOrAbovePlan.reduce((total, set) => total + set.reps, 0);
  const plannedTotalReps = exercise.plannedSets * exercise.plannedReps;
  const topSet = doneSets.reduce<TrainingSetLog | null>(
    (best, set) => (best == null || set.weightKg > best.weightKg ? set : best),
    null,
  );
  return {
    exerciseId: exercise.exerciseId,
    lift: liftForExercise(exercise.exerciseId),
    label: exercise.label,
    plannedWeightKg: planned,
    plannedTotalReps,
    completedReps,
    completedSets: atOrAbovePlan.length,
    ratio: plannedTotalReps > 0 ? completedReps / plannedTotalReps : null,
    topSet,
  };
}

export function summarizeSession(session: TrainingSessionLog): ExercisePerformance[] {
  return session.exercises.map(summarizeExerciseLog);
}

/** その種目の直近のセッション。新しい順。 */
export function sessionsForLift(
  sessions: readonly TrainingSessionLog[],
  lift: LiftId,
  limit = 10,
): { session: TrainingSessionLog; performance: ExercisePerformance }[] {
  const found: { session: TrainingSessionLog; performance: ExercisePerformance }[] = [];
  for (const session of [...sessions].reverse()) {
    for (const exercise of session.exercises) {
      if (liftForExercise(exercise.exerciseId) !== lift) continue;
      const performance = summarizeExerciseLog(exercise);
      if (performance.topSet == null) continue;
      found.push({ session, performance });
      break;
    }
    if (found.length >= limit) break;
  }
  return found;
}

export interface StrengthPoint {
  date: string;
  /** その日のいちばん重い完了セット。 */
  weightKg: number;
  reps: number;
  /** 既存の1RM計算をそのまま使った推定値。出せなければ null。 */
  estimatedOneRmKg: number | null;
}

/**
 * BIG3の伸びを時系列で出す。
 * 推定1RMは既存の estimateOneRM をそのまま使う。新しい式は作らない。
 */
export function strengthTrend(
  sessions: readonly TrainingSessionLog[],
  lift: LiftId,
  limit = 10,
): StrengthPoint[] {
  const points: StrengthPoint[] = [];
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (liftForExercise(exercise.exerciseId) !== lift) continue;
      const { topSet } = summarizeExerciseLog(exercise);
      if (topSet == null) continue;
      const estimate = estimateOneRM(topSet.weightKg, topSet.reps);
      points.push({
        date: session.date,
        weightKg: topSet.weightKg,
        reps: topSet.reps,
        estimatedOneRmKg: estimate == null ? null : Math.round(estimate.average * 10) / 10,
      });
      break;
    }
  }
  return points.slice(-limit);
}

export interface LiftBest {
  lift: LiftId;
  /** 完了セットの中でいちばん重かったもの。 */
  bestWeightKg: number;
  bestWeightReps: number;
  bestWeightDate: string;
  /** 推定1RMがいちばん高かったセット。出せなければ null。 */
  bestEstimatedOneRmKg: number | null;
  bestEstimatedDate: string | null;
}

/**
 * その種目のこれまでの最高。
 *
 * 出すのは「実際に完了したセット」から確実に言えるものだけ。
 * 回数のPRのように、重量が違うと比べられないものは入れない。
 */
export function bestForLift(sessions: readonly TrainingSessionLog[], lift: LiftId): LiftBest | null {
  let best: LiftBest | null = null;
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (liftForExercise(exercise.exerciseId) !== lift) continue;
      for (const set of exercise.sets) {
        if (!set.done) continue;
        const estimate = estimateOneRM(set.weightKg, set.reps);
        const estimated = estimate == null ? null : Math.round(estimate.average * 10) / 10;
        if (best == null) {
          best = {
            lift,
            bestWeightKg: set.weightKg,
            bestWeightReps: set.reps,
            bestWeightDate: session.date,
            bestEstimatedOneRmKg: estimated,
            bestEstimatedDate: estimated == null ? null : session.date,
          };
          continue;
        }
        if (set.weightKg > best.bestWeightKg) {
          best.bestWeightKg = set.weightKg;
          best.bestWeightReps = set.reps;
          best.bestWeightDate = session.date;
        }
        if (estimated != null && (best.bestEstimatedOneRmKg == null || estimated > best.bestEstimatedOneRmKg)) {
          best.bestEstimatedOneRmKg = estimated;
          best.bestEstimatedDate = session.date;
        }
      }
    }
  }
  return best;
}

/** そのセッションの記録が保存済みかどうか。 */
export function findSessionLog(
  sessions: readonly TrainingSessionLog[],
  sessionKey: string,
): TrainingSessionLog | null {
  return [...sessions].reverse().find((session) => session.sessionKey === sessionKey) ?? null;
}

/** 直近のセッション。新しい順。 */
export function recentSessions(sessions: readonly TrainingSessionLog[], limit = 5): TrainingSessionLog[] {
  return [...sessions].reverse().slice(0, Math.max(0, limit));
}
