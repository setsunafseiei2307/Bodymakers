/**
 * 入力（性別・体重・各種目の挙上重量とレップ数）から診断結果を組み立てる。
 *
 * ここも React 非依存の純関数。画面側は結果オブジェクトを描画するだけにして、
 * 判定ルールがUIに散らばらないようにしている。
 */

import { estimateOneRM, MAX_REPS } from '../onerm';
import { isFiniteNumber } from '../format';
import { STRENGTH_STANDARDS } from './standardsData';
import {
  interpolateCurve,
  interpolateSample,
  levelForPercentile,
  percentileForWeight,
  weightForPercentile,
  LEVELS,
  LIFT_MUSCLES,
  LIFT_ORDER,
  MAX_BODYWEIGHT_KG,
  MAX_LIFT_KG,
  MIN_BODYWEIGHT_KG,
  MIN_LIFT_KG,
  type LevelDefinition,
  type LiftId,
  type MetricId,
  type Sex,
} from './standards';

/** 1種目分の入力。 */
export interface LiftInput {
  weightKg: number;
  reps: number;
}

/** 診断全体の入力。種目は未入力（undefined）を許す。 */
export interface DiagnosisInput {
  sex: Sex;
  bodyweightKg: number;
  lifts: Partial<Record<LiftId, LiftInput>>;
}

/** 各レベルの下限重量。結果画面の目安表に使う。 */
export interface LevelThreshold {
  level: LevelDefinition;
  /** このレベルに到達するのに必要な重量（kg）。最下位レベルは表の下限値 */
  weightKg: number;
}

/** 1種目分の診断結果。 */
export interface LiftDiagnosis {
  lift: LiftId;
  input: LiftInput;
  /** 7式の平均による推定1RM（kg） */
  oneRmKg: number;
  /** 式による推定値のばらつき（最大 − 最小、kg） */
  oneRmSpreadKg: number;
  /** 体重比（推定1RM ÷ 体重） */
  bodyweightRatio: number;
  /** 集団内順位（0〜100、大きいほど強い） */
  percentile: number;
  /** 基準表の範囲内だったか */
  bound: 'in-range' | 'below' | 'above';
  level: LevelDefinition;
  /** 5段階それぞれの下限重量 */
  thresholds: LevelThreshold[];
  /** 次のレベルと、そこまでの不足分。最上位なら null */
  nextLevel: { level: LevelDefinition; weightKg: number; deltaKg: number } | null;
}

/** 弱点として指摘する種目。 */
export interface WeaknessFinding {
  lift: LiftId;
  /** 最も順位が高い種目とのパーセンタイル差 */
  percentileGap: number;
  /** 主に動員される部位 */
  muscles: string;
  /**
   * 母集団の種目間比率の中央値から見た「同水準なら出ていておかしくない重量」（kg）。
   * 比率データが無い場合は null。
   */
  balancedKg: number | null;
}

/** 診断結果全体。 */
export interface Diagnosis {
  sex: Sex;
  bodyweightKg: number;
  /** 種目ごとの結果。入力があったものだけが入る */
  lifts: LiftDiagnosis[];
  /** 3種目すべて入力されたときのみ算出されるトータル評価 */
  total: {
    oneRmKg: number;
    percentile: number;
    bound: 'in-range' | 'below' | 'above';
    level: LevelDefinition;
    thresholds: LevelThreshold[];
  } | null;
  /** 弱点。順位差が小さくバランスが取れている場合は空配列 */
  weaknesses: WeaknessFinding[];
  /** この体重帯の基準が何人の記録に基づくか。データなしなら null */
  sampleSize: number | null;
  /** 基準表の生成日 */
  generatedAt: string;
}

/**
 * 弱点と判定するパーセンタイル差のしきい値。
 *
 * 10ポイントは、基準表の分位点の刻み（1,5,10,20,30…）1〜2段分に相当する。
 * これ未満の差は測定日のコンディションや推定1RMの誤差に埋もれるため指摘しない。
 */
export const WEAKNESS_GAP_THRESHOLD = 10;

/** 入力エラーの種類。画面のメッセージはこのIDから引く。 */
export type ValidationErrorCode =
  | 'bodyweight-required'
  | 'bodyweight-range'
  | 'lift-required'
  | 'weight-range'
  | 'reps-range';

export interface ValidationError {
  code: ValidationErrorCode;
  /** 種目に紐づくエラーならその種目ID。全体のエラーなら null */
  lift: LiftId | null;
  message: string;
}

