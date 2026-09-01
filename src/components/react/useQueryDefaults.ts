import { useEffect } from 'react';

/**
 * URLのクエリから、ツールの初期値を受け取る。
 *
 * 【なぜ必要か】
 * 記事の「あなたが30分歩くと何kcal？」を押した人が、ツール側で
 * もう一度「速歩」を選び直すのは無駄な一手間になる。
 * かといって記事の中にReactのツールを埋め込むと、記事ページのJSが
 * 477バイトから200KB近くに増える。記事は検索の着地ページなので、
 * そこを重くしたくない。
 * そこで、記事からは初期値つきのリンクで送る。
 *
 * 【なぜ useState の初期値ではなく useEffect なのか】
 * ページは静的HTMLとして先に書き出される。その時点では window が無いので
 * クエリを読めない。useState の初期値で読むと、サーバーで作ったHTMLと
 * ブラウザでの初回描画がずれる（hydration mismatch）。
 * 描画のあとに一度だけ反映する。
 *
 * 値の検証は呼び出し側で行う。URLは誰でも書き換えられるので、
 * 受け取った文字列をそのまま状態に入れてよい場面は無い。
 */
export function useQueryDefaults(apply: (params: URLSearchParams) => void): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    // クエリが無いときは何もしない（既定値のまま）
    let empty = true;
    params.forEach(() => {
      empty = false;
    });
    if (empty) return;
    apply(params);
    // 初回の一度だけ。以降はユーザーの操作が優先される。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
