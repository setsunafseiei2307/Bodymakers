/**
 * 記事コレクションを扱うヘルパー。
 *
 * 「下書きを外す」「新しい順に並べる」といった処理を各ページに書くと、
 * 一覧とRSSとサイトマップで挙動がずれる。ここに集約して1か所で決める。
 */

import { getCollection, type CollectionEntry } from 'astro:content';

export { readingMinutes } from './readingTime';

export type Article = CollectionEntry<'articles'>;

/** 公開日の新しい順に並べる。 */
function byNewest(a: Article, b: Article): number {
  return b.data.publishedAt.getTime() - a.data.publishedAt.getTime();
}

/**
 * 公開済みの記事を新しい順に返す。
 * 開発サーバーでは下書きも見えるようにして、書きながら確認できるようにする。
 */
export async function getPublishedArticles(): Promise<Article[]> {
  const showDrafts = import.meta.env.DEV;
  const all = await getCollection('articles');
  return all.filter((article) => showDrafts || !article.data.draft).sort(byNewest);
}

/** スラッグから記事を1件引く。見つからなければ undefined。 */
export function findArticle(
  articles: Article[],
  slug: string | undefined,
): Article | undefined {
  if (!slug) return undefined;
  return articles.find((article) => article.id === slug);
}

/** 指定カテゴリの公開済み記事。 */
export async function getArticlesByCategory(category: string): Promise<Article[]> {
  const articles = await getPublishedArticles();
  return articles.filter((article) => article.data.category === category);
}

/**
 * 関連記事を選ぶ。
 * 同じタグを多く共有する記事を優先し、足りなければ同カテゴリの新しい記事で埋める。
 */
export async function getRelatedArticles(
  current: Article,
  limit = 3,
): Promise<Article[]> {
  const articles = await getPublishedArticles();
  const candidates = articles.filter((article) => article.id !== current.id);

  const scored = candidates.map((article) => {
    const sharedTags = article.data.tags.filter((tag) =>
      current.data.tags.includes(tag),
    ).length;
    const sameCategory = article.data.category === current.data.category ? 1 : 0;
    return { article, score: sharedTags * 2 + sameCategory };
  });

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return byNewest(a.article, b.article);
    })
    .slice(0, limit)
    .map((item) => item.article);
}

/** 日付を「2026年8月29日」の形式にする。 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

/** datetime 属性用の YYYY-MM-DD。 */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
