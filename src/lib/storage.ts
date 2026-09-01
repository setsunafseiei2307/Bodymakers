/**
 * Bodymakers の端末内データ。
 *
 * サーバーやCookieには送らず、利用者が使っているブラウザの localStorage にだけ置く。
 * UIから直接JSONを触るとページごとに形式がずれるため、読み書きはこのファイルに集約する。
 */

import type { Sex } from './nutrition';
import type { ExerciseEntry, MealEntry, MuscleGroup } from './today';
import {
  STRENGTH_HISTORY_LIMIT,
  normalizeStrengthDiagnosis,
  normalizeStrengthProfile,
  type SavedStrengthDiagnosis,
  type SavedStrengthProfile,
} from './strength/history';

export const STORAGE_KEY = 'bodymakers:data:v1';
export const DATA_CHANGED_EVENT = 'bodymakers:data-changed';

export interface SavedProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: string;
  trainingDaysPerWeek: number;
}

export interface SavedDietPlan {
  createdAt: string;
  startingWeightKg: number;
  targetWeightKg: number;
  targetDate: string;
  tdee: number;
  targetCalories: number;
  proteinGrams: number;
  fatGrams: number;
  carbsGrams: number;
  dailyKcalGap: number;
  mode: 'cut' | 'bulk';
}

export interface ManualIntake {
  kcal: number | null;
  protein: number | null;
}

export interface DailyLog {
  date: string;
  savedAt: string;
  weightKg: number | null;
  meals: MealEntry[];
  exercises: ExerciseEntry[];
  muscles: MuscleGroup[];
  doneExercises: string[];
  manualIntake: ManualIntake;
  steps: number | null;
  sleepHours: number | null;
}

export interface BodymakersData {
  version: 1;
  profile: SavedProfile | null;
  dietPlan: SavedDietPlan | null;
  dailyLogs: DailyLog[];
  /** ユーザー個人の筋力入力。参照用の筋力基準データとは分離して端末内だけに保存する。 */
  strengthProfile: SavedStrengthProfile | null;
  strengthHistory: SavedStrengthDiagnosis[];
}

export function emptyData(): BodymakersData {
  return {
    version: 1,
    profile: null,
    dietPlan: null,
    dailyLogs: [],
    strengthProfile: null,
    strengthHistory: [],
  };
}

/** 端末のローカル日付を YYYY-MM-DD で返す。UTC日付にしない。 */
export function localDateKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDailyLog(value: unknown): DailyLog | null {
  if (!isRecord(value) || typeof value.date !== 'string') return null;
  const manual = isRecord(value.manualIntake) ? value.manualIntake : {};
  const meals = Array.isArray(value.meals)
    ? value.meals.filter((item): item is MealEntry =>
      isRecord(item) && typeof item.foodId === 'string' && finiteOrNull(item.grams) != null,
    )
    : [];
  const exercises = Array.isArray(value.exercises)
    ? value.exercises.filter((item): item is ExerciseEntry =>
      isRecord(item) && typeof item.activityId === 'string' && finiteOrNull(item.minutes) != null,
    )
    : [];
  return {
    date: value.date,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : value.date,
    weightKg: finiteOrNull(value.weightKg),
    meals,
    exercises,
    muscles: Array.isArray(value.muscles) ? value.muscles.filter((item): item is MuscleGroup => typeof item === 'string') : [],
    doneExercises: Array.isArray(value.doneExercises) ? value.doneExercises.filter((item): item is string => typeof item === 'string') : [],
    manualIntake: { kcal: finiteOrNull(manual.kcal), protein: finiteOrNull(manual.protein) },
    steps: finiteOrNull(value.steps),
    sleepHours: finiteOrNull(value.sleepHours),
  };
}

/**
 * 破損したJSONや旧バージョンでページ全体を壊さないための最低限の復元。
 * 個々の入力値は保存前に各ツールの既存バリデーションを通す。
 */
