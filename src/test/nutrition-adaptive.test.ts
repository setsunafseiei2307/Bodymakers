import { describe, expect, it } from 'vitest';

import {
  CALORIE_STEP_KCAL,
  MAX_OFFSET_KCAL,
  MIN_COMPLETED_NUTRITION_DAYS,
  MIN_WEIGHT_MEASUREMENTS,
  activeOffsetKcal,
  baselineNutritionTarget,
  directionFor,
  emptyNutritionAdjustments,
  isFlat,
  normalizeNutritionAdjustments,
  nutritionAdherence,
  nutritionTargetReason,
  periodKeyFor,
  planKeyFor,
  recommendNutrition,
  resolveNutritionTarget,
  weightTrend,
  type NutritionAdherence,
  type WeightTrend,
} from '../lib/nutritionAdaptive';
import { blankLog } from '../lib/activity/today';
import { shiftDateKey } from '../lib/activity/days';
import {
  applyNutritionAdjustment,
  emptyData,
  parseStoredData,
  resetNutritionAdjustment,
  setNutritionComplete,
  STORAGE_KEY,
  type BodymakersData,
  type DailyLog,
} from '../lib/storage';
import { buildExport, parseImport } from '../lib/dataTransfer';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';
import type { SavedDietPlan } from '../lib/storage';

const NOW = new Date(2026, 8, 3, 10, 0, 0); // 2026-09-03
const ago = (days: number) => shiftDateKey('2026-09-03', -days);

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return { ...blankLog(date), savedAt: `${date}T10:00:00.000Z`, ...patch };
}

/** 体重だけの日。 */
const weighIn = (date: string, weightKg: number) => log(date, { weightKg });
/** 食事記録を完了した日。 */
const ateDay = (date: string, kcal: number, protein = 120) =>
  log(date, { manualIntake: { kcal, protein }, nutritionComplete: true });

const dietPlan: SavedDietPlan = {
  createdAt: '2026-07-01T00:00:00.000Z',
  startingWeightKg: 75, targetWeightKg: 70, targetDate: '2026-11-01',
  tdee: 2600, targetCalories: 2400, proteinGrams: 140, fatGrams: 70, carbsGrams: 300,
  dailyKcalGap: -200, mode: 'cut',
};

function data(patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), ...patch };
}

function plan(goal: 'fat-loss' | 'muscle' | 'recomp' | 'health' | 'strength', createdAt = '2026-07-01T00:00:00.000Z') {
  return { version: 1 as const, createdAt, input: { ...defaultDiagnosisInput(), goal } };
}

