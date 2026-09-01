import { describe, it, expect } from 'vitest';

import {
  EXERCISES,
  EQUIPMENT_ORDER,
  MUSCLES,
  exercisesByEquipment,
  findExercise,
  musclesWorked,
  untouchedMuscles,
} from '../lib/exercises';
import { PACE_STEPS, formatPace, pace, runningKcal } from '../lib/running';
import { bodyweightLoad, bodyweightOneRm, estimateOneRM } from '../lib/onerm';

describe('種目の一覧', () => {
  it('IDが重複していない', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('すべての種目に主働筋が1つ以上ある', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.primary.length, exercise.id).toBeGreaterThan(0);
    }
  });

  it('部位はすべて定義済みのもの', () => {
    for (const exercise of EXERCISES) {
      for (const muscle of [...exercise.primary, ...exercise.secondary]) {
        expect(MUSCLES, `${exercise.id}: ${muscle}`).toContain(muscle);
      }
    }
  });

  it('主働筋と補助筋が重複していない', () => {
    for (const exercise of EXERCISES) {
      for (const muscle of exercise.primary) {
        expect(exercise.secondary, `${exercise.id}: ${muscle}`).not.toContain(muscle);
      }
    }
  });

  it('道具はすべて定義済みのもの', () => {
    for (const exercise of EXERCISES) {
      expect(EQUIPMENT_ORDER, exercise.id).toContain(exercise.equipment);
    }
  });

  it('どの部位にも最低1種目ある', () => {
    for (const muscle of MUSCLES) {
      const found = EXERCISES.some((e) => e.primary.includes(muscle));
      expect(found, `${muscle} を主に鍛える種目がありません`).toBe(true);
    }
  });

  it('道具ごとの分類にすべての種目が含まれる', () => {
    const grouped = exercisesByEquipment().flatMap((g) => g.exercises);
    expect(grouped.length).toBe(EXERCISES.length);
  });

  /**
   * 基準データを持つのは公式競技会の記録がある BIG3 だけ。
   * ここが増えると「上位何%」を出せない種目にも順位が出てしまう。
   */
  it('基準データを持つ種目はBIG3の3つだけ', () => {
    const withStandards = EXERCISES.filter((e) => e.hasStandards).map((e) => e.id);
    expect(withStandards.sort()).toEqual(['bench-press', 'deadlift', 'squat']);
  });
});

describe('musclesWorked', () => {
  it('選んだ種目の部位をまとめる', () => {
    const { primary, secondary } = musclesWorked(['bench-press']);
    expect(primary).toEqual(['胸']);
    expect(secondary).toContain('上腕三頭筋');
    expect(secondary).toContain('肩');
  });

  it('主働筋になっている部位は補助側に出さない', () => {
    // ディップスは胸と三頭が主働。ベンチでは三頭は補助だが、
    // 合わせたときは主働として扱う
    const { primary, secondary } = musclesWorked(['bench-press', 'dips']);
    expect(primary).toContain('上腕三頭筋');
    expect(secondary).not.toContain('上腕三頭筋');
  });

  it('並び順は選んだ順ではなく決まった順になる', () => {
    const a = musclesWorked(['squat', 'bench-press']);
    const b = musclesWorked(['bench-press', 'squat']);
    expect(a.primary).toEqual(b.primary);
    expect(a.secondary).toEqual(b.secondary);
  });

  it('存在しないIDは無視する', () => {
    expect(musclesWorked(['bench-press', 'does-not-exist']).primary).toEqual(['胸']);
  });

  it('何も選んでいなければ空', () => {
    expect(musclesWorked([]).primary).toEqual([]);
    expect(musclesWorked([]).secondary).toEqual([]);
  });
});

