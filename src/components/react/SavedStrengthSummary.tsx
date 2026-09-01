import { fmt } from '../../lib/format';
import {
  latestStrengthLifts,
  type SavedStrengthDiagnosis,
} from '../../lib/strength/history';
import { LIFT_LABELS, type LiftId } from '../../lib/strength/standards';
import { url } from '../../lib/url';

const ORDER: readonly LiftId[] = ['bench', 'squat', 'deadlift'];

export default function SavedStrengthSummary({
  history,
  title = '保存済みの筋力',
}: {
  history: readonly SavedStrengthDiagnosis[];
  title?: string;
}) {
  const lifts = latestStrengthLifts(history);
  const visible = ORDER.flatMap((lift) => {
    const item = lifts[lift];
    return item ? [item] : [];
  });
  if (visible.length === 0) return null;

  return (
    <section className="saved-strength" aria-labelledby="saved-strength-title">
      <div className="saved-strength__head">
        <div>
          <p>STRENGTH</p>
          <h3 id="saved-strength-title">{title}</h3>
        </div>
        <a href={url('/strength-standards')}>診断を更新</a>
      </div>
      <div className="saved-strength__grid">
        {visible.map((lift) => (
          <article key={lift.lift}>
            <span>{LIFT_LABELS[lift.lift]}</span>
            <strong className="num">{fmt(lift.oneRmKg, 1)}<small>kg</small></strong>
            <p>{lift.levelLabel}・体重比 {fmt(lift.bodyweightRatio, 2)}倍</p>
            <p className="saved-strength__target">
              次は <b className="num">{fmt(lift.nextTargetKg, 1)}kg</b>
            </p>
          </article>
        ))}
      </div>
      <p className="saved-strength__note">
        端末内に保存した推定1RMです。トレーニング日の目標確認に使えます。
      </p>
    </section>
  );
}
