/**
 * 広告枠の設定。
 *
 * 【今は何も描画しない】
 * 広告タグを入れるまでは、枠を出さない。空のグレーの箱が並ぶと
 * 「未完成のサイト」に見えてしまい、コンテンツへの信頼を下げるため。
 *
 * 広告を入れるときは ADS_ENABLED を true にして、AdSlot.astro の中に
 * タグを差し込む。枠の寸法は先に決めてあるので、有効化しても
 * 周囲のレイアウトは動かない（読み込み時のCLSも起きない）。
 */

export const ADS_ENABLED = false;

/** 枠の種類。寸法は src/styles/global.css の .ad-slot--* で定義している。 */
export type AdVariant = 'inline' | 'footer' | 'sidebar';

/**
 * 枠を置いてある場所の一覧。
 * 有効化するときにどこへ何が出るかを1か所で見渡せるようにしてある。
 */
export const AD_PLACEMENTS: Record<string, { variant: AdVariant; where: string }> = {
  'home-mid': { variant: 'inline', where: 'トップページ中段' },
  'tools-bottom': { variant: 'inline', where: 'ツール一覧の下部' },
  'tool-bottom': { variant: 'inline', where: '各ツールページの下部' },
  'list-bottom': { variant: 'inline', where: '記事一覧の下部' },
  'article-end': { variant: 'inline', where: '記事本文の末尾' },
  result: { variant: 'inline', where: '診断結果の下部' },
  sidebar: { variant: 'sidebar', where: '診断ページのサイドバー（960px以上）' },
  footer: { variant: 'footer', where: '全ページのフッター' },
};
