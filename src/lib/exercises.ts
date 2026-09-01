/**
 * 筋トレ種目の一覧と、その種目が使う筋肉。
 *
 * 【なぜ必要か】
 * これまで「今日の記録」で選べたのは『胸』『背中』のような部位だけで、
 * 何をやったのかを残せなかった。ベンチプレスもダンベルフライも
 * 「胸」の一語になってしまう。
 *
 * 【この表に入れてよいもの・いけないもの】
 * 入れるのは「その種目がどの筋肉を使うか」だけ。これは解剖の話なので
 * 出典を確認できる。
 *
 * 入れないのは消費カロリーと難易度。種目ごとのメッツ値は
 * 厚生労働省のメッツ表にも Compendium にも個別には載っていない
 * （筋トレはまとめて3.5／6.0などで扱われている）。
 * 種目別の消費カロリーを出すには推測がいるので、出さない。
 * 消費カロリーは従来どおりメッツ表の「筋力トレーニング」で計算する。
 */

/**
 * 部位。
 *
 * 以前は6つ（胸・背中・肩・腕・脚・体幹）だったが、
 * 「腕」では二頭と三頭が区別できず、「脚」では前と後ろが区別できない。
 * 分割して組む人にとっては、ここが分かれていないと記録の意味がない。
 */
export const MUSCLES = [
  '胸',
  '背中',
  '肩',
  '上腕二頭筋',
  '上腕三頭筋',
  '大腿四頭筋',
  'ハムストリング',
  '臀部',
  'ふくらはぎ',
  '体幹',
  '前腕',
] as const;

export type Muscle = (typeof MUSCLES)[number];

/** 使う道具。ジムか家かで選べる種目が変わるため。 */
export type Equipment = 'バーベル' | 'ダンベル' | 'マシン' | '自重' | 'ケーブル';

export const EQUIPMENT_ORDER: readonly Equipment[] = [
  'バーベル',
  'ダンベル',
  'マシン',
  'ケーブル',
  '自重',
];

export interface Exercise {
  id: string;
  name: string;
  equipment: Equipment;
  /** 主に効く部位。1〜2つに絞る */
  primary: readonly Muscle[];
  /** 補助的に使う部位 */
  secondary: readonly Muscle[];
  /**
   * BIG3 など、筋力レベル診断で基準データを持っている種目か。
   * 持っていない種目で「上位何%」は出せない。
   */
  hasStandards?: boolean;
  /**
   * 自重種目で、扱う重量に体重が含まれるもの。
   * 懸垂やディップスの1RMを計算するときに使う。
   */
  bodyweightBased?: boolean;
}

/**
 * 収録している種目。
 *
 * ジムでよく行われる種目を、部位が偏らないように選んでいる。
 * すべての種目を網羅することは目的にしていない。
 */
