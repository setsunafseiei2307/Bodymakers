// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

/**
 * 公開URL。独自ドメインを取得したら SITE_URL を差し替えるだけで
 * sitemap・RSS・canonical・OGP がすべて追従する。
 */
const site = process.env.SITE_URL ?? 'https://bodymakers.example.com';

/**
 * サブディレクトリ配信（GitHub Pages の project pages など）に対応するためのベースパス。
 * ルート直下に置くなら未設定でよい。
 */
const base = process.env.BASE_PATH ?? undefined;

export default defineConfig({
  site,
  base,
  // 全ページを静的HTMLとして書き出す。サーバー・DBを持たない構成の前提。
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    // React は診断ツールなど「操作が要る部分」だけをアイランドとして水和する。
    // 記事ページには一切JSを配らない。
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
