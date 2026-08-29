import { describe, it, expect } from 'vitest';

import source from './strength-standards-source.json';
import { STRENGTH_STANDARDS } from '../lib/strength/standardsData';
import {
  interpolateCurve,
  interpolateSample,
  levelById,
  levelForPercentile,
  percentileForWeight,
  weightForPercentile,
  LEVELS,
  LIFT_ORDER,
  STANDARDS_SOURCE,
  type MetricId,
  type Sex,
} from '../lib/strength/standards';

const METRICS: MetricId[] = ['squat', 'bench', 'deadlift', 'total'];
const SEXES: Sex[] = ['M', 'F'];

describe('基準データと集計元の一致', () => {
  it('生成日・集計条件が集計元と一致する', () => {
    expect(STRENGTH_STANDARDS.generatedAt).toBe(source.generatedAt);
    expect(STRENGTH_STANDARDS.sinceYear).toBe(source.sinceYear);
    expect(STRENGTH_STANDARDS.minSample).toBe(source.minSample);
  });

  it('分位点グリッドが集計元と一致し、昇順である', () => {
    expect(STRENGTH_STANDARDS.percentileGrid).toEqual(source.percentileGrid);
    const grid = STRENGTH_STANDARDS.percentileGrid;
    for (let i = 1; i < grid.length; i += 1) {
      expect(grid[i]).toBeGreaterThan(grid[i - 1]);
    }
  });

  it('母集団の人数が集計元と一致する', () => {
    expect(STRENGTH_STANDARDS.totalLifters.M).toBe(source.totalLifters.M);
    expect(STRENGTH_STANDARDS.totalLifters.F).toBe(source.totalLifters.F);
  });

  it.each(SEXES)('%s のアンカー数・体重・標本数が集計元と一致する', (sex) => {
    const actual = STRENGTH_STANDARDS.anchors[sex];
    const expected = source.anchors[sex];
    expect(actual.length).toBe(expected.length);
    actual.forEach((anchor, index) => {
      expect(anchor.bodyweightKg).toBe(expected[index].bodyweightKg);
      expect(anchor.sample).toBe(expected[index].sample);
    });
  });

  it.each(SEXES)('%s の全分位数が集計元と一致する', (sex) => {
    const actual = STRENGTH_STANDARDS.anchors[sex];
    const expected = source.anchors[sex];
    actual.forEach((anchor, index) => {
      for (const metric of METRICS) {
        const expectedValues = (
          expected[index].percentiles as Record<string, number[] | null>
        )[metric];
        expect(anchor.percentiles[metric]).toEqual(expectedValues);
      }
    });
  });

  it.each(SEXES)('%s の種目間比率が集計元と一致する', (sex) => {
    const actual = STRENGTH_STANDARDS.anchors[sex];
    const expected = source.anchors[sex];
    actual.forEach((anchor, index) => {
      expect(anchor.ratios.benchPerSquat).toBe(expected[index].ratios.benchPerSquat);
      expect(anchor.ratios.deadliftPerSquat).toBe(expected[index].ratios.deadliftPerSquat);
    });
  });
});

