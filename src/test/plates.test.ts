import { describe, it, expect } from 'vitest';
import {
  calcPlates,
  loadableWeights,
  kgToLb,
  lbToKg,
  KG_PLATES,
  LB_PLATES,
  BAR_OPTIONS,
  LB_PER_KG,
} from '../lib/plates';

const total = (r: ReturnType<typeof calcPlates>) =>
  r.perSide.reduce((s, p) => s + p.weight * p.count, 0);

describe('calcPlates — 正常系', () => {
  it('100kg / バー20kg は片側40kg（枚数最小の 25+15）', () => {
    const r = calcPlates(100, 20, KG_PLATES);
    expect(r.error).toBeNull();
    expect(r.achieved).toBe(100);
    expect(r.diff).toBe(0);
    expect(r.perSideWeight).toBe(40);
    expect(r.perSide).toEqual([
      expect.objectContaining({ weight: 25, count: 1 }),
      expect.objectContaining({ weight: 15, count: 1 }),
    ]);
  });

  it('140kg / バー20kg は片側 25×2 + 10×1', () => {
    const r = calcPlates(140, 20, KG_PLATES);
    expect(r.perSide).toEqual([
      expect.objectContaining({ weight: 25, count: 2 }),
      expect.objectContaining({ weight: 10, count: 1 }),
    ]);
  });

  it('バーだけ（20kg）ならプレートは 0 枚', () => {
    const r = calcPlates(20, 20, KG_PLATES);
    expect(r.error).toBeNull();
    expect(r.perSide).toHaveLength(0);
    expect(r.achieved).toBe(20);
  });

  it('重い順に載せる貪欲法になっている', () => {
    const r = calcPlates(142.5, 20, KG_PLATES);
    const weights = r.perSide.map((p) => p.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it('片側合計 × 2 + バー = 達成重量', () => {
    for (const target of [60, 82.5, 137.5, 205, 300]) {
      const r = calcPlates(target, 20, KG_PLATES);
      expect(r.achieved).toBeCloseTo(20 + total(r) * 2, 6);
    }
  });

  it('組める重量ならピッタリ一致する', () => {
    for (const target of [22.5, 25, 40, 60, 100, 180]) {
      const r = calcPlates(target, 20, KG_PLATES);
      expect(r.diff).toBe(0);
      expect(r.remainder).toBe(0);
    }
  });

  it('端数は remainder に残り、achieved は target 以下になる', () => {
    // 最小プレート 0.5kg = 総重量 1kg 刻み。100.3kg はピッタリ組めない
    const r = calcPlates(100.3, 20, KG_PLATES);
    expect(r.achieved).toBeLessThanOrEqual(100.3);
    expect(r.remainder).toBeGreaterThan(0);
    expect(r.diff).toBeLessThan(0);
  });

  it('ポンド環境でも計算できる（135lb / バー45lb → 片側45lb）', () => {
    const r = calcPlates(135, 45, LB_PLATES);
    expect(r.error).toBeNull();
    expect(r.perSideWeight).toBe(45);
    expect(r.achieved).toBe(135);
  });

  it('バー0kg（ダンベル等）でも計算できる', () => {
    const r = calcPlates(40, 0, KG_PLATES);
    expect(r.error).toBeNull();
    expect(r.achieved).toBe(40);
  });
});

describe('calcPlates — 境界値・異常系', () => {
  it('目標がバーより軽ければ BELOW_BAR', () => {
    const r = calcPlates(15, 20, KG_PLATES);
    expect(r.error).toBe('BELOW_BAR');
    expect(r.achieved).toBe(20);
    expect(r.diff).toBe(5);
  });

  it('目標 0 以下・NaN・Infinity は INVALID', () => {
    expect(calcPlates(0, 20, KG_PLATES).error).toBe('INVALID');
    expect(calcPlates(-100, 20, KG_PLATES).error).toBe('INVALID');
    expect(calcPlates(NaN, 20, KG_PLATES).error).toBe('INVALID');
    expect(calcPlates(Infinity, 20, KG_PLATES).error).toBe('INVALID');
  });

  it('バーがマイナスなら INVALID', () => {
    expect(calcPlates(100, -20, KG_PLATES).error).toBe('INVALID');
  });

  it('maxPerSide を超えて枚数を載せない', () => {
    const r = calcPlates(500, 20, KG_PLATES, 4);
    const count = r.perSide.reduce((s, p) => s + p.count, 0);
    expect(count).toBeLessThanOrEqual(4);
    expect(r.remainder).toBeGreaterThan(0);
  });

  it('使えるプレートが1種類だけでも動く', () => {
    const only20 = KG_PLATES.filter((p) => p.weight === 20);
    const r = calcPlates(100, 20, only20);
    expect(r.perSide).toEqual([expect.objectContaining({ weight: 20, count: 2 })]);
  });

  it('プレートが空配列でもクラッシュしない', () => {
    const r = calcPlates(100, 20, []);
    expect(r.error).toBeNull();
    expect(r.perSide).toHaveLength(0);
    expect(r.achieved).toBe(20);
  });

  it('浮動小数点の誤差でプレートを1枚取りこぼさない（0.1刻み想定）', () => {
    const r = calcPlates(20 + 1.25 * 2 * 3, 20, KG_PLATES);
    expect(r.remainder).toBe(0);
  });

  it('極端に重い目標でも有限の結果を返す', () => {
    const r = calcPlates(10_000, 20, KG_PLATES, 100);
    expect(Number.isFinite(r.achieved)).toBe(true);
    expect(r.error).toBeNull();
  });
});

describe('loadableWeights', () => {
  it('バー重量から始まり最小プレート×2刻みで増える', () => {
    const list = loadableWeights(20, KG_PLATES, 60);
    expect(list[0]).toBe(20);
    const step = Math.min(...KG_PLATES.map((p) => p.weight)) * 2;
    expect(list[1] - list[0]).toBeCloseTo(step, 6);
    expect(list[list.length - 1]).toBeLessThanOrEqual(60);
  });

  it('上限がバー未満なら空配列', () => {
    expect(loadableWeights(20, KG_PLATES, 10)).toEqual([]);
  });
});

describe('単位換算', () => {
  it('kg → lb → kg で元に戻る', () => {
    expect(lbToKg(kgToLb(100))).toBeCloseTo(100, 9);
  });

  it('換算係数が正しい', () => {
    expect(kgToLb(1)).toBeCloseTo(LB_PER_KG, 9);
    expect(lbToKg(LB_PER_KG)).toBeCloseTo(1, 9);
  });

  it('0 は 0', () => {
    expect(kgToLb(0)).toBe(0);
    expect(lbToKg(0)).toBe(0);
  });
});

describe('プレート定義の健全性', () => {
  it('kg / lb ともに重い順に並んでいる', () => {
    for (const set of [KG_PLATES, LB_PLATES]) {
      const w = set.map((p) => p.weight);
      expect([...w].sort((a, b) => b - a)).toEqual(w);
    }
  });

  it('バー候補に 0（バーなし）が含まれる', () => {
    expect(BAR_OPTIONS.kg).toContain(0);
    expect(BAR_OPTIONS.lb).toContain(0);
  });

  it('全プレートが正の重量を持つ', () => {
    for (const p of [...KG_PLATES, ...LB_PLATES]) {
      expect(p.weight).toBeGreaterThan(0);
    }
  });
});
