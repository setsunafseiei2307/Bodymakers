/**
 * 今週の栄養の振り返りと、目標を見直す提案。
 *
 * 提案が出ても勝手には適用しない。本人が「試す」を選んだときだけ変わる。
 * 数字は事実だけを並べ、増えた減ったの良し悪しは書かない。
 */

import { fmt } from '../../lib/format';
import type {
  NutritionAdherence,
  NutritionRecommendation,
  WeightTrend,
} from '../../lib/nutritionAdaptive';
import type { NutritionTarget } from '../../lib/nutritionAdaptive';

export function NutritionReviewCard({
  trend,
  adherence,
  recommendation,
  target,
  message,
  onApply,
  onKeep,
  onReset,
}: {
  trend: WeightTrend;
  adherence: NutritionAdherence;
  recommendation: NutritionRecommendation;
  target: NutritionTarget | null;
  message: string;
  onApply: () => void;
  onKeep: () => void;
  onReset: () => void;
}) {
  const hasCandidate = recommendation.state === 'adjust-down' || recommendation.state === 'adjust-up';

  return (
    <div className="nutrition-review">
      <div className="nutrition-review__stats">
        <div>
          <span>体重（7日平均）</span>
          <strong className="num">
            {trend.previousAverageKg == null || trend.currentAverageKg == null
              ? '—'
              : `${fmt(trend.previousAverageKg, 1)} → ${fmt(trend.currentAverageKg, 1)}kg`}
          </strong>
          <small className="num">
            {trend.changeKg == null
              ? `測定 ${trend.currentCount}回`
              : `${trend.changeKg > 0 ? '+' : trend.changeKg < 0 ? '−' : '±'}${fmt(Math.abs(trend.changeKg), 1)}kg`}
          </small>
        </div>
        <div>
          <span>食事の記録</span>
          <strong className="num">{adherence.completedDays} / 7日</strong>
          <small className="num">
            {adherence.averageCalories == null ? '平均は記録待ち' : `平均 ${fmt(adherence.averageCalories, 0)} kcal`}
          </small>
        </div>
        <div>
          <span>今の目標</span>
          <strong className="num">{target == null ? '—' : `${fmt(target.calories, 0)} kcal`}</strong>
          <small className="num">
            {target == null || target.offsetKcal === 0
              ? 'Planの目安どおり'
              : `Plan ${fmt(target.baselineCalories, 0)} から ${target.offsetKcal > 0 ? '+' : '−'}${Math.abs(target.offsetKcal)}`}
          </small>
        </div>
      </div>

      <div className={`nutrition-review__verdict is-${recommendation.state}`}>
        <strong>{recommendation.headline}</strong>
        <p>{recommendation.detail}</p>
      </div>

      {/* 提案は必ず本人が選ぶ。押さなければ何も変わらない。 */}
      {hasCandidate && (
        <div className="nutrition-review__choices">
          <button type="button" className="button button--block" onClick={onApply}>
            {recommendation.deltaKcal > 0 ? '+' : '−'}{Math.abs(recommendation.deltaKcal)}kcalで試す
            {recommendation.nextCalories != null && <small>（{fmt(recommendation.nextCalories, 0)} kcal）</small>}
          </button>
          <button type="button" className="button button--ghost button--block" onClick={onKeep}>
            今の目標を続ける
          </button>
        </div>
      )}

      {target != null && target.offsetKcal !== 0 && (
        <button type="button" className="nutrition-review__reset" onClick={onReset}>
          Planの目安（{fmt(target.baselineCalories, 0)} kcal）に戻す
        </button>
      )}

      {message !== '' && <p className="tool__status" role="status">{message}</p>}
      <p className="tool__note">目標の見直しは体重と食事の記録だけを見た目安です。健康状態の判断はしません。</p>
    </div>
  );
}

export default NutritionReviewCard;
