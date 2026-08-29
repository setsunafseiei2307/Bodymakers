import { describe, it, expect } from 'vitest';
import { isFiniteNumber, parseNumber, roundTo, fmt, fmtComma, clamp } from '../lib/format';

describe('isFiniteNumber', () => {
  it('有限の数値だけを通す', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-12.5)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber(-Infinity)).toBe(false);
  });

  it('数値以外は全て false', () => {
    expect(isFiniteNumber('100')).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
    expect(isFiniteNumber({})).toBe(false);
    expect(isFiniteNumber([])).toBe(false);
  });
});

describe('parseNumber', () => {
  it('通常の文字列を数値にする', () => {
    expect(parseNumber('100')).toBe(100);
    expect(parseNumber('62.5')).toBe(62.5);
    expect(parseNumber('-3')).toBe(-3);
  });

  it('空入力は null', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('   ')).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });

  it('想定外の文字列は null', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('--5')).toBeNull();
  });

  it('数値をそのまま渡しても通る', () => {
    expect(parseNumber(42)).toBe(42);
    expect(parseNumber(NaN)).toBeNull();
  });
});

describe('roundTo', () => {
  it('nearest がデフォルト', () => {
    expect(roundTo(61.3, 2.5)).toBe(62.5);
    expect(roundTo(61.2, 2.5)).toBe(60);
  });

  it('down / up が効く', () => {
    expect(roundTo(61.3, 2.5, 'down')).toBe(60);
    expect(roundTo(61.3, 2.5, 'up')).toBe(62.5);
    expect(roundTo(60, 2.5, 'up')).toBe(60);
  });

  it('浮動小数点誤差が残らない（62.50000000000001 を出さない）', () => {
    expect(roundTo(62.5, 2.5)).toBe(62.5);
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
  });

  it('increment が 0 以下・不正なら値をそのまま返す', () => {
    expect(roundTo(61.3, 0)).toBe(61.3);
    expect(roundTo(61.3, -1)).toBe(61.3);
    expect(roundTo(61.3, NaN)).toBe(61.3);
  });

  it('大きな値・小さな値でも壊れない', () => {
    expect(roundTo(1_000_000.4, 1)).toBe(1_000_000);
    expect(roundTo(0.004, 0.005)).toBe(0.005);
  });
});

describe('fmt / fmtComma', () => {
  it('末尾の 0 を落とす', () => {
    expect(fmt(62.5)).toBe('62.5');
    expect(fmt(60)).toBe('60');
    expect(fmt(60.04, 1)).toBe('60');
  });

  it('整数部の 0 は落とさない（digits=0 で 140 が "14" にならない）', () => {
    expect(fmt(140, 0)).toBe('140');
    expect(fmt(100, 0)).toBe('100');
    expect(fmt(30, 0)).toBe('30');
    expect(fmt(1990, 0)).toBe('1990');
    expect(fmt(0, 0)).toBe('0');
    expect(fmt(105, 0)).toBe('105');
  });

  it('digits を指定しても整数部は保つ', () => {
    expect(fmt(100, 1)).toBe('100');
    expect(fmt(220.5, 1)).toBe('220.5');
    expect(fmt(10, 2)).toBe('10');
  });

  it('null / NaN はダッシュ', () => {
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined)).toBe('—');
    expect(fmt(NaN)).toBe('—');
    expect(fmtComma(null)).toBe('—');
  });

  it('3桁区切りになる', () => {
    expect(fmtComma(1234567)).toBe('1,234,567');
  });
});

describe('clamp', () => {
  it('範囲に収める', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0, 0, 0)).toBe(0);
  });
});
