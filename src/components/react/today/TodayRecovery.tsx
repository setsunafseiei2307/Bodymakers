/**
 * Today の身体・記録面。
 *
 * 体重、歩数、睡眠、そして今日の合計と保存。
 *
 * 【なぜここに保存ボタンがあるか】
 * 「今日の記録を保存」は食事・運動・体重をまとめて1日分として書き込む。
 * どの画面から押しても保存する内容は同じなので、押す場所は
 * 体重を入れる流れの最後、つまりこの画面に置いている。
 *
 * ロジックは持たない。状態も保存処理も useTodayState が持っている。
 */

import { fmt } from '../../../lib/format';
import { SITE_NAME } from '../../../config/site';
import { buildTodayCard, drawTodayCard } from '../../../lib/todayCard';
import { findExercise } from '../../../lib/exercises';
import { TODAY_MICRONUTRIENTS } from './constants';
import ShareCard from '../ShareCard';
import { NumberField, Slip } from '../ui';
import type { TodayViewContext } from './useTodayState';

export default function TodayRecovery({ ctx }: { ctx: TodayViewContext }) {
  const {
    weight, setWeight, weightError,
    steps, setSteps, stepsError, sleepHours, setSleepHours, sleepError,
    saveTodayRecord, saveMessage,
    hasAnything, intakeTotals, intake, exercise, worked, balance, doneExercises,
  } = ctx;

  return (
    <>
      <Slip code="BODY" title="今日の身体">
        <NumberField
          label="今日の体重"
          unit="kg"
          value={weight}
          onChange={setWeight}
          placeholder="70"
          error={weightError}
          hint="前回の記録があれば自動で入ります。"
        />
        <div className="row">
          <NumberField label="歩数" unit="歩" value={steps} onChange={setSteps} placeholder="8000" inputMode="numeric" error={stepsError} />
          <NumberField label="睡眠" unit="時間" value={sleepHours} onChange={setSleepHours} placeholder="7.5" error={sleepError} />
        </div>

        <button type="button" className="button button--block button--lg" onClick={saveTodayRecord}>
          今日の記録を保存
        </button>
        {saveMessage && <p className="tool__status" role="status">{saveMessage}</p>}
        <p className="tool__note">この端末にのみ保存します。サーバーへの送信はありません。</p>
      </Slip>

      {hasAnything && (
        <div className="slip record lv-intermediate">
          <div className="slip__band">
            <span>TODAY</span>
            <span>今日の合計</span>
          </div>
          <div className="record__body">
            <div className="stats">
              <div className="stat">
                <span className="stat__label">食べた</span>
                <span className="stat__value num">{fmt(intakeTotals.kcal, 0)}</span>
                <span className="stat__unit">kcal</span>
              </div>
              <div className="stat">
                <span className="stat__label">運動で消費</span>
                <span className="stat__value num">{fmt(exercise?.kcal ?? 0, 0)}</span>
                <span className="stat__unit">kcal</span>
              </div>
              <div className="stat stat--primary">
                <span className="stat__label">たんぱく質</span>
                <span className="stat__value num">{fmt(intakeTotals.protein, 0)}</span>
                <span className="stat__unit">g</span>
              </div>
            </div>

            <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
              <table className="rows">
                <caption className="visually-hidden">今日の栄養素の合計</caption>
                <tbody>
                  <tr>
                    <th scope="row">脂質</th>
                    <td>{fmt(intakeTotals.fat, 1)} g</td>
                    <th scope="row">炭水化物</th>
                    <td>{fmt(intakeTotals.carbs, 1)} g</td>
                  </tr>
                  <tr>
                    <th scope="row">食物繊維</th>
                    <td>{fmt(intakeTotals.fiber, 1)} g</td>
                    <th scope="row">食塩</th>
                    <td>{fmt(intakeTotals.salt, 1)} g</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <details className="food__nutrient-group" style={{ marginTop: 'var(--s4)' }}>
              <summary>今日のビタミン・ミネラル摂取量</summary>
              <div className="food__nutrient-grid" style={{ marginTop: 'var(--s2)' }}>
                {TODAY_MICRONUTRIENTS.map((nutrient) => (
                  <div key={nutrient.key} className="food__nutrient-card">
                    <span className="food__nutrient-label">{nutrient.label}</span>
                    <strong className="food__nutrient-value num">{fmt(intakeTotals[nutrient.key], nutrient.digits)}</strong>
                    <span className="food__nutrient-unit">{nutrient.unit}</span>
                  </div>
                ))}
              </div>
              <p className="tool__note" style={{ marginTop: 'var(--s2)' }}>上部の「今日の栄養バランス」で、年齢・性別に応じた目安との進捗を確認できます。</p>
            </details>

            {Object.keys(intake.missing).length > 0 && (
              <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                成分表で未測定の項目があった食品が含まれています。その分は合計に足していません。
              </p>
            )}

            {worked.primary.length > 0 && (
              <p className="today__muscle-result">
                鍛えた部位: <strong>{worked.primary.join('・')}</strong>
                {worked.secondary.length > 0 && (
                  <span className="today__muscle-sub">
                    　補助的に使った部位: {worked.secondary.join('・')}
                  </span>
                )}
              </p>
            )}

            {doneExercises.length > 0 && (
              <p className="today__done">
                やった種目:{' '}
                {doneExercises
                  .map((id) => findExercise(id)?.name)
                  .filter(Boolean)
                  .join('・')}
              </p>
            )}
          </div>
        </div>
      )}

      {hasAnything && intakeTotals.kcal > 0 && (
        <Slip code="SHARE" title="今日の記録を保存・共有する">
          <ShareCard
            draw={(ctx) =>
              drawTodayCard(
                ctx,
                buildTodayCard({
                  date: new Date().toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                  intake: intakeTotals,
                  exerciseKcal: exercise?.kcal ?? 0,
                  muscles: worked.primary,
                  balance,
                }),
                SITE_NAME,
              )
            }
            filename="bodymakers-today.png"
            title="今日の記録"
            revision={`${Math.round(intakeTotals.kcal)}-${Math.round(exercise?.kcal ?? 0)}-${worked.primary.join()}-${balance ? Math.round(balance.balanceKcal) : 'x'}`}
          />
        </Slip>
      )}
    </>
  );
}
