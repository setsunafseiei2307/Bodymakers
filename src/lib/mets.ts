/**
 * 身体活動の強度（メッツ）と、そこから求める消費カロリー。
 *
 * 【データの扱い】
 * メッツ値は推測で作らない。厚生労働省「健康づくりのための身体活動基準2013」
 * の参考資料（生活活動・運動のメッツ表）と、その元になった
 * Ainsworth ら (2011) の Compendium of Physical Activities に載っている値だけを使う。
 *
 * 現在は日常的な活動の抜粋のみを収録している。全項目を入れるには
 * 公式PDFの取り込みが要るため、その手順は docs/mets.md に書いてある。
 * 収録していない活動は「データなし」として扱い、近い値で埋めることはしない。
 */

import { isFiniteNumber } from './format';

export const METS_SOURCE = {
  title: '健康づくりのための身体活動基準2013（参考資料 生活活動・運動のメッツ表）',
  publisher: '厚生労働省',
  url: 'https://www.e-healthnet.mhlw.go.jp/information/exercise/guidelines_2013.html',
  original:
    'Ainsworth, B. E. et al. (2011). 2011 Compendium of Physical Activities: a second update of codes and MET values. Medicine & Science in Sports & Exercise, 43(8), 1575-1581.',
  originalUrl: 'https://doi.org/10.1249/MSS.0b013e31821ece12',
} as const;

export type ActivityGroup = '歩く・走る' | '有酸素運動' | '筋トレ・その他の運動' | '生活の中の活動';

export interface Activity {
  id: string;
  label: string;
  /** メッツ値。出典の表に載っている値をそのまま持つ */
  mets: number;
  group: ActivityGroup;
  /** 出典の表で、その値に添えられている説明 */
  note: string;
}

/**
 * 収録している活動。
 *
 * 並びは強度順ではなく、探しやすさを優先して用途別にしてある。
 * 値はすべて出典の表の記載どおりで、当サイトで丸めたり足したりはしていない。
 */
export const ACTIVITIES: readonly Activity[] = [
  // --- 歩く・走る ---
  { id: 'walk-normal', label: '普通に歩く', mets: 3.0, group: '歩く・走る', note: '平地・分速67m（犬を連れてなど）' },
  { id: 'walk-flat', label: '平地を歩く', mets: 3.5, group: '歩く・走る', note: '平地・やや速め' },
  { id: 'walk-brisk', label: '速歩', mets: 4.0, group: '歩く・走る', note: 'やや速歩・階段をゆっくり上る' },
  { id: 'jog-slow', label: 'ゆっくりジョギング', mets: 6.0, group: '歩く・走る', note: 'ゆっくりとしたジョギング' },
  { id: 'run', label: 'ランニング', mets: 8.3, group: '歩く・走る', note: '分速134m' },

  // --- 有酸素運動 ---
  { id: 'swim-crawl', label: '水泳（クロール）', mets: 8.3, group: '有酸素運動', note: 'ふつうの速さ・分速46m未満' },
  { id: 'aerobics', label: 'エアロビクス', mets: 7.0, group: '有酸素運動', note: '' },
  { id: 'tennis-doubles', label: 'テニス（ダブルス）', mets: 4.5, group: '有酸素運動', note: '' },

  // --- 筋トレ・その他の運動 ---
  { id: 'weight-light', label: '筋力トレーニング（軽い）', mets: 3.0, group: '筋トレ・その他の運動', note: '軽い負荷での筋トレ' },
  { id: 'yoga-power', label: 'パワーヨガ', mets: 4.0, group: '筋トレ・その他の運動', note: '' },
  { id: 'bowling', label: 'ボウリング', mets: 3.0, group: '筋トレ・その他の運動', note: '' },

  // --- 生活の中の活動 ---
  { id: 'stand', label: '立っている', mets: 2.0, group: '生活の中の活動', note: '会話・電話・読書など' },
  { id: 'vacuum', label: '掃除機をかける', mets: 3.0, group: '生活の中の活動', note: '洗車・こどもと遊ぶなども同程度' },
  { id: 'sweep', label: '床を掃く・モップがけ', mets: 3.3, group: '生活の中の活動', note: '' },
] as const;

/** 安静時の代謝に対する係数。メッツ×時間×体重に掛けてkcalにする。 */
const KCAL_FACTOR = 1.05;

/**
 * 消費カロリー(kcal) = メッツ × 時間(時) × 体重(kg) × 1.05
 *
 * 安静時（1メッツ）ぶんを含んだ総消費量で、
 * 「その活動で余分に使った量」ではない点に注意。画面にもその旨を出す。
 */
export function burnedKcal(mets: number, minutes: number, weightKg: number): number | null {
  if (!isFiniteNumber(mets) || !isFiniteNumber(minutes) || !isFiniteNumber(weightKg)) return null;
  if (mets <= 0 || minutes < 0 || weightKg <= 0) return null;
  return mets * (minutes / 60) * weightKg * KCAL_FACTOR;
}

/** 指定のカロリーを消費するのにかかる時間（分）。 */
export function minutesForKcal(mets: number, kcal: number, weightKg: number): number | null {
  if (!isFiniteNumber(mets) || !isFiniteNumber(kcal) || !isFiniteNumber(weightKg)) return null;
  if (mets <= 0 || kcal < 0 || weightKg <= 0) return null;
  const perMinute = (mets * weightKg * KCAL_FACTOR) / 60;
  if (perMinute <= 0) return null;
  return kcal / perMinute;
}

/** 活動をIDで引く */
export function findActivity(id: string): Activity | null {
  return ACTIVITIES.find((a) => a.id === id) ?? null;
}

/** 用途別のまとまりで返す（画面の並び用） */
export function activityGroups(): { group: ActivityGroup; items: Activity[] }[] {
  const groups: ActivityGroup[] = [];
  for (const a of ACTIVITIES) if (!groups.includes(a.group)) groups.push(a.group);
  return groups.map((group) => ({ group, items: ACTIVITIES.filter((a) => a.group === group) }));
}
