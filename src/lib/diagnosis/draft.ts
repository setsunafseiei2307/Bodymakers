/**
 * 診断の途中保存。
 *
 * 診断は6ステップあり、最後まで進まないと正式なPlanは保存されない。
 * 途中で閉じた入力が消えると、もう一度最初から答え直しになるため、
 * 回答するたびに端末内へ下書きとして残しておく。
 *
 * 正式な保存データ `bodymakers:data:v1` とは別のキーに置く。
 * 下書きは「まだ検証を通っていない入力」なので、同じ場所に混ぜない。
 *
 * 下書きは壊れていることを前提に読む。JSONが壊れていても、古い形式でも、
 * 項目が欠けていても、既定値へ落として画面は必ず描画できる状態にする。
 */

import type { LiftId } from '../strength/standards';
import {
  RESULT_STEP,
  questionIdFromLegacyStep,
  questionProgress,
  resolveQuestionId,
} from './questions';
import {
  ALCOHOL_HABITS,
  DAILY_ACTIVITIES,
  GOAL_IDS,
  MEAL_AMOUNTS,
  PROTEIN_HABITS,
  SLEEP_DURATIONS,
  SLEEP_QUALITIES,
  STRESS_LEVELS,
  TRAINING_EXPERIENCES,
  TRAINING_FOCUSES,
  TRAINING_LOCATIONS,
  VEGETABLE_HABITS,
  type PersonalPlanInput,
} from './types';

export const DIAGNOSIS_DRAFT_KEY = 'bodymakers:diagnosis:draft:v1';

/** 何日も前の下書きを「前回の続き」として出すと、かえって混乱する。 */
export const DIAGNOSIS_DRAFT_MAX_AGE_DAYS = 30;

/** 診断のステップ。下書きの step の範囲もこの並びで決まる。 */
export const DIAGNOSIS_STEP_TITLES = [
  'なりたい身体',
  '現在の身体',
  '筋トレ状況',
  '現在の筋力',
  '食生活',
  '生活習慣',
] as const;

export type StrengthInputMode = 'oneRm' | 'set';
export type StrengthSetInputs = Record<LiftId, { weight: string; reps: string }>;

export interface DiagnosisDraft {
  version: 1;
  savedAt: string;
  /**
   * 章ごとの位置。1問1画面にする前の形式。
   * 今は questionId を使うが、以前の下書きを読めるように残す。
   */
  step: number;
  /**
   * 今どの質問にいるか。質問IDか 'result'。
   * この項目が無い下書きは、step から位置を割り出す。
   */
  questionId: string | null;
  input: PersonalPlanInput;
  strengthMode: StrengthInputMode;
  setInputs: StrengthSetInputs;
}

const LIFT_IDS: readonly LiftId[] = ['bench', 'squat', 'deadlift'];
/** 入力欄の文字列をそのまま信用しないための上限。 */
const SET_INPUT_MAX_LENGTH = 8;

/** 診断を何も触っていない状態の入力。下書き復元時の既定値でもある。 */
export function defaultDiagnosisInput(): PersonalPlanInput {
  return {
    goal: 'health',
    targets: { weightKg: null, lifts: {} },
    body: { sex: 'male', age: 30, heightCm: 170, weightKg: 70, bodyFatPercent: null },
    training: { experience: 'none', daysPerWeek: 3, sessionMinutes: 60, location: 'gym', focus: 'health' },
    strength: {},
    food: { mealsPerDay: 3, breakfast: 'daily', protein: 'unknown', vegetables: 'normal', outsideMeals: 'oneToTwo', amount: 'normal' },
    lifestyle: { sleepDuration: 'sixToSeven', sleepQuality: 'normal', dailyActivity: 'someWalk', alcohol: 'oneToTwo', smoking: false, stress: 'normal', painOrInjury: false },
  };
}

