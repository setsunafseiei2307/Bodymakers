/**
 * Today の振り返り面。
 *
 * 今週のまとめ、栄養の見直し、続いていること、1か月の見通し。
 * どれも「今日やること」ではないので、Overview の主役から外し、
 * 見たい人が開いたときだけ出す。
 *
 * ロジックは持たない。状態も計算も useTodayState が持っていて、
 * ここは受け取ったものを描くだけ。
 */

import { fmt } from '../../../lib/format';
import { url } from '../../../lib/url';
import type { TodayViewContext } from './useTodayState';
import { Segmented, NumberField, Slip } from '../ui';
import WeeklyCoachCard from '../WeeklyCoachCard';
import NutritionReviewCard from '../NutritionReviewCard';
import { WeeklyProgressPanel } from '../DailyLoop';

export default function TodayProgress({ ctx }: { ctx: TodayViewContext }) {
  const {
    coach, firstWeek, nutritionReview, nutritionTarget, nutritionMessage2,
    applyNutrition, keepNutrition, resetNutrition,
    week, weeklySummary, hasAnything, detailed, setDetailed,
    sex, setSex, height, setHeight, age, setAge, balance,
  } = ctx;

  return (
    <>
      {coach && coach.training.hasData && firstWeek?.isFirstWeek !== true && (
        <Slip code="WEEK" title="今週">
          <WeeklyCoachCard coach={coach} variant="compact" />
        </Slip>
      )}

      {nutritionReview && nutritionTarget && firstWeek?.isFirstWeek !== true && (
        <Slip code="REVIEW" title="今週の栄養">
          <NutritionReviewCard
            trend={nutritionReview.trend}
            adherence={nutritionReview.adherence}
            recommendation={nutritionReview.recommendation}
            target={nutritionTarget}
            message={nutritionMessage2}
            onApply={applyNutrition}
            onKeep={keepNutrition}
            onReset={resetNutrition}
          />
        </Slip>
      )}

      {week && weeklySummary && firstWeek?.isFirstWeek !== true && (
        <Slip code="STREAK" title="続いていること">
          <WeeklyProgressPanel week={week} summary={weeklySummary} />
          <p className="next"><a href={url('/record')}>今週の記録を詳しく見る →</a></p>
        </Slip>
      )}

      {hasAnything && (
        <Slip code="PACE" title="この調子だと">
          {!detailed ? (
            <div className="plan__upgrade">
              <p className="plan__upgrade-text">
                身長・年齢を入れると、今日の収支から
                <strong>1か月でどれくらい体重が動くか</strong>まで出せます。
              </p>
              <button
                type="button"
                className="button button--block"
                onClick={() => setDetailed(true)}
              >
                1か月の見通しを出す
              </button>
            </div>
          ) : (
            <>
              <Segmented
                label="性別"
                value={sex}
                onChange={setSex}
                options={[
                  { value: 'male', label: '男性' },
                  { value: 'female', label: '女性' },
                ]}
              />
              <div className="row">
                <NumberField
                  label="身長"
                  unit="cm"
                  value={height}
                  onChange={setHeight}
                  placeholder="172"
                />
                <NumberField
                  label="年齢"
                  unit="歳"
                  value={age}
                  onChange={setAge}
                  placeholder="30"
                  inputMode="numeric"
                />
              </div>

              {balance ? (
                <>
                  <div className="stats" style={{ marginTop: 'var(--s4)' }}>
                    <div className="stat">
                      <span className="stat__label">消費の合計</span>
                      <span className="stat__value num">{fmt(balance.burnKcal, 0)}</span>
                      <span className="stat__unit">kcal</span>
                    </div>
                    <div className="stat stat--primary">
                      <span className="stat__label">今日の収支</span>
                      <span className="stat__value num">
                        {balance.balanceKcal < 0 ? '−' : '+'}
                        {fmt(Math.abs(balance.balanceKcal), 0)}
                      </span>
                      <span className="stat__unit">kcal</span>
                    </div>
                    <div className="stat">
                      <span className="stat__label">1か月で</span>
                      <span className="stat__value num">
                        {balance.monthlyChangeKg < 0 ? '−' : '+'}
                        {fmt(Math.abs(balance.monthlyChangeKg), 1)}
                      </span>
                      <span className="stat__unit">kg</span>
                    </div>
                  </div>

                  <p className="note" style={{ marginTop: 'var(--s4)' }}>
                    <span className="note__title">運動ぶんを二重に数えないようにしています</span>
                    土台の消費は「基礎代謝 × 1.2（運動をしない日）」で見積もり、
                    そこへ入力された運動ぶんを足しています。活動レベルの係数で消費を出すと、
                    その中に運動ぶんが含まれてしまうためです。
                  </p>

                  <p className="note note--warn" style={{ marginTop: 'var(--s3)' }}>
                    <span className="note__title">1か月の数字は「今日と同じ日が30日続いたら」の計算です</span>
                    実際には体重が減れば基礎代謝も下がるため、同じ割合では進みません。
                    体重の増減には水分も含まれ、体脂肪だけが動くわけでもありません。目安として見てください。
                  </p>
                </>
              ) : (
                <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                  身長と年齢を入れると計算します。
                </p>
              )}
            </>
          )}
        </Slip>
      )}
    </>
  );
}
