// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';

/**
 * 公開URL。独自ドメインを取得したら SITE_URL を差し替えるだけで
 * sitemap・RSS・canonical・OGP がすべて追従する。
 *
 * CF_PAGES_URL は Cloudflare Pages がビルド時に入れる自分のURL。
 * Workers ビルドでは入らないので、その場合はダッシュボードで SITE_URL を設定する。
 */
const site = process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? 'https://bodymakers.example.com';

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
    sitemap(),
  ],
  build: {
    // 記事URLを /articles/xxx/ ではなく /articles/xxx.html にしないための設定。
    format: 'directory',
    // CSSは1ファイルにまとめず、使うページにだけ配る。
    inlineStylesheets: 'auto',
  },
  markdown: {
    // 既定の Sätteri プロセッサのまま、リンクの書き換えだけを足す
    processor: satteri(
      basePrefix === '' ? {} : { hastPlugins: [satteriBasePath(basePrefix)] },
    ),
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
