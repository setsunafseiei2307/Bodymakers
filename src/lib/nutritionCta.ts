/**
 * 計算結果から診断へ渡すクエリ。
 *
 * ここで渡すのは体重と目標体重だけで、保存はしない。
 * 診断側の既存の初期値読み取り（useQueryDefaults）が受け取れる範囲に合わせる。
 * 範囲外の値は渡さない。診断側で弾かれる値をURLに載せても意味がないため。
 */

export const START_PARAM_MIN = 30;
export const START_PARAM_MAX = 300;

export function buildStartQuery(
  weightKg: number | null,
  goalWeightKg: number | null,
): string {
  const params: string[] = [];

  const ok = (v: number | null): v is number =>
    v != null &&
    Number.isFinite(v) &&
    v >= START_PARAM_MIN &&
    v <= START_PARAM_MAX;

  if (ok(weightKg)) {
    params.push(`weight=${weightKg}`);
  }

  if (ok(goalWeightKg)) {
    params.push(`target=${goalWeightKg}`);
  }

  return params.length > 0
    ? `?${params.join('&')}`
    : '';
}
