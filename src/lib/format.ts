/** 数値整形・丸めの共通ユーティリティ */

/** 有限の数値かどうか（NaN / Infinity / null / undefined を弾く） */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 文字列入力を数値に変換する。全角数字・カンマ・空白も受け付ける。
 * 変換できない場合は null を返す。
 */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (input == null) return null;
  const normalized = String(input)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
    .replace(/[，,\s]/g, '')
    .trim();
  if (normalized === '' || normalized === '-' || normalized === '.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * 小数第 digits 位まで表示。小数部の末尾の 0 だけを落とす（62.5 → "62.5", 60.0 → "60"）。
 * 整数部の 0 は落とさない（140 → "140"。digits=0 でも "14" にならない）。
 */
export function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const fixed = value.toFixed(digits);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/\.?0+$/, '') || '0';
}

/** 3桁区切り */
export function fmtComma(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 値を min〜max の範囲に収める */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
