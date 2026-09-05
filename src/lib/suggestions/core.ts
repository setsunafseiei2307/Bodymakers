/**
 * 「次に気になること」の中核。
 *
 * ここには astro:content を読まない部分だけを置く。
 * 記事コレクションを読む処理（suggestionsForArticle）は ../suggestions.ts 側にある。
 * 分けてあるのは、行き先の検証とツール用の表をユニットテストから直接
 * 叩けるようにするため（astro:content はAstroの外から読めない）。
 *
 * 【なぜ「関連記事」ではないのか】
 * 似たタグの記事を並べるのは書き手側の都合で、読者の頭の中の順番ではない。
 * 「ベンチ100kgはすごい？」を読み終えた人が次に思うのは
 *   自分の体重ならどのレベル？ / 自分の1RMは？ / 100kgまでどう伸ばす？
 * であって、似たテーマの記事一覧ではない。
 * だからこの仕組みは記事どうしを結ぶのではなく、
 *   記事 → 記事 / ツール / 診断 / Personal
 * を同じ1つのリストで横断させる。
 *
 * 【存在しないページを出さない】
 * hrefは必ず実在するものだけを通す。記事は公開済みIDの一覧、ツールは
 * TOOLSの表、それ以外は KNOWN_STATIC_PATHS に載っているものだけ。
 */

import { TOOLS } from '../../config/tools';

export type SuggestionType = 'article' | 'tool' | 'diagnosis' | 'personal';

export interface Suggestion {
  label: string;
  href: string;
  type: SuggestionType;
}

/** 1画面に出す上限。これ以上並べると「次の一手」ではなく一覧になる。 */
export const MAX_SUGGESTIONS = 5;

/**
 * 記事・ツール以外で、サジェストの行き先にしてよい固定ページ。
 * ここに無いパスは（存在しないページを作らないため）落とす。
 */
const KNOWN_STATIC_PATHS: readonly string[] = [
  '/start',
  '/personal',
  '/plan',
  '/record',
  '/articles',
  '/tools',
  '/strength-standards',
  '/data',
] as const;

const TOOL_HREFS = new Set(TOOLS.map((tool) => tool.href));

/** サイト内の絶対パスから末尾スラッシュを外して比べる。 */
export function normalize(href: string): string {
  return href.replace(/\/+$/, '') || '/';
}

/**
 * そのhrefが実在するページを指しているか。
 * articleIds には公開済み記事のIDを渡す。
 */
export function isKnownHref(href: string, articleIds: ReadonlySet<string>): boolean {
  const path = normalize(href);
  if (TOOL_HREFS.has(path)) return true;
  if (KNOWN_STATIC_PATHS.includes(path)) return true;
  const articleMatch = /^\/articles\/([^/]+)$/.exec(path);
  if (articleMatch != null) return articleIds.has(articleMatch[1]);
  return false;
}

/** 同じ行き先を二度出さないための積み上げ。 */
export function pushUnique(into: Suggestion[], candidate: Suggestion, seen: Set<string>): void {
  const key = normalize(candidate.href);
  if (seen.has(key)) return;
  seen.add(key);
  into.push(candidate);
}

/**
 * ツール結果のあとに出す「次に気になること」。
 *
 * 記事と違って書き手のfrontmatterが無いので、ツールごとに中央で持つ。
 * ツールと記事を孤立させないための表なので、行き先には必ず
 * 記事か別のツールか診断を混ぜる。
 */