describe('基準データの健全性', () => {
  it.each(SEXES)('%s のアンカーは体重の昇順に並んでいる', (sex) => {
    const anchors = STRENGTH_STANDARDS.anchors[sex];
    for (let i = 1; i < anchors.length; i += 1) {
      expect(anchors[i].bodyweightKg).toBeGreaterThan(anchors[i - 1].bodyweightKg);
    }
  });

  it.each(SEXES)('%s の分位数は単調非減少（強い分位ほど重い）', (sex) => {
    for (const anchor of STRENGTH_STANDARDS.anchors[sex]) {
      for (const metric of METRICS) {
        const values = anchor.percentiles[metric];
        if (values == null) continue;
        for (let i = 1; i < values.length; i += 1) {
          expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
        }
      }
    }
  });

  it.each(SEXES)('%s の分位数配列の長さはグリッドと一致する', (sex) => {
    const gridLength = STRENGTH_STANDARDS.percentileGrid.length;
    for (const anchor of STRENGTH_STANDARDS.anchors[sex]) {
      for (const metric of METRICS) {
        const values = anchor.percentiles[metric];
        if (values == null) continue;
        expect(values.length).toBe(gridLength);
      }
    }
  });

  it.each(SEXES)('%s は標本数の下限を満たすアンカーのみ数値を持つ', (sex) => {
    for (const anchor of STRENGTH_STANDARDS.anchors[sex]) {
      const hasData = anchor.percentiles.squat != null;
      expect(hasData).toBe(anchor.sample >= STRENGTH_STANDARDS.minSample);
    }
  });

  it.each(SEXES)('%s のトータルは3種目の分位数の単純和より大きくない', (sex) => {
    // 各分位点は独立に算出しているため、トータルの分位数が3種目の同分位点の和と
    // 完全一致することはない。ただしトータルの上振れが起きていないことは確認できる。
    for (const anchor of STRENGTH_STANDARDS.anchors[sex]) {
      const { squat, bench, deadlift, total } = anchor.percentiles;
      if (squat == null || bench == null || deadlift == null || total == null) continue;
      total.forEach((value, index) => {
        const naiveSum = squat[index] + bench[index] + deadlift[index];
        // 分位点ごとの和より 15% 以上大きければ集計ミスを疑う
        expect(value).toBeLessThanOrEqual(naiveSum * 1.15);
      });
    }
  });

  it.each(SEXES)('%s の種目間比率は現実的な範囲に収まる', (sex) => {
    for (const anchor of STRENGTH_STANDARDS.anchors[sex]) {
      const { benchPerSquat, deadliftPerSquat } = anchor.ratios;
      if (benchPerSquat == null || deadliftPerSquat == null) continue;
      // ベンチはスクワットより軽く、デッドリフトはスクワットより重いのが一般的
      expect(benchPerSquat).toBeGreaterThan(0.3);
      expect(benchPerSquat).toBeLessThan(1.0);
      expect(deadliftPerSquat).toBeGreaterThan(0.9);
      expect(deadliftPerSquat).toBeLessThan(1.7);
    }
  });

  it('出典情報が欠けていない', () => {
    expect(STANDARDS_SOURCE.name).toBe('OpenPowerlifting');
    expect(STANDARDS_SOURCE.url).toMatch(/^https:\/\//);
    expect(STANDARDS_SOURCE.dataUrl).toMatch(/^https:\/\//);
    expect(STANDARDS_SOURCE.license).not.toBe('');
    expect(STANDARDS_SOURCE.attribution).toContain('OpenPowerlifting');
  });
});

describe('レベル定義', () => {
  it('5段階ある', () => {
    expect(LEVELS.length).toBe(5);
  });

  it('パーセンタイル区間に隙間も重なりもない', () => {
    expect(LEVELS[0].minPercentile).toBe(0);
    expect(LEVELS[LEVELS.length - 1].maxPercentile).toBe(100);
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i].minPercentile).toBe(LEVELS[i - 1].maxPercentile);
    }
  });

  it('区切りは分位点グリッド上の値である（補間せず実データを境界に使うため）', () => {
    const grid = STRENGTH_STANDARDS.percentileGrid;
    for (const level of LEVELS) {
      if (level.minPercentile === 0) continue;
      expect(grid).toContain(level.minPercentile);
    }
  });

  it('すべてのレベルにラベルと説明がある', () => {
    for (const level of LEVELS) {
      expect(level.label).not.toBe('');
      expect(level.description).not.toBe('');
    }
  });

  it('levelForPercentile が境界値で正しいレベルを返す', () => {
    expect(levelForPercentile(0).id).toBe('beginner');
    expect(levelForPercentile(9.99).id).toBe('beginner');
    expect(levelForPercentile(10).id).toBe('novice');
    expect(levelForPercentile(29.99).id).toBe('novice');
    expect(levelForPercentile(30).id).toBe('intermediate');
    expect(levelForPercentile(64.99).id).toBe('intermediate');
    expect(levelForPercentile(65).id).toBe('advanced');
    expect(levelForPercentile(89.99).id).toBe('advanced');
    expect(levelForPercentile(90).id).toBe('elite');
    expect(levelForPercentile(100).id).toBe('elite');
  });

  it('levelForPercentile は不正な値でも最下位レベルを返す（例外を投げない）', () => {
    expect(levelForPercentile(Number.NaN).id).toBe('beginner');
    expect(levelForPercentile(Number.POSITIVE_INFINITY).id).toBe('beginner');
  });

  it('levelById が定義を引ける', () => {
    expect(levelById('elite').label).toBe('エリート');
    expect(levelById('beginner').label).toBe('初心者');
  });
});