describe('体重の傾向', () => {
  it('直近7日と、その前7日の平均を比べる', () => {
    const logs = [
      ...[0, 1, 2, 3].map((d) => weighIn(ago(d), 72.4)),
      ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 72.8)),
    ];
    const trend = weightTrend(logs, NOW);
    expect(trend.currentAverageKg).toBe(72.4);
    expect(trend.previousAverageKg).toBe(72.8);
    expect(trend.changeKg).toBe(-0.4);
    expect(trend.enoughData).toBe(true);
  });

  it('測定が足りなければ判断しない', () => {
    const few = [
      ...[0, 1, 2].map((d) => weighIn(ago(d), 72)),
      ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 73)),
    ];
    const trend = weightTrend(few, NOW);
    expect(trend.currentCount).toBe(3);
    expect(trend.enoughData).toBe(false);
    expect(MIN_WEIGHT_MEASUREMENTS).toBe(4);
  });

  it('片方の窓だけ足りない場合も判断しない', () => {
    const logs = [
      ...[0, 1, 2, 3].map((d) => weighIn(ago(d), 72)),
      ...[7, 8].map((d) => weighIn(ago(d), 73)),
    ];
    expect(weightTrend(logs, NOW).enoughData).toBe(false);
  });

  it('毎日測っていなくても、4回あれば数えられる', () => {
    const logs = [
      ...[0, 2, 4, 6].map((d) => weighIn(ago(d), 72)),
      ...[7, 9, 11, 13].map((d) => weighIn(ago(d), 73)),
    ];
    expect(weightTrend(logs, NOW).enoughData).toBe(true);
  });

  it('単日の大きなブレは平均で薄まる', () => {
    const steady = [0, 1, 2, 3].map((d) => weighIn(ago(d), 72));
    const withSpike = [weighIn(ago(0), 75), ...[1, 2, 3].map((d) => weighIn(ago(d), 72))];
    const previous = [7, 8, 9, 10].map((d) => weighIn(ago(d), 72));

    const a = weightTrend([...steady, ...previous], NOW);
    const b = weightTrend([...withSpike, ...previous], NOW);
    // 3kgのブレが1日入っても、平均への影響は0.75kgに収まる
    expect(b.currentAverageKg! - a.currentAverageKg!).toBeCloseTo(0.75, 2);
  });

  it('壊れた体重は数えない', () => {
    const logs = [
      ...[0, 1, 2, 3].map((d) => weighIn(ago(d), 72)),
      ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 73)),
      log(ago(4), { weightKg: Number.NaN }),
      log(ago(5), { weightKg: Number.POSITIVE_INFINITY }),
      log(ago(6), { weightKg: -50 }),
      log(ago(11), { weightKg: 9999 }),
      log('こわれた', { weightKg: 72 }),
    ];
    const trend = weightTrend(logs, NOW);
    expect(trend.currentCount).toBe(4);
    expect(trend.previousCount).toBe(4);
    expect(Number.isFinite(trend.changeKg!)).toBe(true);
  });

  it('未来の日付は数えない', () => {
    const logs = [
      weighIn(shiftDateKey('2026-09-03', 3), 60),
      ...[0, 1, 2, 3].map((d) => weighIn(ago(d), 72)),
      ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 73)),
    ];
    expect(weightTrend(logs, NOW).currentCount).toBe(4);
  });

  it('同じ日が重なっても1回として数える', () => {
    const logs = [
      ...[0, 1, 2, 3].map((d) => weighIn(ago(d), 72)),
      weighIn(ago(0), 72),
      ...[7, 8, 9, 10].map((d) => weighIn(ago(d), 73)),
    ];
    expect(weightTrend(logs, NOW).currentCount).toBe(4);
  });

  it('記録が無ければすべてnullで、判断しない', () => {
    const trend = weightTrend([], NOW);
    expect(trend).toMatchObject({ currentAverageKg: null, previousAverageKg: null, changeKg: null, enoughData: false });
  });

  it('わずかな差は横ばいとして扱う', () => {
    const flat: WeightTrend = { currentAverageKg: 72, previousAverageKg: 72.1, changeKg: -0.1, changePercent: -0.14, currentCount: 4, previousCount: 4, enoughData: true };
    const moving: WeightTrend = { ...flat, changeKg: -0.5 };
    expect(isFlat(flat)).toBe(true);
    expect(isFlat(moving)).toBe(false);
  });
});

