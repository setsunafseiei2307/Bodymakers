/**
 * 実際にやったトレーニングを、次回の提示重量へ返す仕組み。
 *
 * 【いま端末内にあるもので何ができるか】
 * 1セットずつの重量や回数は保存していない。残っているのは
 *   ・その日にどの種目をやったか（DailyLog.doneExercises）
 *   ・実行中Programのセッションを「完了」したか「スキップ」したか
 * の2つだけ。だから v1 のルールは、この2つだけで説明できる形にする。
 * 保存していない値を推測して重量を動かさない。
 *
 * 【Program自身の週次progressionと二重に足さないための考え方】
 * 提示重量の基準は、あくまでProgramが持っている週ごとの計算とする。
 * ここで持つのは、その上に載せる「ズレ（offsetKg）」だけ。
 * Programの重量は一切書き換えない。だから週が進んで負荷が上がっても、
 * その分がもう一度加算されることはない。
 *
 * 同じセッション（同じ週・同じ日）で二度調整しないよう、
 * 最後に反映したセッションを覚えておく。
 */

import type { LiftId } from '../strength/standards';
import type { ActiveProgram, ProgramSession } from '../programLibrary';

/** バーベルの実用的な刻み。上半身は小さく、下半身は大きく動かす。 */
export const LIFT_STEP_KG: Readonly<Record<LiftId, number>> = {
  bench: 2.5,
  squat: 5,
  deadlift: 5,
};

/** 積み上がりすぎ・下がりすぎを防ぐ範囲。 */
export const MAX_OFFSET_KG = 40;
export const MIN_OFFSET_KG = -40;

/** 何回続けて未達なら重量を下げるか。 */
export const DELOAD_AFTER_MISSES = 2;

/** 履歴として残す件数。 */
export const ADJUSTMENT_HISTORY_LIMIT = 20;

/** Programの種目IDから、調整の単位になるBIG3への対応。 */
const EXERCISE_TO_LIFT: Readonly<Record<string, LiftId>> = {
  'bench-press': 'bench',
  squat: 'squat',
  deadlift: 'deadlift',
};

export const LIFT_IDS: readonly LiftId[] = ['bench', 'squat', 'deadlift'];

export const LIFT_LABELS: Readonly<Record<LiftId, string>> = {
  bench: 'ベンチプレス',
  squat: 'スクワット',
  deadlift: 'デッドリフト',
};

/** セッションをやり切ったか。保存しているのはこの2つだけ。 */
export type SessionOutcome = 'completed' | 'missed';

/** なぜその重量になったか。 */
export type AdjustmentReasonId = 'start' | 'increase' | 'hold' | 'deload';

export interface LiftAdjustment {
  /** Programが出した重量に足すズレ。 */
  offsetKg: number;
  /** 続けて未達だった回数。 */
  consecutiveMisses: number;
  reason: AdjustmentReasonId;
  /** 直前の調整でどれだけ動かしたか。 */
  lastDeltaKg: number;
  updatedAt: string;
  /** 最後に反映したセッション。同じセッションで二度足さないための印。 */
  lastSessionKey: string;
}

export interface AdjustmentEvent {
  id: string;
  date: string;
  lift: LiftId;
  reason: AdjustmentReasonId;
  deltaKg: number;
  offsetKg: number;
  sessionKey: string;
}

export interface TrainingAdjustments {
  version: 1;
  lifts: Partial<Record<LiftId, LiftAdjustment>>;
  history: AdjustmentEvent[];
}

