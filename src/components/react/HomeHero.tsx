/**
 * トップページのヒーロー。
 *
 * 状態の判定は src/lib/home/state.ts が持っている。ここは描くだけ。
 * Homeは読むだけの画面なので、この中から保存は一切しない。
 *
 * 初回の人向けのヒーローは index.astro に静的HTMLとして置いてある。
 * JavaScriptが動かない環境でも、初回の人には正しい入口が出る。
 * この島が受け持つのは、保存済みデータがある人のヒーローだけ。
 */

import { useEffect, useState } from 'react';

import { track } from '../../lib/analytics';
import { readHomeState, type HomeState } from '../../lib/home/state';
import { fmt } from '../../lib/format';
import { programById, sessionForActiveProgram } from '../../lib/programLibrary';
import { DATA_CHANGED_EVENT, readData } from '../../lib/storage';
import { url } from '../../lib/url';

/** 今日の日付。M月D日 (曜) の形。 */
function todayLabel(now = new Date()): string {
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
  return `${now.getMonth() + 1}月${now.getDate()}日 (${weekday})`;
}

interface SessionLine {
  key: string;
  name: string;
  setsReps: string;
  weight: string;
}

/** 今日のセッションを、ヒーローに出す3行までへ整える。 */
function sessionLines(): { label: string; lines: SessionLine[]; more: number } | null {
  try {
    const data = readData();
    const active = data.activeProgram;
    if (active == null) return null;
    const session = sessionForActiveProgram(active);
    if (session == null) return null;
    const definition = programById(active.programId);
    const lines = session.exercises.slice(0, 3).map((exercise, index) => ({
      key: `${exercise.exerciseId}-${index}`,
      name: exercise.label,
      setsReps: `${exercise.sets}×${exercise.reps}`,
      weight: exercise.weightKg == null ? (exercise.note ?? '') : `${fmt(exercise.weightKg, 1)}kg`,
    }));
    return {
      label: definition == null ? session.label : `${session.label}`,
      lines,
      more: Math.max(0, session.exercises.length - lines.length),
    };
  } catch {
    return null;
  }
}

function DraftLink({ state }: { state: HomeState }) {
  if (!state.hasDraft) return null;
  return (
    <a
      className="home-hero__draft-link"
      href={url('/start')}
      onClick={() => track('draft_resume_click', { state: state.id })}
    >
      診断の続きから →
    </a>
  );
}

export default function HomeHero() {
  const [state, setState] = useState<HomeState | null>(null);

  useEffect(() => {
    const refresh = () => setState(readHomeState());
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (state == null) return;
    track('home_view', { state: state.id });
    // 状態が決まったところで、静的HTML側の表示をこの状態に合わせる。
    document.documentElement.dataset.homeState = state.id;
  }, [state?.id]);

  /**
   * 静的HTML側のCTAも同じ track() を通す。
   * 計測の入口を1つに保つため、ここから委譲で拾う。
   */
  useEffect(() => {
    if (state == null) return;
    function onClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const cta = target?.closest?.('[data-home-cta]');
      if (cta == null) return;
      const position = cta.getAttribute('data-home-cta');
      if (position !== 'hero' && position !== 'final') return;
      track('hero_cta_click', { state: state!.id, position });
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [state?.id]);

  // 状態が決まるまでは何も描かない。静的HTML側が場所を確保している。
  if (state == null) return null;

  // A と B のヒーローは静的HTMLが担当する。ここでは続きの案内だけを足す。
  if (state.id === 'A') return null;

  if (state.id === 'B') {
    const { position, total } = state.draft ?? { position: null, total: null };
    return (
      <div className="home-resume-banner" role="status">
        <p>診断の続きから再開できます</p>
        {position != null && total != null && <span className="num">（{position}問目 / 全{total}問）</span>}
        <a
          className="button"
          href={url('/start')}
          onClick={() => track('draft_resume_click', { state: state.id })}
        >
          続きから →
        </a>
      </div>
    );
  }

  if (state.id === 'C') {
    return (
      <div className="home-hero home-hero--member">
        <p className="app-kicker">YOUR PLAN</p>
        <h1>あなたのプランは、できています。</h1>
        <a
          className="button button--lg"
          href={url('/tools/today')}
          onClick={() => track('hero_cta_click', { state: state.id, position: 'hero' })}
        >
          今日の一手を見る
        </a>
        <a
          className="home-hero__secondary"
          href={url('/plan')}
          onClick={() => track('hero_secondary_click', { state: state.id })}
        >
          プランを見直す →
        </a>
        <DraftLink state={state} />
      </div>
    );
  }

  if (state.id === 'D2') {
    return (
      <div className="home-hero home-hero--member">
        <p className="home-hero__date">{todayLabel()}</p>
        <h1>今日はもう完了しています。</h1>
        <a
          className="button button--lg"
          href={url('/record')}
          onClick={() => track('hero_cta_click', { state: state.id, position: 'hero' })}
        >
          記録を見る
        </a>
        <DraftLink state={state} />
      </div>
    );
  }

  // STATE_D1
  const session = sessionLines();
  return (
    <div className="home-hero home-hero--member">
      <p className="home-hero__date">{todayLabel()}</p>
      {session == null
        ? <h1>今日の一手が待っています。</h1>
        : <>
            <h1>今日：{session.label}</h1>
            <ul className="home-hero__session">
              {session.lines.map((line) => (
                <li key={line.key}>
                  <span>{line.name}</span>
                  <strong className="num">{line.setsReps}</strong>
                  <small className="num">{line.weight}</small>
                </li>
              ))}
            </ul>
            {session.more > 0 && <p className="home-hero__more">ほか{session.more}種目</p>}
          </>}
      <a
        className="button button--lg"
        href={url('/tools/today')}
        onClick={() => track('hero_cta_click', { state: state.id, position: 'hero' })}
      >
        今日をはじめる
      </a>
      <DraftLink state={state} />
    </div>
  );
}