describe('食事記録の質', () => {
  const target = { calories: 2400, protein: 140 };

  it('完了の印を付けた日だけを数える', () => {
    const logs = [
      ateDay(ago(0), 2400), ateDay(ago(1), 2400),
      // 印の無い日は数えない
      log(ago(2), { manualIntake: { kcal: 300, protein: 10 } }),
    ];
    const adherence = nutritionAdherence(logs, target, NOW);
    expect(adherence.completedDays).toBe(2);
    expect(adherence.averageCalories).toBe(2400);
  });

  it('食品を1つ入れただけの日を、記録が揃った日として扱わない', () => {
    const logs = [log(ago(0), { meals: [{ foodId: '01088', grams: 100 }] })];
    const adherence = nutritionAdherence(logs, target, NOW);
    expect(adherence.completedDays).toBe(0);
    expect(adherence.averageCalories).toBeNull();
    expect(adherence.enoughData).toBe(false);
  });

  it('記録が足りなければ判断しない', () => {
    const logs = [0, 1, 2].map((d) => ateDay(ago(d), 2400));
    expect(nutritionAdherence(logs, target, NOW).enoughData).toBe(false);
    expect(MIN_COMPLETED_NUTRITION_DAYS).toBe(4);
  });

  it('目標に近い日を数える', () => {
    const logs = [
      ateDay(ago(0), 2400), ateDay(ago(1), 2300), ateDay(ago(2), 2500),
      ateDay(ago(3), 3200),
    ];
    const adherence = nutritionAdherence(logs, target, NOW);
    expect(adherence.completedDays).toBe(4);
    expect(adherence.daysNearCalorieTarget).toBe(3);
    expect(adherence.onTrack).toBe(true);
  });

  it('目標から離れた日ばかりなら、沿っているとは言わない', () => {
    const logs = [0, 1, 2, 3].map((d) => ateDay(ago(d), 3400));
    const adherence = nutritionAdherence(logs, target, NOW);
    expect(adherence.enoughData).toBe(true);
    expect(adherence.onTrack).toBe(false);
  });

  it('7日より前の記録は今週に数えない', () => {
    const logs = [0, 1, 2, 3].map((d) => ateDay(ago(d + 8), 2400));
    expect(nutritionAdherence(logs, target, NOW).completedDays).toBe(0);
  });

  it('目標が無くても落ちない', () => {
    const adherence = nutritionAdherence([ateDay(ago(0), 2400)], null, NOW);
    expect(adherence.daysNearCalorieTarget).toBe(0);
    expect(adherence.targetCalories).toBeNull();
  });
});

describe('目的の向き', () => {
  it('保存されたgoalから決める', () => {
    expect(directionFor(data({ personalPlan: plan('fat-loss') }))).toBe('cut');
    expect(directionFor(data({ personalPlan: plan('muscle') }))).toBe('bulk');
  });

  it('recomp・health・strengthは体重だけで判断しない', () => {
    for (const goal of ['recomp', 'health', 'strength'] as const) {
      expect(directionFor(data({ personalPlan: plan(goal) }))).toBe('maintain');
    }
  });

  it('Planが無ければ dietPlan.mode を見る', () => {
    expect(directionFor(data({ dietPlan }))).toBe('cut');
    expect(directionFor(data({ dietPlan: { ...dietPlan, mode: 'bulk' } }))).toBe('bulk');
    expect(directionFor(emptyData())).toBe('maintain');
  });
});