const TOOL_SUGGESTIONS: Record<string, readonly Suggestion[]> = {
  oneRm: [
    { label: 'この重量は強い？ 同じ体格の中での位置を見る', href: '/strength-standards', type: 'tool' },
    { label: '次のトレーニング重量を決める', href: '/tools/programs', type: 'tool' },
    { label: 'RPEから余力込みで計算する', href: '/tools/rpe', type: 'tool' },
    { label: '1RM推定の仕組みを知る', href: '/articles/one-rep-max-estimation', type: 'article' },
  ],
  nutrition: [
    { label: '何kg痩せられる？ 目標から逆算する', href: '/tools/plan', type: 'tool' },
    { label: '今日食べたものを調べる', href: '/tools/foods', type: 'tool' },
    { label: 'PFCの決め方を理解する', href: '/articles/pfc-balance-basics', type: 'article' },
    { label: '自分向けPlanを作る', href: '/start', type: 'diagnosis' },
  ],
  foods: [
    { label: '今日の食事に追加する', href: '/tools/today', type: 'personal' },
    { label: '1日のカロリー・PFCの目安を出す', href: '/tools/nutrition', type: 'tool' },
    { label: 'コンビニで何を選ぶか', href: '/articles/convenience-store-pfc', type: 'article' },
  ],
  strength: [
    { label: '自分の1RMを計算する', href: '/tools/one-rep-max', type: 'tool' },
    { label: 'この基準は何のデータ？', href: '/articles/strength-standards-explained', type: 'article' },
    { label: 'ここから伸ばすプログラムを探す', href: '/tools/programs', type: 'tool' },
  ],
  plan: [
    { label: '1日のカロリー・PFCを出す', href: '/tools/nutrition', type: 'tool' },
    { label: '停滞したときに何を見るか', href: '/articles/weight-loss-plateau', type: 'article' },
    { label: '自分向けPlanを作る', href: '/start', type: 'diagnosis' },
  ],
  burn: [
    { label: '運動で減るカロリーの現実', href: '/articles/exercise-calorie-reality', type: 'article' },
    { label: '1日の目安カロリーを出す', href: '/tools/nutrition', type: 'tool' },
    { label: '歩数と体重の関係を知る', href: '/articles/steps-and-walking', type: 'article' },
  ],
  rpe: [
    { label: 'RPEの使い方を理解する', href: '/articles/rpe-basics', type: 'article' },
    { label: '1RMから逆算する', href: '/tools/one-rep-max', type: 'tool' },
    { label: 'プログラムに当てはめる', href: '/tools/programs', type: 'tool' },
  ],
  programs: [
    { label: '自分に合うのはどれ？ 診断で決める', href: '/start', type: 'diagnosis' },
    { label: '扱う重量を先に確認する', href: '/tools/one-rep-max', type: 'tool' },
    { label: '分割の考え方を知る', href: '/articles/training-split', type: 'article' },
  ],
  smolov: [
    { label: 'Smolovの中身を理解する', href: '/articles/smolov-guide', type: 'article' },
    { label: '開始重量になる1RMを出す', href: '/tools/one-rep-max', type: 'tool' },
    { label: 'ほかのプログラムと比べる', href: '/tools/programs', type: 'tool' },
  ],
  fitness: [
    { label: '筋力だけの位置も見る', href: '/strength-standards', type: 'tool' },
    { label: '記録を残して変化を見る', href: '/personal', type: 'personal' },
    { label: '最初の1か月に何をやるか', href: '/articles/beginner-first-month', type: 'article' },
  ],
  today: [
    { label: 'これまでの記録を見る', href: '/record', type: 'personal' },
    { label: 'Planを見直す', href: '/plan', type: 'personal' },
  ],
};

/**
 * ツール用の「次に気になること」。
 * 実在しない行き先は落とす。articleIds は呼び出し側から渡す。
 */
export function suggestionsForTool(
  toolKey: string,
  articleIds: ReadonlySet<string>,
): Suggestion[] {
  const list = TOOL_SUGGESTIONS[toolKey] ?? [];
  return list
    .filter((item) => isKnownHref(item.href, articleIds))
    .slice(0, MAX_SUGGESTIONS);
}

/** テストから全ツールぶんを検証できるように公開する。 */
export function allToolSuggestionKeys(): string[] {
  return Object.keys(TOOL_SUGGESTIONS);
}

export function rawToolSuggestions(toolKey: string): readonly Suggestion[] {
  return TOOL_SUGGESTIONS[toolKey] ?? [];
}
