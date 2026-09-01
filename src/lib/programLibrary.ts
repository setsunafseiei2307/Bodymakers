/**
 * Program Libraryの定義・推薦・重量生成。
 * 公開された一般的な負荷管理の原則をBodymakers独自の構成へ落とし込む。
 * 特定の書籍・有料テンプレートを再現しない。
 */

import type { PersonalPlanInput } from './diagnosis/types';
import { findExercise } from './exercises';
import { isFiniteNumber } from './format';
import { roundToIncrement } from './onerm';
import { buildTrainingProgram, type TrainingExperience } from './programs';
import { buildSmolov } from './smolov';
import type { LiftId } from './strength/standards';

export type ProgramGoal = 'strength' | 'hypertrophy' | 'health';
export type ProgramTag = ProgramGoal | 'beginner' | 'high-frequency' | 'short';
export type ProgramDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type ProgramImplementationType = 'generated' | 'reference';
export type ProgramId =
  | 'bodymakers-linear'
  | 'bodymakers-upper-lower'
  | 'bodymakers-ppl'
  | 'bodymakers-gzcl-style'
  | 'bodymakers-texas-style'
  | 'bodymakers-five-by-five'
  | 'smolov-jr'
  | 'bodymakers-full-body'
  | 'wendler-531-reference';

export interface ProgramDefinition {
  id: ProgramId;
  name: string;
  shortName: string;
  category: string;
  goals: readonly ProgramGoal[];
  tags: readonly ProgramTag[];
  experience: ProgramDifficulty;
  daysPerWeek: { min: number; max: number };
  durationWeeks: number;
  difficulty: ProgramDifficulty;
  summary: string;
  features: readonly string[];
  audience: string;
  weekExample: readonly string[];
  progression: string;
  warnings: readonly string[];
  sourceName?: string;
  sourceUrl?: string;
  implementationType: ProgramImplementationType;
  requiresPrimaryLift?: boolean;
  requiredLifts: readonly LiftId[];
}

const BODYMAKERS = 'Bodymakers独自構成';