describe('見直しの提案', () => {
  const enoughTrend = (changeKg: number): WeightTrend => ({
    currentAverageKg: 72, previousAverageKg: 72 - changeKg, changeKg,
    changePercent: 0, currentCount: 4, previousCount: 4, enoughData: true,
  });
  const enoughAdherence: NutritionAdherence = {
    completedDays: 5, averageCalories: 2400, averageProtein: 140,
    targetCalories: 2400, targetProtein: 140,
    daysNearCalorieTarget: 5, daysMeetingProteinTarget: 4, enoughData: true, onTrack: true,
  };
  const base = { currentCalories: 2400, currentOffsetKcal: 0, alreadyAdjustedThisPeriod: false };

  it('体重データが足りなければ集めている状態にする', () => {
    const result = recommendNutrition({
      ...base, direction: 'cut',
      trend: { ...enoughTrend(0), currentCount: 2, enoughData: false },
      adherence: enoughAdherence,
    });
    expect(result.state).toBe('collecting-data');
    expect(result.deltaKcal).toBe(0);
    expect(result.needsMoreDays).toBeGreaterThan(0);
  });

  it('食事記録が足りなければ集めている状態にする', () => {
    const result = recommendNutrition({
      ...base, direction: 'cut', trend: enoughTrend(0),
      adherence: { ...enoughAdherence, completedDays: 2, enoughData: false, onTrack: false },
    });
    expect(result.state).toBe('collecting-data');
    expect(result.deltaKcal).toBe(0);
  });

  it('記録が目標から離れていれば、まず記録を揃える方向にする', () => {
    const result = recommendNutrition({
      ...base, direction: 'cut', trend: enoughTrend(0),
      adherence: { ...enoughAdherence, daysNearCalorieTarget: 1, onTrack: false },
    });
    expect(result.state).toBe('consistency-first');
    expect(result.deltaKcal).toBe(0);
  });

  it('減量で横ばいなら、小さく下げる候補を出す', () => {
    const result = recommendNutrition({ ...base, direction: 'cut', trend: enoughTrend(0), adherence: enoughAdherence });
    expect(result.state).toBe('adjust-down');
    expect(result.deltaKcal).toBe(-CALORIE_STEP_KCAL);
    expect(result.nextCalories).toBe(2300);
  });

  it('減量で意図どおり減っていれば、そのまま続ける', () => {
    const result = recommendNutrition({ ...base, direction: 'cut', trend: enoughTrend(-0.5), adherence: enoughAdherence });
    expect(result.state).toBe('keep');
    expect(result.deltaKcal).toBe(0);
  });

  it('増量で横ばいなら、小さく上げる候補を出す', () => {
    const result = recommendNutrition({ ...base, direction: 'bulk', trend: enoughTrend(0), adherence: enoughAdherence });
    expect(result.state).toBe('adjust-up');
    expect(result.deltaKcal).toBe(CALORIE_STEP_KCAL);
  });

  it('増量で意図どおり増えていれば、そのまま続ける', () => {
    const result = recommendNutrition({ ...base, direction: 'bulk', trend: enoughTrend(0.5), adherence: enoughAdherence });
    expect(result.state).toBe('keep');
  });

  it('維持・recompでは体重だけで動かさない', () => {
    const result = recommendNutrition({ ...base, direction: 'maintain', trend: enoughTrend(0), adherence: enoughAdherence });
    expect(result.state).toBe('keep');
    expect(result.deltaKcal).toBe(0);
  });

  it('同じ週にもう調整していれば、続けて調整しない', () => {
    const result = recommendNutrition({
      ...base, direction: 'cut', trend: enoughTrend(0), adherence: enoughAdherence,
      alreadyAdjustedThisPeriod: true,
    });
    expect(result.state).toBe('keep');
    expect(result.deltaKcal).toBe(0);
  });

  it('上限まで来ていたら、それ以上は動かさない', () => {
    const result = recommendNutrition({
      ...base, direction: 'cut', trend: enoughTrend(0), adherence: enoughAdherence,
      currentOffsetKcal: -MAX_OFFSET_KCAL,
    });
    expect(result.state).toBe('keep');
    expect(result.deltaKcal).toBe(0);
  });

  it('目標そのものが無ければ、まずPlanを作る方向にする', () => {
    const result = recommendNutrition({
      ...base, direction: 'cut', trend: enoughTrend(0), adherence: enoughAdherence, currentCalories: null,
    });
    expect(result.state).toBe('collecting-data');
  });

  it('どの文言も責めたり煽ったりしない', () => {
    const cases = [
      { direction: 'cut' as const, trend: enoughTrend(0), adherence: enoughAdherence },
      { direction: 'cut' as const, trend: enoughTrend(0.6), adherence: enoughAdherence },
      { direction: 'bulk' as const, trend: enoughTrend(0), adherence: enoughAdherence },
      { direction: 'cut' as const, trend: enoughTrend(0), adherence: { ...enoughAdherence, onTrack: false } },
      { direction: 'cut' as const, trend: { ...enoughTrend(0), enoughData: false }, adherence: enoughAdherence },
    ];
    for (const item of cases) {
      const result = recommendNutrition({ ...base, ...item });
      const text = `${result.headline}${result.detail}`;
      expect(text).not.toMatch(/食べすぎ|失敗|痩せていません|我慢|減らすべき|太りました|肥満|危険|ダメ|サボ/);
    }
  });
});

