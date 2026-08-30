import { describe, it, expect } from 'vitest';
import {
  estimateOneRM,
  repTableFromOneRM,
  weightAtPercent,
  percentOfOneRM,
  REP_PERCENT_TABLE,
  MAX_REPS,
} from '../lib/onerm';

describe('estimateOneRM — 正常系', () => {
  it('7つの式すべてが返る', () => {
    const r = estimateOneRM(100, 5);
    expect(r).not.toBeNull();
    expect(r!.results).toHaveLength(7);
    expect(new Set(r!.results.map((x) => x.name)).size).toBe(7);
  });

  it('1回なら式を通さずその重量が 1RM', () => {
    const r = estimateOneRM(140, 1)!;
    expect(r.average).toBe(140);
    expect(r.min).toBe(140);
    expect(r.max).toBe(140);
    expect(r.spread).toBe(0);
  });

  it('Epley の値が理論値と一致する（100kg×5 → 116.67）', () => {
    const r = estimateOneRM(100, 5)!;
    const epley = r.results.find((x) => x.name === 'Epley')!;
    expect(epley.value).toBeCloseTo(100 * (1 + 5 / 30), 6);
  });

  it('Brzycki の値が理論値と一致する（100kg×5 → 112.5）', () => {
    const r = estimateOneRM(100, 5)!;
    const brzycki = r.results.find((x) => x.name === 'Brzycki')!;
    expect(brzycki.value).toBeCloseTo(112.5, 6);
  });

  it('平均は min と max の間に入る', () => {
    const r = estimateOneRM(80, 8)!;
    expect(r.average).toBeGreaterThanOrEqual(r.min);
    expect(r.average).toBeLessThanOrEqual(r.max);
    expect(r.spread).toBeCloseTo(r.max - r.min, 9);
  });

  it('回数が増えるほど推定1RMは大きくなる', () => {
    const a = estimateOneRM(100, 3)!.average;
    const b = estimateOneRM(100, 8)!.average;
    expect(b).toBeGreaterThan(a);
  });

  it('小数の回数は四捨五入される', () => {
    expect(estimateOneRM(100, 5.4)!.average).toBeCloseTo(estimateOneRM(100, 5)!.average, 9);
    expect(estimateOneRM(100, 5.6)!.average).toBeCloseTo(estimateOneRM(100, 6)!.average, 9);
  });
});

describe('estimateOneRM — 境界値・異常系', () => {
  it('上限回数ちょうどは計算し、超えたら null', () => {
    expect(estimateOneRM(100, MAX_REPS)).not.toBeNull();
    expect(estimateOneRM(100, MAX_REPS + 1)).toBeNull();
  });

  it('0回・マイナス回数は null', () => {
    expect(estimateOneRM(100, 0)).toBeNull();
    expect(estimateOneRM(100, -3)).toBeNull();
  });

  it('重量 0 以下は null', () => {
    expect(estimateOneRM(0, 5)).toBeNull();
    expect(estimateOneRM(-60, 5)).toBeNull();
  });

  it('NaN / Infinity は null', () => {
    expect(estimateOneRM(NaN, 5)).toBeNull();
    expect(estimateOneRM(100, NaN)).toBeNull();
    expect(estimateOneRM(Infinity, 5)).toBeNull();
    expect(estimateOneRM(100, Infinity)).toBeNull();
  });

  it('極端に小さい / 大きい重量でも有限値を返す', () => {
    expect(estimateOneRM(0.5, 10)!.average).toBeGreaterThan(0);
    const big = estimateOneRM(1_000_000, 10)!;
    expect(Number.isFinite(big.average)).toBe(true);
  });
});

describe('repTableFromOneRM', () => {
  it('1〜12回ぶんの行が出る', () => {
    const rows = repTableFromOneRM(100);
    expect(rows).toHaveLength(12);
    expect(rows[0].reps).toBe(1);
    expect(rows[11].reps).toBe(12);
  });

  it('1回の行は 1RM と一致する', () => {
    const rows = repTableFromOneRM(100);
    expect(rows[0].percent).toBe(100);
    expect(rows[0].weight).toBe(100);
  });

  it('回数が増えるほど重量は下がる', () => {
    const rows = repTableFromOneRM(150);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].weight).toBeLessThan(rows[i - 1].weight);
    }
  });


  it('換算表は 100% から単調減少している', () => {
    const percents = Object.keys(REP_PERCENT_TABLE)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => REP_PERCENT_TABLE[k]);
    expect(percents[0]).toBe(100);
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeLessThan(percents[i - 1]);
    }
  });
});

describe('weightAtPercent / percentOfOneRM', () => {
  it('往復して元の値に戻る', () => {
    const w = weightAtPercent(200, 80)!;
    expect(w).toBe(160);
    expect(percentOfOneRM(160, 200)).toBe(80);
  });


  it('不正入力は null', () => {
    expect(weightAtPercent(0, 80)).toBeNull();
    expect(weightAtPercent(200, 0)).toBeNull();
    expect(weightAtPercent(200, NaN)).toBeNull();
    expect(percentOfOneRM(100, 0)).toBeNull();
    expect(percentOfOneRM(NaN, 200)).toBeNull();
  });
});
