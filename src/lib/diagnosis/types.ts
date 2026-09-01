import type { Sex } from '../nutrition';
import type { LiftId } from '../strength/standards';

export const GOAL_IDS = ['muscle', 'fat-loss', 'recomp', 'strength', 'health'] as const;
export type GoalId = (typeof GOAL_IDS)[number];

export const TRAINING_EXPERIENCES = ['none', 'under3', 'threeToSix', 'sixToTwelve', 'oneToThree', 'overThree'] as const;
export type TrainingExperience = (typeof TRAINING_EXPERIENCES)[number];
export const TRAINING_LOCATIONS = ['home', 'gym', 'both'] as const;
export type TrainingLocation = (typeof TRAINING_LOCATIONS)[number];
export const TRAINING_FOCUSES = ['hypertrophy', 'strength', 'both', 'health'] as const;
export type TrainingFocus = (typeof TRAINING_FOCUSES)[number];
export const PROTEIN_HABITS = ['everyMeal', 'oneToTwo', 'rarely', 'unknown'] as const;
export type ProteinHabit = (typeof PROTEIN_HABITS)[number];
export const VEGETABLE_HABITS = ['high', 'normal', 'low'] as const;
export type VegetableHabit = (typeof VEGETABLE_HABITS)[number];
export const MEAL_AMOUNTS = ['veryLow', 'low', 'normal', 'high', 'veryHigh', 'unknown'] as const;
export type MealAmount = (typeof MEAL_AMOUNTS)[number];
export const SLEEP_DURATIONS = ['under5', 'fiveToSix', 'sixToSeven', 'sevenToEight', 'overEight'] as const;
export type SleepDuration = (typeof SLEEP_DURATIONS)[number];
export const SLEEP_QUALITIES = ['good', 'normal', 'poor'] as const;
export type SleepQuality = (typeof SLEEP_QUALITIES)[number];
export const DAILY_ACTIVITIES = ['desk', 'someWalk', 'walk', 'active'] as const;
export type DailyActivity = (typeof DAILY_ACTIVITIES)[number];
export const ALCOHOL_HABITS = ['none', 'oneToTwo', 'threeToFour', 'daily'] as const;
export type AlcoholHabit = (typeof ALCOHOL_HABITS)[number];
export const STRESS_LEVELS = ['low', 'normal', 'high'] as const;
export type StressLevel = (typeof STRESS_LEVELS)[number];

export interface PersonalPlanInput {
  goal: GoalId;
  targets: {
    weightKg: number | null;
    lifts: Partial<Record<LiftId, number>>;
  };
  body: {
    sex: Sex;
    age: number;
    heightCm: number;
    weightKg: number;
    bodyFatPercent: number | null;
  };
  training: {
    experience: TrainingExperience;
    daysPerWeek: 1 | 2 | 3 | 4 | 5;
    sessionMinutes: 30 | 45 | 60 | 90;
    location: TrainingLocation;
    focus: TrainingFocus;
  };
  strength: Partial<Record<LiftId, number>>;
  food: {
    mealsPerDay: 1 | 2 | 3 | 4;
    breakfast: 'rarely' | 'sometimes' | 'daily';
    protein: ProteinHabit;
    vegetables: VegetableHabit;
    outsideMeals: 'daily' | 'threeToFour' | 'oneToTwo' | 'rarely';
    amount: MealAmount;
  };
  lifestyle: {
    sleepDuration: SleepDuration;
    sleepQuality: SleepQuality;
    dailyActivity: DailyActivity;
    alcohol: AlcoholHabit;
    smoking: boolean;
    stress: StressLevel;
    painOrInjury: boolean;
  };
}

export type DiagnosisAxisId = 'body' | 'strength' | 'training' | 'nutrition' | 'recovery';

export interface DiagnosisAxis {
  id: DiagnosisAxisId;
  label: string;
  score: number;
  reasons: string[];
}

export interface PriorityAction {
  id: string;
  title: string;
  action: string;
  why: string;
  axis: DiagnosisAxisId;
  priority: number;
}

export interface PlanGap {
  id: string;
  label: string;
  current: string;
  target: string;
  difference: string;
}

export interface DiagnosisResult {
  axes: DiagnosisAxis[];
  priorities: PriorityAction[];
  gaps: PlanGap[];
}

export interface WorkoutDay {
  id: string;
  label: string;
  focus: string;
  exerciseIds: string[];
}

export interface PlanPhase {
  id: 'phase1' | 'phase2' | 'phase3';
  label: string;
  weeks: string;
  title: string;
  detail: string;
}

export interface NutritionTarget {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  note: string;
}

export interface PersonalPlanResult {
  diagnosis: DiagnosisResult;
  phases: PlanPhase[];
  workouts: WorkoutDay[];
  nutrition: NutritionTarget | null;
  todayWorkout: WorkoutDay | null;
}

