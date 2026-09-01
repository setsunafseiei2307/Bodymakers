/**
 * 筋力レベル診断の中核ロジック。
 *
 * standardsData.ts が持つ「体重アンカーごとの分位数表」を使って、
 * 挙上重量 → 競技者集団内でのパーセンタイル → 5段階レベル を求める。
 *
 * 重要な前提:
 * - 基準表の母集団は公式競技会（ノーギア・フルパワー）の出場者であり、
 *   一般のジム利用者より全体に高い水準にある。画面ではこれを必ず明記する。
 * - 表に無い値を外挿して作らない。表の範囲外は範囲外として扱う。
 *
 * このファイルは React に依存しない純関数のみで構成する（テスト容易性のため）。
 */

import { isFiniteNumber } from '../format';

/** 診断対象の種目。将来オーバーヘッドプレス等を足す場合はここに追加する。 */
export type LiftId = 'squat' | 'bench' | 'deadlift';

/** 集計上の種目キー。3種目に加えてトータル（3種目合計）を持つ。 */
export type MetricId = LiftId | 'total';

/** 生物学的な性別。基準表が男女別にしか存在しないため2値。 */
export type Sex = 'M' | 'F';

/** 5段階のレベルID。 */
export type LevelId = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';

export interface StrengthAnchor {
  /** このアンカーの代表体重（kg） */
  bodyweightKg: number;
  /** 集計に使った選手数。0 に近いほど数値の信頼度が低い */
  sample: number;
  /**
   * 種目ごとの分位数。percentileGrid と同じ長さ・同じ順序の配列。
   * 標本数が下限に満たない場合は null（＝データなし）。
   */
  percentiles: Record<MetricId, number[] | null>;
  /** スクワットを1としたときの各種目の比率の中央値。データなしなら null */
  ratios: {
    benchPerSquat: number | null;
    deadliftPerSquat: number | null;
  };
}

export interface StrengthStandardsDataset {
  /** 基準表を生成した日（YYYY-MM-DD） */
  generatedAt: string;
  /** この年以降に開催された大会のみを集計対象にした */
  sinceYear: number;
  /** 1アンカーあたりに要求した標本数の下限 */
  minSample: number;
  /** percentiles 配列の各要素が何パーセンタイルかを示す昇順の配列 */
  percentileGrid: number[];
  /** 集計に使った延べ選手数 */
  totalLifters: Record<Sex, number>;
  /** 体重アンカー（bodyweightKg の昇順） */
  anchors: Record<Sex, StrengthAnchor[]>;
}

/** 出典表示に使う情報。画面とコピー用テキストの両方で参照する。 */
export const STANDARDS_SOURCE = {
  name: 'OpenPowerlifting',
  url: 'https://www.openpowerlifting.org',
  dataUrl: 'https://gitlab.com/openpowerlifting/opl-data',
  license: 'パブリックドメイン（CSVデータの著作権および隣接する権利は放棄されている）',
  /** OpenPowerlifting が推奨している帰属表示文 */
  attribution:
    'This page uses data from the OpenPowerlifting project, https://www.openpowerlifting.org.',
} as const;

export interface LevelDefinition {
  id: LevelId;
  /** 画面に出す短いラベル */
  label: string;
  /** このレベルの下限パーセンタイル（この値以上ならこのレベル） */
  minPercentile: number;
  /** このレベルの上限パーセンタイル（この値未満ならこのレベル）。最上位は 100 */
  maxPercentile: number;
  /** レベルの意味をそのまま説明する一文。ラベル単体では誤解されるため常に併記する */
  description: string;
}

/**
 * 5段階レベルの定義。
 *
 * 区切りは standardsData.ts の percentileGrid 上の点（1 / 10 / 30 / 70）に合わせてある。
 * 補間せずに実データの分位数をそのまま境界値として使えるようにするため。
 *
 * 【区切りをこの位置にした理由】
 * 基準データの母集団は公式競技会の出場者で、一般のジム利用者より全体に高い水準にある。
 * 区切りを中央寄り（10/30/65/90）に置くと、普通にトレーニングしている人がほぼ全員
 * 最下位レベルに落ちてしまい、指標として機能しない。
 *
 * 分布の下側を細かく切ると、データから出てくる境界値が現場で使われている
 * 体重比の目安とほぼ一致する。男性の場合:
 *   ベンチプレス   初級 体重0.75倍 / 中級 1.1倍 / 上級 1.3倍 / エリート 1.6倍
 *   スクワット     初級 1.0倍     / 中級 1.65倍 / 上級 2.0倍 / エリート 2.5倍
 *   デッドリフト   初級 1.4倍     / 中級 2.0倍  / 上級 2.4倍 / エリート 2.9倍
 *
 * 数値そのものは実データの分位数であり、加工していない。
 * 区切り位置の選択だけが編集上の判断であることを docs/strength-standards.md に明記する。
 */
