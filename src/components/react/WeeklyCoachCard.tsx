/**
 * 今週のまとめ。
 *
 * Todayでは小さく（今日やることより目立たせない）、
 * Recordでは詳しく出す。判定は src/lib/coach/ が済ませているので、
 * ここは受け取ったものを描くだけ。
 *
 * 押してもらう操作は原則1つ。重量が上がったことは報告として出し、
 * 操作を求めない。
 */

import { fmt } from '../../lib/format';
import type { WeeklyCoach } from '../../lib/coach';
import { url } from '../../lib/url';

/**
 * 体重の動きを線1本で見せる。
 *
 * 目盛りは実際の値の幅にわずかな余白を足して取る。
 * 100gの差が急落に見えるような切り方はしない。
 */
export function WeightSparkline({ points }: { points: readonly { date: string; weightKg: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // 幅が狭いときは最低1kgの範囲を取り、小さな差を大きく見せない。
  const span = Math.max(max - min, 1);
  const mid = (max + min) / 2;
  const low = mid - span / 2;

  const width = 100;
  const height = 28;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point.weightKg - low) / span) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${Math.max(1, Math.min(height - 1, y)).toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className="coach-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`体重の推移 ${fmt(values[0]!, 1)}kg から ${fmt(values.at(-1)!, 1)}kg`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function WeeklyCoachCard({
  coach,
  variant,
  weightPoints = [],
  onOpenNutrition,
}: {
  coach: WeeklyCoach;
  variant: 'compact' | 'detailed';
  weightPoints?: readonly { date: string; weightKg: number }[];
  /** 栄養の候補を確認する場所へ移動する。Todayでは同じ画面内の移動になる。 */
  onOpenNutrition?: () => void;
}) {
  const { training, nutrition, recommendation } = coach;

  if (variant === 'compact') {
    return (
      <div className={`weekly-coach weekly-coach--compact is-${coach.state}`}>
        <p className="weekly-coach__headline">{coach.headline}</p>
        <div className="weekly-coach__quick">
          <span>トレーニング <strong className="num">{training.sessions}回</strong></span>
          <span>食事記録 <strong className="num">{nutrition.completedDays}日</strong></span>
        </div>
        {coach.narrative[0] && <p className="weekly-coach__line">{coach.narrative[0]}</p>}
        <a className="weekly-coach__more" href={url('/record')}>今週のまとめを見る →</a>
      </div>
    );
  }

  return (
    <div className={`weekly-coach weekly-coach--detailed is-${coach.state}`}>
      <header className="weekly-coach__head">
        <p className="app-kicker">THIS WEEK</p>
        <h2>{coach.headline}</h2>
      </header>

      {coach.narrative.length > 0 && (
        <div className="weekly-coach__narrative">
          {coach.narrative.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}

      <div className="weekly-coach__domains">
        <section className="weekly-coach__domain weekly-coach__domain--training">
          <p><span>TRAINING</span></p>
          <strong className="num">{training.sessions}回</strong>
          {training.programPosition && <small>{training.programPosition}</small>}
          {training.changes.length > 0 && (
            <ul>
              {training.changes.map((change) => (
                <li key={change.lift}>
                  <span>{change.label}</span>
                  <strong className="num">{change.deltaKg > 0 ? '+' : '−'}{fmt(Math.abs(change.deltaKg), 1)}kg</strong>
                </li>
              ))}
            </ul>
          )}
          {training.strength.length > 0 && (
            <details className="weekly-coach__details">
              <summary>推定1RMの動き</summary>
              <ul>
                {training.strength.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <strong className="num">
                      {fmt(item.estimatedOneRmKg, 1)}kg
                      {item.estimatedDeltaKg != null && item.estimatedDeltaKg !== 0
                        ? `（前回比 ${item.estimatedDeltaKg > 0 ? '+' : '−'}${fmt(Math.abs(item.estimatedDeltaKg), 1)}）`
                        : ''}
                    </strong>
                  </li>
                ))}
              </ul>
              <p className="tool__note">推定1RMは記録したセットからの計算値で、実測ではありません。</p>
            </details>
          )}
        </section>

        <section className="weekly-coach__domain weekly-coach__domain--nutrition">
          <p><span>NUTRITION</span></p>
          <strong className="num">{nutrition.completedDays} / 7日</strong>
          {nutrition.targetCalories != null && (
            <small className="num">
              現在 {fmt(nutrition.targetCalories, 0)} kcal
              {nutrition.offsetKcal !== 0 && nutrition.baselineCalories != null
                ? `（Plan ${fmt(nutrition.baselineCalories, 0)}）`
                : ''}
            </small>
          )}
          {nutrition.weightFromKg != null && nutrition.weightToKg != null && (
            <p className="weekly-coach__weight">
              <span className="num">
                {fmt(nutrition.weightFromKg, 1)} → {fmt(nutrition.weightToKg, 1)}kg
              </span>
              <WeightSparkline points={weightPoints} />
            </p>
          )}
        </section>
      </div>

      {coach.changes.length > 0 && (
        <section className="weekly-coach__changes">
          <h3>今週変わったこと</h3>
          <ul>
            {coach.changes.map((change) => (
              <li key={change.id} className={`is-${change.domain}`}>{change.text}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="weekly-coach__verdict">
        <h3>{recommendation.label}</h3>
        <p>{recommendation.detail}</p>
        {/* 押す操作は1つだけ。無いときはボタンを置かない。 */}
        {recommendation.action?.kind === 'nutrition-adjustment' && onOpenNutrition && (
          <button type="button" className="button button--block" onClick={onOpenNutrition}>
            {recommendation.action.label}
          </button>
        )}
        {recommendation.action?.kind === 'nutrition-adjustment' && !onOpenNutrition && (
          <a className="button button--block" href={url('/tools/today')}>{recommendation.action.label}</a>
        )}
        {recommendation.action?.kind === 'open-plan' && (
          <a className="button button--block" href={url('/plan')}>{recommendation.action.label}</a>
        )}
      </section>

      <section className="weekly-coach__next">
        <h3>次の1週間</h3>
        <dl>
          {coach.nextWeek.training && <div><dt>TRAINING</dt><dd>{coach.nextWeek.training}</dd></div>}
          {coach.nextWeek.nutrition && <div><dt>NUTRITION</dt><dd className="num">{coach.nextWeek.nutrition}</dd></div>}
          <div><dt>FOCUS</dt><dd>{coach.nextWeek.focus}</dd></div>
        </dl>
      </section>
    </div>
  );
}

export default WeeklyCoachCard;