export const EXERCISES: readonly Exercise[] = [
  // ---------- 胸 ----------
  {
    id: 'bench-press',
    name: 'ベンチプレス',
    equipment: 'バーベル',
    primary: ['胸'],
    secondary: ['上腕三頭筋', '肩'],
    hasStandards: true,
  },
  {
    id: 'incline-bench-press',
    name: 'インクラインベンチプレス',
    equipment: 'バーベル',
    primary: ['胸', '肩'],
    secondary: ['上腕三頭筋'],
  },
  {
    id: 'dumbbell-press',
    name: 'ダンベルプレス',
    equipment: 'ダンベル',
    primary: ['胸'],
    secondary: ['上腕三頭筋', '肩'],
  },
  {
    id: 'dumbbell-fly',
    name: 'ダンベルフライ',
    equipment: 'ダンベル',
    primary: ['胸'],
    secondary: [],
  },
  {
    id: 'chest-press',
    name: 'チェストプレス',
    equipment: 'マシン',
    primary: ['胸'],
    secondary: ['上腕三頭筋', '肩'],
  },
  {
    id: 'push-up',
    name: '腕立て伏せ',
    equipment: '自重',
    primary: ['胸'],
    secondary: ['上腕三頭筋', '肩', '体幹'],
    bodyweightBased: true,
  },
  {
    id: 'dips',
    name: 'ディップス',
    equipment: '自重',
    primary: ['胸', '上腕三頭筋'],
    secondary: ['肩'],
    bodyweightBased: true,
  },

  // ---------- 背中 ----------
  {
    id: 'deadlift',
    name: 'デッドリフト',
    equipment: 'バーベル',
    primary: ['背中', 'ハムストリング'],
    secondary: ['臀部', '体幹', '前腕'],
    hasStandards: true,
  },
  {
    id: 'bent-over-row',
    name: 'ベントオーバーロウ',
    equipment: 'バーベル',
    primary: ['背中'],
    secondary: ['上腕二頭筋', '体幹'],
  },
  {
    id: 'pull-up',
    name: '懸垂（順手）',
    equipment: '自重',
    primary: ['背中'],
    secondary: ['上腕二頭筋', '前腕'],
    bodyweightBased: true,
  },
  {
    id: 'chin-up',
    name: '懸垂（逆手）',
    equipment: '自重',
    primary: ['背中', '上腕二頭筋'],
    secondary: ['前腕'],
    bodyweightBased: true,
  },
  {
    id: 'lat-pulldown',
    name: 'ラットプルダウン',
    equipment: 'マシン',
    primary: ['背中'],
    secondary: ['上腕二頭筋', '前腕'],
  },
  {
    id: 'seated-row',
    name: 'シーテッドロウ',
    equipment: 'マシン',
    primary: ['背中'],
    secondary: ['上腕二頭筋'],
  },
  {
    id: 'dumbbell-row',
    name: 'ワンハンドロウ',
    equipment: 'ダンベル',
    primary: ['背中'],
    secondary: ['上腕二頭筋', '体幹'],
  },

  // ---------- 肩 ----------
  {
    id: 'overhead-press',
    name: 'オーバーヘッドプレス',
    equipment: 'バーベル',
    primary: ['肩'],
    secondary: ['上腕三頭筋', '体幹'],
  },
  {
    id: 'dumbbell-shoulder-press',
    name: 'ショルダープレス',
    equipment: 'ダンベル',
    primary: ['肩'],
    secondary: ['上腕三頭筋'],
  },
  {
    id: 'side-raise',
    name: 'サイドレイズ',
    equipment: 'ダンベル',
    primary: ['肩'],
    secondary: [],
  },
  {
    id: 'rear-raise',
    name: 'リアレイズ',
    equipment: 'ダンベル',
    primary: ['肩', '背中'],
    secondary: [],
  },
  {
    id: 'face-pull',
    name: 'フェイスプル',
    equipment: 'ケーブル',
    primary: ['肩', '背中'],
    secondary: [],
  },

  // ---------- 腕 ----------
  {
    id: 'barbell-curl',
    name: 'バーベルカール',
    equipment: 'バーベル',
    primary: ['上腕二頭筋'],
    secondary: ['前腕'],
  },
  {
    id: 'dumbbell-curl',
    name: 'ダンベルカール',
    equipment: 'ダンベル',
    primary: ['上腕二頭筋'],
    secondary: ['前腕'],
  },
  {
    id: 'hammer-curl',
    name: 'ハンマーカール',
    equipment: 'ダンベル',
    primary: ['上腕二頭筋', '前腕'],
    secondary: [],
  },
  {
    id: 'triceps-pushdown',
    name: 'トライセプスプッシュダウン',
    equipment: 'ケーブル',
    primary: ['上腕三頭筋'],
    secondary: [],
  },
  {
    id: 'french-press',
    name: 'フレンチプレス',
    equipment: 'ダンベル',
    primary: ['上腕三頭筋'],
    secondary: [],
  },
  {
    id: 'narrow-bench-press',
    name: 'ナロープレス',
    equipment: 'バーベル',
    primary: ['上腕三頭筋'],
    secondary: ['胸', '肩'],
  },

  // ---------- 脚 ----------
  {
    id: 'squat',
    name: 'スクワット',
    equipment: 'バーベル',
    primary: ['大腿四頭筋', '臀部'],
    secondary: ['ハムストリング', '体幹'],
    hasStandards: true,
  },
  {
    id: 'front-squat',
    name: 'フロントスクワット',
    equipment: 'バーベル',
    primary: ['大腿四頭筋'],
    secondary: ['臀部', '体幹'],
  },
  {
    id: 'leg-press',
    name: 'レッグプレス',
    equipment: 'マシン',
    primary: ['大腿四頭筋', '臀部'],
    secondary: ['ハムストリング'],
  },
  {
    id: 'leg-extension',
    name: 'レッグエクステンション',
    equipment: 'マシン',
    primary: ['大腿四頭筋'],
    secondary: [],
  },
  {
    id: 'leg-curl',
    name: 'レッグカール',
    equipment: 'マシン',
    primary: ['ハムストリング'],
    secondary: [],
  },
  {
    id: 'romanian-deadlift',
    name: 'ルーマニアンデッドリフト',
    equipment: 'バーベル',
    primary: ['ハムストリング', '臀部'],
    secondary: ['背中'],
  },
  {
    id: 'hip-thrust',
    name: 'ヒップスラスト',
    equipment: 'バーベル',
    primary: ['臀部'],
    secondary: ['ハムストリング'],
  },
  {
    id: 'lunge',
    name: 'ランジ',
    equipment: 'ダンベル',
    primary: ['大腿四頭筋', '臀部'],
    secondary: ['ハムストリング', '体幹'],
  },
  {
    id: 'bulgarian-squat',
    name: 'ブルガリアンスクワット',
    equipment: 'ダンベル',
    primary: ['大腿四頭筋', '臀部'],
    secondary: ['ハムストリング'],
  },
  {
    id: 'calf-raise',
    name: 'カーフレイズ',
    equipment: 'マシン',
    primary: ['ふくらはぎ'],
    secondary: [],
  },
  {
    id: 'bodyweight-squat',
    name: '自重スクワット',
    equipment: '自重',
    primary: ['大腿四頭筋', '臀部'],
    secondary: ['ハムストリング'],
    bodyweightBased: true,
  },

  // ---------- 体幹 ----------
  {
    id: 'plank',
    name: 'プランク',
    equipment: '自重',
    primary: ['体幹'],
    secondary: [],
    bodyweightBased: true,
  },
  {
    id: 'crunch',
    name: 'クランチ',
    equipment: '自重',
    primary: ['体幹'],
    secondary: [],
    bodyweightBased: true,
  },
  {
    id: 'leg-raise',
    name: 'レッグレイズ',
    equipment: '自重',
    primary: ['体幹'],
    secondary: [],
    bodyweightBased: true,
  },
  {
    id: 'ab-roller',
    name: 'アブローラー',
    equipment: '自重',
    primary: ['体幹'],
    secondary: ['背中', '肩'],
    bodyweightBased: true,
  },
] as const;