/** 端末内に保存する診断入力。結果と12週間Planはこの入力から毎回同じルールで再生成する。 */
export interface SavedPersonalPlan {
  version: 1;
  createdAt: string;
  input: PersonalPlanInput;
}

const LIFT_IDS: readonly LiftId[] = ['bench', 'squat', 'deadlift'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}
function normalizeLiftMap(value: unknown): Partial<Record<LiftId, number>> {
  if (!isRecord(value)) return {};
  const lifts: Partial<Record<LiftId, number>> = {};
  for (const lift of LIFT_IDS) {
    if (finite(value[lift]) && value[lift] > 0 && value[lift] <= 600) lifts[lift] = value[lift];
  }
  return lifts;
}

/** 古い保存形式にこの項目が無くても null に戻し、既存データは消さない。 */
export function normalizePersonalPlan(value: unknown): SavedPersonalPlan | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.createdAt !== 'string' || !isRecord(value.input)) return null;
  const input = value.input;
  const targets = isRecord(input.targets) ? input.targets : null;
  const body = isRecord(input.body) ? input.body : null;
  const training = isRecord(input.training) ? input.training : null;
  const food = isRecord(input.food) ? input.food : null;
  const lifestyle = isRecord(input.lifestyle) ? input.lifestyle : null;
  if (!targets || !body || !training || !food || !lifestyle) return null;
  if (!includes(GOAL_IDS, input.goal) || (body.sex !== 'male' && body.sex !== 'female')) return null;
  if (!finite(body.age) || body.age < 13 || body.age > 120 || !finite(body.heightCm) || body.heightCm < 100 || body.heightCm > 250 || !finite(body.weightKg) || body.weightKg < 30 || body.weightKg > 300) return null;
  if (body.bodyFatPercent != null && (!finite(body.bodyFatPercent) || body.bodyFatPercent < 0 || body.bodyFatPercent >= 100)) return null;
  if (!includes(TRAINING_EXPERIENCES, training.experience) || ![1, 2, 3, 4, 5].includes(training.daysPerWeek as number) || ![30, 45, 60, 90].includes(training.sessionMinutes as number) || !includes(TRAINING_LOCATIONS, training.location) || !includes(TRAINING_FOCUSES, training.focus)) return null;
  if (![1, 2, 3, 4].includes(food.mealsPerDay as number) || !['rarely', 'sometimes', 'daily'].includes(food.breakfast as string) || !includes(PROTEIN_HABITS, food.protein) || !includes(VEGETABLE_HABITS, food.vegetables) || !['daily', 'threeToFour', 'oneToTwo', 'rarely'].includes(food.outsideMeals as string) || !includes(MEAL_AMOUNTS, food.amount)) return null;
  if (!includes(SLEEP_DURATIONS, lifestyle.sleepDuration) || !includes(SLEEP_QUALITIES, lifestyle.sleepQuality) || !includes(DAILY_ACTIVITIES, lifestyle.dailyActivity) || !includes(ALCOHOL_HABITS, lifestyle.alcohol) || typeof lifestyle.smoking !== 'boolean' || !includes(STRESS_LEVELS, lifestyle.stress) || typeof lifestyle.painOrInjury !== 'boolean') return null;
  const targetWeightKg = targets.weightKg == null ? null : finite(targets.weightKg) && targets.weightKg >= 30 && targets.weightKg <= 300 ? targets.weightKg : null;
  return {
    version: 1,
    createdAt: value.createdAt,
    input: {
      goal: input.goal,
      targets: { weightKg: targetWeightKg, lifts: normalizeLiftMap(targets.lifts) },
      body: { sex: body.sex, age: body.age, heightCm: body.heightCm, weightKg: body.weightKg, bodyFatPercent: body.bodyFatPercent == null ? null : body.bodyFatPercent },
      training: { experience: training.experience, daysPerWeek: training.daysPerWeek, sessionMinutes: training.sessionMinutes, location: training.location, focus: training.focus },
      strength: normalizeLiftMap(input.strength),
      food: { mealsPerDay: food.mealsPerDay, breakfast: food.breakfast as PersonalPlanInput['food']['breakfast'], protein: food.protein, vegetables: food.vegetables, outsideMeals: food.outsideMeals as PersonalPlanInput['food']['outsideMeals'], amount: food.amount },
      lifestyle: { sleepDuration: lifestyle.sleepDuration, sleepQuality: lifestyle.sleepQuality, dailyActivity: lifestyle.dailyActivity, alcohol: lifestyle.alcohol, smoking: lifestyle.smoking, stress: lifestyle.stress, painOrInjury: lifestyle.painOrInjury },
    },
  };
}
