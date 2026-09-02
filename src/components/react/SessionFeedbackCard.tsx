/**
 * トレーニングを終えた直後に出るカード。
 *
 * 分析画面ではない。読むのは数秒で、伝えるのは3つだけ。
 *   今日どうだったか / 何を判断したか / 次に何をするか
 *
 * 振り返りはRecordの役目なので、ここからは導線を1本出すだけにする。
 */

import { fmt } from '../../lib/format';
import type { SessionFeedback } from '../../lib/training/feedback';
import { url } from '../../lib/url';

function DeltaBadge({ deltaKg }: { deltaKg: number }) {
  if (deltaKg === 0) return <span className="session-feedback__delta is-hold">据え置き</span>;
  const up = deltaKg > 0;
  return (
    <span className={`session-feedback__delta${up ? ' is-up' : ' is-down'}`}>
      {up ? '+' : '−'}{fmt(Math.abs(deltaKg), 1)}kg
    </span>
  );
}

export function SessionFeedbackCard({
  feedback,
  onDismiss,
}: {
  feedback: SessionFeedback;
  onDismiss: () => void;
}) {
  const { next } = feedback;
  return (
    <section className="session-feedback" role="status" aria-live="polite">
      <header className="session-feedback__head">
        <span className="session-feedback__mark" aria-hidden="true">✓</span>
        <p>{feedback.headline}</p>
      </header>

      {feedback.exercises.length > 0 && (
        <ul className="session-feedback__exercises">
          {feedback.exercises.map((exercise) => (
            <li key={exercise.exerciseId}>
              <div className="session-feedback__exercise-head">
                <strong>{exercise.label}</strong>
                {exercise.plannedSets > 0 && (
                  <span className="num">{exercise.completedSets} / {exercise.plannedSets} sets</span>
                )}
              </div>
              {exercise.nextWeightKg != null && (
                <div className="session-feedback__next">
                  <span>次回</span>
                  <strong className="num">{fmt(exercise.nextWeightKg, 1)}kg</strong>
                  {exercise.lift != null && <DeltaBadge deltaKg={exercise.deltaKg} />}
                </div>
              )}
              {exercise.reason && <p className="session-feedback__reason">{exercise.reason}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* 次回の予定。読めるときだけ出し、推測では作らない。 */}
      {next && (
        <div className="session-feedback__preview">
          <p className="session-feedback__preview-head">
            <span>NEXT</span>
            <strong>{next.label}</strong>
          </p>
          <ul>
            {next.exercises.map((exercise) => (
              <li key={exercise.exerciseId}>
                <span>{exercise.label}</span>
                <strong className="num">
                  {exercise.weightKg == null ? 'フォーム重視' : `${fmt(exercise.weightKg, 1)}kg`}
                </strong>
                <small className="num">{exercise.sets} × {exercise.reps}</small>
              </li>
            ))}
          </ul>
          {next.more > 0 && <p className="session-feedback__more">ほか{next.more}種目</p>}
        </div>
      )}

      <div className="session-feedback__actions">
        <button type="button" className="button button--block" onClick={onDismiss}>閉じる</button>
        <a className="session-feedback__link" href={url('/record')}>詳しい記録を見る →</a>
      </div>
    </section>
  );
}

export default SessionFeedbackCard;