export function emptyTrainingAdjustments(): TrainingAdjustments {
  return { version: 1, lifts: {}, history: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampOffset(value: number): number {
  const clamped = Math.max(MIN_OFFSET_KG, Math.min(MAX_OFFSET_KG, value));
  // 0.5kg単位より細かいズレは扱わない。
  return Math.round(clamped * 2) / 2;
}

function isReason(value: unknown): value is AdjustmentReasonId {
  return value === 'start' || value === 'increase' || value === 'hold' || value === 'deload';
}

function normalizeLiftAdjustment(value: unknown): LiftAdjustment | null {
  if (!isRecord(value)) return null;
  if (!finite(value.offsetKg)) return null;
  const misses = finite(value.consecutiveMisses) ? Math.max(0, Math.floor(value.consecutiveMisses)) : 0;
  return {
    offsetKg: clampOffset(value.offsetKg),
    consecutiveMisses: Math.min(misses, 99),
    reason: isReason(value.reason) ? value.reason : 'start',
    lastDeltaKg: finite(value.lastDeltaKg) ? clampOffset(value.lastDeltaKg) : 0,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    lastSessionKey: typeof value.lastSessionKey === 'string' ? value.lastSessionKey : '',
  };
}

function normalizeEvent(value: unknown): AdjustmentEvent | null {
  if (!isRecord(value)) return null;
  const lift = value.lift;
  if (typeof lift !== 'string' || !LIFT_IDS.includes(lift as LiftId)) return null;
  if (!finite(value.deltaKg) || !finite(value.offsetKg)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : `${String(lift)}-${String(value.date ?? '')}`,
    date: typeof value.date === 'string' ? value.date : '',
    lift: lift as LiftId,
    reason: isReason(value.reason) ? value.reason : 'start',
    deltaKg: clampOffset(value.deltaKg),
    offsetKg: clampOffset(value.offsetKg),
    sessionKey: typeof value.sessionKey === 'string' ? value.sessionKey : '',
  };
}

/**
 * 保存されていた調整を読み戻す。
 * 旧データにはこの項目が無いので、その場合は空の状態から始める。
 */
export function normalizeTrainingAdjustments(value: unknown): TrainingAdjustments {
  if (!isRecord(value) || value.version !== 1) return emptyTrainingAdjustments();
  const lifts: Partial<Record<LiftId, LiftAdjustment>> = {};
  const rawLifts = isRecord(value.lifts) ? value.lifts : {};
  for (const lift of LIFT_IDS) {
    const normalized = normalizeLiftAdjustment(rawLifts[lift]);
    if (normalized != null) lifts[lift] = normalized;
  }
  const history = Array.isArray(value.history)
    ? value.history
        .map(normalizeEvent)
        .filter((event): event is AdjustmentEvent => event != null)
        .slice(-ADJUSTMENT_HISTORY_LIMIT)
    : [];
  return { version: 1, lifts, history };
}

/** そのセッションを指す文字列。週と日が変われば別のセッションになる。 */
export function sessionKeyFor(active: ActiveProgram): string {
  return `${active.programId}:w${active.currentWeek}d${active.currentDay}`;
}

/** そのセッションで重量を扱うBIG3。補助種目は調整の対象にしない。 */
export function liftsInSession(session: ProgramSession | null): LiftId[] {
  if (session == null) return [];
  const lifts: LiftId[] = [];
  for (const exercise of session.exercises) {
    const lift = EXERCISE_TO_LIFT[exercise.exerciseId];
    // 重量が決まっている種目だけを見る。フォーム重視の補助種目は動かさない。
    if (lift != null && exercise.weightKg != null && !lifts.includes(lift)) lifts.push(lift);
  }
  return lifts;
}

function startingAdjustment(): LiftAdjustment {
  return { offsetKg: 0, consecutiveMisses: 0, reason: 'start', lastDeltaKg: 0, updatedAt: '', lastSessionKey: '' };
}

export interface SessionResult {
  sessionKey: string;
  lifts: readonly LiftId[];
  outcome: SessionOutcome;
  /** 記録した日。履歴の並びに使う。 */
  date: string;
}

/**
 * セッションの結果を、次回の重量へ反映する。
 *
 * 完了 → 次回は1段階上げる候補にする
 * 未達 → 据え置き。続けて2回未達なら1段階下げる
 *
 * 同じセッションを二度渡しても、二度は動かさない。
 */
export function applySessionOutcome(
  adjustments: TrainingAdjustments,
  result: SessionResult,
  now = new Date(),
): TrainingAdjustments {
  if (result.lifts.length === 0) return adjustments;

  const lifts = { ...adjustments.lifts };
  const events: AdjustmentEvent[] = [];
  const updatedAt = now.toISOString();

  for (const lift of result.lifts) {
    const current = lifts[lift] ?? startingAdjustment();
    // このセッションはもう反映済み。重ねて足さない。
    if (current.lastSessionKey === result.sessionKey) continue;

    const step = LIFT_STEP_KG[lift];
    let offsetKg = current.offsetKg;
    let consecutiveMisses = current.consecutiveMisses;
    let reason: AdjustmentReasonId;
    let deltaKg = 0;

    if (result.outcome === 'completed') {
      deltaKg = step;
      offsetKg = clampOffset(offsetKg + step);
      consecutiveMisses = 0;
      reason = 'increase';
      // 上限に当たっていれば、実際には動いていない。
      if (offsetKg === current.offsetKg) {
        deltaKg = 0;
        reason = 'hold';
      }
    } else {
      consecutiveMisses = current.consecutiveMisses + 1;
      if (consecutiveMisses >= DELOAD_AFTER_MISSES) {
        deltaKg = -step;
        offsetKg = clampOffset(offsetKg - step);
        consecutiveMisses = 0;
        reason = 'deload';
        if (offsetKg === current.offsetKg) {
          deltaKg = 0;
          reason = 'hold';
        }
      } else {
        reason = 'hold';
      }
    }

    lifts[lift] = { offsetKg, consecutiveMisses, reason, lastDeltaKg: deltaKg, updatedAt, lastSessionKey: result.sessionKey };
    events.push({
      id: `${result.sessionKey}:${lift}`,
      date: result.date,
      lift,
      reason,
      deltaKg,
      offsetKg,
      sessionKey: result.sessionKey,
    });
  }

  if (events.length === 0) return adjustments;

  return {
    version: 1,
    lifts,
    history: [...adjustments.history, ...events].slice(-ADJUSTMENT_HISTORY_LIMIT),
  };
}

/** その種目のいまのズレ。調整がなければ0。 */
export function offsetFor(adjustments: TrainingAdjustments, lift: LiftId): number {
  return adjustments.lifts[lift]?.offsetKg ?? 0;
}

/**
 * Programが出した重量に、いまのズレを足す。
 * Programの重量そのものは書き換えない。
 */
export function adjustedWeightKg(
  baseKg: number,
  lift: LiftId,
  adjustments: TrainingAdjustments,
): number {
  const next = baseKg + offsetFor(adjustments, lift);
  // マイナスや軽すぎる重量は出さない。
  return Math.max(20, Math.round(next * 2) / 2);
}

/**
 * セッションの提示重量を、いまのズレを反映した形にする。
 * 元のセッションは変更せず、新しい値を返す。
 */
export function adjustSession(
  session: ProgramSession,
  adjustments: TrainingAdjustments,
): ProgramSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      const lift = EXERCISE_TO_LIFT[exercise.exerciseId];
      if (lift == null || exercise.weightKg == null) return exercise;
      const offset = offsetFor(adjustments, lift);
      if (offset === 0) return exercise;
      return { ...exercise, weightKg: adjustedWeightKg(exercise.weightKg, lift, adjustments) };
    }),
  };
}