export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'beginner',
    label: '初心者',
    minPercentile: 0,
    maxPercentile: 1,
    description: '競技会の記録を基準にした表の下。ここから始まる人がほとんどです',
  },
  {
    id: 'novice',
    label: '初級',
    minPercentile: 1,
    maxPercentile: 10,
    description: '競技会に出る人の中では下位1〜10%。一般の人と比べれば十分に強い水準です',
  },
  {
    id: 'intermediate',
    label: '中級',
    minPercentile: 10,
    maxPercentile: 30,
    description: '競技会に出る人の中で下位10〜30%。続けてきた人の水準です',
  },
  {
    id: 'advanced',
    label: '上級',
    minPercentile: 30,
    maxPercentile: 70,
    description: '競技会に出る人の中で30〜70%。競技者の中でも真ん中から上です',
  },
  {
    id: 'elite',
    label: 'エリート',
    minPercentile: 70,
    maxPercentile: 100,
    description: '競技会に出る人の中で上位30%以内',
  },
] as const;

/** 種目の表示名。 */
export const LIFT_LABELS: Record<LiftId, string> = {
  squat: 'スクワット',
  bench: 'ベンチプレス',
  deadlift: 'デッドリフト',
};

/** 各種目で主に動員される部位。弱点指摘の文面に使う。 */
export const LIFT_MUSCLES: Record<LiftId, string> = {
  squat: '大腿四頭筋・臀筋・体幹',
  bench: '大胸筋・三角筋前部・上腕三頭筋',
  deadlift: 'ハムストリングス・臀筋・脊柱起立筋・広背筋',
};

/** 診断で扱う種目の並び順。画面もこの順で表示する。 */
export const LIFT_ORDER: readonly LiftId[] = ['squat', 'bench', 'deadlift'] as const;

/** 入力として受け付ける体重の範囲（kg）。基準表の外挿を避けるための上下限。 */
export const MIN_BODYWEIGHT_KG = 30;
export const MAX_BODYWEIGHT_KG = 200;

/** 入力として受け付ける挙上重量の範囲（kg）。 */
export const MIN_LIFT_KG = 1;
export const MAX_LIFT_KG = 600;

/**
 * ある体重に対する分位数カーブを、隣り合うアンカーから線形補間して作る。
 *
 * 体重階級で区切ると境目で基準値が跳ねるため、アンカー間を按分する。
 * 最軽量アンカーより軽い／最重量アンカーより重い場合は、
 * 端のアンカーの値をそのまま使う（外挿はしない）。
 *
 * @returns percentileGrid と同じ長さの配列。データが無ければ null
 */
export function interpolateCurve(
  dataset: StrengthStandardsDataset,
  sex: Sex,
  metric: MetricId,
  bodyweightKg: number,
): number[] | null {
  if (!isFiniteNumber(bodyweightKg) || bodyweightKg <= 0) return null;
  const anchors = dataset.anchors[sex];
  if (!anchors || anchors.length === 0) return null;

  // 有効な（データを持つ）アンカーだけを対象にする
  const usable = anchors.filter((a) => a.percentiles[metric] != null);
  if (usable.length === 0) return null;

  const first = usable[0];
  const last = usable[usable.length - 1];
  if (bodyweightKg <= first.bodyweightKg) {
    return [...(first.percentiles[metric] as number[])];
  }
  if (bodyweightKg >= last.bodyweightKg) {
    return [...(last.percentiles[metric] as number[])];
  }

  for (let i = 0; i < usable.length - 1; i += 1) {
    const low = usable[i];
    const high = usable[i + 1];
    if (bodyweightKg >= low.bodyweightKg && bodyweightKg <= high.bodyweightKg) {
      const span = high.bodyweightKg - low.bodyweightKg;
      const t = span === 0 ? 0 : (bodyweightKg - low.bodyweightKg) / span;
      const lowValues = low.percentiles[metric] as number[];
      const highValues = high.percentiles[metric] as number[];
      return lowValues.map((value, index) => value + (highValues[index] - value) * t);
    }
  }
  return null;
}

/**
 * 体重に対応する標本数を、隣り合うアンカーから線形補間して求める。
 * 画面に「この基準は何人の記録に基づくか」を出すために使う。
 */
export function interpolateSample(
  dataset: StrengthStandardsDataset,
  sex: Sex,
  bodyweightKg: number,
): number | null {
  if (!isFiniteNumber(bodyweightKg) || bodyweightKg <= 0) return null;
  const anchors = dataset.anchors[sex];
  if (!anchors || anchors.length === 0) return null;

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (bodyweightKg <= first.bodyweightKg) return first.sample;
  if (bodyweightKg >= last.bodyweightKg) return last.sample;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const low = anchors[i];
    const high = anchors[i + 1];
    if (bodyweightKg >= low.bodyweightKg && bodyweightKg <= high.bodyweightKg) {
      const span = high.bodyweightKg - low.bodyweightKg;
      const t = span === 0 ? 0 : (bodyweightKg - low.bodyweightKg) / span;
      return Math.round(low.sample + (high.sample - low.sample) * t);
    }
  }
  return null;
}

