/**
 * 「次に気になること」のリンク切れテスト。
 *
 * サジェストは記事・ツール・診断を横断して行き先を出すので、
 * 記事を消したりツールのURLを変えたりすると、ここが真っ先に壊れる。
 * ビルド後の check-links でも拾えるが、それはビルドが通ってからの話なので、
 * 中央の表（TOOL_SUGGESTIONS）だけでも先に落とせるようにしておく。
 */

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { TOOLS } from '../config/tools';
// core だけを読む。../lib/suggestions.ts は astro:content を読むので、
// Astroの外（vitest）からは import できない。
import {
  MAX_SUGGESTIONS,
  allToolSuggestionKeys,
  isKnownHref,
  rawToolSuggestions,
} from '../lib/suggestions/core';

/**
 * 公開済み記事のID。
 * astro:content はテストから読めないので、ファイル名から直接引く。
 * 下書き（draft: true）はビルドから外れるが、リンク先としての存在確認には
 * ファイルがあれば足りるので、ここではファイル名だけを見る。
 */
const ARTICLE_DIR = join(process.cwd(), 'src/content/articles');
const articleIds = new Set(
  readdirSync(ARTICLE_DIR)
    .filter((name) => name.endsWith('.md') || name.endsWith('.mdx'))
    .map((name) => name.replace(/\.mdx?$/, '')),
);

const toolKeys = new Set(TOOLS.map((tool) => tool.key));

describe('ツールのサジェスト', () => {
  it('表に載っているキーは、すべて実在するツール', () => {
    for (const key of allToolSuggestionKeys()) {
      expect(toolKeys.has(key as never), `未知のツールキー: ${key}`).toBe(true);
    }
  });

  it('行き先はすべて実在するページ', () => {
    for (const key of allToolSuggestionKeys()) {
      for (const suggestion of rawToolSuggestions(key)) {
        expect(
          isKnownHref(suggestion.href, articleIds),
          `${key} のサジェストが存在しないページを指している: ${suggestion.href}`,
        ).toBe(true);
      }
    }
  });

  it('1つのツールに出すのは上限まで', () => {
    for (const key of allToolSuggestionKeys()) {
      expect(rawToolSuggestions(key).length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    }
  });

  it('同じツールの中で同じ行き先を二度出さない', () => {
    for (const key of allToolSuggestionKeys()) {
      const hrefs = rawToolSuggestions(key).map((item) => item.href);
      expect(new Set(hrefs).size, `${key} に重複した行き先がある`).toBe(hrefs.length);
    }
  });

  it('自分自身のツールへは戻さない', () => {
    for (const key of allToolSuggestionKeys()) {
      const self = TOOLS.find((tool) => tool.key === key);
      if (self == null) continue;
      const hrefs = rawToolSuggestions(key).map((item) => item.href);
      expect(hrefs, `${key} が自分自身を指している`).not.toContain(self.href);
    }
  });

  it('ラベルは問いの形で、長すぎない', () => {
    for (const key of allToolSuggestionKeys()) {
      for (const suggestion of rawToolSuggestions(key)) {
        expect(suggestion.label.length).toBeGreaterThan(0);
        expect(suggestion.label.length, `${key}: ${suggestion.label}`).toBeLessThanOrEqual(40);
      }
    }
  });
});

describe('行き先の検証', () => {
  it('実在しないページは通さない', () => {
    expect(isKnownHref('/articles/does-not-exist', articleIds)).toBe(false);
    expect(isKnownHref('/tools/does-not-exist', articleIds)).toBe(false);
    expect(isKnownHref('/nope', articleIds)).toBe(false);
  });

  it('末尾スラッシュの有無で判定が変わらない', () => {
    expect(isKnownHref('/tools/one-rep-max', articleIds)).toBe(true);
    expect(isKnownHref('/tools/one-rep-max/', articleIds)).toBe(true);
  });

  it('記事とツールと固定ページは通す', () => {
    expect(isKnownHref('/articles/beginner-first-month', articleIds)).toBe(true);
    expect(isKnownHref('/tools/nutrition', articleIds)).toBe(true);
    expect(isKnownHref('/start', articleIds)).toBe(true);
    expect(isKnownHref('/personal', articleIds)).toBe(true);
  });
});
