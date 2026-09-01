import { describe, it, expect } from 'vitest';

import { buildShareCard, CARD_LEVEL_COLORS, CARD_SIZE } from '../lib/strength/shareCard';
import { diagnose, type DiagnosisInput } from '../lib/strength/diagnose';
import { LEVELS } from '../lib/strength/standards';

function input(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    sex: 'M',
    bodyweightKg: 80,
    lifts: {
      squat: { weightKg: 150, reps: 3 },
      bench: { weightKg: 85, reps: 5 },
      deadlift: { weightKg: 180, reps: 3 },
    },
    ...overrides,
  };
}

describe('buildShareCard', () => {
  it('3種目そろえば合計を主表示にし、種目行を並べる', () => {
    const card = buildShareCard(diagnose(input())!);
    expect(card.scope).toBe('3種目合計');
    expect(card.rows).toHaveLength(3);
    expect(card.ladder).toBeNull();
    expect(card.summary).toContain('合計');
  });

  it('1種目なら その種目名を主表示にし、行の代わりに到達重量のはしごを出す', () => {
    const card = buildShareCard(
      diagnose(input({ lifts: { bench: { weightKg: 100, reps: 5 } } }))!,
    );
    expect(card.scope).toBe('ベンチプレス');
    // 1行だけの表は情報量が乏しいので、5段階の到達重量に置き換える
    expect(card.rows).toHaveLength(0);
    expect(card.ladder).toHaveLength(5);
    expect(card.summary).toContain('推定1RM');
  });

  it('はしごは現在の段をひとつだけ指し、重量は基準表にある値だけを出す', () => {
    const card = buildShareCard(
      diagnose(input({ lifts: { bench: { weightKg: 100, reps: 5 } } }))!,
    );
    const ladder = card.ladder!;
    expect(ladder.filter((step) => step.current)).toHaveLength(1);
    expect(ladder.find((step) => step.current)!.levelLabel).toBe(card.levelLabel);
    // 基準表の下限より下の段は推測せず「—」にする
    for (const step of ladder) {
      expect(step.weight === '—' || /^\d+(\.\d)?$/.test(step.weight)).toBe(true);
    }
    expect(ladder[0].weight).toBe('—');
  });

  it('性別と体重が meta に入る', () => {
    const card = buildShareCard(diagnose(input({ sex: 'F', bodyweightKg: 58 }))!);
    expect(card.meta).toContain('女性');
    expect(card.meta).toContain('58');
  });

  it('順位は「◯%より上」の形で、向きを読み違えない言い方になっている', () => {
    const card = buildShareCard(diagnose(input())!);
    expect(card.rank).toMatch(/より上|以内|範囲外/);
  });

  it('基準表の範囲外なら順位を断定しない', () => {
    const card = buildShareCard(
      diagnose(input({ lifts: { squat: { weightKg: 20, reps: 1 } } }))!,
    );
    expect(card.rank).toBe('基準表の範囲外');
  });

  it('進捗は 0〜1 に収まり、レベルが上がるほど大きい', () => {
    const weak = buildShareCard(
      diagnose(input({ lifts: { squat: { weightKg: 40, reps: 1 } } }))!,
    );
    const strong = buildShareCard(
      diagnose(input({ lifts: { squat: { weightKg: 300, reps: 1 } } }))!,
    );
    for (const card of [weak, strong]) {
      expect(card.progress).toBeGreaterThan(0);
      expect(card.progress).toBeLessThanOrEqual(1);
    }
    expect(strong.progress).toBeGreaterThan(weak.progress);
  });

  it('次の目標が出る。最上位なら null', () => {
    const normal = buildShareCard(diagnose(input())!);
    expect(normal.nextTarget).toMatch(/まで \+/);

    const top = buildShareCard(
      diagnose(input({ lifts: { squat: { weightKg: 400, reps: 1 } } }))!,
    );
    expect(top.levelLabel).toBe('エリート');
    expect(top.nextTarget).toBeNull();
  });

  it('種目ごとの行に重量とレベルが入る', () => {
    const card = buildShareCard(diagnose(input())!);
    for (const row of card.rows) {
      expect(row.label).not.toBe('');
      expect(row.weight).toMatch(/^\d+(\.\d+)?$/);
      expect(LEVELS.map((l) => l.label)).toContain(row.levelLabel);
      expect(CARD_LEVEL_COLORS[row.levelId]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('出典が必ず入る', () => {
    const card = buildShareCard(diagnose(input())!);
    expect(card.source).toContain('OpenPowerlifting');
  });

  it('全レベルに色が定義されている', () => {
    for (const level of LEVELS) {
      expect(CARD_LEVEL_COLORS[level.id]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('カードは正方形で、SNSで切られないサイズ', () => {
    expect(CARD_SIZE).toBe(1080);
  });
});
