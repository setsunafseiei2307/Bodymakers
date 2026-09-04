/**
 * トップページがいまどの状態かを1箇所で決める。
 *
 * Homeは読むだけの画面にする。ここでもコンポーネント側でも、
 * localStorageへの書き込みはしない。Home専用の保存キーも作らない。
 *
 * 【Public Home v1 での役割の変更】
 * 以前は、この状態でHomeの区画そのものを出し分けていた（保存済みの人には
 * ヒーローだけを出す、など）。いまはHomeを「はじめて来た人にも、続けている人にも
 * 同じ入口として見せる公開ページ」にしたので、区画は状態によらず常に出る。
 * この状態が決めるのは、Homeの中に小さく足す案内
 * （診断の続き / Personalの続き）だけ。TodayでHomeを乗っ取らない。
 *
 * 「直近7日に活動があったか」「今日はもう記録したか」は、
 * すでに src/lib/activity/ が持っている定義をそのまま使う。
 * Homeのためだけに活動日の定義を作り直さない。
 *
 * src/lib/todayAction.ts にも状態を決める関数があるが、あちらが答えるのは
 * 「Todayで次に取るべき1アクションは何か」で、セッションの進み方の話。
 * こちらが答えるのは「Homeでどの入口を見せるか」。問いが別なので分けている。
 * 重なるのは「Planを持っているか」だけで、活動判定は共通の src/lib/activity を通す。
 */

import { summarizeActivity, weeklyProgress } from '../activity';
import { readDiagnosisDraft, draftQuestionId, type DiagnosisDraft } from '../diagnosis/draft';
import { RESULT_STEP, questionProgress } from '../diagnosis/questions';
import { readData, type BodymakersData } from '../storage';

export type HomeStateId = 'A' | 'B' | 'C' | 'D1' | 'D2';

export interface DraftPosition {
  /** 何問目か。取れなければ null。 */
  position: number | null;
  /** 全部で何問か。取れなければ null。 */
  total: number | null;
}

export interface HomeState {
  id: HomeStateId;
  /** Personal Plan か実行中Programを持っているか。 */
  hasPlan: boolean;
  /** 途中まで答えた診断が残っているか。 */
  hasDraft: boolean;
  draft: DraftPosition | null;
  /** 直近7日に記録があるか。 */
  recentlyActive: boolean;
  /** 今日すでに記録したか。 */
  todayActive: boolean;
}

function draftPosition(draft: DiagnosisDraft): DraftPosition {
  try {
    const questionId = draftQuestionId(draft);
    if (questionId === RESULT_STEP) return { position: null, total: null };
    const progress = questionProgress(draft.input, questionId);
    if (!Number.isFinite(progress.position) || !Number.isFinite(progress.total) || progress.total <= 0) {
      return { position: null, total: null };
    }
    return { position: progress.position, total: progress.total };
  } catch {
    // 進捗が読めなくても「続きがある」ことは伝えられる。
    return { position: null, total: null };
  }
}

export const FALLBACK_HOME_STATE: HomeState = {
  id: 'A',
  hasPlan: false,
  hasDraft: false,
  draft: null,
  recentlyActive: false,
  todayActive: false,
};

/**
 * 端末内データから、Homeの状態を決める。
 *
 * A : Planなし・診断の途中もなし
 * B : Planなし・診断の途中あり
 * C : Planあり・直近7日に記録なし
 * D1: Planあり・直近7日に記録あり・今日はまだ
 * D2: Planあり・直近7日に記録あり・今日も記録済み
 *
 * 読めない・想定外の形だったときは、いちばん安全なAへ倒す。
 */
export function resolveHomeState(
  data: BodymakersData,
  draft: DiagnosisDraft | null,
  now = new Date(),
): HomeState {
  try {
    // 診断からのPlanだけでなく、Program Libraryを始めた人も「Planあり」として扱う。
    // 実行中Programがある人に、初回向けの説明を出すのは実態と合わない。
    const hasPlan = data.personalPlan != null || data.activeProgram != null;
    const hasDraft = draft != null;

    if (!hasPlan) {
      return {
        id: hasDraft ? 'B' : 'A',
        hasPlan: false,
        hasDraft,
        draft: draft == null ? null : draftPosition(draft),
        recentlyActive: false,
        todayActive: false,
      };
    }

    const activity = summarizeActivity(data, now);
    const recentlyActive = weeklyProgress(data, now, 7).activeDays > 0;
    const todayActive = activity.todayActive;
    const base = {
      hasPlan: true,
      hasDraft,
      draft: draft == null ? null : draftPosition(draft),
      recentlyActive,
      todayActive,
    };

    if (!recentlyActive) return { id: 'C', ...base };
    return { id: todayActive ? 'D2' : 'D1', ...base };
  } catch {
    return FALLBACK_HOME_STATE;
  }
}

/** 端末内データを読んでから状態を決める。読み取りに失敗してもAへ倒す。 */
export function readHomeState(now = new Date()): HomeState {
  try {
    return resolveHomeState(readData(), readDiagnosisDraft(), now);
  } catch {
    return FALLBACK_HOME_STATE;
  }
}
