import { describe, expect, it } from 'vitest';

import { parseMealText } from '../lib/mealText';

describe('食事の自由入力', () => {
  it('料理名と量を材料へ展開する', () => {
    const result = parseMealText('昼 カレーライス大盛り');
    expect(result.meals.length).toBeGreaterThan(1);
    expect(result.matched[0]).toContain('カレーライス');
    expect(result.assumptions[0]).toContain('1.3倍');
  });

  it('食品のグラム数・個数を解釈する', () => {
    const result = parseMealText('卵2個、ご飯200g、納豆1パック');
    expect(result.unmatched).toEqual([]);
    expect(result.meals).toHaveLength(3);
    expect(result.meals.map((item) => item.grams)).toEqual([100, 200, 50]);
  });

  it('分からない食品を推測せず返す', () => {
    const result = parseMealText('謎の未来フード1個');
    expect(result.meals).toEqual([]);
    expect(result.unmatched).toEqual(['謎の未来フード1個']);
  });

  it('自然なコンビニ朝食を分割して候補にする', () => {
    const result = parseMealText('朝 コンビニおにぎり2個とプロテイン');
    expect(result.matched.some((item) => item.includes('おにぎり'))).toBe(true);
    expect(result.meals).toHaveLength(1);
    expect(result.unmatched).toContain('プロテイン');
  });
});
