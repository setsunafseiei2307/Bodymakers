/**
 * セットの記録。
 *
 * ジムで片手で使う前提なので、基本は「できた」を押すだけで終わるようにする。
 * 重量と回数には最初から予定値が入っていて、違ったときだけ直す。
 *
 * 重量を1セット目で直したら、まだ押していないセットにも同じ重量を送る。
 * 同じ重量を何度も打ち直させない。
 */

import { fmt } from '../../lib/format';
import type { PreviousPerformance, TrainingExerciseLog, TrainingSessionLog, TrainingSetLog } from '../../lib/training/log';

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1000, Math.round(value * 2) / 2));
}

function clampReps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function SetTracker({
  log,
  onChange,
  previous,
}: {
  log: TrainingSessionLog;
  onChange: (next: TrainingSessionLog) => void;
  /** 種目ごとの前回実績。あくまで参考で、今日の提示重量には影響しない。 */
  previous?: Map<string, PreviousPerformance>;
}) {
  function updateExercise(index: number, next: TrainingExerciseLog) {
    onChange({ ...log, exercises: log.exercises.map((item, i) => (i === index ? next : item)) });
  }

  return (
    <div className="set-tracker">
      {log.exercises.map((exercise, exerciseIndex) => {
        const plannedWeight = exercise.plannedWeightKg;
        const doneCount = exercise.sets.filter((set) => set.done).length;

        function updateSet(setIndex: number, patch: Partial<TrainingSetLog>, spreadWeight = false) {
          const sets = exercise.sets.map((set, i) => {
            if (i === setIndex) return { ...set, ...patch };
            // 重量を直したら、まだ押していない後ろのセットにも同じ重量を入れる。
            if (spreadWeight && i > setIndex && !set.done && patch.weightKg != null) {
              return { ...set, weightKg: patch.weightKg };
            }
            return set;
          });
          updateExercise(exerciseIndex, { ...exercise, sets });
        }

        return (
          <section key={`${exercise.exerciseId}-${exerciseIndex}`} className="set-tracker__exercise">
            <header className="set-tracker__head">
              <div>
                <strong>{exercise.label}</strong>
                <span className="num">
                  {plannedWeight == null ? 'フォーム重視' : `${fmt(plannedWeight, 1)}kg`}
                  {' × '}{exercise.plannedReps}{' × '}{exercise.plannedSets}
                </span>
              </div>
              <span className="set-tracker__count num" aria-label={`${exercise.sets.length}セット中${doneCount}セット完了`}>
                {doneCount} / {exercise.sets.length}
              </span>
            </header>

            {/* 前回の実績。Recordへ行かずにその場で見られるようにする。 */}
            {(() => {
              const last = previous?.get(exercise.exerciseId);
              if (last == null) return null;
              return (
                <p className="set-tracker__previous">
                  <span>前回</span>
                  <span className="num">{fmt(last.weightKg, 1)}kg × {last.reps.join(', ')}</span>
                </p>
              );
            })()}

            <ol className="set-tracker__sets">
              {exercise.sets.map((set, setIndex) => {
                const setNumber = setIndex + 1;
                const weightId = `set-${exerciseIndex}-${setIndex}-weight`;
                const repsId = `set-${exerciseIndex}-${setIndex}-reps`;
                return (
                  <li key={setIndex} className={`set-tracker__row${set.done ? ' is-done' : ''}`}>
                    <span className="set-tracker__label">Set {setNumber}</span>

                    <span className="set-tracker__field">
                      <label className="visually-hidden" htmlFor={weightId}>
                        {exercise.label} Set {setNumber} の重量（kg）
                      </label>
                      <input
                        id={weightId}
                        className="set-tracker__input num"
                        type="text"
                        inputMode="decimal"
                        value={set.weightKg === 0 ? '' : String(set.weightKg)}
                        onChange={(event) => {
                          const raw = event.target.value.replace(/[^\d.]/g, '');
                          updateSet(setIndex, { weightKg: clampWeight(Number(raw)) }, true);
                        }}
                      />
                      <span aria-hidden="true">kg</span>
                    </span>

                    <span className="set-tracker__times" aria-hidden="true">×</span>

                    <span className="set-tracker__field">
                      <label className="visually-hidden" htmlFor={repsId}>
                        {exercise.label} Set {setNumber} の回数
                      </label>
                      <input
                        id={repsId}
                        className="set-tracker__input num"
                        type="text"
                        inputMode="numeric"
                        value={set.reps === 0 ? '' : String(set.reps)}
                        onChange={(event) => {
                          const raw = event.target.value.replace(/[^\d]/g, '');
                          updateSet(setIndex, { reps: clampReps(Number(raw)) });
                        }}
                      />
                      <span aria-hidden="true">回</span>
                    </span>

                    <button
                      type="button"
                      className="set-tracker__done"
                      aria-pressed={set.done}
                      aria-label={`${exercise.label} Set ${setNumber} を${set.done ? '未完了に戻す' : '完了にする'}`}
                      onClick={() => updateSet(setIndex, { done: !set.done })}
                    >
                      <span aria-hidden="true">{set.done ? '✓' : '　'}</span>
                      <span className="set-tracker__done-text">{set.done ? '完了' : 'できた'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export default SetTracker;
