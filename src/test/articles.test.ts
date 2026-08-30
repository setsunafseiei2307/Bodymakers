import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { TOOLS } from '../config/tools';
import { CATEGORY_KEYS } from '../config/site';
import { readingMinutes } from '../lib/readingTime';

/**
 * 記事の frontmatter が、記事→ツールの導線として成立しているかを検査する。
 *
 * 記事は今後も増える。書き手が primaryTool を書き忘れると、
 * 記事末の導線が消えて「読んで終わり」のページになるが、
 * ビルドは通ってしまうので気づけない。ここで落とす。
 *
 * astro:content は Astro の外から読めないので、Markdown を直接読む。
 */

const DIR = path.join(process.cwd(), 'src/content/articles');

interface Frontmatter {
  slug: string;
  raw: string;
  body: string;
  title: string;
  category: string;
  primaryTool?: string;
  nextArticle?: string;
  takeaways: string[];
  references: number;
}

/**
 * frontmatter を読む簡易パーサ。
 * YAML ライブラリを足すほどの用途ではないので、必要な項目だけ拾う。
 */
function parse(file: string): Frontmatter {
  const source = fs.readFileSync(path.join(DIR, file), 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: frontmatter を読めません`);
  const [, raw, body] = match;

  const scalar = (key: string): string | undefined => {
    const m = raw.match(new RegExp(`^${key}: (.*)$`, 'm'));
    return m ? m[1].trim() : undefined;
  };
  const list = (key: string): string[] => {
    const m = raw.match(new RegExp(`^${key}:\\n((?:  - .*\\n?)+)`, 'm'));
    if (!m) return [];
    return m[1]
      .split('\n')
      .filter((line) => line.startsWith('  - '))
      .map((line) => line.slice(4).trim());
  };

  return {
    slug: file.replace(/\.md$/, ''),
    raw,
    body,
    title: scalar('title') ?? '',
    category: scalar('category') ?? '',
    primaryTool: scalar('primaryTool'),
    nextArticle: scalar('nextArticle'),
    takeaways: list('takeaways'),
    references: (raw.match(/^ {2}- title:/gm) ?? []).length,
  };
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md'));
const articles = files.map(parse);
const slugs = new Set(articles.map((a) => a.slug));
const toolKeys = new Set(TOOLS.map((t) => t.key));

describe('記事の frontmatter', () => {
  it('記事が1本以上ある', () => {
    expect(articles.length).toBeGreaterThan(0);
  });

  it.each(articles.map((a) => [a.slug, a] as const))(
    '%s',
    (_slug, article) => {
      // カテゴリは定義済みのものだけ
      expect(CATEGORY_KEYS).toContain(article.category);

      // 記事→ツールの導線。これが無いと記事末のCTAが出ない
      expect(article.primaryTool, 'primaryTool が必要です').toBeDefined();
      expect(toolKeys, `primaryTool: ${article.primaryTool} は未定義`).toContain(
        article.primaryTool,
      );

      // 冒頭の「この記事で分かること」
      expect(article.takeaways.length).toBeGreaterThanOrEqual(2);
      expect(article.takeaways.length).toBeLessThanOrEqual(4);

      // 主張には出典を添える方針
      expect(article.references, '参考文献が必要です').toBeGreaterThan(0);

      // 「次に読む」は存在する記事を指す（自分自身は不可）
      if (article.nextArticle) {
        expect(slugs, `nextArticle: ${article.nextArticle} が存在しません`).toContain(
          article.nextArticle,
        );
        expect(article.nextArticle).not.toBe(article.slug);
      }
    },
  );

  it('本文からサイト内のリンク先がすべて実在する', () => {
    for (const article of articles) {
      const links = [...article.body.matchAll(/\]\((\/articles\/[a-z0-9-]+)\)/g)];
      for (const [, href] of links) {
        const target = href.replace('/articles/', '');
        expect(slugs, `${article.slug} → ${href} が存在しません`).toContain(target);
      }
    }
  });

  it('すべての記事が、本文かCTAのどちらかでツールか診断へ送っている', () => {
    for (const article of articles) {
      const hasCta = Boolean(article.primaryTool);
      expect(hasCta, `${article.slug} に導線がありません`).toBe(true);
    }
  });
});

describe('readingMinutes', () => {
  it('短い本文でも最低1分になる', () => {
    expect(readingMinutes('短い')).toBe(1);
  });

  it('500字でおよそ1分', () => {
    expect(readingMinutes('あ'.repeat(500))).toBe(1);
    expect(readingMinutes('あ'.repeat(2000))).toBe(4);
  });

  it('コードブロックと記号は字数に数えない', () => {
    const withCode = 'あ'.repeat(500) + '\n\n```\n' + 'x'.repeat(5000) + '\n```\n';
    expect(readingMinutes(withCode)).toBe(1);
  });

  it('リンクは表示文字だけを数える', () => {
    // 表示は「ここ」の2文字。URLは読まない
    expect(readingMinutes('[ここ](https://example.com/very/long/path)')).toBe(1);
  });

  it('実際の記事はすべて1〜15分に収まる', () => {
    for (const article of articles) {
      const minutes = readingMinutes(article.body);
      expect(minutes).toBeGreaterThanOrEqual(1);
      expect(minutes).toBeLessThanOrEqual(15);
    }
  });
});
