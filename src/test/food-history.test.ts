import { describe, expect, it } from 'vitest';

import { FOOD_HISTORY_DAYS, frequentFoods, lastAmountFor } from '../lib/foodHistory';
import { blankLog } from '../lib/activity/today';
import { shiftDateKey } from '../lib/activity/days';
import { commonFoods } from '../lib/foods';
import type { DailyLog } from '../lib/storage';

const NOW = new Date(2026, 8, 3, 10, 0, 0);
const ago = (days: number) => shiftDateKey('2026-09-03', -days);

/** 成分表から実在する食品IDを2つ借りる。 */
const [foodA, foodB] = commonFoods().slice(0, 2);

function log(date: string, meals: { foodId: string; grams: number; mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' }[]): DailyLog {
  return { ...blankLog(date), savedAt: '', meals };
}

describe('よく食べるもの', () => {
  it('記録が無ければ候補も出ない', () => {
    expect(frequentFoods([], { now: NOW })).toEqual([]);
  });

  it('回数の多い順に並ぶ', () => {
    const logs = [
      log(ago(0), [{ foodId: foodA!.id, grams: 150 }]),
      log(ago(1), [{ foodId: foodA!.id, grams: 150 }, { foodId: foodB!.id, grams: 80 }]),
      log(ago(2), [{ foodId: foodA!.id, grams: 150 }]),
    ];
    const result = frequentFoods(logs, { now: NOW });
    expect(result[0]!.food.id).toBe(foodA!.id);
    expect(result[0]!.count).toBe(3);
    expect(result[1]!.food.id).toBe(foodB!.id);
  });

  it('いちばん多く使った分量を初期値にする', () => {
    const logs = [
      log(ago(0), [{ foodId: foodA!.id, grams: 200 }]),
      log(ago(1), [{ foodId: foodA!.id, grams: 150 }]),
      log(ago(2), [{ foodId: foodA!.id, grams: 150 }]),
    ];
    expect(frequentFoods(logs, { now: NOW })[0]!.grams).toBe(150);
  });

  it('1回しか食べていなければ、その分量を使う', () => {
    const logs = [log(ago(0), [{ foodId: foodA!.id, grams: 175 }])];
    expect(frequentFoods(logs, { now: NOW })[0]!.grams).toBe(175);
  });

  it('期間の外は数えない', () => {
    const logs = [log(ago(FOOD_HISTORY_DAYS + 5), [{ foodId: foodA!.id, grams: 150 }])];
    expect(frequentFoods(logs, { now: NOW })).toEqual([]);
  });

  it('同じ食品を何度も並べない', () => {
    const logs = [0, 1, 2, 3].map((d) => log(ago(d), [{ foodId: foodA!.id, grams: 150 }]));
    const result = frequentFoods(logs, { now: NOW });
    expect(result).toHaveLength(1);
  });

  it('件数の上限を守る', () => {
    const logs = [log(ago(0), commonFoods().slice(0, 10).map((food) => ({ foodId: food.id, grams: 100 })))];
    expect(frequentFoods(logs, { limit: 3, now: NOW })).toHaveLength(3);
    expect(frequentFoods(logs, { limit: 0, now: NOW })).toEqual([]);
  });

  it('成分表から引けない食品は候補にしない', () => {
    const logs = [log(ago(0), [{ foodId: 'まだ無い食品', grams: 100 }])];
    expect(frequentFoods(logs, { now: NOW })).toEqual([]);
  });

  it('おかしな分量は数えない', () => {
    const logs = [log(ago(0), [
      { foodId: foodA!.id, grams: Number.NaN },
      { foodId: foodA!.id, grams: -50 },
      { foodId: foodA!.id, grams: 99999 },
      { foodId: foodA!.id, grams: Number.POSITIVE_INFINITY },
    ])];
    expect(frequentFoods(logs, { now: NOW })).toEqual([]);
  });

  it('前回の食事区分を覚えている', () => {
    const logs = [log(ago(0), [{ foodId: foodA!.id, grams: 150, mealType: 'breakfast' }])];
    expect(frequentFoods(logs, { now: NOW })[0]!.mealType).toBe('breakfast');
  });
});

describe('前回の分量', () => {
  it('最後に使った分量を返す', () => {
    const logs = [
      log(ago(3), [{ foodId: foodA!.id, grams: 100 }]),
      log(ago(0), [{ foodId: foodA!.id, grams: 220 }]),
    ];
    expect(lastAmountFor(logs, foodA!.id)).toBe(220);
  });

  it('記録が無ければ null', () => {
    expect(lastAmountFor([], foodA!.id)).toBeNull();
    expect(lastAmountFor([log(ago(0), [{ foodId: foodB!.id, grams: 100 }])], foodA!.id)).toBeNull();
  });

  it('壊れた分量は無視する', () => {
    const logs = [log(ago(0), [{ foodId: foodA!.id, grams: Number.NaN }])];
    expect(lastAmountFor(logs, foodA!.id)).toBeNull();
  });

  it('保存領域を増やさず、記録から数え直す', () => {
    // 記録を消せば候補も消える
    const logs = [log(ago(0), [{ foodId: foodA!.id, grams: 150 }])];
    expect(frequentFoods(logs, { now: NOW })).toHaveLength(1);
    expect(frequentFoods([], { now: NOW })).toHaveLength(0);
  });
});
