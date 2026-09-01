/**
 * サイト内リンクの組み立て。
 *
 * GitHub Pages のようにサブディレクトリで配信する場合、href="/tools" は
 * 実際には /Bodymakers/tools を指す必要がある。配信先ごとの差はここ1か所に
 * 閉じ込め、画面側は今までどおりサイト内の絶対パスを書けるようにする。
 *
 * 独自ドメインでルート直下に置くようになったら BASE_PATH を外すだけでよく、
 * そのとき url() は何も足さない。
 */

/** 配信先のベースパス。Astro がビルド時に埋める（ルート配信なら '/'）。 */
const BASE = import.meta.env.BASE_URL ?? '/';

/** 末尾のスラッシュを落としたベース。ルート配信では空文字になる。 */
const PREFIX = BASE.replace(/\/+$/, '');

/**
 * サイト内の絶対パスに、配信先のベースパスを付ける。
 * 外部URL・アンカー・mailto などはそのまま返す。
 */
export function url(path: string): string {
  if (!path.startsWith('/')) return path;
  return `${PREFIX}${path}`;
}

/**
 * ブラウザ上のパスから、ベースパスを取り除いたサイト内パスを返す。
 * ナビの現在地判定に使う。末尾のスラッシュは無視する。
 */
export function sitePath(pathname: string): string {
  const withoutBase =
    PREFIX !== '' && pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : pathname;
  return withoutBase.replace(/\/+$/, '') || '/';
}
