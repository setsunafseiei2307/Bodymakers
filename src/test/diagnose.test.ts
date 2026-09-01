import { describe, it, expect } from 'vitest';

import {
  diagnose,
  topPercent,
  validateInput,
  WEAKNESS_GAP_THRESHOLD,
  type DiagnosisInput,
} from '../lib/strength/diagnose';
import { LEVELS, LIFT_ORDER } from '../lib/strength/standards';

/** テスト用の標準的な入力（男性80kg、3種目とも入力済み）。 */
function baseInput(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    sex: 'M',
    bodyweightKg: 80,
    lifts: {
      squat: { weightKg: 140, reps: 5 },
      bench: { weightKg: 100, reps: 5 },
      deadlift: { weightKg: 170, reps: 5 },
    },
    ...overrides,
  };
}

describe('validateInput', () => {
  it('正常な入力ではエラーが無い', () => {
    expect(validateInput(baseInput())).toEqual([]);
  });

  it('体重が未入力ならエラー', () => {
    const errors = validateInput(baseInput({ bodyweightKg: Number.NaN }));
    expect(errors.map((e) => e.code)).toContain('bodyweight-required');
  });

  it('体重が範囲外ならエラー', () => {
    expect(validateInput(baseInput({ bodyweightKg: 10 })).map((e) => e.code)).toContain(
      'bodyweight-range',
    );
    expect(validateInput(baseInput({ bodyweightKg: 500 })).map((e) => e.code)).toContain(
      'bodyweight-range',
    );
  });

  it('体重の境界値は通る', () => {
    expect(validateInput(baseInput({ bodyweightKg: 30 }))).toEqual([]);
    expect(validateInput(baseInput({ bodyweightKg: 200 }))).toEqual([]);
  });

  it('種目が1つも無ければエラー', () => {
    const errors = validateInput(baseInput({ lifts: {} }));
    expect(errors.map((e) => e.code)).toContain('lift-required');
  });

  it('1種目だけでも通る', () => {
    const errors = validateInput(
      baseInput({ lifts: { bench: { weightKg: 80, reps: 3 } } }),
    );
    expect(errors).toEqual([]);
  });

  it('重量が範囲外ならその種目にエラーが付く', () => {
    const errors = validateInput(
      baseInput({ lifts: { squat: { weightKg: 0, reps: 5 } } }),
    );
    expect(errors[0].code).toBe('weight-range');
    expect(errors[0].lift).toBe('squat');
  });

  it('重量が上限超過ならエラー', () => {
    const errors = validateInput(
      baseInput({ lifts: { squat: { weightKg: 601, reps: 5 } } }),
    );
    expect(errors.map((e) => e.code)).toContain('weight-range');
  });

  it('レップ数が範囲外ならエラー', () => {
    expect(
      validateInput(baseInput({ lifts: { squat: { weightKg: 100, reps: 0 } } })).map(
        (e) => e.code,
      ),
    ).toContain('reps-range');
    expect(
      validateInput(baseInput({ lifts: { squat: { weightKg: 100, reps: 13 } } })).map(
        (e) => e.code,
      ),
    ).toContain('reps-range');
  });

  it('レップ数が整数でなければエラー', () => {
    const errors = validateInput(
      baseInput({ lifts: { squat: { weightKg: 100, reps: 5.5 } } }),
    );
    expect(errors.map((e) => e.code)).toContain('reps-range');
  });

  it('レップ数の境界値は通る', () => {
    expect(validateInput(baseInput({ lifts: { squat: { weightKg: 100, reps: 1 } } }))).toEqual(
      [],
    );
    expect(validateInput(baseInput({ lifts: { squat: { weightKg: 100, reps: 12 } } }))).toEqual(
      [],
    );
  });

  it('複数のエラーをまとめて返す', () => {
    const errors = validateInput({
      sex: 'M',
      bodyweightKg: 5,
      lifts: { squat: { weightKg: 0, reps: 0 } },
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('diagnose の基本', () => {
  it('入力が不正なら null', () => {
    expect(diagnose(baseInput({ lifts: {} }))).toBeNull();
    expect(diagnose(baseInput({ bodyweightKg: Number.NaN }))).toBeNull();
  });

  it('3種目すべての結果が入力順に返る', () => {
    const result = diagnose(baseInput())!;
    expect(result.lifts.map((l) => l.lift)).toEqual([...LIFT_ORDER]);
  });

  it('入力した種目だけが結果に含まれる', () => {
    const result = diagnose(baseInput({ lifts: { bench: { weightKg: 100, reps: 5 } } }))!;
    expect(result.lifts.length).toBe(1);
    expect(result.lifts[0].lift).toBe('bench');
  });

  it('推定1RMは挙上重量より重い（2レップ以上の場合）', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      expect(lift.oneRmKg).toBeGreaterThan(lift.input.weightKg);
    }
  });

  it('1レップなら推定1RMはその重量と一致し、ばらつきは0', () => {
    const result = diagnose(baseInput({ lifts: { squat: { weightKg: 150, reps: 1 } } }))!;
    expect(result.lifts[0].oneRmKg).toBe(150);
    expect(result.lifts[0].oneRmSpreadKg).toBe(0);
  });

  it('体重比が推定1RM ÷ 体重と一致する', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      expect(lift.bodyweightRatio).toBeCloseTo(lift.oneRmKg / 80, 10);
    }
  });

  it('基準表の母集団サイズと生成日が結果に載る', () => {
    const result = diagnose(baseInput())!;
    expect(result.sampleSize).toBeGreaterThan(0);
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('性別と体重が結果にそのまま引き継がれる', () => {
    const result = diagnose(baseInput({ sex: 'F', bodyweightKg: 58 }))!;
    expect(result.sex).toBe('F');
    expect(result.bodyweightKg).toBe(58);
  });
});

describe('パーセンタイルとレベル判定', () => {
  it('重い方が高い順位になる', () => {
    const light = diagnose(baseInput({ lifts: { squat: { weightKg: 100, reps: 5 } } }))!;
    const heavy = diagnose(baseInput({ lifts: { squat: { weightKg: 200, reps: 5 } } }))!;
    expect(heavy.lifts[0].percentile).toBeGreaterThan(light.lifts[0].percentile);
  });

  it('順位に対応したレベルが付く', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      expect(lift.percentile).toBeGreaterThanOrEqual(lift.level.minPercentile);
      expect(lift.percentile).toBeLessThanOrEqual(lift.level.maxPercentile);
    }
  });

  it('極端に軽ければ bound が below になり最下位レベルになる', () => {
    const result = diagnose(baseInput({ lifts: { squat: { weightKg: 20, reps: 1 } } }))!;
    expect(result.lifts[0].bound).toBe('below');
    expect(result.lifts[0].level.id).toBe('beginner');
  });

  it('極端に重ければ bound が above になり最上位レベルになる', () => {
    const result = diagnose(baseInput({ lifts: { squat: { weightKg: 400, reps: 1 } } }))!;
    expect(result.lifts[0].bound).toBe('above');
    expect(result.lifts[0].level.id).toBe('elite');
  });

  it('通常の範囲では bound が in-range になる', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      expect(lift.bound).toBe('in-range');
    }
  });

  it('同じ重量でも体重が重いほど順位は下がる', () => {
    const lightBw = diagnose({
      sex: 'M',
      bodyweightKg: 60,
      lifts: { squat: { weightKg: 140, reps: 5 } },
    })!;
    const heavyBw = diagnose({
      sex: 'M',
      bodyweightKg: 110,
      lifts: { squat: { weightKg: 140, reps: 5 } },
    })!;
    expect(heavyBw.lifts[0].percentile).toBeLessThan(lightBw.lifts[0].percentile);
  });

  it('同じ体重・同じ重量なら女性の方が高い順位になる', () => {
    const male = diagnose({
      sex: 'M',
      bodyweightKg: 65,
      lifts: { bench: { weightKg: 70, reps: 3 } },
    })!;
    const female = diagnose({
      sex: 'F',
      bodyweightKg: 65,
      lifts: { bench: { weightKg: 70, reps: 3 } },
    })!;
    expect(female.lifts[0].percentile).toBeGreaterThan(male.lifts[0].percentile);
  });
});