/** パーセンタイル算出の結果。範囲外だったかどうかを呼び出し側に伝える。 */
export interface PercentileResult {
  /**
   * 集団内での順位（0〜100）。値が大きいほど強い。
   * 基準表の範囲外だった場合は、最も近い端の値になる。
   */
  percentile: number;
  /**
   * 'in-range'  … 基準表の範囲内で補間できた
   * 'below'     … 表の最小値（1パーセンタイル）未満。percentile は下限値
   * 'above'     … 表の最大値（99パーセンタイル）超。percentile は上限値
   */
  bound: 'in-range' | 'below' | 'above';
}

/**
 * 分位数カーブ上で、ある重量が何パーセンタイルに当たるかを線形補間で求める。
 *
 * カーブは「パーセンタイル → 重量」の対応なので、逆方向に引く。
 * 同じ重量が複数の分位点に対応する（データが平坦な）場合は、
 * 最初に到達した分位点を採る。
 */
export function percentileForWeight(
  curve: number[],
  grid: number[],
  weightKg: number,
): PercentileResult | null {
  if (curve.length === 0 || curve.length !== grid.length) return null;
  if (!isFiniteNumber(weightKg) || weightKg <= 0) return null;

  if (weightKg < curve[0]) {
    return { percentile: grid[0], bound: 'below' };
  }
  const lastIndex = curve.length - 1;
  if (weightKg >= curve[lastIndex]) {
    return { percentile: grid[lastIndex], bound: 'above' };
  }

  for (let i = 0; i < lastIndex; i += 1) {
    const low = curve[i];
    const high = curve[i + 1];
    if (weightKg >= low && weightKg < high) {
      const span = high - low;
      const t = span === 0 ? 0 : (weightKg - low) / span;
      return {
        percentile: grid[i] + (grid[i + 1] - grid[i]) * t,
        bound: 'in-range',
      };
    }
  }
  return { percentile: grid[lastIndex], bound: 'above' };
}

/**
 * 分位数カーブ上で、あるパーセンタイルに対応する重量を線形補間で求める。
 * レベルの境界重量（「初級まであと何kg」）を出すのに使う。
 */
export function weightForPercentile(
  curve: number[],
  grid: number[],
  percentile: number,
): number | null {
  if (curve.length === 0 || curve.length !== grid.length) return null;
  if (!isFiniteNumber(percentile)) return null;

  if (percentile <= grid[0]) return curve[0];
  const lastIndex = grid.length - 1;
  if (percentile >= grid[lastIndex]) return curve[lastIndex];

  for (let i = 0; i < lastIndex; i += 1) {
    if (percentile >= grid[i] && percentile <= grid[i + 1]) {
      const span = grid[i + 1] - grid[i];
      const t = span === 0 ? 0 : (percentile - grid[i]) / span;
      return curve[i] + (curve[i + 1] - curve[i]) * t;
    }
  }
  return null;
}

/** パーセンタイルから該当するレベル定義を引く。 */
export function levelForPercentile(percentile: number): LevelDefinition {
  if (!isFiniteNumber(percentile)) return LEVELS[0];
  for (const level of LEVELS) {
    if (percentile < level.maxPercentile) return level;
  }
  return LEVELS[LEVELS.length - 1];
}

/** レベルIDから定義を引く。 */
export function levelById(id: LevelId): LevelDefinition {
  const found = LEVELS.find((level) => level.id === id);
  // LevelId は LEVELS から導出した型なので、実行時に見つからないことはない
  return found ?? LEVELS[0];
}

/**
 * パーセンタイルを「5段階のどこまで進んだか」（0〜5）に変換する。
 *
 * パーセンタイルをそのまま半径に使うと、分布の下側に区切りが密集している
 * （1 / 10 / 30 / 70）ため、初心者〜中級の差がチャート上でほぼ潰れてしまう。
 * レベル内の進捗を等間隔に引き伸ばすことで、どの段でも同じだけ動いて見える。
 *
 * 例: 初級のちょうど真ん中なら 1.5、上級に入りたてなら 3.0。
 */
export function tierProgress(percentile: number): number {
  if (!isFiniteNumber(percentile)) return 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    const level = LEVELS[i];
    if (percentile < level.maxPercentile) {
      const span = level.maxPercentile - level.minPercentile;
      const within = span === 0 ? 0 : (percentile - level.minPercentile) / span;
      return i + Math.min(1, Math.max(0, within));
    }
  }
  return LEVELS.length;
}
