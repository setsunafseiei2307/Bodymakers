/**
 * 記録。
 *
 * 【なぜ作り直したか】
 * 以前はページの先頭が「今週のトレーニング日数／食事日数／睡眠日数／体重…」という
 * 6枚の数字タイルだった。だが記録を開く人がまず見たいのは集計値ではなく、
 * 自分が何をしたかそのものだ。集計は記録から得られる追加価値であって、主役ではない。
 *
 * いまは順番を逆にした。
 *   1. 最近の記録（日付ごとの時系列。タップでその日の中身を開く）
 *   2. その下に、今週のまとめ・トレーニングの振り返り・30日の変化
 * 分析は畳んであり、見たい人が開く。
 *
 * 集計ロジックは1つも変えていない。buildWeeklyRecordSummary /
 * buildWeeklyCoach / buildWeeklyTrainingReview / monthlyProgress /
 * weeklyHistory はそのまま呼んでいる。
 */

import { useEffect, useMemo, useState } from 'react';

import { buildWeeklyRecordSummary } from '../../lib/record';
import { fmt } from '../../lib/format';
import { DATA_CHANGED_EVENT, readData, type BodymakersData, type DailyLog } from '../../lib/storage';
import { url } from '../../lib/url';
import { buildWeeklyTrainingReview, liftProgressSummaries } from '../../lib/training/review';
import { recentSessions, summarizeSession } from '../../lib/training/log';
import { buildWeeklyCoach } from '../../lib/coach';
import { recentDateKeys, dateKey } from '../../lib/activity/days';
import WeeklyCoachCard from './WeeklyCoachCard';
import { monthlyProgress, weeklyHistory } from '../../lib/progressHistory';
import { MonthlyProgressCard, WeeklyHistoryList } from './ProgressHistory';

/** 1日ぶんの1行に出す要約。数字ではなく「何をしたか」を先に書く。 */
function dayHeadline(log: DailyLog): string {
  const parts: string[] = [];
  if (log.doneExercises.length > 0 || log.exercises.length > 0) parts.push('トレーニング');
  if (log.meals.length > 0 || log.manualIntake.kcal != null) parts.push('食事');
  if (log.weightKg != null) parts.push('体重');
  if (log.sleepHours != null) parts.push('睡眠');
  if (log.steps != null) parts.push('歩数');
  return parts.length === 0 ? '記録なし' : parts.join('・');
}

function formatDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

