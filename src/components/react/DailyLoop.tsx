/**
 * 今日の進捗と、直近7日の積み上げ。
 *
 * Todayの最上部にある「今日の一手」の下に置く。
 * あちらが次の1アクション、こちらが「今日どこまで進んだか」。
 * ここに置くリンクはすべて補助的な扱いにして、Primary CTAを1つに保つ。
 *
 * 計算は src/lib/activity/ の純粋な関数が持っている。
 * ここは受け取った結果を描くだけにしている。
 */

import type { ActivitySummary, TodayProgress, WeeklyProgress, WeeklySummary } from '../../lib/activity';
import { streakMessage } from '../../lib/activity';

export function TodayProgressPanel({
  progress,
  activity,
  onNavigate,
}: {
  progress: TodayProgress;
  activity: ActivitySummary;
  /** ページ内リンクを踏んだときに、呼び出し側で開閉などを合わせるための通知。 */
  onNavigate?: (href: string) => void;
}) {
  if (progress.total === 0) return null;
  return (
    <div className="daily-loop">
      <div className="daily-loop__head">
        <p className="daily-loop__title">今日の進捗</p>
        <span className={`daily-loop__count${progress.allDone ? ' is-complete' : ''}`}>
          <strong className="num">{progress.done}</strong> / {progress.total}
        </span>
      </div>

      <div className="daily-loop__bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
        <span style={{ width: `${progress.percent}%` }} />
      </div>

      <ul className="daily-loop__tasks">
        {progress.tasks.map((task) => (
          <li key={task.id} className={`daily-loop__task${task.done ? ' is-done' : ''}`}>
            <span className="daily-loop__dot" aria-hidden="true" />
            <span className="daily-loop__label">{task.label}</span>
            {task.done
              ? <span className="daily-loop__state">記録済み</span>
              : <a className="daily-loop__link" href={task.href} onClick={() => onNavigate?.(task.href)}>{task.action}</a>}
          </li>
        ))}
      </ul>

      {progress.allDone
        ? <p className="daily-loop__done" role="status">今日の記録がそろいました。{activity.currentStreak > 1 ? `${activity.currentStreak}日続いています。` : ''}</p>
        : <p className="daily-loop__streak">{streakMessage(activity)}</p>}
    </div>
  );
}

export function WeeklyProgressPanel({
  week,
  summary,
}: {
  week: WeeklyProgress;
  summary: WeeklySummary;
}) {
  return (
    <div className="weekly-loop">
      <div className="weekly-loop__head">
        <p className="weekly-loop__title">直近7日</p>
        <span className="weekly-loop__count"><strong className="num">{week.activeDays}</strong> / {week.total} 日</span>
      </div>

      <ol className="weekly-loop__days">
        {week.days.map((day) => (
          <li
            key={day.date}
            className={`weekly-loop__day${day.active ? ' is-active' : ''}${day.isToday ? ' is-today' : ''}`}
          >
            <span className="weekly-loop__weekday">{day.weekday}</span>
            <span className="weekly-loop__mark" aria-hidden="true" />
            <span className="visually-hidden">
              {day.date.replaceAll('-', '/')} {day.active ? '記録あり' : '記録なし'}
            </span>
          </li>
        ))}
      </ol>

      {summary.lines.length > 0 && (
        <ul className="weekly-loop__lines">
          {summary.lines.map((line) => <li key={line.id}>{line.text}</li>)}
        </ul>
      )}

      {week.activeDays > 0 && (
        <details className="weekly-loop__details">
          <summary>内訳を見る</summary>
          <div className="weekly-loop__breakdown">
            <div><span>トレーニング</span><strong className="num">{week.trainingDays}日</strong></div>
            <div><span>食事</span><strong className="num">{week.nutritionDays}日</strong></div>
            <div><span>体重・睡眠</span><strong className="num">{week.checkInDays}日</strong></div>
          </div>
        </details>
      )}
    </div>
  );
}
