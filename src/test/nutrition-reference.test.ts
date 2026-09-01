import { describe, expect, it } from 'vitest';

import { nutritionAgeBand, nutritionTargetFor, nutritionTargets } from '../lib/nutritionReference';
import { nutritionPriorities, nutritionProgress, recommendFoods } from '../lib/foodRecommendations';
import { summarizeIntake } from '../lib/today';
import { findFood } from '../lib/foods';

describe('日本人の食事摂取基準（2025年版）', () => {
  it('年齢を指定の7区分へ選ぶ', () => {
    expect(nutritionAgeBand(12)?.label).toBe('12〜14歳');
    expect(nutritionAgeBand(29)?.label).toBe('18〜29歳');
    expect(nutritionAgeBand(75)?.label).toBe('75歳以上');
  });

  it('男女・年齢別のRDAを返し、RDAのない項目はAIを返す', () => {
    expect(nutritionTargetFor('calcium', 'male', 18)).toMatchObject({ kind: 'rda', value: 800 });
    expect(nutritionTargetFor('calcium', 'female', 18)).toMatchObject({ kind: 'rda', value: 650 });
    expect(nutritionTargetFor('vitaminD', 'female', 30)).toMatchObject({ kind: 'ai', value: 9 });
  });

  it('DGの下限・上限を区別し、ULを今日の目標にしない', () => {
    expect(nutritionTargetFor('fiber', 'male', 30)).toMatchObject({ kind: 'dg-min', value: 22 });
    expect(nutritionTargetFor('salt', 'female', 30)).toMatchObject({ kind: 'dg-max', value: 7 });
    expect(nutritionTargets('male', 30).some((target) => 'upperLimit' in target)).toBe(false);
  });

  it('月経条件が未入力の女性の鉄は目安を確定しない', () => {
    expect(nutritionTargetFor('iron', 'female', 30)).toMatchObject({ status: 'unresolved' });
    const progress = nutritionProgress(summarizeIntake([]).totals, 'female', 30);
    expect(nutritionPriorities(progress).some((item) => item.nutrient === 'iron')).toBe(false);
  });
});

describe('Todayの食品推薦', () => {
  it('塩分は上限方向で表示し、推薦の優先対象にしない', () => {
    const progress = nutritionProgress({ ...summarizeIntake([]).totals, salt: 8 }, 'male', 30);
    expect(progress.find((item) => item.nutrient === 'salt')).toMatchObject({ state: 'over' });
    expect(nutritionPriorities(progress).some((item) => item.nutrient === 'salt')).toBe(false);
  });

  it('日常的な食品だけを推薦し、追加後の栄養合計が再計算される', () => {
    const before = summarizeIntake([]);
    const recommendation = recommendFoods(before.totals, 'male', 30, 1)[0];
    expect(recommendation).toBeDefined();
    expect(recommendation?.food.common).toBe(true);
    expect(recommendation?.food.category).not.toMatch(/調味|香辛|油脂|酒/);
    const after = summarizeIntake([{ foodId: recommendation!.food.id, grams: recommendation!.serving.grams }]);
    expect(after.totals.kcal).toBeGreaterThan(0);
    expect(findFood(recommendation!.food.id)?.name).toBe(recommendation!.food.name);
  });
});
