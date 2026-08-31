import { describe, expect, it } from 'vitest';
import { calculateFitnessScore } from '../lib/fitness';

describe('calculateFitnessScore', () => {
  it('returns null without a measurable event', () => {
    expect(calculateFitnessScore({})).toBeNull();
  });
  it('scores four transparent milestones', () => {
    const result = calculateFitnessScore({ bodyweightKg: 75, benchKg: 75, squatKg: 100, deadliftKg: 125, pullUps: 10, fiveKmMinutes: 25, plankSeconds: 120 });
    expect(result?.components).toHaveLength(4);
    expect(result?.score).toBe(68);
    expect(result?.components.find((item) => item.key === 'strength')?.score).toBe(80);
  });
  it('supports one category without inventing missing results', () => {
    const result = calculateFitnessScore({ pullUps: 5 });
    expect(result?.score).toBe(40);
    expect(result?.components).toHaveLength(1);
  });
  it('caps exceptional results at 100', () => {
    const result = calculateFitnessScore({ pullUps: 50, fiveKmMinutes: 14, plankSeconds: 600 });
    expect(result?.score).toBe(100);
  });
});
