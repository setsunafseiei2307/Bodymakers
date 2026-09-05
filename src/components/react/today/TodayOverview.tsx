/**
 * Today の入口。この画面が Today の主役。
 *
 * 【なぜこうしたか】
 * 以前の Today は、開いた瞬間に Training / Nutrition / Food / Exercise /
 * Recovery / Adaptive / Coach / Progress / Program が全部縦に並んでいた。
 * 機能は揃っているのに「今日やること」がどれなのか読み取れない。
 *
 * いまここに出すのは3つだけ。
 *   今日のトレーニング / 今日の食事 / 体重・記録
 * それぞれ1行だけ状態を書き、押した人が詳細へ入る。
 * 微量栄養素、重量が変わった理由、週次分析、過去比較は、この画面から消して
 * 奥（各詳細画面）へ移した。消したのは表示位置であって、機能ではない。
 *
 * ロジックは持たない。状態も計算も useTodayState が持っている。
 */

import { fmt } from '../../../lib/format';
import { url } from '../../../lib/url';
import FirstWeekCard from '../FirstWeekCard';
import type { TodayViewContext } from './useTodayState';

export type TodayView = 'overview' | 'training' | 'nutrition' | 'body' | 'progress';

function todayLabel(now = new Date()): string {
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
  return `${now.getMonth() + 1}月${now.getDate()}日 (${weekday})`;
}

interface Props {
  ctx: TodayViewContext;
  onOpen: (view: TodayView) => void;
}

export default function TodayOverview({ ctx, onOpen }: Props) {
  const {
    todayAction,
    activeProgramDefinition,
    activeProgramSession,
    activeProgram,
    intakeTotals,
    nutritionTarget,
    weight,
    firstWeek,
    dailyProgress,
    coach,
    sessionLog,
  } = ctx;

  /** 「今日の一手」の行き先。ページ内アンカーはそのまま、ページはベースパスを付ける。 */
  function actionHref(href: string): string {
    return href.startsWith('#') ? href : url(href);
  }

  /** トレーニングの1行。予定があるならその名前、無ければ促し。 */
  const trainingLine = activeProgramSession
    ? `${activeProgramSession.label}${activeProgram ? `（Week ${activeProgram.currentWeek} / Day ${activeProgram.currentDay}）` : ''}`
    : activeProgramDefinition
      ? activeProgramDefinition.name
      : 'プログラムを始めると、今日の内容が決まります';

  /** 食事の1行。目標があれば「いま / 目標」、無ければ合計だけ。 */
  const nutritionLine = nutritionTarget
    ? `${fmt(intakeTotals.kcal, 0)} / ${fmt(nutritionTarget.calories, 0)} kcal`
    : intakeTotals.kcal > 0
      ? `${fmt(intakeTotals.kcal, 0)} kcal`
      : 'まだ記録がありません';

  const bodyLine = weight === '' ? '体重は未記録' : `${weight} kg`;

  const done = {
    training: sessionLog?.exercises.some((item) => item.sets.some((set) => set.done)) ?? false,
    nutrition: intakeTotals.kcal > 0,
    body: weight !== '',
  };

  return (
    <div className="td">
      <header className="td__head">
        <p className="td__date">{todayLabel()}</p>
        <h1>今日やること</h1>
      </header>

      {/* この画面で唯一の主役。状態にかかわらず1つだけ出す。 */}
      <a className="td__action" href={actionHref(todayAction.cta.href)}>
        <span className="td__action-label">{todayAction.heading}</span>
        <strong>{todayAction.title}</strong>
        <span className="td__action-detail">{todayAction.detail}</span>
        <span className="td__action-cta">{todayAction.cta.label} →</span>
      </a>

      {/* 3つだけ。ここから先は選んだ人にだけ見せる。 */}
      <nav className="td__rows" aria-label="今日の項目">
        <button type="button" onClick={() => onOpen('training')}>
          <strong>今日のトレーニング</strong>
          <small>{trainingLine}</small>
          <span aria-hidden="true">{done.training ? '✓' : '→'}</span>
        </button>
        <button type="button" onClick={() => onOpen('nutrition')}>
          <strong>今日の食事</strong>
          <small className="num">{nutritionLine}</small>
          <span aria-hidden="true">{done.nutrition ? '✓' : '→'}</span>
        </button>
        <button type="button" onClick={() => onOpen('body')}>
          <strong>体重・記録</strong>
          <small className="num">{bodyLine}</small>
          <span aria-hidden="true">{done.body ? '✓' : '→'}</span>
        </button>
      </nav>

      {/* 今日の埋まり具合。上のCTAと競合しないよう、数字1つだけ。 */}
      {dailyProgress && (
        <p className="td__progress">
          今日の記録 <strong className="num">{dailyProgress.done}</strong> / {dailyProgress.total}
        </p>
      )}

      {/* 使いはじめの案内。初週と、久しぶりに戻った人にだけ出す。 */}
      {firstWeek && (firstWeek.isFirstWeek || firstWeek.returningAfterGap) && (
        <FirstWeekCard progress={firstWeek} />
      )}

      {/* 振り返りは「今日やること」ではないので、行1本の入口だけ置く。 */}
      {coach && coach.training.hasData && firstWeek?.isFirstWeek !== true && (
        <button type="button" className="td__more" onClick={() => onOpen('progress')}>
          今週のまとめを見る →
        </button>
      )}

      <p className="td__note">
        保存した記録はこの端末にだけ残ります。
        <a href={url('/record')}>これまでの記録 →</a>
      </p>
    </div>
  );
}
