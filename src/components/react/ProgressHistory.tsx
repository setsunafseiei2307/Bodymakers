/**
 * 過去数週と、30日の振り返り。
 *
 * 1週ごとに大きなカードを並べない。行で追えるようにして、
 * 記録が無い週は0を実績のように見せない。
 */

import { fmt } from '../../lib/format';
import type { MonthlyProgress, WeekSummary } from '../../lib/progressHistory';

export function WeeklyHistoryList({ weeks }: { weeks: readonly WeekSummary[] }) {
  if (weeks.length === 0) return null;
  return (
    <div className="weekly-history">
      <h3>これまでの週</h3>
      <ol className="weekly-history__rows">
        {weeks.map((week) => (
          <li key={week.weekKey} className={`${week.isCurrentWeek ? 'is-current' : ''}${week.hasData ? '' : ' is-empty'}`}>
            <span className="weekly-history__label">
              {week.isCurrentWeek ? '今週' : week.label}
            </span>
            {week.hasData ? (
              <span className="weekly-history__metrics">
                <span className="num">記録 {week.activeDays}日</span>
                <span className="num">Training {week.trainingSessions}</span>
                <span className="num">食事 {week.nutritionCompleteDays}日</span>
                {week.averageWeightKg != null && <span className="num">{fmt(week.averageWeightKg, 1)}kg</span>}
                {week.adjusted && <span className="weekly-history__badge">調整あり</span>}
              </span>
            ) : (
              <span className="weekly-history__none">記録なし</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MonthlyProgressCard({ progress }: { progress: MonthlyProgress }) {
  return (
    <div className="monthly-progress">
      <h3>この30日</h3>
      <div className="monthly-progress__narrative">
        {progress.narrative.map((line) => <p key={line}>{line}</p>)}
      </div>

      {progress.hasEnoughData && (
        <div className="monthly-progress__stats">
          <div><span>記録した日</span><strong className="num">{progress.activeDays}日</strong></div>
          <div><span>トレーニング</span><strong className="num">{progress.trainingSessions}回</strong></div>
          <div><span>食事の記録</span><strong className="num">{progress.nutritionCompleteDays}日</strong></div>
        </div>
      )}

      {progress.strength.length > 0 && (
        <div className="monthly-progress__strength">
          <h4>推定1RMの動き</h4>
          <ul>
            {progress.strength.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong className="num">
                  {fmt(item.fromKg, 1)} → {fmt(item.toKg, 1)}kg
                </strong>
              </li>
            ))}
          </ul>
          <p className="tool__note">推定1RMは記録したセットからの計算値です。身体の変化そのものを示すものではありません。</p>
        </div>
      )}

      {progress.milestones.length > 0 && (
        <ul className="monthly-progress__milestones">
          {progress.milestones.map((milestone) => (
            <li key={milestone.id}>
              <span>{milestone.label}</span>
              <time>{milestone.date.replaceAll('-', '/')}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
