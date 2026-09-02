/**
 * 使いはじめの案内。
 *
 * Adaptiveがまだ動かない期間でも、いまどこにいて次に何をすれば進むかを返す。
 * チェックリストのアプリにはしない。印は4つまでで、済んだものは静かに畳む。
 */

import type { FirstWeekProgress } from '../../lib/onboarding';
import { url } from '../../lib/url';

export function FirstWeekCard({ progress }: { progress: FirstWeekProgress }) {
  const remaining = progress.steps.filter((step) => !step.done);
  const next = remaining[0] ?? null;
  const doneCount = progress.steps.length - remaining.length;

  return (
    <div className="first-week">
      <div className="first-week__head">
        <p className="first-week__headline">{progress.headline}</p>
        <span className="first-week__count num" aria-label={`${progress.steps.length}項目中${doneCount}項目`}>
          {doneCount} / {progress.steps.length}
        </span>
      </div>
      <p className="first-week__detail">{progress.detail}</p>

      <ol className="first-week__steps">
        {progress.steps.map((step) => (
          <li key={step.id} className={step.done ? 'is-done' : ''}>
            <span className="first-week__mark" aria-hidden="true">{step.done ? '✓' : '○'}</span>
            <span className="first-week__label">{step.label}</span>
            <span className="visually-hidden">{step.done ? '完了' : '未完了'}</span>
          </li>
        ))}
      </ol>

      {next?.hint && <p className="first-week__next">{next.hint}</p>}

      {progress.unlocks.length > 0 && (
        <ul className="first-week__unlocks">
          {progress.unlocks.map((unlock) => <li key={unlock.id}>{unlock.hint}</li>)}
        </ul>
      )}

      {progress.stage === 'new' && (
        <a className="button button--block" href={url('/start')}>診断をはじめる</a>
      )}
    </div>
  );
}

export default FirstWeekCard;
