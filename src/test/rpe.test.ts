import { describe, it, expect } from 'vitest';
import {
  rpePercent,
  oneRmFromRpe,
  weightForRepsAtRpe,
  buildRpeMatrix,
  RPE_VALUES,
  RPE_MAX_REPS,
} from '../lib/rpe';

describe('rpePercent — 正常系', () => {
  it('1レップ RPE10 は 100%', () => {
    expect(rpePercent(1, 10)).toBe(100);
  });

  it('残り回数が同じなら同じ%（1×RPE9 と 2×RPE10）', () => {
    expect(rpePercent(1, 9)).toBe(rpePercent(2, 10));
    expect(rpePercent(3, 8)).toBe(rpePercent(5, 10));
  });

  it('同じレップ数なら RPE が下がるほど % も下がる', () => {
    let prev = rpePercent(5, 10)!;
    for (const rpe of [9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6]) {
      const cur = rpePercent(5, rpe)!;
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });

  it('同じ RPE ならレップ数が増えるほど % は下がる', () => {
    let prev = rpePercent(1, 8)!;
    for (let r = 2; r <= 8; r++) {
      const cur = rpePercent(r, 8)!;
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });
});

describe('rpePercent — 境界値・異常系', () => {
  it('RPE は 0.5 刻みのみ有効', () => {
    expect(rpePercent(5, 8.5)).not.toBeNull();
    expect(rpePercent(5, 8.3)).toBeNull();
    expect(rpePercent(5, 8.75)).toBeNull();
  });

  it('RPE の範囲外は null', () => {
    expect(rpePercent(5, 10.5)).toBeNull();
    expect(rpePercent(5, 5.5)).toBeNull();
    expect(rpePercent(5, 0)).toBeNull();
    expect(rpePercent(5, -1)).toBeNull();
  });

  it('レップ数の範囲外は null', () => {
    expect(rpePercent(0, 8)).toBeNull();
    expect(rpePercent(-2, 8)).toBeNull();
    expect(rpePercent(RPE_MAX_REPS, 10)).not.toBeNull();
    expect(rpePercent(RPE_MAX_REPS + 1, 10)).toBeNull();
  });

  it('表の端（12レップ×RPE6）まで値がある', () => {
    expect(rpePercent(12, 6)).toBeGreaterThan(0);
  });

  it('NaN / Infinity は null', () => {
    expect(rpePercent(NaN, 8)).toBeNull();
    expect(rpePercent(5, NaN)).toBeNull();
    expect(rpePercent(Infinity, 8)).toBeNull();
  });
});

describe('oneRmFromRpe', () => {
  it('1レップ RPE10 なら挙げた重量がそのまま 1RM', () => {
    expect(oneRmFromRpe(150, 1, 10)).toBeCloseTo(150, 9);
  });

  it('余力があるほど推定1RMは高くなる', () => {
    const hard = oneRmFromRpe(100, 5, 10)!;
    const easy = oneRmFromRpe(100, 5, 8)!;
    expect(easy).toBeGreaterThan(hard);
  });

  it('不正な重量は null', () => {
    expect(oneRmFromRpe(0, 5, 8)).toBeNull();
    expect(oneRmFromRpe(-100, 5, 8)).toBeNull();
    expect(oneRmFromRpe(NaN, 5, 8)).toBeNull();
  });

  it('換算不能な RPE 指定は null', () => {
    expect(oneRmFromRpe(100, 5, 4)).toBeNull();
  });
});

describe('weightForRepsAtRpe', () => {
  it('1RM から逆算して往復が一致する', () => {
    const oneRM = oneRmFromRpe(100, 5, 8)!;
    expect(weightForRepsAtRpe(oneRM, 5, 8)).toBeCloseTo(100, 6);
  });


  it('不正入力は null', () => {
    expect(weightForRepsAtRpe(0, 5, 8)).toBeNull();
    expect(weightForRepsAtRpe(200, 20, 8)).toBeNull();
  });
});

describe('buildRpeMatrix', () => {
  it('行=RPE、列=レップ数で全マスが埋まる', () => {
    const m = buildRpeMatrix(200);
    expect(m).toHaveLength(RPE_VALUES.length);
    expect(m[0]).toHaveLength(8);
    expect(m[0][0]).toEqual({ reps: 1, rpe: 10, percent: 100, weight: 200 });
  });

  it('maxReps は RPE_MAX_REPS で頭打ちになる', () => {
    expect(buildRpeMatrix(200, 99)[0]).toHaveLength(RPE_MAX_REPS);
  });

  it('1RM が null なら weight は null だが percent は出る', () => {
    const m = buildRpeMatrix(null);
    const cell = m[0][0];
    expect(cell.weight).toBeNull();
    expect(cell.percent).toBe(100);
  });

  it('右下に行くほど重量が軽くなる', () => {
    const m = buildRpeMatrix(200);
    const topLeft = m[0][0].weight!;
    const bottomRight = m[RPE_VALUES.length - 1][7].weight!;
    expect(bottomRight).toBeLessThan(topLeft);
  });

});
