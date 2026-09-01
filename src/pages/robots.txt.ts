import type { APIContext } from 'astro';

import { SEARCH_INDEXING } from '../config/site';
import { url } from '../lib/url';

/**
 * robots.txt。
 *
 * 静的ファイルとして置くとサイトマップのURLを手で書くことになり、
 * 配信先を変えたときに古いドメインが残る。ビルド時に組み立てる。
 */
export function GET(context: APIContext): Response {
  const sitemap = new URL(url('/sitemap-index.xml'), context.site ?? 'https://example.com');

  const body = SEARCH_INDEXING
    ? `User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n`
    : // 公開前は検索エンジンに載せない。サイトマップも知らせない
      `User-agent: *\nDisallow: /\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