describe('untouchedMuscles', () => {
  it('触れていない部位を返す', () => {
    const rest = untouchedMuscles(['bench-press']);
    expect(rest).toContain('大腿四頭筋');
    expect(rest).not.toContain('胸');
  });

  it('何もしていなければ全部位が残る', () => {
    expect(untouchedMuscles([]).length).toBe(MUSCLES.length);
  });
});

describe('findExercise', () => {
  it('IDで引ける', () => {
    expect(findExercise('squat')?.name).toBe('スクワット');
  });

  it('無いIDでは undefined', () => {
    expect(findExercise('nope')).toBeUndefined();
  });
});

describe('ランニングのペース', () => {
  it('距離と時間から分速を求める', () => {
    // 5km を 25分 → 分速200m
    const result = pace(5, 25)!;
    expect(result.metersPerMinute).toBeCloseTo(200, 6);
    expect(result.minutesPerKm).toBeCloseTo(5, 6);
    expect(result.kmPerHour).toBeCloseTo(12, 6);
  });

  it('速いペースではランニングの段を選ぶ', () => {
    expect(pace(5, 25)!.step.mets).toBe(8.3);
  });

  it('歩くペースでは歩行の段を選ぶ', () => {
    // 3km を 45分 → 分速66.7m。普通歩行の段
    expect(pace(3, 45)!.step.mets).toBe(3.0);
  });

  it('段と段の間のペースは遅い側に寄せる', () => {
    // 分速100m は 134 に届かないので、その下の段（93m以上）になる
    const result = pace(5, 50)!;
    expect(result.metersPerMinute).toBeCloseTo(100, 6);
    expect(result.step.mets).toBe(4.3);
  });

  it('段は速い順に並んでいる', () => {
    for (let i = 1; i < PACE_STEPS.length; i += 1) {
      expect(PACE_STEPS[i].metersPerMinute).toBeLessThan(PACE_STEPS[i - 1].metersPerMinute);
      expect(PACE_STEPS[i].mets).toBeLessThan(PACE_STEPS[i - 1].mets);
    }
  });

  it('0や負の値では計算しない', () => {
    expect(pace(0, 30)).toBeNull();
    expect(pace(5, 0)).toBeNull();
    expect(pace(-5, 30)).toBeNull();
    expect(pace(Number.NaN, 30)).toBeNull();
  });

  it('ペースを分秒で表示する', () => {
    expect(formatPace(5.5)).toBe('5分30秒/km');
    expect(formatPace(4)).toBe('4分00秒/km');
    expect(formatPace(0)).toBe('—');
  });

  it('消費カロリーはメッツ式と一致する', () => {
    // 5km 25分 → 8.3メッツ、体重60kg
    const expected = 8.3 * (25 / 60) * 60 * 1.05;
    expect(runningKcal(5, 25, 60)!).toBeCloseTo(expected, 6);
  });

  it('体重がなければ計算しない', () => {
    expect(runningKcal(5, 25, 0)).toBeNull();
  });
});

describe('自重種目の1RM', () => {
  it('体重に加重を足す', () => {
    expect(bodyweightLoad(70, 20)).toBe(90);
    expect(bodyweightLoad(70, 0)).toBe(70);
  });

  it('体重が無効なら計算しない', () => {
    expect(bodyweightLoad(0, 20)).toBeNull();
    expect(bodyweightLoad(70, -5)).toBeNull();
  });

  it('体重込みの重量で1RMを推定する', () => {
    // 体重70kg・加重20kgで5回 = 90kgで5回
    const viaBodyweight = bodyweightOneRm(70, 20, 5)!;
    const viaWeight = estimateOneRM(90, 5)!;
    expect(viaBodyweight.average).toBeCloseTo(viaWeight.average, 6);
  });

  it('加重なしの懸垂でも推定できる', () => {
    const result = bodyweightOneRm(70, 0, 10);
    expect(result).not.toBeNull();
    // 体重ぶんは必ず含まれるので、推定1RMは体重を下回らない
    expect(result!.average).toBeGreaterThan(70);
  });
});
