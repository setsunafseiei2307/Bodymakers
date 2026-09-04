/**
 * Public Home（トップページ）に出す中身。
 *
 * Homeは「はじめて来た人が5秒で何のサイトか分かる」ことを最優先にする画面なので、
 * 文言と行き先をこの1ファイルに集めてある。文章を直すときにレイアウトを読まなくてよく、
 * 記事やツールを差し替えるときも、ここの1行を書き換えれば済む。
 *
 * ここに書くリンク先は、すべて実在するルートだけ。
 * 存在しないURLを推測で書かない（ビルド後に scripts/check-links.mjs が落ちる）。
 */

import type { GoalId } from '../lib/diagnosis/types';

/* ============================================================
   ブランド
   ============================================================ */

/**
 * ヒーローの見出し。
 *
 * 「カライイ」は造語なので、単独で置かない。必ず次の一行で意味を説明する。
 * これは装飾ではなく、初見の人が意味を取れるかどうかの分かれ目になる。
 */
export const HERO_HEADLINE = 'カライイは、つくれる。';
export const HERO_HEADLINE_LINES = ['カライイは、', 'つくれる。'] as const;
export const HERO_GLOSS = 'カライイ = カッコいい体 × 調子のいい身体';
export const HERO_SUB = '筋トレ・食事・休養・記録をひとつに。';
export const HERO_LEAD =
  'Bodymakersは、あなたに合う身体づくりを案内するフィットネスサービスです。';

/** 主CTA。ヒーローと最後の区画で同じ言葉を使い、迷わせない。 */
export const PRIMARY_CTA_LABEL = '30秒で自分向けPlanを見る';
export const PRIMARY_CTA_NOTE = '無料・登録不要';
export const PRIMARY_CTA_HREF = '/start';

/** トップページ専用の説明文。<title> と meta description に使う。 */
export const HOME_DESCRIPTION =
  '筋トレ・食事・休養・記録をひとつに。目標と身体から自分向けのPlanを作り、今日やることが分かるフィットネスサービスです。登録不要で、記録はこの端末に残ります。';

/* ============================================================
   Heroの画像
   ============================================================ */

/**
 * ヒーローに敷く写真。
 *
 * 【なぜ null が既定なのか】
 * まだ本採用の素材が決まっていない。ここを null にしておくと、
 * HeroVisual.astro がCSSだけで組んだ画面の実物（スマホの表示例）を出す。
 * 画像が無いことでヒーローが崩れたり、空の枠が残ったりしない。
 *
 * 【差し替え方】
 * 1. 画像を public/home/ に置く（例: public/home/hero.jpg）
 * 2. ここを { src: '/home/hero.jpg', alt: '…' } に書き換える
 * それだけで、写真つきのヒーローに切り替わる。ほかのファイルは触らなくてよい。
 *
 * 画像は文字が焼き込まれていないものを選ぶ。見出しとCTAはHTML側が持っているので、
 * 画像内に同じ日本語が入っていると二重に読ませることになる。
 */
export interface HeroImage {
  /** サイト内の絶対パス。url() を通してから使う。 */
  src: string;
  /** 画像が読めないときに読まれる説明。装飾に徹する場合は空文字。 */
  alt: string;
}

export const HERO_IMAGE: HeroImage | null = null;

/* ============================================================
   SECTION 3 — Bodymakersでできること
   ============================================================ */

/**
 * 4つだけ。増やすと「結局なんでもできるサイト」になって伝わらなくなる。
 * 見出しは日本語。英字は補助のラベルにとどめる。
 */
export interface Capability {
  /** 補助の英字ラベル。読ませる文字ではなく、区画の目印として置く。 */
  code: string;
  title: string;
  text: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    code: 'TRAINING',
    title: 'トレーニング',
    text: '今日やる種目・重量・回数が分かる。',
  },
  {
    code: 'NUTRITION',
    title: '食事',
    text: 'カロリー・PFC・食事の目安が分かる。',
  },
  {
    code: 'RECORD',
    title: '記録',
    text: 'トレーニング・食事・体重を残せる。',
  },
  {
    code: 'PROGRESS',
    title: '変化を見る',
    text: '続けた変化を振り返れる。',
  },
] as const;

/* ============================================================
   SECTION 4 — どんな身体になりたい？
   ============================================================ */

/**
 * 診断の入口。ここで選んだ目標は、クエリで /start へ渡す。
 * value は診断側の GoalId と同じものだけを使う（新しい目標を発明しない）。
 */
export interface GoalChoice {
  goal: GoalId;
  label: string;
  text: string;
}

export const GOAL_CHOICES: readonly GoalChoice[] = [
  { goal: 'muscle', label: '筋肉をつけたい', text: '身体を大きくしたい' },
  { goal: 'fat-loss', label: '痩せたい', text: '体脂肪を落としたい' },
  { goal: 'strength', label: '強くなりたい', text: 'BIG3を伸ばしたい' },
  { goal: 'health', label: '調子を良くしたい', text: '運動と食事を整えたい' },
] as const;

/* ============================================================
   SECTION 5 — 読んで知る
   ============================================================ */

/**
 * Homeに出す記事。初心者・筋肥大・ダイエット・栄養で1本ずつ選んである。
 * id は src/content/articles/ のファイル名（拡張子なし）。
 * 実在しない id を書くとビルド時に落ちるので、記事を消したらここも直す。
 */
export const FEATURED_ARTICLE_IDS: readonly string[] = [
  'beginner-first-month',
  'bulking-guide',
  'energy-balance-basics',
  'pfc-balance-basics',
] as const;

/* ============================================================
   SECTION 6 — 無料で使えるツール
   ============================================================ */

export interface HomeLink {
  href: string;
  label: string;
  text: string;
}

export const HOME_TOOLS: readonly HomeLink[] = [
  {
    href: '/tools/nutrition',
    label: 'カロリー・PFC計算',
    text: '身長・体重・活動量から、1日の目安を出す。',
  },
  {
    href: '/tools/one-rep-max',
    label: '1RM・RPE換算',
    text: '挙げた重量と回数から、最大挙上重量を推定する。',
  },
  {
    href: '/strength-standards',
    label: '筋力レベル診断',
    text: '同じ性別・体重の人と比べて、いまどのくらいか。',
  },
  {
    href: '/tools/foods',
    label: '食品・料理を調べる',
    text: '食品成分表から、カロリーとPFCを調べる。',
  },
] as const;

/* ============================================================
   SECTION 7 — プログラム
   ============================================================ */

/**
 * Program Libraryへの入口。
 * この工程ではProgramの中身を変えないので、行き先はすべて既存の一覧ページ。
 */
export const PROGRAM_ENTRIES: readonly HomeLink[] = [
  { href: '/tools/programs', label: '初心者向け', text: 'まず何をやるかが決まっている組み方から。' },
  { href: '/tools/programs', label: '筋肥大', text: '部位ごとの量を確保して、身体を大きくする。' },
  { href: '/tools/programs', label: '筋力アップ', text: 'BIG3を軸に、扱う重量を伸ばしていく。' },
] as const;

export const PROGRAM_LIBRARY_HREF = '/tools/programs';
export const ARTICLES_HREF = '/articles';
export const TOOLS_HREF = '/tools';