export const PROGRAM_LIBRARY: readonly ProgramDefinition[] = [
  {
    id: 'bodymakers-linear', name: 'Bodymakers Linear Progression', shortName: 'LINEAR', category: BODYMAKERS,
    goals: ['strength'], tags: ['strength', 'beginner'], experience: 'beginner', daysPerWeek: { min: 3, max: 3 }, durationWeeks: 4, difficulty: 'beginner',
    summary: '同じ主種目を、フォームを保ちながら少しずつ進める4週間。', features: ['既存の線形進歩ロジックを使用', '2.5kg刻みの実用重量', '4週目は軽めに整える'],
    audience: '筋トレを始めたばかりで、まず主種目の練習を安定させたい人。', weekExample: ['Day 1 主種目を練習', 'Day 2 主種目を練習', 'Day 3 主種目を練習'],
    progression: '全セットをフォーム良く終えられたら、次回は小さく上げます。', warnings: ['痛みがある日は重量を上げず、フォームを優先してください。'], implementationType: 'generated', requiresPrimaryLift: true, requiredLifts: [],
  },
  {
    id: 'bodymakers-upper-lower', name: 'Bodymakers Upper / Lower', shortName: 'UPPER / LOWER', category: BODYMAKERS,
    goals: ['strength', 'hypertrophy'], tags: ['strength', 'hypertrophy'], experience: 'intermediate', daysPerWeek: { min: 4, max: 4 }, durationWeeks: 6, difficulty: 'intermediate',
    summary: '上半身と下半身を交互に行い、週4回へ分散する構成。', features: ['上半身・下半身を分けて回復を確保', 'BIG3の重量を自動計算', '筋力と筋量の両方を扱う'],
    audience: '週4回通えて、部位ごとのボリュームを増やしたい初心者〜中級者。', weekExample: ['Upper A', 'Lower A', 'Upper B', 'Lower B'],
    progression: '重い日と回数を積む日を分け、毎週フォームを崩さない範囲で進めます。', warnings: [], implementationType: 'generated', requiredLifts: ['bench', 'squat', 'deadlift'],
  },
  {
    id: 'bodymakers-ppl', name: 'Bodymakers PPL', shortName: 'PPL', category: BODYMAKERS,
    goals: ['hypertrophy'], tags: ['hypertrophy', 'high-frequency'], experience: 'intermediate', daysPerWeek: { min: 3, max: 6 }, durationWeeks: 6, difficulty: 'intermediate',
    summary: 'Push / Pull / Legsで部位を分け、頻度を上げやすくする構成。', features: ['3分割を週3〜6回へ拡張可能', '胸・背中・脚を整理', '主要リフトは2.5kg刻み'],
    audience: '筋肥大を中心に、週3回以上のトレーニングを続けられる人。', weekExample: ['Push', 'Pull', 'Legs'],
    progression: '各日の主種目を安定させ、補助種目は回数とフォームを優先します。', warnings: ['週5〜6回にする場合は睡眠・食事・疲労感を優先してください。'], implementationType: 'generated', requiredLifts: ['bench', 'squat', 'deadlift'],
  },
  {
    id: 'bodymakers-gzcl-style', name: 'GZCL方式を参考にした階層型プログラム', shortName: 'GZCL STYLE', category: BODYMAKERS,
    goals: ['strength', 'hypertrophy'], tags: ['strength', 'hypertrophy'], experience: 'intermediate', daysPerWeek: { min: 3, max: 4 }, durationWeeks: 6, difficulty: 'intermediate',
    summary: '高強度・中強度・補助種目を役割ごとに分けるBodymakers独自構成。', features: ['T1 / T2 / T3という階層思想を参考', '主種目の重量を自動計算', '補助種目はフォームと回数を重視'],
    audience: '主種目を重く扱いつつ、補助種目も計画的に行いたい中級者。', weekExample: ['T1 スクワット / T2 ベンチ', 'T1 ベンチ / T2 デッドリフト', 'T1 デッドリフト / T2 スクワット'],
    progression: 'T1は高重量、T2は中重量、T3は余力を残した補助として進めます。', warnings: ['GZCLの公式・有料テンプレートの複製ではありません。'], sourceName: 'GZCLの階層思想を参考にしたBodymakers独自構成', implementationType: 'generated', requiredLifts: ['bench', 'squat', 'deadlift'],
  },
  {
    id: 'bodymakers-texas-style', name: 'Texas方式を参考にした週単位進行', shortName: 'WEEKLY WAVE', category: BODYMAKERS,
    goals: ['strength'], tags: ['strength'], experience: 'intermediate', daysPerWeek: { min: 3, max: 3 }, durationWeeks: 6, difficulty: 'intermediate',
    summary: 'ボリューム・回復・強度の日を分けるBodymakers独自の週単位構成。', features: ['週内で負荷の役割を分離', '主種目を3日に分散', '高重量日は2.5kg刻み'],
    audience: '週3回で筋力を伸ばしたく、毎日同じ負荷では疲れやすい人。', weekExample: ['Volume', 'Recovery', 'Intensity'],
    progression: '回復日を軽く保ち、強度日に扱う重量の質を優先します。', warnings: ['Texas Methodの公式テンプレートの複製ではありません。'], sourceName: '週内でVolume / Recovery / Intensityを分ける考え方を参考', implementationType: 'generated', requiredLifts: ['bench', 'squat', 'deadlift'],
  },
  {
    id: 'bodymakers-five-by-five', name: 'Bodymakers 5×5 Progression', shortName: '5×5', category: BODYMAKERS,
    goals: ['strength'], tags: ['strength', 'beginner'], experience: 'beginner', daysPerWeek: { min: 3, max: 3 }, durationWeeks: 6, difficulty: 'beginner',
    summary: '主種目を5セット×5回で練習する、基礎づくり向けの構成。', features: ['スクワット・ベンチ・デッドを中心', '週3回で完結', '固定重量ではなく保存済み1RMから計算'],
    audience: '主種目の練習量をシンプルに積みたい初心者〜中級者。', weekExample: ['Squat / Bench / Row', 'Squat / Press / Deadlift', 'Squat / Bench / Row'],
    progression: '5×5を安定して終えられる重量を選び、急がずに進めます。', warnings: ['特定サービスの5×5テンプレートの複製ではありません。'], implementationType: 'generated', requiredLifts: ['bench', 'squat', 'deadlift'],
  },
  {
    id: 'smolov-jr', name: 'Smolov Jr.', shortName: 'SMOLOV JR.', category: '高頻度サイクル',
    goals: ['strength'], tags: ['strength', 'high-frequency'], experience: 'advanced', daysPerWeek: { min: 4, max: 4 }, durationWeeks: 4, difficulty: 'advanced',
    summary: '短期間で高頻度・高負荷を扱う、既存Smolov Jr.計算を使うサイクル。', features: ['既存Smolov Jr.ロジックを再利用', '全表示重量を2.5kg刻みに丸める', 'テスト週を含む'],
    audience: '1種目に絞り、回復管理をできる経験者。', weekExample: ['Day 1', 'Day 2', 'Day 3', 'Day 4'],
    progression: '週ごとの増加量と既存のテスト週ロジックに従います。', warnings: ['短期間で高い頻度と負荷を扱うため、初心者向けではありません。', '痛み・怪我がある場合は開始しないでください。'], sourceName: 'Smolov Jr.として広く知られる高頻度サイクルを既存計算で表示', implementationType: 'generated', requiresPrimaryLift: true, requiredLifts: [],
  },
  {
    id: 'bodymakers-full-body', name: 'Bodymakers Full Body', shortName: 'FULL BODY', category: BODYMAKERS,
    goals: ['strength', 'health'], tags: ['strength', 'beginner', 'short'], experience: 'beginner', daysPerWeek: { min: 2, max: 3 }, durationWeeks: 6, difficulty: 'beginner',
    summary: '全身の基本動作を週2〜3回へまとめる、忙しい人向けの構成。', features: ['Push / Pull / Legsを1回にまとめる', '週2回から開始できる', '健康目的でも使いやすい'],
    audience: '忙しい人、筋トレを再開する人、全身をバランス良く動かしたい人。', weekExample: ['Full Body A', 'Full Body B', 'Full Body C'],
    progression: '主種目は無理のない重量から始め、補助種目は回数を安定させます。', warnings: [], implementationType: 'generated', requiredLifts: ['bench', 'squat', 'deadlift'],
  },
  {
    id: 'wendler-531-reference', name: '5/3/1', shortName: '5/3/1', category: '紹介',
    goals: ['strength'], tags: ['strength'], experience: 'intermediate', daysPerWeek: { min: 3, max: 4 }, durationWeeks: 0, difficulty: 'intermediate',
    summary: 'Jim Wendlerによる有名な長期筋力プログラム。詳細な公式プログラムは原典を参照してください。', features: ['長期の筋力向上を目的とする紹介枠'],
    audience: '中級以上で、原典を確認しながら長期の筋力計画を組みたい人。', weekExample: ['公式の原典を参照'], progression: '今回、完全な生成機能は提供しません。', warnings: ['公式書籍・公式資料のテンプレートは転載していません。'], sourceName: 'Jim Wendlerによる5/3/1', implementationType: 'reference', requiredLifts: [],
  },
] as const;