describe('interpolateCurve', () => {
  it('アンカーちょうどの体重ではそのアンカーの値をそのまま返す', () => {
    const anchor = STRENGTH_STANDARDS.anchors.M[3];
    const curve = interpolateCurve(STRENGTH_STANDARDS, 'M', 'squat', anchor.bodyweightKg);
    expect(curve).toEqual(anchor.percentiles.squat);
  });

  it('アンカー間の体重では両端の中間の値になる', () => {
    const anchors = STRENGTH_STANDARDS.anchors.M;
    const low = anchors[3];
    const high = anchors[4];
    const middle = (low.bodyweightKg + high.bodyweightKg) / 2;
    const curve = interpolateCurve(STRENGTH_STANDARDS, 'M', 'squat', middle);
    expect(curve).not.toBeNull();
    const lowValues = low.percentiles.squat as number[];
    const highValues = high.percentiles.squat as number[];
    curve!.forEach((value, index) => {
      expect(value).toBeCloseTo((lowValues[index] + highValues[index]) / 2, 6);
    });
  });

  it('最軽量アンカーより軽くても外挿せず端の値を使う', () => {
    const first = STRENGTH_STANDARDS.anchors.M[0];
    const curve = interpolateCurve(STRENGTH_STANDARDS, 'M', 'squat', 20);
    expect(curve).toEqual(first.percentiles.squat);
  });

  it('最重量アンカーより重くても外挿せず端の値を使う', () => {
    const anchors = STRENGTH_STANDARDS.anchors.M;
    const last = anchors[anchors.length - 1];
    const curve = interpolateCurve(STRENGTH_STANDARDS, 'M', 'squat', 300);
    expect(curve).toEqual(last.percentiles.squat);
  });

  it('体重が不正なら null', () => {
    expect(interpolateCurve(STRENGTH_STANDARDS, 'M', 'squat', Number.NaN)).toBeNull();
    expect(interpolateCurve(STRENGTH_STANDARDS, 'M', 'squat', 0)).toBeNull();
    expect(interpolateCurve(STRENGTH_STANDARDS, 'M', 'squat', -10)).toBeNull();
  });

  it('女性の基準表も同じように引ける', () => {
    const anchor = STRENGTH_STANDARDS.anchors.F[2];
    const curve = interpolateCurve(STRENGTH_STANDARDS, 'F', 'bench', anchor.bodyweightKg);
    expect(curve).toEqual(anchor.percentiles.bench);
  });

  it('補間結果も単調非減少である', () => {
    const curve = interpolateCurve(STRENGTH_STANDARDS, 'M', 'deadlift', 77.3);
    expect(curve).not.toBeNull();
    for (let i = 1; i < curve!.length; i += 1) {
      expect(curve![i]).toBeGreaterThanOrEqual(curve![i - 1]);
    }
  });
});

describe('interpolateSample', () => {
  it('アンカーちょうどならその標本数', () => {
    const anchor = STRENGTH_STANDARDS.anchors.M[2];
    expect(interpolateSample(STRENGTH_STANDARDS, 'M', anchor.bodyweightKg)).toBe(anchor.sample);
  });

  it('アンカー間では按分され、両端の間に収まる', () => {
    const anchors = STRENGTH_STANDARDS.anchors.F;
    const low = anchors[1];
    const high = anchors[2];
    const value = interpolateSample(
      STRENGTH_STANDARDS,
      'F',
      (low.bodyweightKg + high.bodyweightKg) / 2,
    );
    expect(value).not.toBeNull();
    const min = Math.min(low.sample, high.sample);
    const max = Math.max(low.sample, high.sample);
    expect(value!).toBeGreaterThanOrEqual(min);
    expect(value!).toBeLessThanOrEqual(max);
  });

  it('範囲外は端の値を使う', () => {
    const anchors = STRENGTH_STANDARDS.anchors.M;
    expect(interpolateSample(STRENGTH_STANDARDS, 'M', 10)).toBe(anchors[0].sample);
    expect(interpolateSample(STRENGTH_STANDARDS, 'M', 400)).toBe(
      anchors[anchors.length - 1].sample,
    );
  });

  it('体重が不正なら null', () => {
    expect(interpolateSample(STRENGTH_STANDARDS, 'M', Number.NaN)).toBeNull();
  });
});

