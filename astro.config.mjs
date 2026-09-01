// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 記事の最終更新日。sitemap の lastmod に使う。
 *
 * sitemap の serialize には URL しか渡ってこないので、
 * ここで Markdown を直接読んで slug → 日付の対応を作っておく。
 * updatedAt があればそちらを優先する（内容を直した日が最終更新日）。
 * 値は ISO 文字列で持つ。sitemap の lastmod は文字列しか受け付けない。
 */
const articleDates = new Map(
  /** @type {[string, string][]} */ (
    fs
      .readdirSync(path.join(process.cwd(), 'src/content/articles'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => {
        const source = fs.readFileSync(
          path.join(process.cwd(), 'src/content/articles', file),
          'utf8',
        );
        const updated = source.match(/^updatedAt: (\S+)/m);
        const published = source.match(/^publishedAt: (\S+)/m);
        const value = (updated ?? published)?.[1];
        const date = value ? new Date(value) : null;
        // sitemap の lastmod は文字列で渡す必要がある（Date だと型が合わない）
        return [
          file.replace(/\.md$/, ''),
          date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
        ];
      })
      .filter((entry) => entry[1] !== null)
  ),
);

/**
 * 公開URL。canonical・OGP・sitemap・RSS がすべてここを基準にする。
 *
 * 既定値は現在の本番URL。ここが実在しないドメインだと、canonical が
 * 「本物は別の場所にある」と宣言することになり、検索結果から実ページが
 * 落ちうる。そのため既定値はプレースホルダにせず、実際の配信先にしておく。
 *
 * 独自ドメインを取得したら SITE_URL を設定すれば、そちらが優先される。
 * CF_PAGES_URL は Cloudflare Pages がビルド時に入れる自分のURL。
 */
const site =
  process.env.SITE_URL ??
  process.env.CF_PAGES_URL ??
  'https://bodymakers.shushushu1990.workers.dev';

/**
 * サブディレクトリ配信（GitHub Pages の project pages など）に対応するためのベースパス。
 * ルート直下に置くなら未設定でよい。
 */
const base = process.env.BASE_PATH ?? undefined;

/** ベースパスから、リンクの先頭に足す接頭辞を作る（ルート配信なら空文字）。 */
const basePrefix = (base ?? '/').replace(/\/+$/, '');

/**
 * 記事本文（Markdown）の中のサイト内リンクにも、配信先のベースパスを付ける。
 *
 * 記事は毎日追加していく運用なので、書き手が「今どこに配信しているか」を
 * 意識せずに /strength-standards と書けるようにしておく。
 * ルート直下配信のときはプラグイン自体を差し込まない。
 */
/**
 * @param {string} prefix サイト内リンクの先頭に足す接頭辞
 */
function satteriBasePath(prefix) {
  return {
    name: 'bodymakers-base-path',
    element: {
      filter: ['a', 'img'],
      /**
       * @param {{ properties?: Record<string, unknown> }} node
       * @param {{ setProperty(node: unknown, key: string, value: unknown): void }} ctx
       */
      visit(node, ctx) {
        for (const attr of ['href', 'src']) {
          const value = node.properties?.[attr];
          // 「/」始まりのサイト内パスだけが対象。「//」は外部URLの省略形
          if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
            ctx.setProperty(node, attr, prefix + value);
          }
        }
      },
    },
  };
}

/**
 * 記事本文の表を、横スクロールできる箱で包む。
 *
 * Markdown で書いた表は素の <table> になるため、列が多いと
 * スマホでページ全体が横に伸びる（実測: 6列の表で 360px の画面に対し 419px）。
 * ツール側の表は JSX で .table-scroll を書いているが、Markdown ではそれができない。
 * そこで変換時に包む。
 *
 * role="region" と tabindex="0" を付けるのは、スクロールできる領域を
 * キーボードでも操作できるようにするため（付けないと矢印キーで動かせない）。
 */
function satteriTableScroll() {
  return {
    name: 'bodymakers-table-scroll',
    element: {
      filter: ['table'],
      /**
       * @param {import('hast').Element} node
       * @param {{ wrapNode(node: unknown, parent: unknown): void }} ctx
       */
      visit(node, ctx) {
        ctx.wrapNode(node, {
          type: 'element',
          tagName: 'div',
          properties: {
            className: ['table-scroll'],
            role: 'region',
            tabIndex: 0,
            'aria-label': '表（横にスクロールできます）',
          },
          children: [],
        });
      },
    },
  };
}

export default defineConfig({
  site,
  base,
  // 全ページを静的HTMLとして書き出す。サーバー・DBを持たない構成の前提。
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    // React は診断ツールなど「操作が要る部分」だけをアイランドとして水和する。
    // 記事ページに React は配られない（実測: 外部JS 0本。
    // 配色切り替え用のインラインスクリプト約0.9KBのみ）。
    react(),
    // 記事には lastmod を付けて、更新したものを優先的に再クロールしてもらう。
    // 記事以外のページには付けない。ビルド日時を入れると毎回「更新した」
    // ことになってしまい、かえって信用されなくなるため。
    sitemap({
      serialize(item) {
        const match = item.url.match(/\/articles\/([a-z0-9-]+)\/?$/);
        const date = match ? articleDates.get(match[1]) : undefined;
        return date ? { ...item, lastmod: date } : item;
      },
    }),
  ],
  build: {
    // 記事URLを /articles/xxx/ ではなく /articles/xxx.html にしないための設定。
    format: 'directory',
    // CSSは1ファイルにまとめず、使うページにだけ配る。
    inlineStylesheets: 'auto',
  },
  markdown: {
    // 既定の Sätteri プロセッサのまま、必要な書き換えだけを足す
    processor: satteri({
      hastPlugins: [
        satteriTableScroll(),
        // ルート直下配信のときはリンク書き換えが不要なので差し込まない
        ...(basePrefix === '' ? [] : [satteriBasePath(basePrefix)]),
      ],
    }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
  vite: {
    build: {
      // 本番バンドルにソースマップを含めない。
      sourcemap: false,
    },
  },
});
