/**
 * Public Home v1 で足した部分。
 *
 * ここで守りたいのは2つ。
 *   1. HomeからURLで渡す目標が、表にある値だけを通すこと
 *   2. 保存済みの人に出す「続きから」が、Todayの再現にならないこと
 */

import { describe, expect, it } from 'vitest';

import { GOAL_CHOICES, FEATURED_ARTICLE_IDS, HOME_TOOLS, PROGRAM_ENTRIES } from '../config/home';
import { GOAL_IDS } from '../lib/diagnosis/types';
import { defaultDiagnosisInput } from '../lib/diagnosis/draft';
import { GOAL_PARAM, parseGoalParam, startHrefForGoal } from '../lib/home/goals';
import { buildContinueCard } from '../lib/home/continue';
import { emptyData, type BodymakersData } from '../lib/storage';
import type { ActiveProgram } from '../lib/programLibrary';

const personalPlan = {
  version: 1 as const,
  createdAt: '2026-06-01T00:00:00.000Z',
  input: defaultDiagnosisInput(),
};

const activeProgram: ActiveProgram = {
  programId: 'bodymakers-linear',
  startedAt: '2026-08-01T00:00:00.000Z',
  currentWeek: 1,
  currentDay: 2,
  trainingMaxes: { squat: 100 },
  daysPerWeek: 3,
  durationWeeks: 12,
  primaryLift: 'squat',
  completedSessions: 1,
};

function data(patch: Partial<BodymakersData> = {}): BodymakersData {
  return { ...emptyData(), ...patch };
}

describe('Homeから診断へ渡す目標', () => {
  it('診断にある目標だけを通す', () => {
    for (const goal of GOAL_IDS) {
      expect(parseGoalParam(goal)).toBe(goal);
    }
  });

  it('表にない値・空・null は無視する', () => {
    expect(parseGoalParam(null)).toBeNull();
    expect(parseGoalParam(undefined)).toBeNull();
    expect(parseGoalParam('')).toBeNull();
    expect(parseGoalParam('bulk')).toBeNull();
    expect(parseGoalParam('<script>')).toBeNull();
    // 大文字や別表記も通さない。曖昧に受け取らない。
    expect(parseGoalParam('MUSCLE')).toBeNull();
  });

  it('前後の空白は落として読む', () => {
    expect(parseGoalParam('  muscle ')).toBe('muscle');
  });

  it('Homeの4択は、すべて診断にある目標を指している', () => {
    expect(GOAL_CHOICES).toHaveLength(4);
    for (const choice of GOAL_CHOICES) {
      expect(GOAL_IDS).toContain(choice.goal);
      const href = startHrefForGoal('/start', choice.goal);
      expect(href).toBe(`/start?${GOAL_PARAM}=${choice.goal}`);
      // 作ったリンクを読み直しても同じ目標になる。
      const params = new URLSearchParams(href.slice(href.indexOf('?')));
      expect(parseGoalParam(params.get(GOAL_PARAM))).toBe(choice.goal);
    }
  });
});

describe('続きからカード', () => {
  it('Planも実行中Programも無ければ出さない', () => {
    expect(buildContinueCard(emptyData())).toBeNull();
  });

  it('実行中Programがあれば、いまの位置だけを出す', () => {
    const card = buildContinueCard(data({ activeProgram }));
    expect(card?.position).toBe('Week 1 / Day 2');
  });

  it('Planだけの人には位置を出さない（推測しない）', () => {
    const card = buildContinueCard(data({ personalPlan }));
    expect(card).not.toBeNull();
    expect(card?.position).toBeNull();
  });

  it('週・日が壊れていても、カード自体は出せる', () => {
    const broken = { ...activeProgram, currentWeek: 0, currentDay: Number.NaN };
    const card = buildContinueCard(data({ activeProgram: broken }));
    expect(card).not.toBeNull();
    expect(card?.position).toBeNull();
  });

  it('重量・カロリー・達成率はHomeに持ち込まない', () => {
    const card = buildContinueCard(data({ activeProgram }));
    const text = `${card?.position ?? ''} ${card?.note ?? ''}`;
    expect(text).not.toMatch(/kg|kcal|%/);
  });
});

describe('Homeの行き先', () => {
  it('記事は4本、重複なし', () => {
    expect(FEATURED_ARTICLE_IDS).toHaveLength(4);
    expect(new Set(FEATURED_ARTICLE_IDS).size).toBe(4);
  });

  it('リンク先はすべてサイト内の絶対パス', () => {
    for (const entry of [...HOME_TOOLS, ...PROGRAM_ENTRIES]) {
      expect(entry.href.startsWith('/')).toBe(true);
    }
  });
});