export interface ProgramExercise {
  exerciseId: string;
  label: string;
  sets: number;
  reps: number;
  weightKg: number | null;
  percent: number | null;
  note?: string;
}

export interface ProgramSession {
  week: number;
  day: number;
  label: string;
  focus: string;
  exercises: ProgramExercise[];
}

export interface GeneratedLibraryProgram {
  definition: ProgramDefinition;
  primaryLift: LiftId;
  daysPerWeek: number;
  weeks: ProgramSession[];
}

export interface ActiveProgram {
  programId: ProgramId;
  startedAt: string;
  currentWeek: number;
  currentDay: number;
  trainingMaxes: Partial<Record<LiftId, number>>;
  daysPerWeek: number;
  durationWeeks: number;
  primaryLift: LiftId;
  completedSessions: number;
}

export interface ProgramRecommendation {
  definition: ProgramDefinition;
  score: number;
  reasons: string[];
}

const DIFFICULTY_ORDER: Record<ProgramDifficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const EXPERIENCE_ORDER: Record<TrainingExperience, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export function programById(id: string): ProgramDefinition | null {
  return PROGRAM_LIBRARY.find((program) => program.id === id) ?? null;
}

export function validateProgramDefinition(definition: ProgramDefinition): boolean {
  if (!definition.id || !definition.name || definition.daysPerWeek.min < 1 || definition.daysPerWeek.max < definition.daysPerWeek.min) return false;
  if (definition.implementationType === 'generated' && definition.durationWeeks < 1) return false;
  return definition.goals.length > 0 && definition.features.length > 0;
}

