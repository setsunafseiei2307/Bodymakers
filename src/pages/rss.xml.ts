import rss from '@astrojs/rss';
import type { APIContext } from 'astro';

import { getPublishedArticles } from '../lib/articles';
import { url } from '../lib/url';
import { SITE_DESCRIPTION, SITE_NAME } from '../config/site';

/**
 * RSSフィード。記事を毎日追加する運用では、
 * 更新を追う読者と外部サービスの両方に効く。
 */
export async function GET(context: APIContext) {
  const articles = await getPublishedArticles();

  return rss({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    // サブディレクトリ配信のときは、フィードの基準URLもその下を指す
    site: new URL(url('/'), context.site ?? 'https://bodymakers.example.com'),
    items: articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: article.data.publishedAt,
      link: url(`/articles/${article.id}`),
      categories: [article.data.category, ...article.data.tags],
    })),
    customData: '<language>ja</language>',
  });
}