export function emptySetInputs(): StrengthSetInputs {
  return { bench: { weight: '', reps: '' }, squat: { weight: '', reps: '' }, deadlift: { weight: '', reps: '' } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pick<T extends readonly string[]>(values: T, value: unknown, fallback: T[number]): T[number] {
  return typeof value === 'string' && values.includes(value) ? (value as T[number]) : fallback;
}

function pickNumber<T extends readonly number[]>(values: T, value: unknown, fallback: T[number]): T[number] {
  return typeof value === 'number' && values.includes(value) ? (value as T[number]) : fallback;
}

/**
 * 数値欄の防御。入力途中の 0 や空欄は正常な状態なので弾かない。
 * ここで見るのは「文字列・NaN・Infinity・桁が異常」のような壊れた値だけ。
 */
function pickRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function pickLiftMap(value: unknown): Partial<Record<LiftId, number>> {
  if (!isRecord(value)) return {};
  const lifts: Partial<Record<LiftId, number>> = {};
  for (const lift of LIFT_IDS) {
    const raw = value[lift];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= 600) lifts[lift] = raw;
  }
  return lifts;
}

function pickSetInputs(value: unknown): StrengthSetInputs {
  const base = emptySetInputs();
  if (!isRecord(value)) return base;
  for (const lift of LIFT_IDS) {
    const entry = value[lift];
    if (!isRecord(entry)) continue;
    const weight = typeof entry.weight === 'string' ? entry.weight.slice(0, SET_INPUT_MAX_LENGTH) : '';
    const reps = typeof entry.reps === 'string' ? entry.reps.slice(0, SET_INPUT_MAX_LENGTH) : '';
    base[lift] = { weight, reps };
  }
  return base;
}

function pickInput(value: unknown): PersonalPlanInput {
  const base = defaultDiagnosisInput();
  if (!isRecord(value)) return base;
  const targets = isRecord(value.targets) ? value.targets : {};
  const body = isRecord(value.body) ? value.body : {};
  const training = isRecord(value.training) ? value.training : {};
  const food = isRecord(value.food) ? value.food : {};
  const lifestyle = isRecord(value.lifestyle) ? value.lifestyle : {};
  const targetWeight = targets.weightKg;
  const bodyFat = body.bodyFatPercent;
  return {
    goal: pick(GOAL_IDS, value.goal, base.goal),
    targets: {
      weightKg: typeof targetWeight === 'number' && Number.isFinite(targetWeight) && targetWeight >= 0 && targetWeight <= 300 ? targetWeight : null,
      lifts: pickLiftMap(targets.lifts),
    },
    body: {
      sex: body.sex === 'female' ? 'female' : 'male',
      age: pickRange(body.age, 0, 120, base.body.age),
      heightCm: pickRange(body.heightCm, 0, 250, base.body.heightCm),
      weightKg: pickRange(body.weightKg, 0, 300, base.body.weightKg),
      bodyFatPercent: typeof bodyFat === 'number' && Number.isFinite(bodyFat) && bodyFat >= 0 && bodyFat < 100 ? bodyFat : null,
    },
    training: {
      experience: pick(TRAINING_EXPERIENCES, training.experience, base.training.experience),
      daysPerWeek: pickNumber([1, 2, 3, 4, 5] as const, training.daysPerWeek, base.training.daysPerWeek),
      sessionMinutes: pickNumber([30, 45, 60, 90] as const, training.sessionMinutes, base.training.sessionMinutes),
      location: pick(TRAINING_LOCATIONS, training.location, base.training.location),
      focus: pick(TRAINING_FOCUSES, training.focus, base.training.focus),
    },
    strength: pickLiftMap(value.strength),
    food: {
      mealsPerDay: pickNumber([1, 2, 3, 4] as const, food.mealsPerDay, base.food.mealsPerDay),
      breakfast: pick(['rarely', 'sometimes', 'daily'] as const, food.breakfast, base.food.breakfast),
      protein: pick(PROTEIN_HABITS, food.protein, base.food.protein),
      vegetables: pick(VEGETABLE_HABITS, food.vegetables, base.food.vegetables),
      outsideMeals: pick(['daily', 'threeToFour', 'oneToTwo', 'rarely'] as const, food.outsideMeals, base.food.outsideMeals),
      amount: pick(MEAL_AMOUNTS, food.amount, base.food.amount),
    },
    lifestyle: {
      sleepDuration: pick(SLEEP_DURATIONS, lifestyle.sleepDuration, base.lifestyle.sleepDuration),
      sleepQuality: pick(SLEEP_QUALITIES, lifestyle.sleepQuality, base.lifestyle.sleepQuality),
      dailyActivity: pick(DAILY_ACTIVITIES, lifestyle.dailyActivity, base.lifestyle.dailyActivity),
      alcohol: pick(ALCOHOL_HABITS, lifestyle.alcohol, base.lifestyle.alcohol),
      smoking: lifestyle.smoking === true,
      stress: pick(STRESS_LEVELS, lifestyle.stress, base.lifestyle.stress),
      painOrInjury: lifestyle.painOrInjury === true,
    },
  };
}

/**
 * 下書きの復元。
 *
 * 保存日時が読めない・未来すぎる・古すぎる場合は「続きがある」とは扱わない。
 * それ以外は、欠けた項目を既定値で埋めてでも復元する。
 */
export function normalizeDiagnosisDraft(value: unknown, now = new Date()): DiagnosisDraft | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (typeof value.savedAt !== 'string') return null;
  const savedAt = Date.parse(value.savedAt);
  if (!Number.isFinite(savedAt)) return null;
  const ageDays = (now.getTime() - savedAt) / 86_400_000;
  if (ageDays > DIAGNOSIS_DRAFT_MAX_AGE_DAYS) return null;
  const maxStep = DIAGNOSIS_STEP_TITLES.length;
  const rawStep = value.step;
  const step = typeof rawStep === 'number' && Number.isInteger(rawStep) && rawStep >= 0 && rawStep <= maxStep ? rawStep : 0;
  // IDの中身は質問表の側で確かめる。ここでは「文字列かどうか」だけを見る。
  const questionId = typeof value.questionId === 'string' && value.questionId !== '' && value.questionId.length <= 64
    ? value.questionId
    : null;
  return {
    version: 1,
    savedAt: value.savedAt,
    step,
    questionId,
    input: pickInput(value.input),
    strengthMode: value.strengthMode === 'set' ? 'set' : 'oneRm',
    setInputs: pickSetInputs(value.setInputs),
  };
}

