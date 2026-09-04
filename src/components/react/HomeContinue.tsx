/**
 * Homeに小さく足す「続き」の案内。
 *
 * Public Homeの主役はあくまで、はじめて来た人向けのヒーローと説明。
 * この島はその邪魔をしない範囲で、
 *   - 診断を途中でやめた人に「続きから」
 *   - Planを保存済みの人に「Personalの続きへ」
 * だけを出す。今日のメニューも重量も達成率もここには出さない（Personal側の担当）。
 *
 * Homeは読むだけの画面なので、ここからは保存しない。
 * 状態の判定は src/lib/home/state.ts、カードの中身は src/lib/home/continue.ts。
 */

import { useEffect, useState } from 'react';

import { track } from '../../lib/analytics';
import { buildContinueCard, type ContinueCard } from '../../lib/home/continue';
import { readHomeState, type HomeState } from '../../lib/home/state';
import { DATA_CHANGED_EVENT, readData } from '../../lib/storage';
import { url } from '../../lib/url';

interface Snapshot {
  state: HomeState;
  card: ContinueCard | null;
}

function readSnapshot(): Snapshot {
  const state = readHomeState();
  let card: ContinueCard | null = null;
  try {
    card = state.hasPlan ? buildContinueCard(readData()) : null;
  } catch {
    card = null;
  }
  return { state, card };
}

export default function HomeContinue() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    const refresh = () => setSnapshot(readSnapshot());
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const stateId = snapshot?.state.id;

  useEffect(() => {
    if (stateId == null) return;
    track('home_view', { state: stateId });
    // 保存済みの人にだけ出す案内（最後の区画の「Personalの続きへ」）を、
    // 静的HTML側でも同じ判定で出せるようにしておく。
    document.documentElement.dataset.homeState = stateId;
  }, [stateId]);

  /**
   * 静的HTML側のCTAも同じ track() を通す。
   * 計測の入口を1か所に保つため、ここから委譲で拾う。
   */
  useEffect(() => {
    if (stateId == null) return;
    function onClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const cta = target?.closest?.('[data-home-cta], [data-home-goal], [data-home-continue]');
      if (cta == null) return;

      if (cta.hasAttribute('data-home-continue')) {
        track('continue_click', { state: stateId });
        return;
      }
      const goal = cta.getAttribute('data-home-goal');
      if (goal != null) {
        // 属性値は自分で書いた4種類しか入らないが、型の都合でここで絞る。
        track('goal_select', { state: stateId, goal: goal as never });
        return;
      }
      const position = cta.getAttribute('data-home-cta');
      if (position === 'hero' || position === 'final') {
        track('hero_cta_click', { state: stateId, position });
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [stateId]);

  // 状態が決まるまでは何も描かない。初回の人には結局これが正解の表示になる。
  if (snapshot == null) return null;
  const { state, card } = snapshot;

  if (card != null) {
    return (
      <aside className="home-continue" aria-label="続きから">
        <div className="home-continue__body">
          <p className="home-continue__label">続きから</p>
          {card.position != null && <p className="home-continue__position num">{card.position}</p>}
          <p className="home-continue__note">{card.note}</p>
        </div>
        <a
          className="home-continue__link"
          href={url('/tools/today')}
          onClick={() => track('continue_click', { state: state.id })}
        >
          Personalの続きへ<span aria-hidden="true"> →</span>
        </a>
      </aside>
    );
  }

  if (state.hasDraft) {
    const { position, total } = state.draft ?? { position: null, total: null };
    return (
      <aside className="home-continue" aria-label="診断の続きから">
        <div className="home-continue__body">
          <p className="home-continue__label">診断の続きから</p>
          {position != null && total != null && (
            <p className="home-continue__position num">{position}問目 / 全{total}問</p>
          )}
          <p className="home-continue__note">前回の回答は残っています。</p>
        </div>
        <a
          className="home-continue__link"
          href={url('/start')}
          onClick={() => track('draft_resume_click', { state: state.id })}
        >
          続きから<span aria-hidden="true"> →</span>
        </a>
      </aside>
    );
  }

  return null;
}