export function programRequiredLifts(definition: ProgramDefinition, primaryLift: LiftId): readonly LiftId[] {
  return definition.requiresPrimaryLift ? [primaryLift] : definition.requiredLifts;
}

function goalFromPersonalPlan(input: PersonalPlanInput): ProgramGoal {
  if (input.goal === 'strength') return 'strength';
  if (input.goal === 'muscle' || input.goal === 'recomp') return 'hypertrophy';
  return 'health';
}

function experienceFromPersonalPlan(input: PersonalPlanInput): TrainingExperience {
  if (input.training.experience === 'overThree') return 'advanced';
  if (input.training.experience === 'sixToTwelve' || input.training.experience === 'oneToThree') return 'intermediate';
  return 'beginner';
}

/** Personal Planの条件から、生成可能な上位3本を説明可能なルールで選ぶ。 */
export function recommendPrograms(input: PersonalPlanInput | null): ProgramRecommendation[] {
  const goal = input ? goalFromPersonalPlan(input) : 'strength';
  const experience = input ? experienceFromPersonalPlan(input) : 'beginner';
  const days = input?.training.daysPerWeek ?? 3;
  const hasPain = input?.lifestyle.painOrInjury ?? false;

  return PROGRAM_LIBRARY
    .filter((program) => program.implementationType === 'generated')
    .filter((program) => !(hasPain && program.id === 'smolov-jr'))
    .map((definition) => {
      let score = 0;
      const reasons: string[] = [];
      if (definition.goals.includes(goal)) { score += 5; reasons.push(goal === 'hypertrophy' ? '筋肥大が目的' : goal === 'strength' ? '筋力向上が目的' : '健康・習慣づくりが目的'); }
      if (days >= definition.daysPerWeek.min && days <= definition.daysPerWeek.max) { score += 4; reasons.push(`週${days}回のトレーニング頻度に合う`); }
      else score -= Math.min(3, Math.abs(days - Math.max(definition.daysPerWeek.min, Math.min(days, definition.daysPerWeek.max))));
      const gap = Math.abs(DIFFICULTY_ORDER[definition.experience] - EXPERIENCE_ORDER[experience]);
      score += gap === 0 ? 3 : gap === 1 ? 1 : -4;
      if (gap === 0) reasons.push(`${experience === 'beginner' ? '基礎づくり' : experience === 'intermediate' ? '中級者向け' : '高負荷を扱える経験者向け'}の難易度`);
      if (definition.id === 'smolov-jr' && experience !== 'advanced') score -= 8;
      return { definition, score, reasons: reasons.slice(0, 3) };
    })
    .sort((a, b) => b.score - a.score || a.definition.name.localeCompare(b.definition.name, 'ja'))
    .slice(0, 3);
}

function load(maxes: Partial<Record<LiftId, number>>, lift: LiftId, percent: number): number | null {
  const max = maxes[lift];
  if (!isFiniteNumber(max) || max <= 0) return null;
  return roundToIncrement(max * (percent / 100), 2.5);
}

function weighted(exerciseId: string, lift: LiftId, percent: number, sets: number, reps: number, maxes: Partial<Record<LiftId, number>>, note?: string): ProgramExercise {
  return { exerciseId, label: findExercise(exerciseId)?.name ?? exerciseId, sets, reps, weightKg: load(maxes, lift, percent), percent, note };
}
function accessory(exerciseId: string, sets: number, reps: number, note = 'フォームを保てる負荷で'): ProgramExercise {
  return { exerciseId, label: findExercise(exerciseId)?.name ?? exerciseId, sets, reps, weightKg: null, percent: null, note };
}
function makeWeeks(daysPerWeek: number, durationWeeks: number, templates: readonly Omit<ProgramSession, 'week' | 'day'>[]): ProgramSession[] {
  const result: ProgramSession[] = [];
  for (let week = 1; week <= durationWeeks; week += 1) {
    for (let day = 1; day <= daysPerWeek; day += 1) {
      const template = templates[(day - 1) % templates.length]!;
      result.push({ ...template, week, day, exercises: template.exercises.map((exercise) => ({ ...exercise })) });
    }
  }
  return result;
}

