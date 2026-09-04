/**
 * Homeの「どんな身体になりたい？」から診断へ目標を渡す部分。
 *
 * 【なぜ別ファイルにしたか】
 * URLのクエリは誰でも書き換えられるので、受け取った文字列をそのまま
 * 診断の入力に入れてはいけない。検証は1か所に置いて、Home側（リンクを作る）と
 * 診断側（リンクを受け取る）が同じ表を見るようにしてある。
 *
 * 診断のロジックそのものは変えていない。渡すのは最初の質問の初期値だけで、
 * 質問の並びも進み方も、選択肢の意味も従来どおり。
 */

import { GOAL_IDS, type GoalId } from '../diagnosis/types';

/** クエリのキー。Home側と診断側でこの定数を共有する。 */
export const GOAL_PARAM = 'goal';

/**
 * クエリの値を GoalId として受け取れるか確かめる。
 * 表にない値・空・null はすべて null にする（無視して既定値のまま進む）。
 */
export function parseGoalParam(raw: string | null | undefined): GoalId | null {
  if (raw == null) return null;
  const value = raw.trim();
  return (GOAL_IDS as readonly string[]).includes(value) ? (value as GoalId) : null;
}

/** Homeの目標カードから、診断へのリンクを作る。 */
export function startHrefForGoal(base: string, goal: GoalId): string {
  return `${base}?${GOAL_PARAM}=${encodeURIComponent(goal)}`;
}
