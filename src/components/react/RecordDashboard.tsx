import { useEffect, useMemo, useState } from 'react';

import { buildWeeklyRecordSummary } from '../../lib/record';
import { fmt } from '../../lib/format';
import { DATA_CHANGED_EVENT, readData, type BodymakersData } from '../../lib/storage';
import { url } from '../../lib/url';

export default function RecordDashboard() {
  const [data, setData] = useState<BodymakersData | null>(null);
  useEffect(() => {
    const refresh = () => setData(readData());
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DATA_CHANGED_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const summary = useMemo(() => data ? buildWeeklyRecordSummary(data) : null, [data]);
  if (!data || !summary) return <section className="record-dashboard record-dashboard--loading" aria-hidden="true" />;
  const hasRecords = data.dailyLogs.length > 0 || data.programHistory.length > 0;
  const weightDelta = summary.latestWeightKg != null && summary.previousWeightKg != null ? summary.latestWeightKg - summary.previousWeightKg : null;
  return <section className="record-dashboard" aria-labelledby="record-title">
    <header><p className="app-kicker">YOUR PROGRESS</p><h1 id="record-title">続いていることが、見える。</h1><p>{summary.weekStart.replaceAll('-', '/')}〜{summary.weekEnd.replaceAll('-', '/')} の記録です。</p></header>
    {!hasRecords ? <div className="record-dashboard__empty"><span aria-hidden="true">◌</span><h2>最初の記録を残そう</h2><p>食事・睡眠・トレーニングを少しずつ入れると、今週の進み方がここにまとまります。</p><a className="button" href={url('/tools/today')}>今日を記録する</a></div> : <>
      <div className="record-dashboard__metrics">
        <article><span>トレーニング</span><strong>{summary.workoutDays}</strong><small>今週の記録日</small></article>
        <article><span>食事</span><strong>{summary.mealRecordDays}</strong><small>今週の記録日</small></article>
        <article><span>睡眠</span><strong>{summary.sleepRecordDays}</strong><small>今週の記録日</small></article>
        <article><span>体重</span><strong>{summary.latestWeightKg == null ? '—' : `${fmt(summary.latestWeightKg, 1)}kg`}</strong><small>{weightDelta == null ? '次の記録を待っています' : `前回比 ${weightDelta > 0 ? '+' : ''}${fmt(weightDelta, 1)}kg`}</small></article>
      </div>
      <section className="record-dashboard__timeline"><div><h2>最近の記録</h2><a href={url('/tools/today')}>今日を更新 →</a></div><ol>{[...data.dailyLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map((log) => <li key={log.date}><time>{log.date.replaceAll('-', '/')}</time><span>{log.weightKg == null ? '体重未記録' : `${fmt(log.weightKg, 1)}kg`}</span><span>{log.meals.length > 0 ? `食事 ${log.meals.length}件` : '食事未記録'}</span><span>{log.doneExercises.length > 0 || log.exercises.length > 0 ? '運動を記録' : '運動未記録'}</span></li>)}</ol></section>
    </>}
  </section>;
}
