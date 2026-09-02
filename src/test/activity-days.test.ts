import { describe, expect, it } from 'vitest';

import {
  dateFromKey,
  dateKey,
  dateKeyFromISO,
  daysBetweenKeys,
  isDateKey,
  recentDateKeys,
  shiftDateKey,
  weekdayLabel,
} from '../lib/activity/days';

describe('日付キーの計算', () => {
  it('ローカル日付を YYYY-MM-DD にする', () => {
    expect(dateKey(new Date(2026, 8, 2, 23, 59))).toBe('2026-09-02');
    // 早朝でも前日にならない（UTCへ寄せていないこと）
    expect(dateKey(new Date(2026, 8, 2, 0, 30))).toBe('2026-09-02');
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('読めない日付は弾く', () => {
    expect(isDateKey('2026-09-02')).toBe(true);
    expect(isDateKey('2026-9-2')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('')).toBe(false);
    expect(isDateKey('きょう')).toBe(false);
    expect(dateFromKey('2026-02-30')).toBeNull();
  });

  it('日付をずらす', () => {
    expect(shiftDateKey('2026-09-02', -1)).toBe('2026-09-01');
    expect(shiftDateKey('2026-09-02', 1)).toBe('2026-09-03');
    expect(shiftDateKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    // うるう年
    expect(shiftDateKey('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('壊れた日付キーはそのまま返し、例外を投げない', () => {
    expect(shiftDateKey('こわれた', -1)).toBe('こわれた');
    expect(daysBetweenKeys('こわれた', '2026-09-02')).toBe(0);
  });

  it('日数の差を数える', () => {
    expect(daysBetweenKeys('2026-09-01', '2026-09-02')).toBe(1);
    expect(daysBetweenKeys('2026-09-02', '2026-09-02')).toBe(0);
    expect(daysBetweenKeys('2026-09-03', '2026-09-02')).toBe(-1);
    expect(daysBetweenKeys('2026-08-26', '2026-09-02')).toBe(7);
    // 月・年をまたいでもずれない
    expect(daysBetweenKeys('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('夏時間の切り替わりを挟んでも1日ずつ数える', () => {
    // 米国の夏時間開始・終了日。正午基準で計算しているので前後にずれない。
    expect(daysBetweenKeys('2026-03-07', '2026-03-09')).toBe(2);
    expect(shiftDateKey('2026-03-08', -1)).toBe('2026-03-07');
    expect(daysBetweenKeys('2026-10-31', '2026-11-02')).toBe(2);
    expect(shiftDateKey('2026-11-01', -1)).toBe('2026-10-31');
  });

  it('直近の連続した日付を古い順に返す', () => {
    expect(recentDateKeys('2026-09-02', 3)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02']);
    expect(recentDateKeys('2026-09-02', 1)).toEqual(['2026-09-02']);
    expect(recentDateKeys('2026-09-02', 0)).toEqual([]);
    expect(recentDateKeys('2026-09-02', 7)).toHaveLength(7);
  });

  it('曜日を1文字で返す', () => {
    // 2026-09-02 は水曜日
    expect(weekdayLabel('2026-09-02')).toBe('水');
    expect(weekdayLabel('2026-09-06')).toBe('日');
    expect(weekdayLabel('こわれた')).toBe('');
  });

  it('ISO日時をローカル日付へ直す', () => {
    expect(dateKeyFromISO(new Date(2026, 8, 2, 10, 0).toISOString())).toBe('2026-09-02');
    expect(dateKeyFromISO('だめな日時')).toBeNull();
  });
});
