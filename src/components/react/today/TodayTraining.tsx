/**
 * Today のトレーニング面。
 *
 * 実行中プログラムの内容、セットの記録、終わったあとのまとめ、次回の予定、
 * 重量が変わった理由、それに「今日動いたもの」の記録までをここが持つ。
 *
 * 【なぜ分けたか】
 * 以前は Today の1ページに Training / Nutrition / Food / Exercise / Recovery /
 * Adaptive / Coach / Progress / Program が同時に並んでいた。開いた瞬間に
 * 9種類の情報が来るので、今日やることが何なのか読み取れない。
 * いまは Overview で「トレーニング」を選んだ人にだけこの画面を見せる。
 *
 * ロジックは持たない。状態も計算も useTodayState が持っていて、
 * ここは受け取ったものを描くだけ。
 */

import { fmt } from '../../../lib/format';
import type { TodayViewContext } from './useTodayState';
import { activityGroups } from '../../../lib/mets';
import { exercisesByEquipment } from '../../../lib/exercises';
import { MUSCLE_GROUPS } from '../../../lib/today';
import { LIFT_LABELS as ADAPTIVE_LIFT_LABELS } from '../../../lib/training/adaptive';
import SetTracker from '../SetTracker';
import SessionFeedbackCard from '../SessionFeedbackCard';
import { NumberField, SelectField, Slip } from '../ui';

