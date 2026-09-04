/**
 * 保存済みPlanがある人に、Homeで出す「続きから」の中身。
 *
 * 【方針】
 * Homeは初見の人のための画面なので、ここでTodayを再現しない。
 * ベンチの重量も、今日のメニューも、達成率も出さない。出すのは
 * 「続きがある」ことと「いまどのあたりか」だけで、詳細はPersonal側の担当。
 *
 * Homeは読むだけの画面なので、ここからは保存しない。
 */

import type { BodymakersData } from '../storage';

export interface ContinueCard {
  /** いまの位置。Programを実行中のときだけ出る。分からなければ null。 */
  position: string | null;
  /** 補助の一行。位置が出せないときの代わりにもなる。 */
  note: string;
}

/** 週・日の表示に使えるのは、1以上の整数のときだけ。 */
function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * 続きからカードの中身を決める。
 * Planも実行中Programも無ければ null（カード自体を出さない）。
 */
export function buildContinueCard(data: BodymakersData): ContinueCard | null {
  try {
    const active = data.activeProgram;
    if (active != null) {
      const week = positiveInteger(active.currentWeek);
      const day = positiveInteger(active.currentDay);
      return {
        position: week != null && day != null ? `Week ${week} / Day ${day}` : null,
        note: '今日やることは Personal 側にまとまっています。',
      };
    }
    if (data.personalPlan != null) {
      return { position: null, note: '保存したPlanから、今日やることを確認できます。' };
    }
    return null;
  } catch {
    // 保存データの形が想定外でも、Homeは表示できたほうがよい。
    return null;
  }
}
