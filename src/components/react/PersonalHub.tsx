/**
 * Personal Hub（/personal）。
 *
 * 1画面1目的: 「自分の続きに入る」。
 * いちばん上に今日の入口を1つだけ置き、その下は行のリスト。
 * カードで囲まず、余白と行の区切りだけで階層をつくる。
 *
 * ここは読むだけ。保存は一切しない。
 */

import { useEffect, useState } from 'react';

import { HUB_ENTRIES, resolvePersonalHub, type PersonalHubState } from '../../lib/personal/hub';
import { DATA_CHANGED_EVENT, readData } from '../../lib/storage';
import { url } from '../../lib/url';

function todayLabel(now = new Date()): string {
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
  return `${now.getMonth() + 1}月${now.getDate()}日 (${weekday})`;
}

export default function PersonalHub() {
  const [state, setState] = useState<PersonalHubState | null>(null);

  useEffect(() => {
    const refresh = () => setState(resolvePersonalHub(readData()));
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (state == null) {
    return <div className="hub__loading" aria-hidden="true" />;
  }

  // まだ何も無い人。ここで記録を勧めない。まず自分向けの答えを作ってもらう。
  if (!state.hasPlan && !state.hasAnyRecord) {
    return (
      <div className="hub__empty">
        <h1>マイ</h1>
        <p>
          診断で自分向けのPlanを作ると、ここに「今日やること」と記録が集まります。
          まだ何も保存されていません。
        </p>
        <a className="hub__cta" href={url('/start')}>30秒で自分向けPlanを見る</a>
        <p className="hub__note">無料・登録不要。記録はこの端末にだけ残ります。</p>
      </div>
    );
  }

  return (
    <div className="hub">
      <header className="hub__head">
        <p className="hub__date">{todayLabel()}</p>
        <h1>マイ</h1>
      </header>

      {/* 主役はここ1つだけ。今日の入口。 */}
      <a className="hub__today" href={url('/tools/today')}>
        <span className="hub__today-label">今日やること</span>
        <strong>{state.todayDone ? '今日はもう記録しました' : '今日のメニューを見る'}</strong>
        {state.programPosition != null && (
          <span className="hub__today-note num">{state.programPosition}</span>
        )}
        {state.programPosition == null && state.hasPlan && (
          <span className="hub__today-note">Planから今日の内容が決まります</span>
        )}
      </a>

      <p className="hub__week">
        今週の記録 <strong className="num">{state.activeDaysThisWeek}</strong> 日
      </p>

      <nav className="hub__list" aria-label="個人の記録">
        {HUB_ENTRIES.map((entry) => (
          <a key={entry.href} href={url(entry.href)}>
            <strong>{entry.label}</strong>
            <small>{entry.note}</small>
            <span aria-hidden="true">→</span>
          </a>
        ))}
      </nav>

      {!state.hasPlan && (
        <p className="hub__note">
          まだPlanがありません。<a href={url('/start')}>診断でPlanを作る →</a>
        </p>
      )}
    </div>
  );
}