describe('レベル境界の重量表', () => {
  it('次に狙う重量と次レベル到達重量は2.5kg刻み', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      expect(lift.nextTargetKg % 2.5).toBeCloseTo(0, 10);
      expect(lift.nextTargetKg).toBeGreaterThan(lift.oneRmKg);
      if (lift.nextLevel) {
        expect(lift.nextLevel.actionableWeightKg % 2.5).toBeCloseTo(0, 10);
        expect(lift.nextLevel.actionableWeightKg).toBeGreaterThanOrEqual(lift.nextLevel.weightKg);
      }
    }
  });

  it('5段階すべての下限重量が並ぶ', () => {
    const result = diagnose(baseInput())!;
    const thresholds = result.lifts[0].thresholds;
    expect(thresholds.length).toBe(LEVELS.length);
    expect(thresholds.map((t) => t.level.id)).toEqual(LEVELS.map((l) => l.id));
  });

  it('下限重量はレベルが上がるほど重い', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      for (let i = 1; i < lift.thresholds.length; i += 1) {
        expect(lift.thresholds[i].weightKg).toBeGreaterThan(lift.thresholds[i - 1].weightKg);
      }
    }
  });

  it('最下位レベルには到達重量がない（0 を入れて画面側で「—」にする）', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      expect(lift.thresholds[0].level.id).toBe('beginner');
      expect(lift.thresholds[0].weightKg).toBe(0);
    }
  });

  it('次のレベルまでの不足分が負にならない', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      if (lift.nextLevel == null) continue;
      expect(lift.nextLevel.deltaKg).toBeGreaterThanOrEqual(0);
    }
  });

  it('次のレベルは現在のレベルの1つ上である', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      if (lift.nextLevel == null) continue;
      const currentIndex = LEVELS.findIndex((l) => l.id === lift.level.id);
      expect(lift.nextLevel.level.id).toBe(LEVELS[currentIndex + 1].id);
    }
  });

  it('最上位レベルなら次のレベルは null', () => {
    const result = diagnose(baseInput({ lifts: { squat: { weightKg: 400, reps: 1 } } }))!;
    expect(result.lifts[0].level.id).toBe('elite');
    expect(result.lifts[0].nextLevel).toBeNull();
  });

  it('自分の推定1RMは現在のレベルの下限以上である', () => {
    const result = diagnose(baseInput())!;
    for (const lift of result.lifts) {
      if (lift.bound === 'below') continue;
      const currentIndex = LEVELS.findIndex((l) => l.id === lift.level.id);
      expect(lift.oneRmKg).toBeGreaterThanOrEqual(
        lift.thresholds[currentIndex].weightKg - 1e-6,
      );
    }
  });
});