export default function RecordDashboard() {
  const [data, setData] = useState<BodymakersData | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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

  const summary = useMemo(() => (data ? buildWeeklyRecordSummary(data) : null), [data]);
  const trainingReview = useMemo(() => (data ? buildWeeklyTrainingReview(data) : null), [data]);
  const liftProgress = useMemo(() => (data ? liftProgressSummaries(data) : []), [data]);
  const sessions = useMemo(() => (data ? recentSessions(data.trainingSessions, 5) : []), [data]);
  const coach = useMemo(() => (data ? buildWeeklyCoach(data) : null), [data]);
  const weeks = useMemo(() => (data ? weeklyHistory(data) : []), [data]);
  const monthly = useMemo(() => (data ? monthlyProgress(data) : null), [data]);

  /** 直近14日の体重。傾向が見える程度の軽い折れ線に使う。 */
  const weightPoints = useMemo(() => {
    if (data == null) return [];
    const window = new Set(recentDateKeys(dateKey(new Date()), 14));
    return data.dailyLogs
      .filter((log) => log.weightKg != null && window.has(log.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => ({ date: log.date, weightKg: log.weightKg as number }));
  }, [data]);

  /** 新しい順の記録。既定では2週間ぶんだけ出す。 */
  const logs = useMemo(
    () => (data == null ? [] : [...data.dailyLogs].sort((a, b) => b.date.localeCompare(a.date))),
    [data],
  );
  const visibleLogs = showAll ? logs : logs.slice(0, 14);

  if (!data || !summary) {
    return <section className="rec rec--loading" aria-hidden="true" />;
  }

  const hasRecords = data.dailyLogs.length > 0 || data.programHistory.length > 0;

  if (!hasRecords) {
    return (
      <section className="rec" aria-labelledby="record-title">
        <h1 id="record-title">記録</h1>
        <p className="ux-note">
          今日の食事やトレーニングを記録すると、ここに残っていきます。まだ何もありません。
        </p>
        <a className="ux-cta" href={url('/tools/today')}>今日を記録する</a>
      </section>
    );
  }

  return (
    <section className="rec" aria-labelledby="record-title">
      <header className="rec__head">
        <h1 id="record-title">記録</h1>
        <p className="ux-note">やったことがそのまま残ります。まとめは下にあります。</p>
      </header>

      {/* 主役。日付ごとの時系列。 */}
      <div className="rec__days">
        {visibleLogs.map((log) => {
          const open = openDate === log.date;
          return (
            <div className="rec__day" key={log.date}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenDate(open ? null : log.date)}
              >
                <time dateTime={log.date}>{formatDate(log.date)}</time>
                <span className="rec__day-summary">{dayHeadline(log)}</span>
                <span className="rec__day-weight num">
                  {log.weightKg == null ? '' : `${fmt(log.weightKg, 1)}kg`}
                </span>
                <span className="rec__day-mark" aria-hidden="true">{open ? '−' : '+'}</span>
              </button>

              {open && (
                <dl className="rec__detail">
                  <div>
                    <dt>体重</dt>
                    <dd className="num">{log.weightKg == null ? '未記録' : `${fmt(log.weightKg, 1)} kg`}</dd>
                  </div>
                  <div>
                    <dt>食事</dt>
                    <dd className="num">
                      {log.manualIntake.kcal != null
                        ? `${fmt(log.manualIntake.kcal, 0)} kcal`
                        : log.meals.length > 0
                          ? `${log.meals.length}件`
                          : '未記録'}
                    </dd>
                  </div>
                  <div>
                    <dt>トレーニング</dt>
                    <dd>
                      {log.doneExercises.length > 0
                        ? `${log.doneExercises.length}種目`
                        : log.exercises.length > 0
                          ? `${log.exercises.length}件`
                          : '未記録'}
                    </dd>
                  </div>
                  <div>
                    <dt>睡眠</dt>
                    <dd className="num">{log.sleepHours == null ? '未記録' : `${fmt(log.sleepHours, 1)} 時間`}</dd>
                  </div>
                  <div>
                    <dt>歩数</dt>
                    <dd className="num">{log.steps == null ? '未記録' : `${fmt(log.steps, 0)} 歩`}</dd>
                  </div>
                </dl>
              )}
            </div>
          );
        })}
      </div>

      {logs.length > 14 && !showAll && (
        <button type="button" className="rec__more" onClick={() => setShowAll(true)}>
          もっと前の記録を見る（全{logs.length}日）
        </button>
      )}

      {/* ここから下は、記録から得られる追加価値。畳んでおく。 */}
      {coach && (
        <details className="ux-details">
          <summary>今週のまとめ</summary>
          <div>
            <WeeklyCoachCard coach={coach} variant="detailed" weightPoints={weightPoints} />
          </div>
        </details>
      )}

      {trainingReview && (
        <details className="ux-details">
          <summary>
            今週のトレーニング
            {trainingReview.programPosition ? `（${trainingReview.programPosition}）` : ''}
          </summary>
          <div>
            <ul className="rec__lines">
              {trainingReview.lines.map((line) => (
                <li key={line.id}>{line.text}</li>
              ))}
            </ul>

            {liftProgress.length > 0 && (
              <ul className="rec__lifts">
                {liftProgress.map((item) => (
                  <li key={item.lift}>
                    <span>{item.label}</span>
                    <strong className="num">
                      {item.latestWeightKg == null ? '—' : `${fmt(item.latestWeightKg, 1)}kg × ${item.latestReps}`}
                    </strong>
                    {item.estimatedOneRmKg != null && (
                      <small className="num">
                        推定1RM {fmt(item.estimatedOneRmKg, 1)}kg
                        {item.estimatedDeltaKg != null && item.estimatedDeltaKg !== 0
                          ? `（前回比 ${item.estimatedDeltaKg > 0 ? '+' : '−'}${fmt(Math.abs(item.estimatedDeltaKg), 1)}kg）`
                          : ''}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {sessions.length > 0 && (
              <ol className="rec__sessions">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <time>{session.date.replaceAll('-', '/')}</time>
                    <div>
                      {summarizeSession(session)
                        .filter((performance) => performance.topSet != null)
                        .map((performance) => (
                          <p key={performance.exerciseId}>
                            <span>{performance.label}</span>
                            <strong className="num">
                              {fmt(performance.topSet!.weightKg, 1)}kg × {performance.completedSets}セット
                            </strong>
                          </p>
                        ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      )}

      {monthly && (
        <details className="ux-details">
          <summary>30日の変化</summary>
          <div>
            <MonthlyProgressCard progress={monthly} />
            <WeeklyHistoryList weeks={weeks} />
          </div>
        </details>
      )}

      <p className="ux-note">
        記録はこの端末にだけ残ります。
        <a href={url('/data')}>ファイルに書き出して保管する →</a>
      </p>
    </section>
  );
}