describe('目標の解決（唯一の計算箇所）', () => {
  it('Planが無ければnull', () => {
    expect(resolveNutritionTarget(emptyData())).toBeNull();
  });

  it('dietPlanをbaselineとして使う', () => {
    const target = resolveNutritionTarget(data({ dietPlan }))!;
    expect(target.calories).toBe(2400);
    expect(target.baselineCalories).toBe(2400);
    expect(target.offsetKcal).toBe(0);
    expect(target.source).toBe('diet-plan');
  });

  it('Personal Planからも目標を出せる', () => {
    const target = resolveNutritionTarget(data({ personalPlan: plan('fat-loss') }));
    expect(target).not.toBeNull();
    expect(target!.source).toBe('personal-plan');
    expect(target!.calories).toBeGreaterThan(0);
  });

  it('調整はbaselineに足され、Planは書き換わらない', () => {
    const base = data({ dietPlan });
    const adjusted = {
      ...base,
      nutritionAdjustments: { version: 1 as const, offsetKcal: -100, planKey: planKeyFor(base), lastPeriodKey: '', history: [] },
    };
    const target = resolveNutritionTarget(adjusted)!;
    expect(target.calories).toBe(2300);
    expect(target.baselineCalories).toBe(2400);
    expect(target.offsetKcal).toBe(-100);
    // 元のdietPlanは変わっていない
    expect(adjusted.dietPlan!.targetCalories).toBe(2400);
  });

  it('たんぱく質と脂質は動かさず、差は炭水化物で吸収する', () => {
    const base = data({ dietPlan });
    const adjusted = {
      ...base,
      nutritionAdjustments: { version: 1 as const, offsetKcal: -100, planKey: planKeyFor(base), lastPeriodKey: '', history: [] },
    };
    const target = resolveNutritionTarget(adjusted)!;
    expect(target.protein).toBe(140);
    expect(target.fat).toBe(70);
    expect(target.carbs).toBe(300 - 25);
  });

  it('どの値もNaNにならない', () => {
    const broken = parseStoredData(JSON.stringify({
      version: 1,
      dietPlan: { ...dietPlan, targetCalories: Number.NaN },
      nutritionAdjustments: { version: 1, offsetKcal: -100, planKey: 'x', lastPeriodKey: '', history: [] },
    }));
    const target = resolveNutritionTarget(broken);
    if (target != null) {
      for (const value of [target.calories, target.protein, target.fat, target.carbs]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('理由は調整があるときだけ出る', () => {
    const base = data({ dietPlan });
    expect(nutritionTargetReason(resolveNutritionTarget(base))).toBeNull();
    const adjusted = {
      ...base,
      nutritionAdjustments: { version: 1 as const, offsetKcal: -100, planKey: planKeyFor(base), lastPeriodKey: '', history: [] },
    };
    expect(nutritionTargetReason(resolveNutritionTarget(adjusted))).toContain('−100kcal');
  });
});

describe('Plan変更・目的変更での無効化', () => {
  it('診断をやり直したら、古い調整は効かない', () => {
    const before = data({ personalPlan: plan('fat-loss', '2026-07-01T00:00:00.000Z') });
    const adjustments = { version: 1 as const, offsetKcal: -200, planKey: planKeyFor(before), lastPeriodKey: '', history: [] };
    expect(activeOffsetKcal({ ...before, nutritionAdjustments: adjustments })).toBe(-200);

    // 作り直したPlan（createdAtが変わる）
    const after = data({ personalPlan: plan('fat-loss', '2026-09-01T00:00:00.000Z'), nutritionAdjustments: adjustments });
    expect(activeOffsetKcal(after)).toBe(0);
    expect(resolveNutritionTarget(after)!.offsetKcal).toBe(0);
  });

  it('目的を変えたら、古い調整は効かない', () => {
    const cutting = data({ personalPlan: plan('fat-loss') });
    const adjustments = { version: 1 as const, offsetKcal: -200, planKey: planKeyFor(cutting), lastPeriodKey: '', history: [] };
    const bulking = data({ personalPlan: plan('muscle'), nutritionAdjustments: adjustments });
    expect(activeOffsetKcal(bulking)).toBe(0);
  });

  it('Planが無ければ調整も効かない', () => {
    const adjustments = { version: 1 as const, offsetKcal: -200, planKey: 'personal:fat-loss:x', lastPeriodKey: '', history: [] };
    expect(activeOffsetKcal(data({ nutritionAdjustments: adjustments }))).toBe(0);
  });

  it('週のキーは月曜でそろう', () => {
    // 2026-09-03は木曜、その週の月曜は2026-08-31
    expect(periodKeyFor('2026-09-03')).toBe('2026-08-31');
    expect(periodKeyFor('2026-08-31')).toBe('2026-08-31');
    expect(periodKeyFor('2026-09-07')).toBe('2026-09-07');
    expect(periodKeyFor('こわれた')).toBe('');
  });
});

describe('保存と適用', () => {
  function seed(patch: Partial<BodymakersData> = {}) {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), dietPlan, ...patch }));
    return storage;
  }

  it('本人が選んで初めて調整が保存される', () => {
    const storage = seed();
    // 何もしなければ変わらない
    expect(parseStoredData(storage.getItem(STORAGE_KEY)).nutritionAdjustments.offsetKcal).toBe(0);

    const applied = applyNutritionAdjustment(-100, '記録をもとに', storage);
    expect(applied).not.toBeNull();
    expect(applied!.calories).toBe(2300);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.nutritionAdjustments.offsetKcal).toBe(-100);
    expect(resolveNutritionTarget(stored)!.calories).toBe(2300);
    // Planは書き換わっていない
    expect(stored.dietPlan!.targetCalories).toBe(2400);
  });

  it('履歴に変更前後と理由が残る', () => {
    const storage = seed();
    applyNutritionAdjustment(-100, '直近2週間の記録をもとに', storage);
    const [event] = parseStoredData(storage.getItem(STORAGE_KEY)).nutritionAdjustments.history;
    expect(event).toMatchObject({ fromCalories: 2400, toCalories: 2300, deltaKcal: -100, reason: '直近2週間の記録をもとに' });
    expect(event!.date).not.toBe('');
  });

  it('累積の上限を超えない', () => {
    const storage = seed();
    for (let i = 0; i < 10; i += 1) applyNutritionAdjustment(-100, 'test', storage);
    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.nutritionAdjustments.offsetKcal).toBe(-MAX_OFFSET_KCAL);
    expect(resolveNutritionTarget(stored)!.calories).toBe(2400 - MAX_OFFSET_KCAL);
  });

  it('Planの目安へ戻せる', () => {
    const storage = seed();
    applyNutritionAdjustment(-100, 'test', storage);
    expect(resetNutritionAdjustment(storage)).toBe(true);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.nutritionAdjustments.offsetKcal).toBe(0);
    expect(resolveNutritionTarget(stored)!.calories).toBe(2400);
    // 履歴は残る
    expect(stored.nutritionAdjustments.history.length).toBeGreaterThanOrEqual(2);
  });

  it('適用した週が記録される', () => {
    const storage = seed();
    applyNutritionAdjustment(-100, 'test', storage);
    expect(parseStoredData(storage.getItem(STORAGE_KEY)).nutritionAdjustments.lastPeriodKey).not.toBe('');
  });

  it('食事記録の完了は、あとから外せる', () => {
    const storage = seed();
    expect(setNutritionComplete('2026-09-03', true, storage)).toBe(true);
    let stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.dailyLogs.find((item) => item.date === '2026-09-03')?.nutritionComplete).toBe(true);

    setNutritionComplete('2026-09-03', false, storage);
    stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.dailyLogs.find((item) => item.date === '2026-09-03')?.nutritionComplete).toBe(false);
  });

  it('完了の印を付けても、その日の食事内容は消えない', () => {
    const storage = seed({ dailyLogs: [log('2026-09-03', { meals: [{ foodId: '01088', grams: 200 }], weightKg: 72 })] });
    setNutritionComplete('2026-09-03', true, storage);
    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    const day = stored.dailyLogs.find((item) => item.date === '2026-09-03')!;
    expect(day.meals).toHaveLength(1);
    expect(day.weightKg).toBe(72);
    expect(day.nutritionComplete).toBe(true);
  });

  it('Training側のデータを壊さない', () => {
    const storage = seed({
      trainingSessions: [{
        id: 'a', date: '2026-09-01', savedAt: '', programId: 'p', week: 1, day: 1, sessionKey: 'k',
        exercises: [{ exerciseId: 'squat', label: 'スクワット', plannedWeightKg: 100, plannedSets: 5, plannedReps: 5, sets: [{ weightKg: 100, reps: 5, done: true }] }],
      }],
      trainingAdjustments: { version: 1, lifts: { squat: { offsetKg: 5, consecutiveMisses: 0, reason: 'increase', lastDeltaKg: 5, updatedAt: '', lastSessionKey: 'k' } }, history: [] },
      recentFoodIds: ['01088'],
    });
    applyNutritionAdjustment(-100, 'test', storage);

    const stored = parseStoredData(storage.getItem(STORAGE_KEY));
    expect(stored.trainingSessions).toHaveLength(1);
    expect(stored.trainingAdjustments.lifts.squat?.offsetKg).toBe(5);
    expect(stored.recentFoodIds).toEqual(['01088']);
  });
});

