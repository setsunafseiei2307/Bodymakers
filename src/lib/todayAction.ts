/**
 * 今日の一手。
 *
 * Todayを開いた人が最初に見るのは「次に何をするか」であってほしい。
 * 食事の一覧や栄養素の内訳は、その次でいい。
 *
 * ここでは端末内データだけを見て、次の1アクションを1つに決める。
 * 表示は呼び出し側が行い、この関数は文言と行き先を返すだけにする。
 */

import type { SavedPersonalPlan } from './diagnosis/types';
import type { ActiveProgram, ProgramSession } from './programLibrary';

export type TodayActionKind =
  /** 実行中のProgramに今日のセッションがある */
  | 'workout'
  /** 実行中のProgramはあるが、今日のトレーニングはもう記録済み */
  | 'workout-done'
  /** 実行中のProgramはあるが、今日のセッションを読み出せない */
  | 'program-check'
  /** Planはあるが、実行中のProgramがない */
  | 'program-select'
  /** Planがない */
  | 'diagnosis';

export interface TodayActionLink {
  label: string;
  href: string;
}

export interface TodayAction {
  kind: TodayActionKind;
  /** 票の左に出す英字ラベル */
  code: string;
  /** 状況の見出し（「今日のトレーニング」など） */
  heading: string;
  /** いま何をするか */
  title: string;
  detail: string;
  cta: TodayActionLink;
  /** 迷った人のための逃げ道。1つまで。 */
  secondary?: TodayActionLink;
}

export interface TodayActionInput {
  activeProgram: ActiveProgram | null;
  /** Program Libraryの表示名。定義を読めなかった場合は null。 */
  activeProgramName: string | null;
  /** 実行中Programの今日のセッション。読み出せなければ null。 */
  activeProgramSession: ProgramSession | null;
  personalPlan: SavedPersonalPlan | null;
  /** 12週間Planから出した今日のトレーニング名。 */
  planWorkoutLabel: string | null;
  /** 今日、筋トレの種目・部位を記録しているか。 */
  trainedToday: boolean;
  /** 今日、食事を記録しているか。 */
  ateToday: boolean;
}

/**
 * 優先順位は上から順に決める。
 * 1. 実行中Programの今日のセッションがあり、まだ記録していない
 * 2. 実行中Programはあるが、今日のトレーニングは記録済み
 * 3. 実行中Programはあるが、今日のセッションを読み出せない
 * 4. Planはあるが、実行中Programがない
 * 5. Planがない
 */
export function resolveTodayAction(input: TodayActionInput): TodayAction {
  const { activeProgram, activeProgramSession, personalPlan } = input;

  if (activeProgram != null) {
    const position = `Week ${activeProgram.currentWeek} / Day ${activeProgram.currentDay}`;
    const programName = input.activeProgramName ?? 'Program';

    if (activeProgramSession != null && !input.trainedToday) {
      return {
        kind: 'workout',
        code: 'TODAY',
        heading: '今日のトレーニング',
        title: activeProgramSession.label,
        detail: `${programName}・${position}／${activeProgramSession.focus}`,
        cta: { label: 'トレーニングを開始', href: '#active-program' },
        secondary: { label: '今日は食事だけ記録する', href: '#quick-record' },
      };
    }

    if (activeProgramSession != null) {
      return {
        kind: 'workout-done',
        code: 'NEXT',
        heading: '今日のトレーニング',
        title: '今日のトレーニングは記録済み',
        detail: input.ateToday
          ? `${programName}・${position}。記録を保存すると、この日の進捗が残ります。`
          : `${programName}・${position}。あとは今日の食事を記録すれば完了です。`,
        cta: input.ateToday
          ? { label: '今日の記録を保存する', href: '#quick-record' }
          : { label: '今日の食事を記録する', href: '#quick-record' },
        secondary: { label: '今週の進捗を見る', href: '/record' },
      };
    }

    return {
      kind: 'program-check',
      code: 'CHECK',
      heading: '今日のトレーニング',
      title: '今日のメニューを読み出せませんでした',
      detail: `${programName}・${position}。Program Libraryで条件を選び直すと、今日のメニューが戻ります。`,
      cta: { label: 'Programを確認する', href: '/tools/programs' },
      secondary: { label: '今日は食事だけ記録する', href: '#quick-record' },
    };
  }

  if (personalPlan != null) {
    return {
      kind: 'program-select',
      code: 'NEXT',
      heading: '今日の一手',
      title: 'トレーニングProgramを選ぶ',
      detail: input.planWorkoutLabel == null
        ? 'Planは保存済みです。Programを選ぶと、毎日のメニューが決まります。'
        : `Planの今日の予定は「${input.planWorkoutLabel}」です。Programを選ぶと、重量と回数まで決まります。`,
      cta: { label: 'Programを選ぶ', href: '/tools/programs' },
      secondary: { label: '12週間Planを見る', href: '/plan' },
    };
  }

  return {
    kind: 'diagnosis',
    code: 'START',
    heading: '今日の一手',
    title: 'まず診断でPlanを作る',
    detail: '約2〜3分の診断で、トレーニング・食事・回復の目安がそろいます。登録は不要です。',
    cta: { label: '診断をはじめる', href: '/start' },
    secondary: { label: '今日は食事だけ記録する', href: '#quick-record' },
  };
}
