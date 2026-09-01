/**
 * 筋力診断の端末保存用スナップショット。
 *
 * OpenPowerliftingの基準データそのものは保存せず、その時点でユーザーが入力した値と
 * 診断結果だけを保存する。基準の生成日も持たせ、将来データ更新後に区別できるようにする。
 */

import type { Diagnosis } from './diagnose';
import type { LevelId, LiftId, Sex } from './standards';

export const STRENGTH_HISTORY_LIMIT = 100;

export interface SavedStrengthLift {
  lift: LiftId;
  inputWeightKg: number;
  reps: number;
  oneRmKg: number;
  bodyweightRatio: number;
  percentile: number;
  bound: 'in-range' | 'below' | 'above';
  levelId: LevelId;
  levelLabel: string;
  nextTargetKg: number;
  nextLevel: {
    levelId: LevelId;
    levelLabel: string;
    targetWeightKg: number;
    deltaKg: number;
  } | null;
}

export interface SavedStrengthDiagnosis {
  id: string;
  savedAt: string;
  standardsGeneratedAt: string;
  sex: Sex;
  bodyweightKg: number;
  lifts: SavedStrengthLift[];
}

export interface SavedStrengthProfileLift {
  weightKg: number;
  reps: number;
  oneRmKg: number;
  savedAt: string;
}

export interface SavedStrengthProfile {
  sex: Sex;
  bodyweightKg: number;
  lifts: Partial<Record<LiftId, SavedStrengthProfileLift>>;
}

const LIFT_IDS: readonly LiftId[] = ['squat', 'bench', 'deadlift'];
const LEVEL_IDS: readonly LevelId[] = ['beginner', 'novice', 'intermediate', 'advanced', 'elite'];
const BOUNDS = ['in-range', 'below', 'above'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeLift(value: unknown): SavedStrengthLift | null {
  if (!isRecord(value)) return null;
  if (!LIFT_IDS.includes(value.lift as LiftId)) return null;
  if (!LEVEL_IDS.includes(value.levelId as LevelId)) return null;
  if (!BOUNDS.includes(value.bound as (typeof BOUNDS)[number])) return null;
  const numbers = [
    value.inputWeightKg,
    value.reps,
    value.oneRmKg,
    value.bodyweightRatio,
    value.percentile,
    value.nextTargetKg,
  ];
  if (!numbers.every(finite) || typeof value.levelLabel !== 'string') return null;

  let nextLevel: SavedStrengthLift['nextLevel'] = null;
  if (isRecord(value.nextLevel)) {
    if (
      LEVEL_IDS.includes(value.nextLevel.levelId as LevelId) &&
      typeof value.nextLevel.levelLabel === 'string' &&
      finite(value.nextLevel.targetWeightKg) &&
      finite(value.nextLevel.deltaKg)
    ) {
      nextLevel = {
        levelId: value.nextLevel.levelId as LevelId,
        levelLabel: value.nextLevel.levelLabel,
        targetWeightKg: value.nextLevel.targetWeightKg,
        deltaKg: value.nextLevel.deltaKg,
      };
    }
  }

  return {
    lift: value.lift as LiftId,
    inputWeightKg: value.inputWeightKg as number,
    reps: value.reps as number,
    oneRmKg: value.oneRmKg as number,
    bodyweightRatio: value.bodyweightRatio as number,
    percentile: value.percentile as number,
    bound: value.bound as SavedStrengthLift['bound'],
    levelId: value.levelId as LevelId,
    levelLabel: value.levelLabel,
    nextTargetKg: value.nextTargetKg as number,
    nextLevel,
  };
}

export function normalizeStrengthDiagnosis(value: unknown): SavedStrengthDiagnosis | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.savedAt !== 'string' ||
    typeof value.standardsGeneratedAt !== 'string' ||
    (value.sex !== 'M' && value.sex !== 'F') ||
    !finite(value.bodyweightKg) ||
    !Array.isArray(value.lifts)
  ) {
    return null;
  }
  const lifts = value.lifts.map(normalizeLift).filter((lift): lift is SavedStrengthLift => lift != null);
  if (lifts.length === 0) return null;
  return {
    id: value.id,
    savedAt: value.savedAt,
    standardsGeneratedAt: value.standardsGeneratedAt,
    sex: value.sex,
    bodyweightKg: value.bodyweightKg,
    lifts,
  };
}

export function normalizeStrengthProfile(value: unknown): SavedStrengthProfile | null {
  if (!isRecord(value) || (value.sex !== 'M' && value.sex !== 'F') || !finite(value.bodyweightKg)) {
    return null;
  }
  const source = isRecord(value.lifts) ? value.lifts : {};
  const lifts: SavedStrengthProfile['lifts'] = {};
  for (const lift of LIFT_IDS) {
    const item = source[lift];
    if (
      isRecord(item) &&
      finite(item.weightKg) &&
      finite(item.reps) &&
      finite(item.oneRmKg) &&
      typeof item.savedAt === 'string'
    ) {
      lifts[lift] = {
        weightKg: item.weightKg,
        reps: item.reps,
        oneRmKg: item.oneRmKg,
        savedAt: item.savedAt,
      };
    }
  }
  return { sex: value.sex, bodyweightKg: value.bodyweightKg, lifts };
}

export function snapshotDiagnosis(
  diagnosis: Diagnosis,
  savedAt = new Date().toISOString(),
): SavedStrengthDiagnosis {
  return {
    id: savedAt,
    savedAt,
    standardsGeneratedAt: diagnosis.generatedAt,
    sex: diagnosis.sex,
    bodyweightKg: diagnosis.bodyweightKg,
    lifts: diagnosis.lifts.map((lift) => ({
      lift: lift.lift,
      inputWeightKg: lift.input.weightKg,
      reps: lift.input.reps,
      oneRmKg: lift.oneRmKg,
      bodyweightRatio: lift.bodyweightRatio,
      percentile: lift.percentile,
      bound: lift.bound,
      levelId: lift.level.id,
      levelLabel: lift.level.label,
      nextTargetKg: lift.nextTargetKg,
      nextLevel: lift.nextLevel
        ? {
            levelId: lift.nextLevel.level.id,
            levelLabel: lift.nextLevel.level.label,
            targetWeightKg: lift.nextLevel.actionableWeightKg,
            deltaKg: lift.nextLevel.deltaKg,
          }
        : null,
    })),
  };
}

export function latestStrengthDiagnosis(
  history: readonly SavedStrengthDiagnosis[],
): SavedStrengthDiagnosis | null {
  return history.at(-1) ?? null;
}

/** 各種目について最新の保存値を返す。診断日が種目ごとに違ってもよい。 */
export function latestStrengthLifts(
  history: readonly SavedStrengthDiagnosis[],
): Partial<Record<LiftId, SavedStrengthLift & { savedAt: string }>> {
  const result: Partial<Record<LiftId, SavedStrengthLift & { savedAt: string }>> = {};
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item == null) continue;
    for (const lift of item.lifts) {
      if (result[lift.lift] == null) result[lift.lift] = { ...lift, savedAt: item.savedAt };
    }
  }
  return result;
}