export default function TodayTraining({ ctx }: { ctx: TodayViewContext }) {
  const {
    activeProgram, activeProgramDefinition, activeProgramSession, activeProgramMessage,
    sessionLog, updateSessionLog, previousByExercise, sessionFeedback, setSessionFeedback,
    nextPreview, adjustmentLines, adjustmentHistory, advanceProgram,
    activityId, setActivityId, minutes, setMinutes, addExercise, exercises, setExercises,
    muscles, toggleMuscle, doneExercises, toggleExercise,
    exercise, weightKg,
  } = ctx;

  return (
    <>
      {activeProgram && activeProgramDefinition && (
        <Slip code="ACTIVE" title="今日のトレーニング">
          <div id="active-program" className="today__active-program">
            <span>{activeProgramDefinition.name}</span>
            <strong>Week {activeProgram.currentWeek} / Day {activeProgram.currentDay}</strong>
            {activeProgramSession ? <><p>{activeProgramSession.label}／{activeProgramSession.focus}</p><ul>{activeProgramSession.exercises.map((item) => <li key={item.exerciseId}><span>{item.label}</span><strong>{item.weightKg == null ? item.note ?? 'フォームを保てる負荷で' : `${fmt(item.weightKg, 1)}kg`}</strong><small>{item.sets}セット × {item.reps}回</small></li>)}</ul></> : <p>現在のDayを読み込めませんでした。Program Libraryで条件を確認してください。</p>}
            {/* 実際にやったセットをその場で押す。予定値が最初から入っている。 */}
            {sessionLog && <SetTracker log={sessionLog} onChange={updateSessionLog} previous={previousByExercise} />}
            <div className="today__active-actions"><button type="button" className="button" onClick={() => advanceProgram('complete')}>セッションを完了</button><button type="button" className="button button--quiet" onClick={() => advanceProgram('skip')}>スキップ</button></div>
            {activeProgramMessage && <p className="tool__status" role="status">{activeProgramMessage}</p>}

            {/* 終わった直後だけ出す。今日どうだったか・何を判断したか・次に何をするか。 */}
            {sessionFeedback && (
              <SessionFeedbackCard feedback={sessionFeedback} onDismiss={() => setSessionFeedback(null)} />
            )}

            {/* 次回の予定。完了カードを閉じたあとも、次にやることが見える。 */}
            {sessionFeedback == null && nextPreview && (
              <div className="today__next-session">
                <p className="today__next-session-head"><span>NEXT</span><strong>{nextPreview.label}</strong></p>
                <ul>
                  {nextPreview.exercises.map((item) => (
                    <li key={item.exerciseId}>
                      <span>{item.label}</span>
                      <strong className="num">{item.weightKg == null ? 'フォーム重視' : `${fmt(item.weightKg, 1)}kg`}</strong>
                      <small className="num">{item.sets} × {item.reps}</small>
                    </li>
                  ))}
                </ul>
                {nextPreview.more > 0 && <p className="tool__note">ほか{nextPreview.more}種目</p>}
              </div>
            )}

            {/* なぜこの重量なのか。記録の結果が次回へどう返ったかを短く出す。 */}
            {adjustmentLines.length > 0 && (
              <div className="today__adaptive">
                <span>この重量になった理由</span>
                <ul>{adjustmentLines.map((line) => <li key={line}>{line}</li>)}</ul>
                {adjustmentHistory.length > 0 && (
                  <details className="today__adaptive-history">
                    <summary>これまでの調整（{adjustmentHistory.length}件）</summary>
                    <ol>
                      {adjustmentHistory.map((event) => (
                        <li key={event.id}>
                          <time>{event.date.replaceAll('-', '/')}</time>
                          <span>{ADAPTIVE_LIFT_LABELS[event.lift]}</span>
                          <strong className="num">
                            {event.deltaKg === 0 ? '据え置き' : `${event.deltaKg > 0 ? '+' : '−'}${fmt(Math.abs(event.deltaKg), 1)}kg`}
                          </strong>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            )}
          </div>
        </Slip>
      )}

      <div id="workout">
      <Slip code="MOVE" title="動いたもの">
        <div className="row">
          <SelectField
            label="何をした？"
            value={activityId}
            onChange={setActivityId}
            options={activityGroups().flatMap((g) =>
              g.items.map((a) => ({ value: a.id, label: `${g.group}／${a.label}` })),
            )}
          />
          <NumberField
            label="何分"
            unit="分"
            value={minutes}
            onChange={setMinutes}
            placeholder="30"
            inputMode="numeric"
          />
        </div>

        <button type="button" className="button button--block" onClick={addExercise}>
          運動を追加する
        </button>

        {exercise && exercise.items.length > 0 && (
          <ul className="today__list">
            {exercise.items.map((item, index) => (
              <li className="today__row" key={`${item.activityId}-${index}`}>
                <span className="today__row-name">{item.label}</span>
                <span className="today__row-unit">{item.minutes}分</span>
                <span className="today__row-kcal num">{fmt(item.kcal, 0)} kcal</span>
                <button
                  type="button"
                  className="today__remove"
                  onClick={() => setExercises((list) => list.filter((_, i) => i !== index))}
                  aria-label={`${item.label}を削除`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {exercises.length === 0 && weightKg == null && (
          <p className="tool__note">体重を入れると、運動の消費カロリーを計算できます。</p>
        )}

        {/* やった種目を選ぶ。部位は種目から決まるので入力させない */}
        <details className="today__exercises">
          <summary className="today__exercisesSummary">
            筋トレの種目を選ぶ
            {doneExercises.length > 0 && <span className="num"> （{doneExercises.length}種目）</span>}
          </summary>
          {exercisesByEquipment().map((group) => (
            <fieldset key={group.equipment} className="today__muscles">
              <legend className="field__label">{group.equipment}</legend>
              <div className="today__chips">
                {group.exercises.map((exercise) => (
                  <button
                    key={exercise.id}
                    type="button"
                    className={`today__chip${doneExercises.includes(exercise.id) ? ' is-on' : ''}`}
                    aria-pressed={doneExercises.includes(exercise.id)}
                    onClick={() => toggleExercise(exercise.id)}
                  >
                    {exercise.name}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </details>

        {/* 種目を選ばずに部位だけ残したい人のための入力。
            種目を選んでいればそちらが優先されるので、その旨を出す。 */}
        <fieldset className="today__muscles">
          <legend className="field__label">
            {doneExercises.length > 0
              ? '部位を手で足す（種目から出したものに加算されます）'
              : '鍛えた部位（種目を選ばない場合）'}
          </legend>
          <div className="today__chips">
            {MUSCLE_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                className={`today__chip${muscles.includes(group) ? ' is-on' : ''}`}
                aria-pressed={muscles.includes(group)}
                onClick={() => toggleMuscle(group)}
              >
                {group}
              </button>
            ))}
          </div>
        </fieldset>
      </Slip>

      </div>
    </>
  );
}