describe('トータル評価', () => {
  it('3種目そろえばトータルが出る', () => {
    const result = diagnose(baseInput())!;
    expect(result.total).not.toBeNull();
  });

  it('トータルは3種目の推定1RMの合計と一致する', () => {
    const result = diagnose(baseInput())!;
    const sum = result.lifts.reduce((acc, lift) => acc + lift.oneRmKg, 0);
    expect(result.total!.oneRmKg).toBeCloseTo(sum, 10);
  });

  it('2種目以下ではトータルは出ない', () => {
    const result = diagnose(
      baseInput({
        lifts: {
          squat: { weightKg: 140, reps: 5 },
          bench: { weightKg: 100, reps: 5 },
        },
      }),
    )!;
    expect(result.total).toBeNull();
  });

  it('トータルにもレベルと境界重量表が付く', () => {
    const result = diagnose(baseInput())!;
    expect(result.total!.level).toBeDefined();
    expect(result.total!.thresholds.length).toBe(LEVELS.length);
  });
});

describe('弱点部位の指摘', () => {
  it('デッドリフトだけ極端に弱ければ弱点として挙がる', () => {
    const result = diagnose(
      baseInput({
        lifts: {
          squat: { weightKg: 180, reps: 3 },
          bench: { weightKg: 130, reps: 3 },
          deadlift: { weightKg: 100, reps: 3 },
        },
      }),
    )!;
    expect(result.weaknesses.map((w) => w.lift)).toContain('deadlift');
  });

  it('弱点には動員部位の説明が付く', () => {
    const result = diagnose(
      baseInput({
        lifts: {
          squat: { weightKg: 180, reps: 3 },
          bench: { weightKg: 60, reps: 3 },
          deadlift: { weightKg: 200, reps: 3 },
        },
      }),
    )!;
    const bench = result.weaknesses.find((w) => w.lift === 'bench');
    expect(bench).toBeDefined();
    expect(bench!.muscles).toContain('大胸筋');
  });

  it('バランスが取れていれば弱点は挙がらない', () => {
    // 母集団の比率中央値どおりに揃えた入力（スクワット1に対しベンチ約0.66/デッドリフト約1.18）
    const result = diagnose(
      baseInput({
        lifts: {
          squat: { weightKg: 180, reps: 1 },
          bench: { weightKg: 118, reps: 1 },
          deadlift: { weightKg: 212, reps: 1 },
        },
      }),
    )!;
    for (const weakness of result.weaknesses) {
      expect(weakness.percentileGap).toBeGreaterThanOrEqual(WEAKNESS_GAP_THRESHOLD);
    }
  });

  it('弱点は順位差の大きい順に並ぶ', () => {
    const result = diagnose(
      baseInput({
        lifts: {
          squat: { weightKg: 200, reps: 1 },
          bench: { weightKg: 70, reps: 1 },
          deadlift: { weightKg: 150, reps: 1 },
        },
      }),
    )!;
    for (let i = 1; i < result.weaknesses.length; i += 1) {
      expect(result.weaknesses[i - 1].percentileGap).toBeGreaterThanOrEqual(
        result.weaknesses[i].percentileGap,
      );
    }
  });

  it('1種目だけの入力では弱点判定をしない', () => {
    const result = diagnose(baseInput({ lifts: { squat: { weightKg: 140, reps: 5 } } }))!;
    expect(result.weaknesses).toEqual([]);
  });

  it('釣り合う重量（balancedKg）は実際の推定1RMより重い', () => {
    const result = diagnose(
      baseInput({
        lifts: {
          squat: { weightKg: 180, reps: 1 },
          bench: { weightKg: 60, reps: 1 },
          deadlift: { weightKg: 200, reps: 1 },
        },
      }),
    )!;
    const bench = result.weaknesses.find((w) => w.lift === 'bench')!;
    expect(bench.balancedKg).not.toBeNull();
    expect(bench.balancedKg!).toBeGreaterThan(60);
  });

  it('弱点の順位差はしきい値以上である', () => {
    const result = diagnose(
      baseInput({
        lifts: {
          squat: { weightKg: 200, reps: 1 },
          bench: { weightKg: 60, reps: 1 },
          deadlift: { weightKg: 130, reps: 1 },
        },
      }),
    )!;
    expect(result.weaknesses.length).toBeGreaterThan(0);
    for (const weakness of result.weaknesses) {
      expect(weakness.percentileGap).toBeGreaterThanOrEqual(WEAKNESS_GAP_THRESHOLD);
    }
  });
});

describe('topPercent', () => {
  it('順位を「上位◯%」に変換する', () => {
    expect(topPercent(90)).toBe(10);
    expect(topPercent(50)).toBe(50);
    expect(topPercent(1)).toBe(99);
  });
});