describe('保存データとの互換', () => {
  it('この項目が無い旧データでも動く', () => {
    const legacy = parseStoredData(JSON.stringify({
      version: 1,
      dailyLogs: [{ date: '2026-09-01', weightKg: 70 }],
      dietPlan,
    }));
    expect(legacy.nutritionAdjustments).toEqual(emptyNutritionAdjustments());
    expect(legacy.dailyLogs[0]!.nutritionComplete).toBe(false);
    expect(resolveNutritionTarget(legacy)!.calories).toBe(2400);
  });

  it('壊れた調整データは既定値へ倒す', () => {
    for (const broken of ['ごみ', 42, null, [], { version: 9 }, { version: 1, offsetKcal: 'たくさん' }]) {
      const restored = normalizeNutritionAdjustments(broken);
      expect(Number.isFinite(restored.offsetKcal)).toBe(true);
    }
    expect(normalizeNutritionAdjustments({ version: 1, offsetKcal: 99999 }).offsetKcal).toBe(MAX_OFFSET_KCAL);
    expect(normalizeNutritionAdjustments({ version: 1, offsetKcal: -99999 }).offsetKcal).toBe(-MAX_OFFSET_KCAL);
  });

  it('壊れた履歴は落として、読めるものだけ残す', () => {
    const restored = normalizeNutritionAdjustments({
      version: 1, offsetKcal: -100, planKey: 'k', lastPeriodKey: 'p',
      history: [
        { id: 'a', date: '2026-09-01', fromCalories: 2400, toCalories: 2300, deltaKcal: -100, reason: 'x', periodKey: 'p' },
        { nope: true },
        'ごみ',
        { deltaKcal: Number.NaN, fromCalories: 1, toCalories: 1 },
      ],
    });
    expect(restored.history).toHaveLength(1);
  });

  it('書き出して読み込むと、調整も完了の印も戻る', () => {
    const base = data({ dietPlan, dailyLogs: [ateDay('2026-09-01', 2400)] });
    const original = {
      ...base,
      nutritionAdjustments: { version: 1 as const, offsetKcal: -100, planKey: planKeyFor(base), lastPeriodKey: '2026-08-31', history: [] },
    };
    const round = parseImport(JSON.stringify(buildExport(original)));
    expect(round.ok).toBe(true);
    if (!round.ok) return;

    expect(round.data.nutritionAdjustments.offsetKcal).toBe(-100);
    expect(round.data.dailyLogs[0]!.nutritionComplete).toBe(true);
    // 読み込んだデータからも同じ目標が出る
    expect(resolveNutritionTarget(round.data)!.calories).toBe(2300);
  });

  it('baselineの取得は目標が無ければnull', () => {
    expect(baselineNutritionTarget(emptyData())).toBeNull();
  });
});