export function parseDiagnosisDraft(raw: string | null, now = new Date()): DiagnosisDraft | null {
  if (raw == null || raw === '') return null;
  try {
    return normalizeDiagnosisDraft(JSON.parse(raw) as unknown, now);
  } catch {
    return null;
  }
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDiagnosisDraft(storage: Storage | null = browserStorage(), now = new Date()): DiagnosisDraft | null {
  if (storage == null) return null;
  try {
    return parseDiagnosisDraft(storage.getItem(DIAGNOSIS_DRAFT_KEY), now);
  } catch {
    return null;
  }
}

export function writeDiagnosisDraft(
  draft: Omit<DiagnosisDraft, 'version' | 'savedAt' | 'questionId'> & { savedAt?: string; questionId?: string | null },
  storage: Storage | null = browserStorage(),
): boolean {
  if (storage == null) return false;
  const payload: DiagnosisDraft = {
    version: 1,
    savedAt: draft.savedAt ?? new Date().toISOString(),
    step: draft.step,
    questionId: draft.questionId ?? null,
    input: draft.input,
    strengthMode: draft.strengthMode,
    setInputs: draft.setInputs,
  };
  try {
    storage.setItem(DIAGNOSIS_DRAFT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // 保存容量やプライベートモードで失敗しても、診断そのものは続けられる。
    return false;
  }
}

export function clearDiagnosisDraft(storage: Storage | null = browserStorage()): boolean {
  if (storage == null) return false;
  try {
    storage.removeItem(DIAGNOSIS_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * 下書きの位置を、今の質問表の上の位置へ直す。
 * questionId が無い古い下書きは、章の番号から割り出す。
 */
export function draftQuestionId(draft: DiagnosisDraft): string {
  if (draft.questionId != null) {
    const resolved = resolveQuestionId(draft.input, draft.questionId);
    // 保存されたIDが今の質問表に無い場合だけ、章の番号へ落とす。
    if (draft.questionId === RESULT_STEP || resolved === draft.questionId) return resolved;
  }
  return questionIdFromLegacyStep(draft.input, draft.step);
}

/** 「前回の続き」の案内に出す、どこまで進んでいたかの表示。 */
export function draftStepLabel(draft: DiagnosisDraft): string {
  const questionId = draftQuestionId(draft);
  if (questionId === RESULT_STEP) return '診断結果';
  const progress = questionProgress(draft.input, questionId);
  return `${progress.position} / ${progress.total}問目`;
}