export function parseStoredData(raw: string | null): BodymakersData {
  if (raw == null || raw === '') return emptyData();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return emptyData();
    return {
      version: 1,
      profile: isRecord(parsed.profile) ? (parsed.profile as unknown as SavedProfile) : null,
      dietPlan: isRecord(parsed.dietPlan) ? (parsed.dietPlan as unknown as SavedDietPlan) : null,
      dailyLogs: Array.isArray(parsed.dailyLogs)
        ? parsed.dailyLogs.map(normalizeDailyLog).filter((log): log is DailyLog => log != null).slice(-366)
        : [],
      strengthProfile: normalizeStrengthProfile(parsed.strengthProfile),
      strengthHistory: Array.isArray(parsed.strengthHistory)
        ? parsed.strengthHistory
            .map(normalizeStrengthDiagnosis)
            .filter((item): item is SavedStrengthDiagnosis => item != null)
            .slice(-STRENGTH_HISTORY_LIMIT)
        : [],
    };
  } catch {
    return emptyData();
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

export function readData(storage: Storage | null = browserStorage()): BodymakersData {
  if (storage == null) return emptyData();
  try {
    return parseStoredData(storage.getItem(STORAGE_KEY));
  } catch {
    return emptyData();
  }
}

export function writeData(
  data: BodymakersData,
  storage: Storage | null = browserStorage(),
): boolean {
  if (storage == null) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function saveDietPlan(
  plan: SavedDietPlan,
  profile: SavedProfile,
  storage: Storage | null = browserStorage(),
): boolean {
  const data = readData(storage);
  return writeData({ ...data, dietPlan: plan, profile }, storage);
}

/** 診断履歴と、次回入力に使う最新の体重・BIG3を同時に保存する。 */
export function saveStrengthDiagnosis(
  snapshot: SavedStrengthDiagnosis,
  storage: Storage | null = browserStorage(),
): boolean {
  const data = readData(storage);
  const savedAt = snapshot.savedAt;
  const lifts: SavedStrengthProfile['lifts'] = { ...(data.strengthProfile?.lifts ?? {}) };
  for (const lift of snapshot.lifts) {
    lifts[lift.lift] = {
      weightKg: lift.inputWeightKg,
      reps: lift.reps,
      oneRmKg: lift.oneRmKg,
      savedAt,
    };
  }
  const strengthHistory = [
    ...data.strengthHistory.filter((item) => item.id !== snapshot.id),
    snapshot,
  ]
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
    .slice(-STRENGTH_HISTORY_LIMIT);
  return writeData(
    {
      ...data,
      strengthProfile: {
        sex: snapshot.sex,
        bodyweightKg: snapshot.bodyweightKg,
        lifts,
      },
      strengthHistory,
    },
    storage,
  );
}

/** 同じ日付の記録は上書きし、最大1年分だけ保持する。 */
export function saveDailyLog(
  log: DailyLog,
  storage: Storage | null = browserStorage(),
): boolean {
  const data = readData(storage);
  const dailyLogs = [...data.dailyLogs.filter((item) => item.date !== log.date), log]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-366);
  return writeData({ ...data, dailyLogs }, storage);
}

/** 食品ページから今日の記録へ、食品成分表のIDと分量だけを渡す。 */
export function addMealsToToday(
  meals: readonly MealEntry[],
  storage: Storage | null = browserStorage(),
): boolean {
  if (meals.length === 0) return false;
  const data = readData(storage);
  const date = localDateKey();
  const existing = data.dailyLogs.find((item) => item.date === date);
  const log: DailyLog = existing ?? {
    date,
    savedAt: new Date().toISOString(),
    weightKg: data.profile?.weightKg ?? null,
    meals: [],
    exercises: [],
    muscles: [],
    doneExercises: [],
    manualIntake: { kcal: null, protein: null },
    steps: null,
    sleepHours: null,
  };
  return saveDailyLog(
    { ...log, meals: [...log.meals, ...meals], savedAt: new Date().toISOString() },
    storage,
  );
}

export function todayLog(data: BodymakersData, date = localDateKey()): DailyLog | null {
  return data.dailyLogs.find((item) => item.date === date) ?? null;
}

export function clearBodymakersData(storage: Storage | null = browserStorage()): boolean {
  if (storage == null) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}