/** IDから種目を引く */
export function findExercise(id: string): Exercise | undefined {
  return EXERCISES.find((exercise) => exercise.id === id);
}

/** 道具ごとにまとめる（選ぶときの見出し用） */
export function exercisesByEquipment(): { equipment: Equipment; exercises: Exercise[] }[] {
  return EQUIPMENT_ORDER.map((equipment) => ({
    equipment,
    exercises: EXERCISES.filter((exercise) => exercise.equipment === equipment),
  })).filter((group) => group.exercises.length > 0);
}

/**
 * 選んだ種目から、動かした部位をまとめる。
 *
 * 主働筋と補助筋を分けて返す。「胸の日にベンチだけやった」場合、
 * 三頭にも肩にも入っているが、狙って鍛えた部位とは区別したい。
 */
export function musclesWorked(exerciseIds: readonly string[]): {
  primary: Muscle[];
  secondary: Muscle[];
} {
  const primary = new Set<Muscle>();
  const secondary = new Set<Muscle>();

  for (const id of exerciseIds) {
    const exercise = findExercise(id);
    if (!exercise) continue;
    for (const muscle of exercise.primary) primary.add(muscle);
    for (const muscle of exercise.secondary) secondary.add(muscle);
  }

  // 主働筋として入っているものは補助から外す（二重に出さない）
  for (const muscle of primary) secondary.delete(muscle);

  // MUSCLES の並び順に揃えて返す（選んだ順に出すと毎回並びが変わるため）
  const inOrder = (set: Set<Muscle>) => MUSCLES.filter((muscle) => set.has(muscle));
  return { primary: inOrder(primary), secondary: inOrder(secondary) };
}

/**
 * まだ触れていない部位を返す。
 *
 * 「今週まだ脚をやっていない」に気づけるようにするためのもの。
 * 何をやるべきかまでは言わない（それは個人の計画の話なので）。
 */
export function untouchedMuscles(exerciseIds: readonly string[]): Muscle[] {
  const { primary, secondary } = musclesWorked(exerciseIds);
  const touched = new Set<Muscle>([...primary, ...secondary]);
  return MUSCLES.filter((muscle) => !touched.has(muscle));
}
