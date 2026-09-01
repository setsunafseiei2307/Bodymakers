import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

import { CATEGORY_KEYS } from './config/site';
import { TOOL_KEYS } from './config/tools';

/**
 * 記事コレクション。
 *
 * src/content/articles/ に .md を置くだけでページが増える。
 * frontmatter は下の schema で検証され、必須項目の書き忘れや日付の書式誤りは
 * ビルド時にエラーになる。記事を毎日追加する運用で、公開前に人が気づけるようにするため。
 */
const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    /** 一覧・記事見出し・OGPに使う。60文字前後までを推奨 */
    title: z.string().min(1).max(120),
    /** 一覧のカードとmeta descriptionに使う */
    description: z.string().min(1).max(200),
    /** 公開日。YYYY-MM-DD で書く */
    publishedAt: z.coerce.date(),
    /** 更新日。内容を直したときだけ入れる */
    updatedAt: z.coerce.date().optional(),
    /** カテゴリ。src/config/site.ts の CATEGORIES と対応する */
    category: z.enum(CATEGORY_KEYS as [string, ...string[]]),
    /** 検索・関連記事用のタグ */
    tags: z.array(z.string()).default([]),
    /**
     * この記事を読んだ人が次に使うと役に立つツール。
     * src/config/tools.ts のキーを書くと、記事末のCTAが切り替わる。
     * 対応するツールが無い記事は書かなくてよい（CTAが出ないだけ）。
     */
    primaryTool: z.enum(TOOL_KEYS as [string, ...string[]]).optional(),
    /**
     * CTAの見出し。省略するとツール側の既定文言が使われる。
     * 記事の内容に寄せた問いかけにしたいときだけ書く。
     */
    ctaLabel: z.string().max(60).optional(),
    /**
     * ツールに渡す初期値（クエリ文字列。先頭の ? は書かない）。
     * 例: 'activity=walk-brisk' と書くと /tools/burn?activity=walk-brisk へ送る。
     * 受け取ったツール側で値を検証するので、無効な値は無視される。
     */
    toolQuery: z.string().max(120).optional(),
    /**
     * 「この記事で分かること」。冒頭に出す。
     * 検索から来た人が、読む前に自分の疑問と合っているか判断できるようにする。
     * 本文の要約ではなく、読者が持ち帰れる結論を書く。
     */
    takeaways: z.array(z.string()).max(4).default([]),
    /**
     * 次に読むと理解が進む記事のスラッグ。
     * 自動の関連記事とは別に、書き手が読む順番を決めたいときに使う。
     */
    nextArticle: z.string().optional(),
    /**
     * 参考文献。健康・トレーニングの主張には根拠を添える方針のため、
     * 主張を含む記事では必ず埋める。
     */
    references: z
      .array(
        z.object({
          title: z.string(),
          url: z.url().optional(),
          note: z.string().optional(),
        }),
      )
      .default([]),
    /**
     * 一覧の先頭で大きく出す記事。
     *
     * 「新着＝先頭」にすると、書いた順という運営の都合が
     * そのまま並びになる。検索需要が大きい記事や、当サイトの
     * データを使った記事を先に見せたいので、明示で指定する。
     * 複数指定した場合は公開日の新しい順に並ぶ。
     */
    featured: z.boolean().default(false),
    /** true の間はビルドに含めない（書きかけの記事を置いておける） */
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