/**
 * 入力を検証する。エラーが無ければ空配列。
 * 画面はこの配列をそのままフィールド下のメッセージに使う。
 */
export function validateInput(input: DiagnosisInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isFiniteNumber(input.bodyweightKg)) {
    errors.push({
      code: 'bodyweight-required',
      lift: null,
      message: '体重を入力してください。',
    });
  } else if (
    input.bodyweightKg < MIN_BODYWEIGHT_KG ||
    input.bodyweightKg > MAX_BODYWEIGHT_KG
  ) {
    errors.push({
      code: 'bodyweight-range',
      lift: null,
      message: `体重は ${MIN_BODYWEIGHT_KG}〜${MAX_BODYWEIGHT_KG}kg の範囲で入力してください。`,
    });
  }

  const entered = LIFT_ORDER.filter((lift) => input.lifts[lift] != null);
  if (entered.length === 0) {
    errors.push({
      code: 'lift-required',
      lift: null,
      message: '少なくとも1種目の重量とレップ数を入力してください。',
    });
  }

  for (const lift of entered) {
    const value = input.lifts[lift];
    if (value == null) continue;
    if (
      !isFiniteNumber(value.weightKg) ||
      value.weightKg < MIN_LIFT_KG ||
      value.weightKg > MAX_LIFT_KG
    ) {
      errors.push({
        code: 'weight-range',
        lift,
        message: `重量は ${MIN_LIFT_KG}〜${MAX_LIFT_KG}kg の範囲で入力してください。`,
      });
    }
    if (
      !isFiniteNumber(value.reps) ||
      value.reps < 1 ||
      value.reps > MAX_REPS ||
      !Number.isInteger(value.reps)
    ) {
      errors.push({
        code: 'reps-range',
        lift,
        message: `レップ数は 1〜${MAX_REPS} の整数で入力してください（それ以上は推定誤差が大きく計算しません）。`,
      });
    }
  }

  return errors;
}

/** 指定の体重・種目について、5段階それぞれの下限重量を求める。 */
function buildThresholds(
  curve: number[],
  grid: number[],
): LevelThreshold[] {
  return LEVELS.map((level) => {
    // 最下位レベルの下限は基準表そのものの下限値を使う（0kg では意味がないため）
    const percentile = level.minPercentile === 0 ? grid[0] : level.minPercentile;
    const weightKg = weightForPercentile(curve, grid, percentile);
    return { level, weightKg: weightKg ?? 0 };
  });
}

/** 現在のレベルの次に到達するレベルと、そこまでの不足分を求める。 */
function findNextLevel(
  current: LevelDefinition,
  thresholds: LevelThreshold[],
  oneRmKg: number,
): { level: LevelDefinition; weightKg: number; deltaKg: number } | null {
  const currentIndex = LEVELS.findIndex((level) => level.id === current.id);
  if (currentIndex < 0 || currentIndex >= LEVELS.length - 1) return null;
  const next = thresholds[currentIndex + 1];
  if (next == null) return null;
  return {
    level: next.level,
    weightKg: next.weightKg,
    deltaKg: Math.max(0, next.weightKg - oneRmKg),
  };
}

/** 1種目分を診断する。基準データが無い場合は null。 */
function diagnoseLift(
  sex: Sex,
  bodyweightKg: number,
  lift: LiftId,
  value: LiftInput,
): LiftDiagnosis | null {
  const estimate = estimateOneRM(value.weightKg, value.reps);
  if (estimate == null) return null;

  const grid = STRENGTH_STANDARDS.percentileGrid;
  const curve = interpolateCurve(STRENGTH_STANDARDS, sex, lift, bodyweightKg);
  if (curve == null) return null;

  const ranked = percentileForWeight(curve, grid, estimate.average);
  if (ranked == null) return null;

  const thresholds = buildThresholds(curve, grid);
  const level = levelForPercentile(ranked.percentile);

  return {
    lift,
    input: value,
    oneRmKg: estimate.average,
    oneRmSpreadKg: estimate.spread,
    bodyweightRatio: estimate.average / bodyweightKg,
    percentile: ranked.percentile,
    bound: ranked.bound,
    level,
    thresholds,
    nextLevel: findNextLevel(level, thresholds, estimate.average),
  };
}

