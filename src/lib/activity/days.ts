/**
 * 日付の足し算・引き算。
 *
 * Bodymakersの記録は `YYYY-MM-DD` の「その人の端末のローカル日付」で持っている。
 * UTCへ直すと、日本時間の朝が前日になったりして継続日数がずれる。
 * そのため、ここでは文字列のローカル日付だけを扱い、UTCへは一度も変換しない。
 *
 * 日をまたぐ計算では、正午のDateを作ってから日数を足す。
 * 深夜0時を基点にすると、夏時間の切り替わる日に1時間ずれて
 * 前日や翌日へ飛ぶことがあるため。
 */

export const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 端末のローカル日付を YYYY-MM-DD で返す。 */
export function dateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 日付キーを、その日の正午のDateにする。読めない値は null。 */
export function dateFromKey(key: string): Date | null {
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // 2月30日のような日付は、Dateが繰り上げてしまうので弾く。
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function isDateKey(key: string): boolean {
  return dateFromKey(key) != null;
}

/** 日付キーから n 日ずらした日付キー。負の数なら過去へ。 */
export function shiftDateKey(key: string, days: number): string {
  const date = dateFromKey(key);
  if (date == null) return key;
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

/** from から to までの日数。to が過去なら負の数。 */
export function daysBetweenKeys(from: string, to: string): number {
  const start = dateFromKey(from);
  const end = dateFromKey(to);
  if (start == null || end == null) return 0;
  const day = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / day);
}

/** end で終わる連続した length 日分の日付キー。古い順。 */
export function recentDateKeys(end: string, length: number): string[] {
  const count = Math.max(0, Math.floor(length));
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) keys.push(shiftDateKey(end, -offset));
  return keys;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 曜日の1文字表記。表示用。 */
export function weekdayLabel(key: string): string {
  const date = dateFromKey(key);
  return date == null ? '' : WEEKDAY_LABELS[date.getDay()]!;
}

/** ISO日時を、その人のローカル日付キーへ直す。読めなければ null。 */
export function dateKeyFromISO(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateKey(date);
}
