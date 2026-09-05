/**
 * Personal Hub（/personal）に何を出すかを決める。
 *
 * 【この画面の役割】
 * Public Web（Home / 診断 / ツール / 記事）と、個人の記録領域を分ける境界。
 * 初回訪問者にPersonalを強要しない代わりに、使いたい人がここから
 * 「今日やること」「Plan」「記録」「進捗」へ入る。
 *
 * ここは読むだけ。保存は一切しない。判定に使う定義（活動日など）は
 * すでに src/lib/activity/ が持っているものをそのまま使い、作り直さない。
 */

import { summarizeActivity, weeklyProgress } from '../activity';
import type { BodymakersData } from '../storage';

export interface HubEntry {
  href: string;
  label: string;
  /** 1行の補足。数字ではなく「そこに何があるか」を書く。 */
  note: string;
}

export interface PersonalHubState {
  /** Personal Plan か実行中Programを持っているか。 */
  hasPlan: boolean;
  /** 実行中Programの位置。無ければ null。 */
  programPosition: string | null;
  /** 直近7日の活動日数。 */
  activeDaysThisWeek: number;
  /** 今日すでに記録したか。 */
  todayDone: boolean;
  /** 何か記録が1件でもあるか（Planが無くても記録だけある人がいる）。 */
  hasAnyRecord: boolean;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function resolvePersonalHub(data: BodymakersData, now = new Date()): PersonalHubState {
  try {
    const active = data.activeProgram;
    const week = positiveInteger(active?.currentWeek);
    const day = positiveInteger(active?.currentDay);
    const activity = summarizeActivity(data, now);
    return {
      hasPlan: data.personalPlan != null || active != null,
      programPosition: active != null && week != null && day != null ? `Week ${week} / Day ${day}` : null,
      activeDaysThisWeek: weeklyProgress(data, now, 7).activeDays,
      todayDone: activity.todayActive,
      hasAnyRecord: (data.dailyLogs?.length ?? 0) > 0,
    };
  } catch {
    // 保存データの形が想定外でも、入口としては開けたほうがよい
    return {
      hasPlan: false,
      programPosition: null,
      activeDaysThisWeek: 0,
      todayDone: false,
      hasAnyRecord: false,
    };
  }
}

/**
 * Hubに並べる行。カードにはしない。
 * Todayだけは主役なので、この一覧には入れず上に単独で置く。
 */
export const HUB_ENTRIES: readonly HubEntry[] = [
  { href: '/record', label: '記録', note: 'これまでにやったこと' },
  { href: '/plan', label: 'Plan', note: '12週間の進め方' },
  { href: '/tools/programs', label: 'プログラム', note: '実行中のメニュー' },
  { href: '/data', label: 'データ', note: 'バックアップと復元' },
] as const;