/**
 * 母集団の種目間比率の中央値から、「他の種目と釣り合う重量」を求める。
 * 比率はスクワットを1とした値なので、いったんスクワット換算に直してから掛ける。
 */
function balancedWeightFor(
  sex: Sex,
  bodyweightKg: number,
  target: LiftId,
  reference: LiftDiagnosis,
): number | null {
  const anchors = STRENGTH_STANDARDS.anchors[sex];
  if (!anchors || anchors.length === 0) return null;

  // 体重に最も近いアンカーの比率を使う（比率は体重による変化が小さいため補間しない）
  let nearest = anchors[0];
  for (const anchor of anchors) {
    if (
      Math.abs(anchor.bodyweightKg - bodyweightKg) <
      Math.abs(nearest.bodyweightKg - bodyweightKg)
    ) {
      nearest = anchor;
    }
  }

  const { benchPerSquat, deadliftPerSquat } = nearest.ratios;
  if (benchPerSquat == null || deadliftPerSquat == null) return null;

  const toSquat: Record<LiftId, number> = {
    squat: 1,
    bench: benchPerSquat,
    deadlift: deadliftPerSquat,
  };

  const referenceFactor = toSquat[reference.lift];
  if (referenceFactor <= 0) return null;
  // 基準種目をスクワット相当に換算してから、対象種目の比率を掛ける
  const squatEquivalent = reference.oneRmKg / referenceFactor;
  return squatEquivalent * toSquat[target];
}

/** 種目間の順位差から弱点を洗い出す。 */
function findWeaknesses(
  sex: Sex,
  bodyweightKg: number,
  lifts: LiftDiagnosis[],
): WeaknessFinding[] {
  // 2種目以上ないと比較できない
  if (lifts.length < 2) return [];

  const strongest = lifts.reduce((best, current) =>
    current.percentile > best.percentile ? current : best,
  );

  return lifts
    .filter((item) => strongest.percentile - item.percentile >= WEAKNESS_GAP_THRESHOLD)
    .map((item) => ({
      lift: item.lift,
      percentileGap: strongest.percentile - item.percentile,
      muscles: LIFT_MUSCLES[item.lift],
      balancedKg: balancedWeightFor(sex, bodyweightKg, item.lift, strongest),
    }))
    .sort((a, b) => b.percentileGap - a.percentileGap);
}

/** 3種目そろっている場合のトータル評価。 */
function diagnoseTotal(
  sex: Sex,
  bodyweightKg: number,
  lifts: LiftDiagnosis[],
): Diagnosis['total'] {
  if (lifts.length !== LIFT_ORDER.length) return null;

  const grid = STRENGTH_STANDARDS.percentileGrid;
  const metric: MetricId = 'total';
  const curve = interpolateCurve(STRENGTH_STANDARDS, sex, metric, bodyweightKg);
  if (curve == null) return null;

  const oneRmKg = lifts.reduce((sum, item) => sum + item.oneRmKg, 0);
  const ranked = percentileForWeight(curve, grid, oneRmKg);
  if (ranked == null) return null;

  return {
    oneRmKg,
    percentile: ranked.percentile,
    bound: ranked.bound,
    level: levelForPercentile(ranked.percentile),
    thresholds: buildThresholds(curve, grid),
  };
}

/**
 * 診断を実行する。
 * 入力が不正な場合は null を返す（呼び出し前に validateInput で検証すること）。
 */
export function diagnose(input: DiagnosisInput): Diagnosis | null {
  if (validateInput(input).length > 0) return null;

  const lifts: LiftDiagnosis[] = [];
  for (const lift of LIFT_ORDER) {
    const value = input.lifts[lift];
    if (value == null) continue;
    const result = diagnoseLift(input.sex, input.bodyweightKg, lift, value);
    if (result != null) lifts.push(result);
  }

  if (lifts.length === 0) return null;

  return {
    sex: input.sex,
    bodyweightKg: input.bodyweightKg,
    lifts,
    total: diagnoseTotal(input.sex, input.bodyweightKg, lifts),
    weaknesses: findWeaknesses(input.sex, input.bodyweightKg, lifts),
    sampleSize: interpolateSample(STRENGTH_STANDARDS, input.sex, input.bodyweightKg),
    generatedAt: STRENGTH_STANDARDS.generatedAt,
  };
}

/** 「上位◯%」の表示に使う値。percentile が大きいほど小さくなる。 */
export function topPercent(percentile: number): number {
  return 100 - percentile;
}
