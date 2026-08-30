/**
 * サイト全体の設定。
 *
 * サイト名は暫定で「Bodymakers」。変更するときはこのファイルの SITE_NAME だけを
 * 書き換えれば、ヘッダー・フッター・OGP・RSS・構造化データすべてに反映される。
 * 文言に直接サイト名を埋め込まないこと。
 */

export const SITE_NAME = 'Bodymakers';

/** ロゴやタブに出す短縮名。SITE_NAME が長くなった場合の逃げ道として分けてある。 */
export const SITE_SHORT_NAME = 'Bodymakers';

/** 各ページの <title> に付く接尾辞と、トップページの説明文。 */
export const SITE_TAGLINE = '筋力レベル診断とトレーニング情報';

export const SITE_DESCRIPTION =
  '自分の筋力が同じ性別・体重の人と比べてどの位置にあるかを、競技会の実データをもとに判定します。登録不要・データ保存なし。';

/**
 * 公開URL。astro.config.mjs の site と同じ値を参照する。
 * ビルド時に import.meta.env.SITE が入る。
 */
export const SITE_URL = import.meta.env.SITE ?? 'https://bodymakers.example.com';

/**
 * 検索エンジンにインデックスさせるか。
 *
 * false の間は robots.txt が全拒否になり、各ページにも noindex が入る。
 * 中身が揃うまでは検索結果に出さない、という運用のための切り替え。
 *
 * 【true にした理由】
 * 記事26本・ツール9種が揃い、canonical が実在するドメインを指すようになった。
 * canonical が誤ったドメインを指したまま公開すると、検索エンジンに
 * 「本物は別の場所にある」と伝えることになり回復に時間がかかるため、
 * その修正を先に済ませてある。カテゴリのURL変更も公開前に終わらせた。
 */
export const SEARCH_INDEXING = true;

/** 言語・地域。lang 属性と OGP に使う。 */
export const SITE_LOCALE = 'ja-JP';
export const SITE_LANG = 'ja';

/** グローバルナビゲーション。診断への導線を最上位に置く。 */
export interface NavItem {
  href: string;
  label: string;
  /** ナビで強調表示するか（診断への導線を目立たせるため） */
  primary?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/strength-standards', label: '筋力レベル診断', primary: true },
  { href: '/tools', label: 'ツール' },
  { href: '/articles', label: '記事' },
  { href: '/about', label: 'このサイトについて' },
] as const;

/** フッターのリンク。 */
export const FOOTER_ITEMS: readonly NavItem[] = [
  { href: '/about', label: 'このサイトについて' },
  { href: '/sources', label: '出典・データについて' },
  { href: '/disclaimer', label: '免責事項' },
  { href: '/rss.xml', label: 'RSS' },
] as const;

/**
 * 記事カテゴリ。content collection のスキーマ（src/content.config.ts）と対で管理する。
 *
 * 【なぜこの4つか】
 * 以前は training / nutrition / basics の3つだったが、basics が
 * 筋力・ダイエット・栄養の寄せ集めになっていて、探す側の役に立っていなかった。
 * 実際、ベンチプレスの記事とダイエットの記事が同じ棚に並んでいた。
 *
 * 分け方の基準は「読む人が何を知りたくて来たか」。
 *   筋力・データ … 自分の強さを知りたい
 *   トレーニング … 伸ばし方を知りたい
 *   栄養・食事   … 何をどれだけ食べるかを知りたい
 *   ダイエット   … 体重を落としたい
 * サイトの都合ではなく、来訪の動機で切っている。
 */
export const CATEGORIES = {
  strength: { slug: 'strength', label: '筋力・データ' },
  training: { slug: 'training', label: 'トレーニング' },
  nutrition: { slug: 'nutrition', label: '栄養・食事' },
  diet: { slug: 'diet', label: 'ダイエット' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[];
