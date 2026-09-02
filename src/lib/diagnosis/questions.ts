/**
 * 診断の質問表。
 *
 * 画面は1問ずつ出す。どの質問を、どの順で、どんな条件で出すかは
 * すべてここに置き、画面側はこの表をそのまま描くだけにする。
 *
 * こうしておくと「何問あるか」「今どこか」「次はどこか」「途中の声かけを出すか」を
 * 画面を動かさずに確かめられる。
 *
 * 保存する値は既存の PersonalPlanInput のまま。質問の並べ方を変えても
 * bodymakers:data:v1 と bodymakers:diagnosis:draft:v1 の形式は変わらない。
 */

import type { LiftId } from '../strength/standards';
import type { PersonalPlanInput } from './types';

export type QuestionSection = 'goal' | 'body' | 'training' | 'strength' | 'food' | 'lifestyle';

/** 結果画面を指すときの値。質問IDと同じ場所に入れて扱う。 */
export const RESULT_STEP = 'result';

export interface ChoiceOption {
  value: string;
  label: string;
  detail?: string;
  icon?: string;
}

export interface NumberFieldSpec {
  id: string;
  label: string;
  unit: string;
  placeholder: string;
  inputMode?: 'numeric' | 'decimal';
  get: (input: PersonalPlanInput) => string;
  set: (input: PersonalPlanInput, raw: string) => PersonalPlanInput;
}

interface QuestionBase {
  id: string;
  section: QuestionSection;
  /** 上に出す英字ラベル。区切りが変わったことを伝える。 */
  kicker: string;
  title: string;
  lead?: string;
  /** 表示条件。省略した質問は常に出す。 */
  visible?: (input: PersonalPlanInput) => boolean;
}

export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice';
  columns: 1 | 2;
  options: readonly ChoiceOption[];
  get: (input: PersonalPlanInput) => string;
  set: (input: PersonalPlanInput, value: string) => PersonalPlanInput;
}

export interface NumberQuestion extends QuestionBase {
  kind: 'number';
  fields: readonly NumberFieldSpec[];
  hint?: string;
  /** 未入力でも次へ進めるか。 */
  optional?: boolean;
  /** 入力が範囲内かどうか。false の間は次へ進めない。 */
  ready?: (input: PersonalPlanInput) => boolean;
  errorText?: string;
}

/** BIG3の3項目をまとめて聞く画面。現在の筋力と目標で同じ形を使う。 */
export interface LiftsQuestion extends QuestionBase {
  kind: 'lifts';
  target: 'strength' | 'targets';
  hint?: string;
}

export type Question = ChoiceQuestion | NumberQuestion | LiftsQuestion;

/**
 * 選択式は答えた瞬間に次へ送る。
 * ただし数値入力・任意入力・安全に関わる確認は、本人が「次へ」を押すまで止める。
 */
export function autoAdvances(question: Question): boolean {
  return question.kind === 'choice' && question.id !== 'painOrInjury';
}

const LIFT_IDS: readonly LiftId[] = ['bench', 'squat', 'deadlift'];

export const LIFT_LABELS: Readonly<Record<LiftId, string>> = {
  bench: 'ベンチプレス',
  squat: 'スクワット',
  deadlift: 'デッドリフト',
};

