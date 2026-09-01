import { useEffect, useMemo, useState } from 'react';

import { fmt } from '../../lib/format';
import { buildPersonalPlan } from '../../lib/diagnosis/plan';
import { planProgress, weightTrend } from '../../lib/progress';
import {
  DATA_CHANGED_EVENT,
  clearBodymakersData,
  readData,
  todayLog,
  type BodymakersData,
} from '../../lib/storage';
import { summarizeIntake } from '../../lib/today';
import { url } from '../../lib/url';
import SavedStrengthSummary from './SavedStrengthSummary';

const STATUS_TEXT = {
  ahead: '予定より少し先行',
  'on-track': 'ほぼ予定どおり',
  behind: '少しゆっくりめ',
} as const;

export default function Dashboard() {
  const [data, setData] = useState<BodymakersData | null>(null);

  useEffect(() => {
    const refresh = () => setData(readData());
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const today = data ? todayLog(data) : null;
  const intake = useMemo(() => (today ? summarizeIntake(today.meals) : null), [today]);
  const kcal = today?.manualIntake.kcal ?? intake?.totals.kcal ?? 0;
  const protein = today?.manualIntake.protein ?? intake?.totals.protein ?? 0;
  const progress = data?.dietPlan ? planProgress(data.dietPlan, data.dailyLogs) : null;
  const personal = useMemo(() => data?.personalPlan ? buildPersonalPlan(data.personalPlan.input) : null, [data]);
  const trend = data ? weightTrend(data.dailyLogs, 14) : [];
  const hasDailyData = Boolean(data?.dietPlan || today || (data?.dailyLogs.length ?? 0) > 0);
  const hasData = Boolean(hasDailyData || (data?.strengthHistory.length ?? 0) > 0 || data?.personalPlan);

  if (data == null) {
    return <div className="dashboard dashboard--loading" aria-hidden="true" />;
  }

  function clearAll() {
    if (!window.confirm('この端末に保存した計画と記録をすべて削除しますか？')) return;
    clearBodymakersData();
    setData(readData());
  }

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard__head">
        <div>
          <p className="dashboard__eyebrow">TODAY</p>
          <h2 id="dashboard-title">今日のBodymakers</h2>
        </div>
        {hasData && (
          <button type="button" className="dashboard__clear" onClick={clearAll}>
            端末内データを削除
          </button>
        )}
      </div>

      {!hasData ? (
        <div className="dashboard__empty">
          <p>
            ダイエット計画や今日の記録を、この端末だけに保存して続きから使えます。
            アカウント登録もサーバー送信もありません。
          </p>
          <div className="dashboard__actions">
            <a className="button" href={url('/start')}>診断をはじめる</a>
            <a className="button button--ghost" href={url('/tools/today')}>今日を記録する</a>
          </div>
        </div>
      ) : (
        <>
          {personal && <div className="dashboard__plan">
            <div className="dashboard__planText"><strong>12週間Planを保存済み</strong><span>{personal.todayWorkout?.label ?? '次のトレーニングを確認'} ・ {personal.diagnosis.priorities[0]?.title ?? '今日の記録を続ける'}</span></div>
            <div className="dashboard__actions"><a className="button button--block" href={url('/plan')}>今日やることを見る</a></div>
          </div>}
          {hasDailyData && <div className="dashboard__grid">
            <a className="dashboard__metric" href={url('/tools/today')}>
              <span>体重</span>
              <strong className="num">{progress ? fmt(progress.currentWeightKg, 1) : today?.weightKg ? fmt(today.weightKg, 1) : '—'}</strong>
              <small>kg</small>
            </a>
            <a className="dashboard__metric" href={url('/tools/today')}>
              <span>今日の摂取</span>
              <strong className="num">{fmt(kcal, 0)}</strong>
              <small>/ {data.dietPlan ? fmt(data.dietPlan.targetCalories, 0) : '—'} kcal</small>
            </a>
            <a className="dashboard__metric" href={url('/tools/today')}>
              <span>Protein</span>
              <strong className="num">{fmt(protein, 0)}</strong>
              <small>/ {data.dietPlan ? fmt(data.dietPlan.proteinGrams, 0) : '—'} g</small>
            </a>
            <a className="dashboard__metric" href={url('/tools/plan')}>
              <span>目標まで</span>
              <strong className="num">
                {progress ? `${progress.remainingKg > 0 ? '+' : '−'}${fmt(Math.abs(progress.remainingKg), 1)}` : '—'}
              </strong>
              <small>kg</small>
            </a>
          </div>}

          {data.dietPlan && progress && (
            <div className="dashboard__plan">
              <div className="dashboard__planText">
                <strong>{fmt(progress.progressPercent, 0)}% 達成</strong>
                <span>{STATUS_TEXT[progress.paceStatus]}・あと{progress.remainingDays}日</span>
              </div>
              <div className="dashboard__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.progressPercent)}>
                <span style={{ width: `${progress.progressPercent}%` }} />
              </div>
              <p>
                予定体重 {fmt(progress.expectedWeightKg, 1)}kg ／ 目標日 {data.dietPlan.targetDate.replaceAll('-', '/')}
              </p>
            </div>
          )}

          {trend.length >= 2 && (
            <p className="dashboard__trend">
              直近{trend.length}回: <strong className="num">{fmt(trend[0]?.weightKg ?? 0, 1)} → {fmt(trend.at(-1)?.weightKg ?? 0, 1)}kg</strong>
            </p>
          )}

          <SavedStrengthSummary history={data.strengthHistory} />

          <div className="dashboard__actions">
            <a className="button" href={url('/tools/today')}>今日を記録する</a>
            <a className="button button--ghost" href={url('/tools/foods')}>食事を追加する</a>
          </div>
        </>
      )}

      <p className="dashboard__privacy">保存先はこのブラウザだけです。Bodymakersのサーバーには送信されません。</p>
    </section>
  );
}
