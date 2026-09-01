/**
 * 記事コレクションを扱うヘルパー。
 *
 * 「下書きを外す」「新しい順に並べる」といった処理を各ページに書くと、
 * 一覧とRSSとサイトマップで挙動がずれる。ここに集約して1か所で決める。
 */

import { getCollection, type CollectionEntry } from 'astro:content';

import { CATEGORY_KEYS, type CategoryKey } from '../config/site';

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

/**
 * 一覧の先頭で大きく出す記事。
 * 指定が無ければ、いちばん新しい記事を1本だけ使う
 * （先頭が空のページにならないようにするため）。
 */
export async function getFeaturedArticles(limit = 3): Promise<Article[]> {
  const articles = await getPublishedArticles();
  const featured = articles.filter((article) => article.data.featured);
  return (featured.length > 0 ? featured : articles.slice(0, 1)).slice(0, limit);
}

/** カテゴリごとに記事をまとめる（一覧の見出し用） */
export async function getArticlesGroupedByCategory(): Promise<
  { category: CategoryKey; articles: Article[] }[]
> {
  const articles = await getPublishedArticles();
  return CATEGORY_KEYS.map((category) => ({
    category,
    articles: articles.filter((article) => article.data.category === category),
  })).filter((group) => group.articles.length > 0);
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
 *
 * 【なぜ素朴な「同カテゴリの新着3件」ではだめか】
 * カテゴリは3つしかなく、basics には筋力・ダイエット・栄養が混在している。
 * 同カテゴリというだけで並べると、ベンチプレス100kgの記事に
 * 「体脂肪率」「エネルギー収支」が並ぶ。実際そうなっていた。
 *
 * そこで、
 *  - タグの一致を最も重く見る（書き手が付けた主題そのもの）
 *  - 送り先のツールが同じなら、読者の目的が近い
 *  - 「次に読む」で結ばれた関係は双方向で効かせる
 * とし、カテゴリが同じだけの記事は関連として出さない。
 *
 * 3件を埋めることより、関係のない記事を出さないことを優先する。
 */

/** タグが1つ一致したときの点。主題が同じという最も強い手がかり */
const SCORE_SHARED_TAG = 3;
/** 送り先のツールが同じときの点。読者の目的が近い */
const SCORE_SAME_TOOL = 2;
/** 「次に読む」で結ばれているときの点。向きは問わない */
const SCORE_NEXT_LINK = 2;
/** カテゴリが同じときの点。これ単独では関連と見なさない */
const SCORE_SAME_CATEGORY = 1;
/**
 * これ未満の記事は出さない。
 * カテゴリ一致だけ（1点）では足りない、という線引き。
 */
const MIN_SCORE = SCORE_SAME_TOOL;

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

    const sameTool =
      current.data.primaryTool != null &&
      article.data.primaryTool === current.data.primaryTool;

    const nextLinked =
      current.data.nextArticle === article.id ||
      article.data.nextArticle === current.id;

    const sameCategory = article.data.category === current.data.category;

    const score =
      sharedTags * SCORE_SHARED_TAG +
      (sameTool ? SCORE_SAME_TOOL : 0) +
      (nextLinked ? SCORE_NEXT_LINK : 0) +
      (sameCategory ? SCORE_SAME_CATEGORY : 0);

    return { article, score };
  });

  return scored
    .filter((item) => item.score >= MIN_SCORE)
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
