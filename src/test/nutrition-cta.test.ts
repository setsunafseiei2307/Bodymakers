import { describe, expect, it } from 'vitest';

import { START_PARAM_MAX, START_PARAM_MIN, buildStartQuery } from '../lib/nutritionCta';

describe('診断へ渡すクエリ', () => {
  it('体重と目標体重の両方を渡す', () => {
    expect(buildStartQuery(70, 65)).toBe('?weight=70&target=65');
  });

  it('体重だけでも渡せる', () => {
    expect(buildStartQuery(70, null)).toBe('?weight=70');
  });

  it('目標体重だけでも渡せる', () => {
    expect(buildStartQuery(null, 65)).toBe('?target=65');
  });

  it('どちらも無ければ空文字', () => {
    expect(buildStartQuery(null, null)).toBe('');
  });

  it('範囲の端は渡す', () => {
    expect(buildStartQuery(START_PARAM_MIN, START_PARAM_MAX)).toBe('?weight=30&target=300');
  });

  it('範囲外は渡さない', () => {
    expect(buildStartQuery(29, 301)).toBe('');
    expect(buildStartQuery(29, 65)).toBe('?target=65');
    expect(buildStartQuery(70, 301)).toBe('?weight=70');
  });

  it('数値でない値は渡さない', () => {
    expect(buildStartQuery(Number.NaN, Number.NaN)).toBe('');
    expect(buildStartQuery(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toBe('');
    expect(buildStartQuery(Number.NaN, 65)).toBe('?target=65');
  });

  it('小数もそのまま渡す', () => {
    expect(buildStartQuery(70.5, 65.5)).toBe('?weight=70.5&target=65.5');
  });

  it('0や負の値は渡さない', () => {
    expect(buildStartQuery(0, -5)).toBe('');
  });
});
