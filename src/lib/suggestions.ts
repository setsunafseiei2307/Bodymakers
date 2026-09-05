/**
 * 記事の「次に気になること」。
 *
 * 行き先の検証・ツール用の表は ./suggestions/core.ts にある（astro:content を
 * 読まないので、ユニットテストから直接叩ける）。このファイルは記事コレクションを
 * 読む必要がある部分だけを持ち、core をそのまま再輸出する。
 *
 * 【優先順位】
 *   1. 記事frontmatterの明示 suggestions（書き手が読者の次の問いを直接書く）
 *   2. primaryTool（読んだ直後に使う道具）
 *   3. nextArticle（書き手が決めた読む順番）
 *   4. タグ・カテゴリから作る関連記事
 * 上から順に埋め、最大 MAX_SUGGESTIONS 件で打ち切る。
 */

import { TOOLS } from '../config/tools';
import { getPublishedArticles, getRelatedArticles, type Article } from './articles';
import { MAX_SUGGESTIONS, isKnownHref, normalize, pushUnique, type Suggestion } from './suggestions/core';

export * from './suggestions/core';

/**
 * 記事1本ぶんの「次に気になること」を組み立てる。
 *
 * 最大 MAX_SUGGESTIONS 件。実在しない行き先は含まれない。
 */
export interface ArticleSuggestionOptions {
  /**
   * primaryToolを候補から外す。
   *
   * 記事ページは本文直後に専用のTool CTAを1つ出しているので、
   * そのすぐ下の「次に気になること」に同じ行き先をもう一度並べると、
   * 同じリンクを2回見せることになる。記事ページからはこれをtrueで呼ぶ。
   */
  excludePrimaryTool?: boolean;
}

export async function suggestionsForArticle(
  article: Article,
  options: ArticleSuggestionOptions = {},
): Promise<Suggestion[]> {
  const all = await getPublishedArticles();
  const articleIds = new Set(all.map((item) => item.id));
  const out: Suggestion[] = [];
  const seen = new Set<string>([normalize(`/articles/${article.id}`)]);
  if (options.excludePrimaryTool) {
    const shown = TOOLS.find((tool) => tool.key === article.data.primaryTool);
    if (shown != null) seen.add(normalize(shown.href));
  }

  // 1. 書き手が明示したもの
  for (const explicit of article.data.suggestions ?? []) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (!isKnownHref(explicit.href, articleIds)) continue;
    pushUnique(out, { label: explicit.label, href: explicit.href, type: explicit.type }, seen);
  }

  // 2. 読んだ直後に使う道具
  const primaryTool = options.excludePrimaryTool
    ? undefined
    : TOOLS.find((tool) => tool.key === article.data.primaryTool);
  if (primaryTool != null && out.length < MAX_SUGGESTIONS) {
    const href = article.data.toolQuery
      ? `${primaryTool.href}?${article.data.toolQuery}`
      : primaryTool.href;
    // クエリ付きでも行き先のページ自体は実在するので、ベースで判定する
    if (isKnownHref(primaryTool.href, articleIds)) {
      pushUnique(out, { label: article.data.ctaLabel ?? primaryTool.cta, href, type: 'tool' }, seen);
    }
  }

  // 3. 書き手が決めた読む順番
  const nextId = article.data.nextArticle;
  if (nextId != null && out.length < MAX_SUGGESTIONS) {
    const next = all.find((item) => item.id === nextId);
    if (next != null) {
      pushUnique(out, { label: next.data.title, href: `/articles/${next.id}`, type: 'article' }, seen);
    }
  }

  // 4. タグ・カテゴリから作る関連記事で残りを埋める
  if (out.length < MAX_SUGGESTIONS) {
    const related = await getRelatedArticles(article, MAX_SUGGESTIONS);
    for (const item of related) {
      if (out.length >= MAX_SUGGESTIONS) break;
      pushUnique(out, { label: item.data.title, href: `/articles/${item.id}`, type: 'article' }, seen);
    }
  }

  return out.slice(0, MAX_SUGGESTIONS);
}
