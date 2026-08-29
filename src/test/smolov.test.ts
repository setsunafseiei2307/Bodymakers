import { describe, it, expect } from 'vitest';
import { buildSmolov, smolovToText } from '../lib/smolov';

describe('buildSmolov — 構造', () => {
  it('4週ぶんのプランが出る', () => {
    const plan = buildSmolov(100, 'jr')!;
    expect(plan.weeks).toHaveLength(4);
    expect(plan.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
  });

  it('Smolov Jr. は週4日', () => {
    const plan = buildSmolov(100, 'jr')!;
    expect(plan.weeks[0].days).toHaveLength(4);
  });

  it('variant を変えると中身が変わる', () => {
    const jr = buildSmolov(100, 'jr')!;
    const base = buildSmolov(100, 'base')!;
    expect(base.variant).toBe('base');
    expect(base.tonnage).not.toBe(jr.tonnage);
  });

  it('デフォルトは jr', () => {
    expect(buildSmolov(100)!.variant).toBe('jr');
  });
});

describe('buildSmolov — 重量計算', () => {
  it('working max が毎週 weeklyIncrement ずつ上がる', () => {
    const plan = buildSmolov(100, 'jr', { weeklyIncrement: 5, roundingIncrement: 2.5 })!;
    const maxes = plan.weeks.map((w) => w.workingMax);
    expect(maxes).toEqual([100, 105, 110, 115]);
  });

  it('weeklyIncrement 0 なら全週同じ working max', () => {
    const plan = buildSmolov(100, 'jr', { weeklyIncrement: 0 })!;
    expect(new Set(plan.weeks.map((w) => w.workingMax)).size).toBe(1);
  });


  it('1日の tonnage = 重量 × セット × レップ', () => {
    const plan = buildSmolov(100, 'jr')!;
    for (const week of plan.weeks) {
      for (const day of week.days) {
        expect(day.tonnage).toBeCloseTo(day.weight * day.sets * day.reps, 4);
        expect(day.totalReps).toBe(day.sets * day.reps);
      }
    }
  });

  it('週の合計が日の合計と一致する', () => {
    const plan = buildSmolov(100, 'jr')!;
    for (const week of plan.weeks) {
      const t = week.days.reduce((s, d) => s + d.tonnage, 0);
      const r = week.days.reduce((s, d) => s + d.totalReps, 0);
      expect(week.tonnage).toBeCloseTo(t, 4);
      expect(week.totalReps).toBe(r);
    }
  });

  it('全体の合計が週の合計と一致する', () => {
    const plan = buildSmolov(100, 'jr')!;
    const t = plan.weeks.reduce((s, w) => s + w.tonnage, 0);
    const r = plan.weeks.reduce((s, w) => s + w.totalReps, 0);
    expect(plan.tonnage).toBeCloseTo(t, 4);
    expect(plan.totalReps).toBe(r);
  });

  it('1RM を2倍にすると総重量もほぼ2倍', () => {
    const a = buildSmolov(100, 'jr', { roundingIncrement: 0.001, weeklyIncrement: 0 })!;
    const b = buildSmolov(200, 'jr', { roundingIncrement: 0.001, weeklyIncrement: 0 })!;
    expect(b.tonnage / a.tonnage).toBeCloseTo(2, 2);
  });
});

describe('buildSmolov — テスト週', () => {
  it('デフォルトで4週目がテスト週', () => {
    const plan = buildSmolov(100)!;
    expect(plan.weeks[3].isTestWeek).toBe(true);
    expect(plan.weeks.slice(0, 3).every((w) => !w.isTestWeek)).toBe(true);
  });

  it('testWeek: false なら通常週になる', () => {
    const plan = buildSmolov(100, 'jr', { testWeek: false })!;
    expect(plan.weeks[3].isTestWeek).toBe(false);
  });

  it('各週に説明文が入っている', () => {
    const plan = buildSmolov(100)!;
    for (const w of plan.weeks) {
      expect(w.note.length).toBeGreaterThan(0);
      expect(w.label.length).toBeGreaterThan(0);
    }
  });
});

describe('buildSmolov — 異常系', () => {
  it('1RM が 0 以下なら null', () => {
    expect(buildSmolov(0)).toBeNull();
    expect(buildSmolov(-100)).toBeNull();
  });

  it('NaN / Infinity は null', () => {
    expect(buildSmolov(NaN)).toBeNull();
    expect(buildSmolov(Infinity)).toBeNull();
  });

  it('極端に軽い1RM でもクラッシュしない', () => {
    const plan = buildSmolov(1, 'jr', { roundingIncrement: 0.5 })!;
    expect(plan.weeks).toHaveLength(4);
    expect(Number.isFinite(plan.tonnage)).toBe(true);
  });

  it('極端に重い1RM でも有限値', () => {
    const plan = buildSmolov(1000)!;
    expect(Number.isFinite(plan.tonnage)).toBe(true);
  });
});

describe('smolovToText', () => {
  it('種目名と週の情報が入ったテキストになる', () => {
    const plan = buildSmolov(100, 'jr')!;
    const text = smolovToText(plan, 'ベンチプレス');
    expect(text).toContain('ベンチプレス');
    expect(text).toContain('Week 1');
    expect(text).toContain('Week 4');
    expect(text.split('\n').length).toBeGreaterThan(10);
  });

  it('全週の重量がテキストに現れる', () => {
    const plan = buildSmolov(100, 'jr', { weeklyIncrement: 5 })!;
    const text = smolovToText(plan, 'スクワット');
    for (const week of plan.weeks.filter((w) => !w.isTestWeek)) {
      expect(text).toContain(String(week.days[0].weight));
    }
  });
});