describe('percentileForWeight', () => {
  const grid = [10, 20, 30];
  const curve = [100, 150, 200];

  it('分位点ちょうどの重量ではその分位を返す', () => {
    expect(percentileForWeight(curve, grid, 100)).toEqual({ percentile: 10, bound: 'in-range' });
    expect(percentileForWeight(curve, grid, 150)).toEqual({ percentile: 20, bound: 'in-range' });
  });

  it('分位点の中間は線形補間される', () => {
    const result = percentileForWeight(curve, grid, 125);
    expect(result!.percentile).toBeCloseTo(15, 6);
    expect(result!.bound).toBe('in-range');
  });

  it('表の下限未満は below として下限値を返す', () => {
    expect(percentileForWeight(curve, grid, 50)).toEqual({ percentile: 10, bound: 'below' });
  });

  it('表の上限以上は above として上限値を返す', () => {
    expect(percentileForWeight(curve, grid, 200)).toEqual({ percentile: 30, bound: 'above' });
    expect(percentileForWeight(curve, grid, 999)).toEqual({ percentile: 30, bound: 'above' });
  });

  it('不正な入力では null', () => {
    expect(percentileForWeight([], grid, 100)).toBeNull();
    expect(percentileForWeight(curve, [10, 20], 100)).toBeNull();
    expect(percentileForWeight(curve, grid, Number.NaN)).toBeNull();
    expect(percentileForWeight(curve, grid, 0)).toBeNull();
  });

  it('実データでも順位が単調に増える', () => {
    const realCurve = interpolateCurve(STRENGTH_STANDARDS, 'M', 'squat', 80)!;
    const realGrid = STRENGTH_STANDARDS.percentileGrid;
    const light = percentileForWeight(realCurve, realGrid, 120)!;
    const heavy = percentileForWeight(realCurve, realGrid, 200)!;
    expect(heavy.percentile).toBeGreaterThan(light.percentile);
  });
});

describe('weightForPercentile', () => {
  const grid = [10, 20, 30];
  const curve = [100, 150, 200];

  it('分位点ちょうどならその重量', () => {
    expect(weightForPercentile(curve, grid, 20)).toBe(150);
  });

  it('分位点の中間は線形補間される', () => {
    expect(weightForPercentile(curve, grid, 15)).toBeCloseTo(125, 6);
  });

  it('グリッドの外は端の値に丸める（外挿しない）', () => {
    expect(weightForPercentile(curve, grid, 0)).toBe(100);
    expect(weightForPercentile(curve, grid, 100)).toBe(200);
  });

  it('不正な入力では null', () => {
    expect(weightForPercentile([], grid, 20)).toBeNull();
    expect(weightForPercentile(curve, [10], 20)).toBeNull();
    expect(weightForPercentile(curve, grid, Number.NaN)).toBeNull();
  });

  it('percentileForWeight と往復して元の値に戻る', () => {
    const realCurve = interpolateCurve(STRENGTH_STANDARDS, 'F', 'deadlift', 60)!;
    const realGrid = STRENGTH_STANDARDS.percentileGrid;
    const weight = weightForPercentile(realCurve, realGrid, 50)!;
    const back = percentileForWeight(realCurve, realGrid, weight)!;
    expect(back.percentile).toBeCloseTo(50, 4);
  });
});

describe('種目の定義', () => {
  it('診断対象は3種目', () => {
    expect(LIFT_ORDER).toEqual(['squat', 'bench', 'deadlift']);
  });

  it('全種目に基準データが存在する', () => {
    for (const sex of SEXES) {
      for (const lift of LIFT_ORDER) {
        const curve = interpolateCurve(STRENGTH_STANDARDS, sex, lift, 70);
        expect(curve).not.toBeNull();
        expect(curve!.length).toBeGreaterThan(0);
      }
    }
  });
});
