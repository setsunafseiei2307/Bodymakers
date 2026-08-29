import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

import { CATEGORY_KEYS } from './config/site';

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
    /** true の間はビルドに含めない（書きかけの記事を置いておける） */
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