export function generateLibraryProgram(
  programId: ProgramId,
  trainingMaxes: Partial<Record<LiftId, number>>,
  primaryLift: LiftId = 'bench',
  requestedDays?: number,
): GeneratedLibraryProgram | null {
  const definition = programById(programId);
  if (definition == null || definition.implementationType !== 'generated') return null;
  const daysPerWeek = Math.max(definition.daysPerWeek.min, Math.min(definition.daysPerWeek.max, requestedDays ?? definition.daysPerWeek.min));
  const required = programRequiredLifts(definition, primaryLift);
  if (required.some((lift) => !isFiniteNumber(trainingMaxes[lift]) || (trainingMaxes[lift] ?? 0) <= 0)) return null;

  if (programId === 'bodymakers-linear') {
    const built = buildTrainingProgram({ exercise: primaryLift === 'bench' ? 'ベンチプレス' : primaryLift === 'squat' ? 'スクワット' : 'デッドリフト', oneRmKg: trainingMaxes[primaryLift]!, experience: 'beginner', daysPerWeek: 3, goal: 'strength' });
    if (built == null) return null;
    return { definition, primaryLift, daysPerWeek: 3, weeks: built.sessions.map((session) => ({ week: session.week, day: session.day, label: `Linear Day ${session.day}`, focus: session.label, exercises: [{ exerciseId: primaryLift === 'bench' ? 'bench-press' : primaryLift, label: primaryLift === 'bench' ? 'ベンチプレス' : primaryLift === 'squat' ? 'スクワット' : 'デッドリフト', sets: session.sets, reps: session.reps, weightKg: session.weightKg, percent: session.percent, note: session.note }] })) };
  }
  if (programId === 'smolov-jr') {
    const smolov = buildSmolov(trainingMaxes[primaryLift]!, 'jr');
    if (smolov == null) return null;
    return { definition, primaryLift, daysPerWeek: 4, weeks: smolov.weeks.flatMap((week) => week.days.map((day, index) => ({ week: week.week, day: index + 1, label: week.isTestWeek ? '1RMテスト' : day.label, focus: week.note, exercises: [{ exerciseId: primaryLift === 'bench' ? 'bench-press' : primaryLift, label: primaryLift === 'bench' ? 'ベンチプレス' : primaryLift === 'squat' ? 'スクワット' : 'デッドリフト', sets: day.sets, reps: day.reps, weightKg: day.weight, percent: day.percent, note: week.isTestWeek ? '無理な更新はせず、状態を優先' : `${day.percent}%` }] }))) };
  }

  const sessions = programId === 'bodymakers-upper-lower' ? makeWeeks(daysPerWeek, definition.durationWeeks, [
    { label: 'Upper A', focus: '胸・背中を中心に', exercises: [weighted('bench-press', 'bench', 72.5, 4, 6, trainingMaxes), accessory('bent-over-row', 4, 8), accessory('side-raise', 3, 12)] },
    { label: 'Lower A', focus: '脚を中心に', exercises: [weighted('squat', 'squat', 72.5, 4, 6, trainingMaxes), weighted('deadlift', 'deadlift', 65, 3, 5, trainingMaxes), accessory('leg-curl', 3, 10)] },
    { label: 'Upper B', focus: '上半身の回数を積む', exercises: [weighted('bench-press', 'bench', 65, 4, 8, trainingMaxes), accessory('lat-pulldown', 4, 10), accessory('triceps-extension', 3, 12)] },
    { label: 'Lower B', focus: '脚と臀部を整える', exercises: [weighted('squat', 'squat', 65, 4, 8, trainingMaxes), accessory('leg-press', 3, 10), accessory('plank', 3, 30, '30秒') ] },
  ]) : programId === 'bodymakers-ppl' ? makeWeeks(daysPerWeek, definition.durationWeeks, [
    { label: 'Push', focus: '胸・肩・上腕三頭筋', exercises: [weighted('bench-press', 'bench', 70, 4, 6, trainingMaxes), accessory('dumbbell-press', 3, 10), accessory('side-raise', 3, 12)] },
    { label: 'Pull', focus: '背中・上腕二頭筋', exercises: [weighted('deadlift', 'deadlift', 70, 3, 5, trainingMaxes), accessory('lat-pulldown', 4, 8), accessory('dumbbell-curl', 3, 12)] },
    { label: 'Legs', focus: '脚・臀部', exercises: [weighted('squat', 'squat', 72.5, 4, 6, trainingMaxes), accessory('romanian-deadlift', 3, 8), accessory('leg-curl', 3, 12)] },
  ]) : programId === 'bodymakers-gzcl-style' ? makeWeeks(daysPerWeek, definition.durationWeeks, [
    { label: 'T1 Squat / T2 Bench', focus: '高強度の脚・中強度の胸', exercises: [weighted('squat', 'squat', 82.5, 4, 3, trainingMaxes, 'T1'), weighted('bench-press', 'bench', 70, 3, 8, trainingMaxes, 'T2'), accessory('lat-pulldown', 3, 12, 'T3')] },
    { label: 'T1 Bench / T2 Deadlift', focus: '高強度の胸・中強度の背面', exercises: [weighted('bench-press', 'bench', 82.5, 4, 3, trainingMaxes, 'T1'), weighted('deadlift', 'deadlift', 65, 3, 6, trainingMaxes, 'T2'), accessory('dumbbell-row', 3, 12, 'T3')] },
    { label: 'T1 Deadlift / T2 Squat', focus: '高強度の背面・中強度の脚', exercises: [weighted('deadlift', 'deadlift', 82.5, 3, 3, trainingMaxes, 'T1'), weighted('squat', 'squat', 65, 3, 8, trainingMaxes, 'T2'), accessory('side-raise', 3, 12, 'T3')] },
  ]) : programId === 'bodymakers-texas-style' ? makeWeeks(3, definition.durationWeeks, [
    { label: 'Volume', focus: '練習量を積む日', exercises: [weighted('squat', 'squat', 75, 5, 5, trainingMaxes), weighted('bench-press', 'bench', 75, 5, 5, trainingMaxes), accessory('bent-over-row', 3, 8)] },
    { label: 'Recovery', focus: '回復を優先する日', exercises: [weighted('squat', 'squat', 60, 3, 5, trainingMaxes), accessory('overhead-press', 3, 8), accessory('lat-pulldown', 3, 10)] },
    { label: 'Intensity', focus: '質の高い高重量日', exercises: [weighted('squat', 'squat', 87.5, 1, 5, trainingMaxes), weighted('bench-press', 'bench', 87.5, 1, 5, trainingMaxes), weighted('deadlift', 'deadlift', 85, 1, 5, trainingMaxes)] },
  ]) : programId === 'bodymakers-five-by-five' ? makeWeeks(3, definition.durationWeeks, [
    { label: '5×5 A', focus: 'スクワット・ベンチ・ロー', exercises: [weighted('squat', 'squat', 70, 5, 5, trainingMaxes), weighted('bench-press', 'bench', 70, 5, 5, trainingMaxes), accessory('bent-over-row', 5, 5)] },
    { label: '5×5 B', focus: 'スクワット・プレス・デッド', exercises: [weighted('squat', 'squat', 70, 5, 5, trainingMaxes), accessory('overhead-press', 5, 5), weighted('deadlift', 'deadlift', 75, 1, 5, trainingMaxes)] },
  ]) : makeWeeks(daysPerWeek, definition.durationWeeks, [
    { label: 'Full Body A', focus: '脚・胸・背中', exercises: [weighted('squat', 'squat', 65, 3, 8, trainingMaxes), weighted('bench-press', 'bench', 65, 3, 8, trainingMaxes), accessory('lat-pulldown', 3, 10)] },
    { label: 'Full Body B', focus: '背面・肩・体幹', exercises: [weighted('deadlift', 'deadlift', 65, 3, 5, trainingMaxes), accessory('overhead-press', 3, 8), accessory('plank', 3, 30, '30秒')] },
    { label: 'Full Body C', focus: '全身を軽めに動かす', exercises: [weighted('squat', 'squat', 60, 3, 10, trainingMaxes), accessory('dumbbell-press', 3, 10), accessory('dumbbell-row', 3, 10)] },
  ]);
  return { definition, primaryLift, daysPerWeek, weeks: sessions };
}

export function sessionForActiveProgram(active: ActiveProgram): ProgramSession | null {
  return generateLibraryProgram(active.programId, active.trainingMaxes, active.primaryLift, active.daysPerWeek)
    ?.weeks.find((session) => session.week === active.currentWeek && session.day === active.currentDay) ?? null;
}