function parseField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(/[^\d.-]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function numberText(value: number | null | undefined): string {
  return value == null || value === 0 ? '' : String(value);
}

function bodyField(
  key: 'age' | 'heightCm' | 'weightKg',
  label: string,
  unit: string,
  placeholder: string,
  inputMode: 'numeric' | 'decimal',
): NumberFieldSpec {
  return {
    id: key,
    label,
    unit,
    placeholder,
    inputMode,
    get: (input) => numberText(input.body[key]),
    set: (input, raw) => ({ ...input, body: { ...input.body, [key]: parseField(raw) ?? 0 } }),
  };
}

const inBodyRange = (input: PersonalPlanInput) =>
  input.body.age >= 13 && input.body.age <= 120
  && input.body.heightCm >= 100 && input.body.heightCm <= 250
  && input.body.weightKg >= 30 && input.body.weightKg <= 300;

/**
 * 質問の並び。目的 → 身体 → トレーニング → 筋力 → 食事 → 生活の順で、
 * 答えやすいものから聞く。
 */
export const DIAGNOSIS_QUESTIONS: readonly Question[] = [
  {
    id: 'goal',
    section: 'goal',
    kicker: 'GOAL',
    title: 'どんな身体になりたい？',
    lead: 'いちばん近いものを1つ。あとから変えられます。',
    kind: 'choice',
    columns: 1,
    options: [
      { value: 'muscle', icon: '↗', label: '筋肉を増やしたい', detail: '身体を大きくしたい' },
      { value: 'fat-loss', icon: '◒', label: '体脂肪を落としたい', detail: '引き締めたい' },
      { value: 'recomp', icon: '◐', label: '筋肉を残して絞りたい', detail: '見た目を良くしたい' },
      { value: 'strength', icon: '▰', label: '力を強くしたい', detail: 'BIG3を伸ばしたい' },
      { value: 'health', icon: '◎', label: '健康的な身体にしたい', detail: '運動と食事を整えたい' },
    ],
    get: (input) => input.goal,
    set: (input, value) => ({ ...input, goal: value as PersonalPlanInput['goal'] }),
  },
  {
    id: 'targetWeight',
    section: 'goal',
    kicker: 'GOAL',
    title: '目標の体重は？',
    lead: '決まっていなければ空のままで大丈夫です。',
    visible: (input) => input.goal === 'muscle' || input.goal === 'fat-loss' || input.goal === 'recomp',
    kind: 'number',
    optional: true,
    fields: [{
      id: 'targetWeight',
      label: '目標体重',
      unit: 'kg',
      placeholder: '70',
      inputMode: 'decimal',
      get: (input) => numberText(input.targets.weightKg),
      set: (input, raw) => ({ ...input, targets: { ...input.targets, weightKg: parseField(raw) } }),
    }],
  },
  {
    id: 'targetLifts',
    section: 'goal',
    kicker: 'GOAL',
    title: '目標のBIG3は？',
    lead: '決まっている種目だけで大丈夫です。',
    visible: (input) => input.goal === 'strength',
    kind: 'lifts',
    target: 'targets',
    hint: '空欄の種目は目標なしとして扱います。',
  },
  {
    id: 'sex',
    section: 'body',
    kicker: 'BODY',
    title: '性別は？',
    lead: '必要な栄養量の目安を出すために使います。',
    kind: 'choice',
    columns: 2,
    options: [{ value: 'male', label: '男性' }, { value: 'female', label: '女性' }],
    get: (input) => input.body.sex,
    set: (input, value) => ({ ...input, body: { ...input.body, sex: value as PersonalPlanInput['body']['sex'] } }),
  },
  {
    id: 'age',
    section: 'body',
    kicker: 'BODY',
    title: '年齢は？',
    kind: 'number',
    fields: [bodyField('age', '年齢', '歳', '30', 'numeric')],
    ready: (input) => input.body.age >= 13 && input.body.age <= 120,
    errorText: '13〜120歳の範囲で入力してください。',
  },
  {
    id: 'bodySize',
    section: 'body',
    kicker: 'BODY',
    title: '身長と体重は？',
    lead: '今のおおよその値で大丈夫です。',
    kind: 'number',
    fields: [
      bodyField('heightCm', '身長', 'cm', '170', 'decimal'),
      bodyField('weightKg', '体重', 'kg', '70', 'decimal'),
    ],
    ready: inBodyRange,
    errorText: '身長100〜250cm、体重30〜300kgの範囲で入力してください。',
  },
  {
    id: 'bodyFat',
    section: 'body',
    kicker: 'BODY',
    title: '体脂肪率は分かる？',
    lead: '分からなければ空のままで大丈夫です。',
    kind: 'number',
    optional: true,
    fields: [{
      id: 'bodyFatPercent',
      label: '体脂肪率',
      unit: '%',
      placeholder: '20',
      inputMode: 'decimal',
      get: (input) => numberText(input.body.bodyFatPercent),
      set: (input, raw) => ({ ...input, body: { ...input.body, bodyFatPercent: parseField(raw) } }),
    }],
  },
  {
    id: 'experience',
    section: 'training',
    kicker: 'TRAINING',
    title: '筋トレはどのくらい続けている？',
    kind: 'choice',
    columns: 2,
    options: [
      { value: 'none', label: 'はじめて' },
      { value: 'under3', label: '3ヶ月未満' },
      { value: 'threeToSix', label: '3〜6ヶ月' },
      { value: 'sixToTwelve', label: '6〜12ヶ月' },
      { value: 'oneToThree', label: '1〜3年' },
      { value: 'overThree', label: '3年以上' },
    ],
    get: (input) => input.training.experience,
    set: (input, value) => ({ ...input, training: { ...input.training, experience: value as PersonalPlanInput['training']['experience'] } }),
  },
  {
    id: 'daysPerWeek',
    section: 'training',
    kicker: 'TRAINING',
    title: '週に何日できそう？',
    lead: '理想ではなく、続けられる日数を選んでください。',
    kind: 'choice',
    columns: 2,
    options: [
      { value: '1', label: '週1日' },
      { value: '2', label: '週2日' },
      { value: '3', label: '週3日' },
      { value: '4', label: '週4日' },
      { value: '5', label: '週5日以上' },
    ],
    get: (input) => String(input.training.daysPerWeek),
    set: (input, value) => ({ ...input, training: { ...input.training, daysPerWeek: Number(value) as PersonalPlanInput['training']['daysPerWeek'] } }),
  },
  {
    id: 'sessionMinutes',
    section: 'training',
    kicker: 'TRAINING',
    title: '1回にかけられる時間は？',
    kind: 'choice',
    columns: 2,
    options: [
      { value: '30', label: '30分' },
      { value: '45', label: '45分' },
      { value: '60', label: '60分' },
      { value: '90', label: '90分以上' },
    ],
    get: (input) => String(input.training.sessionMinutes),
    set: (input, value) => ({ ...input, training: { ...input.training, sessionMinutes: Number(value) as PersonalPlanInput['training']['sessionMinutes'] } }),
  },
  {
    id: 'location',
    section: 'training',
    kicker: 'TRAINING',
    title: 'どこでやる？',
    kind: 'choice',
    columns: 1,
    options: [
      { value: 'gym', icon: '▤', label: 'ジム', detail: 'バーベル・マシンが使える' },
      { value: 'home', icon: '⌂', label: '自宅', detail: '自重・ダンベル中心' },
      { value: 'both', icon: '◇', label: '両方', detail: '日によって変える' },
    ],
    get: (input) => input.training.location,
    set: (input, value) => ({ ...input, training: { ...input.training, location: value as PersonalPlanInput['training']['location'] } }),
  },
  {
    id: 'focus',
    section: 'training',
    kicker: 'TRAINING',
    title: 'トレーニングで重視したいのは？',
    kind: 'choice',
    columns: 2,
    options: [
      { value: 'hypertrophy', label: '身体を大きく' },
      { value: 'strength', label: '重量を伸ばす' },
      { value: 'both', label: '両方' },
      { value: 'health', label: '健康・体力' },
    ],
    get: (input) => input.training.focus,
    set: (input, value) => ({ ...input, training: { ...input.training, focus: value as PersonalPlanInput['training']['focus'] } }),
  },
  {
    id: 'strength',
    section: 'strength',
    kicker: 'STRENGTH',
    title: '今の重量が分かる種目はある？',
    lead: '分かる種目だけで大丈夫です。入力のない種目は推測しません。',
    kind: 'lifts',
    target: 'strength',
    hint: '重量と回数からの計算もできます。',
  },
  {
    id: 'mealsPerDay',
    section: 'food',
    kicker: 'FOOD',
    title: '1日に何回食べる？',
    kind: 'choice',
    columns: 1,
    options: [
      { value: '1', label: '1〜2回' },
      { value: '3', label: '3回' },
      { value: '4', label: '4回以上' },
    ],
    get: (input) => String(input.food.mealsPerDay),
    set: (input, value) => ({ ...input, food: { ...input.food, mealsPerDay: Number(value) as PersonalPlanInput['food']['mealsPerDay'] } }),
  },
  {
    id: 'breakfast',
    section: 'food',
    kicker: 'FOOD',
    title: '朝ごはんは食べる？',
    kind: 'choice',
    columns: 1,
    options: [
      { value: 'daily', label: '毎日食べる' },
      { value: 'sometimes', label: '時々' },
      { value: 'rarely', label: 'ほぼ食べない' },
    ],
    get: (input) => input.food.breakfast,
    set: (input, value) => ({ ...input, food: { ...input.food, breakfast: value as PersonalPlanInput['food']['breakfast'] } }),
  },
  {
    id: 'protein',
    section: 'food',
    kicker: 'FOOD',
    title: '肉・魚・卵・豆はどのくらい？',
    lead: 'たんぱく質をとれているかの目安にします。',
    kind: 'choice',
    columns: 1,
    options: [
      { value: 'everyMeal', label: '毎食入っている' },
      { value: 'oneToTwo', label: '1日1〜2食' },
      { value: 'rarely', label: 'あまり食べない' },
      { value: 'unknown', label: '分からない' },
    ],
    get: (input) => input.food.protein,
    set: (input, value) => ({ ...input, food: { ...input.food, protein: value as PersonalPlanInput['food']['protein'] } }),
  },
  {
    id: 'vegetables',
    section: 'food',
    kicker: 'FOOD',
    title: '野菜・果物はどのくらい？',
    kind: 'choice',
    columns: 1,
    options: [
      { value: 'high', label: 'よく食べる' },
      { value: 'normal', label: '普通' },
      { value: 'low', label: '少ない' },
    ],
    get: (input) => input.food.vegetables,
    set: (input, value) => ({ ...input, food: { ...input.food, vegetables: value as PersonalPlanInput['food']['vegetables'] } }),
  },
  {
    id: 'outsideMeals',
    section: 'food',
    kicker: 'FOOD',
    title: '外食・コンビニはどのくらい？',
    kind: 'choice',
    columns: 2,
    options: [
      { value: 'daily', label: 'ほぼ毎日' },
      { value: 'threeToFour', label: '週3〜4回' },
      { value: 'oneToTwo', label: '週1〜2回' },
      { value: 'rarely', label: 'ほとんどない' },
    ],
    get: (input) => input.food.outsideMeals,
    set: (input, value) => ({ ...input, food: { ...input.food, outsideMeals: value as PersonalPlanInput['food']['outsideMeals'] } }),
  },
  {
    id: 'amount',
    section: 'food',
    kicker: 'FOOD',
    title: '食べる量は多いほう？',
    kind: 'choice',
    columns: 2,
    options: [
      { value: 'veryLow', label: 'かなり少ない' },
      { value: 'low', label: '少なめ' },
      { value: 'normal', label: '普通' },
      { value: 'high', label: '多め' },
      { value: 'veryHigh', label: 'かなり多い' },
      { value: 'unknown', label: '分からない' },
    ],
    get: (input) => input.food.amount,
    set: (input, value) => ({ ...input, food: { ...input.food, amount: value as PersonalPlanInput['food']['amount'] } }),
  },
  {
    id: 'sleepDuration',
    section: 'lifestyle',
    kicker: 'LIFE',
    title: '睡眠時間はどのくらい？',
    kind: 'choice',
    columns: 2,
    options: [
      { value: 'under5', label: '5時間未満' },
      { value: 'fiveToSix', label: '5〜6時間' },
      { value: 'sixToSeven', label: '6〜7時間' },
      { value: 'sevenToEight', label: '7〜8時間' },
      { value: 'overEight', label: '8時間以上' },
    ],
    get: (input) => input.lifestyle.sleepDuration,
    set: (input, value) => ({ ...input, lifestyle: { ...input.lifestyle, sleepDuration: value as PersonalPlanInput['lifestyle']['sleepDuration'] } }),
  },
  {
    id: 'sleepQuality',
    section: 'lifestyle',
    kicker: 'LIFE',
    title: '寝起きはすっきりする？',
    kind: 'choice',
    columns: 1,
    options: [
      { value: 'good', label: 'すっきりしている' },
      { value: 'normal', label: '普通' },
      { value: 'poor', label: '疲れが残る' },
    ],
    get: (input) => input.lifestyle.sleepQuality,
    set: (input, value) => ({ ...input, lifestyle: { ...input.lifestyle, sleepQuality: value as PersonalPlanInput['lifestyle']['sleepQuality'] } }),
  },
  {
    id: 'dailyActivity',
    section: 'lifestyle',
    kicker: 'LIFE',
    title: 'ふだんどのくらい動く？',
    lead: 'トレーニング以外の1日の動きです。',
    kind: 'choice',
    columns: 1,
    options: [
      { value: 'desk', label: 'ほぼ座っている' },
      { value: 'someWalk', label: '少し歩く' },
      { value: 'walk', label: 'よく歩く' },
      { value: 'active', label: '立ち仕事・力仕事' },
    ],
    get: (input) => input.lifestyle.dailyActivity,
    set: (input, value) => ({ ...input, lifestyle: { ...input.lifestyle, dailyActivity: value as PersonalPlanInput['lifestyle']['dailyActivity'] } }),
  },
  {
    id: 'alcohol',
    section: 'lifestyle',
    kicker: 'LIFE',
    title: 'お酒はどのくらい？',
    kind: 'choice',
    columns: 2,
    options: [
      { value: 'none', label: '飲まない' },
      { value: 'oneToTwo', label: '週1〜2回' },
      { value: 'threeToFour', label: '週3〜4回' },
      { value: 'daily', label: 'ほぼ毎日' },
    ],
    get: (input) => input.lifestyle.alcohol,
    set: (input, value) => ({ ...input, lifestyle: { ...input.lifestyle, alcohol: value as PersonalPlanInput['lifestyle']['alcohol'] } }),
  },
  {
    id: 'smoking',
    section: 'lifestyle',
    kicker: 'LIFE',
    title: 'たばこは吸う？',
    kind: 'choice',
    columns: 2,
    options: [{ value: 'no', label: '吸わない' }, { value: 'yes', label: '吸う' }],
    get: (input) => (input.lifestyle.smoking ? 'yes' : 'no'),
    set: (input, value) => ({ ...input, lifestyle: { ...input.lifestyle, smoking: value === 'yes' } }),
  },
  {
    id: 'stress',
    section: 'lifestyle',
    kicker: 'LIFE',
    title: '最近のストレスは？',
    kind: 'choice',
    columns: 1,
    options: [
      { value: 'low', label: '落ち着いている' },
      { value: 'normal', label: '普通' },
      { value: 'high', label: '高い' },
    ],
    get: (input) => input.lifestyle.stress,
    set: (input, value) => ({ ...input, lifestyle: { ...input.lifestyle, stress: value as PersonalPlanInput['lifestyle']['stress'] } }),
  },
  {
    id: 'painOrInjury',
    section: 'lifestyle',
    kicker: 'LIFE',
    title: '今、痛みや怪我はある？',
    lead: 'ある場合は負荷を抑えた組み方にします。ここでは医療的な判断はしません。',
    kind: 'choice',
    columns: 2,
    options: [{ value: 'no', label: 'ない' }, { value: 'yes', label: 'ある' }],
    get: (input) => (input.lifestyle.painOrInjury ? 'yes' : 'no'),
    set: (input, value) => ({ ...input, lifestyle: { ...input.lifestyle, painOrInjury: value === 'yes' } }),
  },
];

/** 今の回答で実際に出す質問だけを返す。目的によって出ない質問がある。 */
export function visibleQuestions(input: PersonalPlanInput): Question[] {
  return DIAGNOSIS_QUESTIONS.filter((question) => question.visible?.(input) ?? true);
}

export function findQuestion(id: string): Question | null {
  return DIAGNOSIS_QUESTIONS.find((question) => question.id === id) ?? null;
}

export interface QuestionProgress {
  /** 1始まりの現在位置。 */
  position: number;
  total: number;
  /** 0〜100。進捗バーの幅に使う。 */
  percent: number;
}

/**
 * 進捗は、いま出す予定の質問数から毎回数え直す。
 * 目的を選び直して質問が増減しても、表示がずれない。
 */
export function questionProgress(input: PersonalPlanInput, questionId: string): QuestionProgress {
  const questions = visibleQuestions(input);
  const total = questions.length;
  if (questionId === RESULT_STEP) return { position: total, total, percent: 100 };
  const index = questions.findIndex((question) => question.id === questionId);
  const position = index < 0 ? 1 : index + 1;
  return { position, total, percent: total === 0 ? 0 : Math.round((position / total) * 100) };
}

/** 次の質問。最後まで来ていれば結果画面を指す。 */
export function nextQuestionId(input: PersonalPlanInput, questionId: string): string {
  const questions = visibleQuestions(input);
  const index = questions.findIndex((question) => question.id === questionId);
  if (index < 0) return questions[0]?.id ?? RESULT_STEP;
  return questions[index + 1]?.id ?? RESULT_STEP;
}

/** 前の質問。最初の質問なら null を返し、これ以上戻さない。 */
export function previousQuestionId(input: PersonalPlanInput, questionId: string): string | null {
  const questions = visibleQuestions(input);
  if (questionId === RESULT_STEP) return questions.at(-1)?.id ?? null;
  const index = questions.findIndex((question) => question.id === questionId);
  if (index <= 0) return null;
  return questions[index - 1]?.id ?? null;
}

/**
 * 保存してあった位置を、いまの質問表に合わせ直す。
 * 目的が変わって消えた質問や、知らないIDが入っていても最初へ戻すだけで済ませる。
 */
export function resolveQuestionId(input: PersonalPlanInput, candidate: string | null | undefined): string {
  const questions = visibleQuestions(input);
  const fallback = questions[0]?.id ?? RESULT_STEP;
  if (candidate == null || candidate === '') return fallback;
  if (candidate === RESULT_STEP) return RESULT_STEP;
  return questions.some((question) => question.id === candidate) ? candidate : fallback;
}

/**
 * 旧形式の下書き（章ごとの番号）から、今の質問IDへ移す。
 * 途中まで答えていた人の位置をできるだけ保つための対応。
 */
const LEGACY_STEP_SECTIONS: readonly QuestionSection[] = ['goal', 'body', 'training', 'strength', 'food', 'lifestyle'];

export function questionIdFromLegacyStep(input: PersonalPlanInput, step: number): string {
  if (!Number.isInteger(step) || step < 0) return resolveQuestionId(input, null);
  if (step >= LEGACY_STEP_SECTIONS.length) return RESULT_STEP;
  const section = LEGACY_STEP_SECTIONS[step];
  const questions = visibleQuestions(input);
  return questions.find((question) => question.section === section)?.id ?? resolveQuestionId(input, null);
}

export interface Interstitial {
  id: string;
  kicker: string;
  title: string;
  /** 本文。回答から安全に言えることだけを書く。 */
  lines: string[];
}

const INTERSTITIAL_MARKS = [0.25, 0.5, 0.75] as const;

function trainingLine(input: PersonalPlanInput): string {
  const days = input.training.daysPerWeek;
  if (days <= 2) return `週${days}日なら、1回で全身をまとめる組み方が続けやすくなります。`;
  if (days >= 4) return `週${days}日なら、部位を分けて回復の時間をとる組み方にできます。`;
  return `週${days}日は、続けやすさと伸びやすさのバランスが取りやすい頻度です。`;
}

function goalLine(input: PersonalPlanInput): string {
  switch (input.goal) {
    case 'muscle': return '筋肉を増やす方向で、食事量とトレーニング量の組み立てを見ています。';
    case 'fat-loss': return '体脂肪を落とす方向で、続けられる範囲の食事量を見ています。';
    case 'recomp': return '筋肉を残して絞る方向で、たんぱく質と負荷の兼ね合いを見ています。';
    case 'strength': return '重量を伸ばす方向で、BIG3の組み立てを見ています。';
    default: return '運動と食事の習慣を整える方向で組み立てています。';
  }
}

/**
 * 質問に答えた直後に、短い声かけを挟むかどうか。
 *
 * だいたい4分の1・半分・4分の3の地点で1回ずつ。
 * ここではまだ結果を言い切らず、「何を見ているか」だけを伝える。
 */
export function interstitialAfter(input: PersonalPlanInput, questionId: string): Interstitial | null {
  const questions = visibleQuestions(input);
  const total = questions.length;
  if (total < 8) return null;
  const index = questions.findIndex((question) => question.id === questionId);
  if (index < 0) return null;
  const answered = index + 1;
  // 最後の質問の直後は結果画面に進むので、声かけは挟まない。
  if (answered >= total) return null;

  const markIndex = INTERSTITIAL_MARKS.findIndex((mark) => Math.round(total * mark) === answered);
  if (markIndex < 0) return null;

  const remaining = total - answered;
  if (markIndex === 0) {
    return {
      id: 'quarter',
      kicker: 'ANALYZING',
      title: '基礎データを読み込んでいます',
      lines: ['身体の情報を受け取りました。', `残り${remaining}問です。`],
    };
  }
  if (markIndex === 1) {
    return {
      id: 'half',
      kicker: 'TRAINING',
      title: 'トレーニングの輪郭が見えてきました',
      lines: [trainingLine(input), `ここから食事と生活の質問です。残り${remaining}問。`],
    };
  }
  return {
    id: 'three-quarters',
    kicker: 'ALMOST',
    title: 'あと少しでプランが揃います',
    lines: [goalLine(input), `残り${remaining}問です。`],
  };
}

export { LIFT_IDS };
