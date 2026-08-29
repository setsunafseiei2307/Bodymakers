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
 * フェーズ2で「食事メニュー」「種目解説」を足す想定でカテゴリを先に切ってある。
 */
export const CATEGORIES = {
  training: { slug: 'training', label: 'トレーニング' },
  nutrition: { slug: 'nutrition', label: '栄養・食事' },
  basics: { slug: 'basics', label: '基礎知識' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[];
