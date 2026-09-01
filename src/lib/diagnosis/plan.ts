import { ACTIVITY_LEVELS, GOAL_PRESETS, calcMacros } from '../nutrition';
import { diagnosePersonalPlan } from './score';
import type { GoalId, PersonalPlanInput, PersonalPlanResult, PlanPhase, WorkoutDay } from './types';

function goalNutritionPreset(goal: GoalId): string {
  if (goal === 'muscle') return 'leanbulk';
  if (goal === 'fat-loss') return 'cut';
  if (goal === 'recomp') return 'slowcut';
  return 'maintain';
}

function activityKey(input: PersonalPlanInput): string {
  const { dailyActivity } = input.lifestyle;
  if (dailyActivity === 'active') return 'active';
  if (dailyActivity === 'walk') return 'moderate';
  if (dailyActivity === 'someWalk') return input.training.daysPerWeek >= 3 ? 'moderate' : 'light';
  if (input.training.daysPerWeek >= 4) return 'moderate';
  if (input.training.daysPerWeek >= 2) return 'light';
  return 'sedentary';
}

const HOME_DAYS: WorkoutDay[] = [
  { id: 'home-a', label: 'Full Body A', focus: '全身を動かす', exerciseIds: ['push-up', 'bodyweight-squat', 'lunge', 'plank'] },
  { id: 'home-b', label: 'Full Body B', focus: '下半身・体幹を中心に', exerciseIds: ['bodyweight-squat', 'lunge', 'crunch', 'plank'] },
  { id: 'home-c', label: 'Full Body C', focus: '上半身・体幹を中心に', exerciseIds: ['push-up', 'bodyweight-squat', 'crunch', 'plank'] },
];

function gymDays(goal: GoalId): WorkoutDay[] {
  if (goal === 'strength') return [
    { id: 'big3-a', label: 'BIG3 A', focus: 'スクワット・ベンチを優先', exerciseIds: ['squat', 'bench-press', 'bent-over-row'] },
    { id: 'big3-b', label: 'BIG3 B', focus: 'デッドリフト・上半身を優先', exerciseIds: ['deadlift', 'overhead-press', 'lat-pulldown'] },
    { id: 'big3-c', label: 'BIG3 C', focus: 'ベンチ・スクワットの練習', exerciseIds: ['bench-press', 'front-squat', 'seated-row'] },
  ];
  if (goal === 'muscle' || goal === 'recomp') return [
    { id: 'push', label: 'Push', focus: '胸・肩・上腕三頭筋', exerciseIds: ['bench-press', 'dumbbell-press', 'side-raise', 'triceps-extension'] },
    { id: 'legs', label: 'Legs', focus: '脚・臀部', exerciseIds: ['squat', 'romanian-deadlift', 'leg-press', 'leg-curl'] },
    { id: 'pull', label: 'Pull', focus: '背中・上腕二頭筋', exerciseIds: ['lat-pulldown', 'seated-row', 'dumbbell-row', 'dumbbell-curl'] },
  ];
  return [
    { id: 'full-a', label: 'Full Body A', focus: '全身をバランス良く', exerciseIds: ['squat', 'bench-press', 'lat-pulldown', 'plank'] },
    { id: 'full-b', label: 'Full Body B', focus: '全身をバランス良く', exerciseIds: ['deadlift', 'overhead-press', 'seated-row', 'crunch'] },
    { id: 'full-c', label: 'Full Body C', focus: '全身を軽めに動かす', exerciseIds: ['leg-press', 'chest-press', 'dumbbell-row', 'plank'] },
  ];
}

function workouts(input: PersonalPlanInput): WorkoutDay[] {
  const base = input.training.location === 'home' ? HOME_DAYS : gymDays(input.goal);
  return Array.from({ length: input.training.daysPerWeek }, (_, index) => {
    const source = base[index % base.length]!;
    return index < base.length
      ? { ...source, exerciseIds: [...source.exerciseIds] }
      : { ...source, id: `${source.id}-${index + 1}`, label: `${source.label}（軽め）`, exerciseIds: [...source.exerciseIds] };
  });
}

function phases(input: PersonalPlanInput): PlanPhase[] {
  const strength = input.goal === 'strength';
  const cut = input.goal === 'fat-loss' || input.goal === 'recomp';
  return [
    { id: 'phase1', label: 'Phase 1', weeks: 'Week 1〜4', title: '習慣を固定する', detail: `週${input.training.daysPerWeek}回の予定を先にカレンダーへ置き、${input.training.sessionMinutes}分で終えられる内容から始めます。` },
    { id: 'phase2', label: 'Phase 2', weeks: 'Week 5〜8', title: strength ? 'BIG3の練習を積む' : cut ? '食事と活動を安定させる' : '少しずつ進める', detail: strength ? 'フォームを保てる範囲でBIG3の重量・回数を記録し、前回との違いを見ます。' : cut ? '筋トレを維持しながら、食事記録と日常活動を続けます。' : 'できたセット・回数を記録し、無理のない範囲で少しずつ進めます。' },
    { id: 'phase3', label: 'Phase 3', weeks: 'Week 9〜12', title: '振り返って次へつなぐ', detail: '体重・BIG3・週あたりの実施回数を見返し、次の12週間で変えることを1つだけ決めます。' },
  ];
}

function todayWorkout(items: WorkoutDay[], date = new Date()): WorkoutDay | null {
  if (items.length === 0) return null;
  const index = (date.getDay() + 6) % items.length;
  return items[index] ?? null;
}

export function buildPersonalPlan(input: PersonalPlanInput, date = new Date()): PersonalPlanResult {
  const preset = GOAL_PRESETS.find((item) => item.key === goalNutritionPreset(input.goal));
  const activity = ACTIVITY_LEVELS.find((item) => item.key === activityKey(input));
  const macros = preset && activity
    ? calcMacros(input.body, activity.factor, preset.ratio, 'mifflin', { proteinPerKg: preset.protein })
    : null;
  const nutrition = macros == null ? null : {
    calories: Math.round(macros.targetCalories),
    protein: Math.round(macros.protein.grams),
    fat: Math.round(macros.fat.grams),
    carbs: Math.round(macros.carbs.grams),
    note: `既存のPFC・カロリー計算と同じ${activity?.label ?? ''}活動量・${preset?.label ?? ''}設定です。`,
  };
  const weekly = workouts(input);
  return {
    diagnosis: diagnosePersonalPlan(input),
    phases: phases(input),
    workouts: weekly,
    nutrition,
    todayWorkout: todayWorkout(weekly, date),
  };
}
