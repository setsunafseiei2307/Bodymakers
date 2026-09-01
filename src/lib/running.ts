/**
 * ランニング・ウォーキングのペース計算。
 *
 * 【なぜ必要か】
 * これまで走った量は「ランニング30分」としか入れられず、
 * 分速134mで30分なのか、ゆっくり30分なのかを区別できなかった。
 * 同じ30分でも消費カロリーは倍近く変わる。
 *
 * 【メッツ値の扱い】
 * メッツ表のランニングの行には、それぞれ分速が書かれている。
 * だからペースが決まれば、どの行を使うべきかも決まる。
 * ここで新しい値を作ることはせず、表にある行を選ぶだけにする。
 * 表の行と行の間のペースは、遅い側の行に寄せる（過大に見積もらないため）。
 * 分速の書かれていない行はペースから選べないので、この表には入れない。
 */

import { isFiniteNumber } from './format';

/**
 * ペースから選ぶメッツの段。
 *
 * metersPerMinute は出典の表に書かれている分速そのもの。
 * この分速「以上」なら、その段のメッツを使う。
 *
 * 収録しているのは、出典の表に分速が明記されている行だけ。
 * 分速の書かれていない行は、ペースから選びようがないので入れない。
 */
export interface PaceStep {
  /** この分速以上なら、この段を使う */
  metersPerMinute: number;
  mets: number;
  /** 出典の表に書かれている説明 */
  label: string;
}

/**
 * 歩く・走るの段。速い順に並べる。
 *
 * 収録しているのは、出典の表に分速がはっきり書かれていて、
 * その記載を確認できた行だけ。
 *
 * 【ここに載っていない行について】
 * 出典の表には、これより速いランニング（分速139m・161m・188m）の行もある。
 * ただし当サイトではその値を一次資料で確認できていないため入れていない。
 * そのため分速134mを超えるペースは、すべて 8.3 メッツで計算する。
 * 速く走った人の消費カロリーは少なめに出る。多めに見積もるよりはよい、
 * という判断でこうしている。
 *
 * 「ゆっくりとしたジョギング（6.0メッツ）」も表にはあるが、
 * 分速の記載がないためペースからは選べない。時間で入力する側に残してある。
 */
export const PACE_STEPS: readonly PaceStep[] = [
  { metersPerMinute: 134, mets: 8.3, label: 'ランニング（分速134m）' },
  { metersPerMinute: 93, mets: 4.3, label: 'やや速歩（平地・分速93m）' },
  { metersPerMinute: 75, mets: 3.5, label: '歩行（平地・分速75〜85m・散歩など）' },
  { metersPerMinute: 0, mets: 3.0, label: '普通歩行（平地・分速67m）' },
] as const;

export interface PaceResult {
  /** 分速（m/分） */
  metersPerMinute: number;
  /** 1kmあたりの所要時間（分） */
  minutesPerKm: number;
  /** 時速（km/h） */
  kmPerHour: number;
  /** ペースから選ばれたメッツの段 */
  step: PaceStep;
}

/**
 * 距離(km)と時間(分)からペースを求め、使うメッツの段を選ぶ。
 * どちらかが0以下・数値でない場合は null。
 */
export function pace(distanceKm: number, minutes: number): PaceResult | null {
  if (!isFiniteNumber(distanceKm) || !isFiniteNumber(minutes)) return null;
  if (distanceKm <= 0 || minutes <= 0) return null;

  const metersPerMinute = (distanceKm * 1000) / minutes;
  const step =
    PACE_STEPS.find((candidate) => metersPerMinute >= candidate.metersPerMinute) ??
    PACE_STEPS[PACE_STEPS.length - 1];

  return {
    metersPerMinute,
    minutesPerKm: minutes / distanceKm,
    kmPerHour: (distanceKm / minutes) * 60,
    step,
  };
}

/** 「5分30秒/km」の形にする */
export function formatPace(minutesPerKm: number): string {
  if (!isFiniteNumber(minutesPerKm) || minutesPerKm <= 0) return '—';
  const totalSeconds = Math.round(minutesPerKm * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}分${String(s).padStart(2, '0')}秒/km`;
}

/**
 * 距離・時間・体重から消費カロリーを求める。
 *
 * 式はメッツ表と同じ（メッツ × 時間 × 体重 × 1.05）。
 * 安静時ぶんを含んだ総消費量である点も同じ。
 */
export function runningKcal(
  distanceKm: number,
  minutes: number,
  weightKg: number,
): number | null {
  const result = pace(distanceKm, minutes);
  if (result == null) return null;
  if (!isFiniteNumber(weightKg) || weightKg <= 0) return null;
  return result.step.mets * (minutes / 60) * weightKg * 1.05;
}
