import { describe, expect, it } from 'vitest';

import { diagnose } from '../lib/strength/diagnose';
import {
  latestStrengthDiagnosis,
  latestStrengthLifts,
  snapshotDiagnosis,
} from '../lib/strength/history';

describe('筋力診断履歴', () => {
  it('共有・履歴表示に使える保存用スナップショットを作る', () => {
    const result = diagnose({
      sex: 'F',
      bodyweightKg: 60,
      lifts: {
        bench: { weightKg: 50, reps: 5 },
        squat: { weightKg: 80, reps: 5 },
      },
    })!;
    const saved = snapshotDiagnosis(result, '2026-09-01T12:00:00.000Z');

    expect(saved.sex).toBe('F');
    expect(saved.bodyweightKg).toBe(60);
    expect(saved.standardsGeneratedAt).toBe(result.generatedAt);
    expect(saved.lifts.map((lift) => lift.lift)).toEqual(['squat', 'bench']);
    expect(saved.lifts.every((lift) => lift.nextTargetKg % 2.5 === 0)).toBe(true);
  });

  it('前回診断と、種目ごとの最新値を取得できる', () => {
    const first = snapshotDiagnosis(diagnose({
      sex: 'M',
      bodyweightKg: 75,
      lifts: { bench: { weightKg: 80, reps: 5 } },
    })!, '2026-08-01T00:00:00.000Z');
    const second = snapshotDiagnosis(diagnose({
      sex: 'M',
      bodyweightKg: 75,
      lifts: { squat: { weightKg: 120, reps: 5 } },
    })!, '2026-09-01T00:00:00.000Z');

    expect(latestStrengthDiagnosis([first, second])?.id).toBe(second.id);
    const latest = latestStrengthLifts([first, second]);
    expect(latest.bench?.savedAt).toBe(first.savedAt);
    expect(latest.squat?.savedAt).toBe(second.savedAt);
  });
});