/**
 * なぜその重量になったかの一言。
 * できなかったことを責める言い方はしない。
 */
export function adjustmentReasonText(lift: LiftId, adjustment: LiftAdjustment | undefined): string | null {
  if (adjustment == null || adjustment.reason === 'start') return null;
  const label = LIFT_LABELS[lift];
  const step = Math.abs(adjustment.lastDeltaKg);
  switch (adjustment.reason) {
    case 'increase':
      return `${label}は前回のセッションを完了したので、次回は+${step}kgです。`;
    case 'deload':
      return `${label}は同じ重量が続いたので、次回は−${step}kgで組み直します。`;
    case 'hold':
      return `${label}は次回も同じ重量でもう一度です。`;
    default:
      return null;
  }
}

/** いま効いている調整をまとめて文にする。多くなりすぎないよう3件まで。 */
export function adjustmentSummaryLines(adjustments: TrainingAdjustments): string[] {
  const lines: string[] = [];
  for (const lift of LIFT_IDS) {
    const text = adjustmentReasonText(lift, adjustments.lifts[lift]);
    if (text != null) lines.push(text);
  }
  return lines.slice(0, 3);
}

/** 直近の調整履歴。新しい順。 */
export function recentAdjustments(adjustments: TrainingAdjustments, limit = 5): AdjustmentEvent[] {
  return [...adjustments.history].reverse().slice(0, Math.max(0, limit));
}
