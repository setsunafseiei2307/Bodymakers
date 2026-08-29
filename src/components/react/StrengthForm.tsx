/**
 * 筋力レベル診断の入力フォーム。
 *
 * 入力値はコンポーネントの state にしか持たない。
 * 送信先が無く、localStorage にも書かないため、リロードすれば完全に消える。
 * （個人情報を保管しない設計方針。診断結果はスクリーンショットで残してもらう前提。）
 */

import { useId, useMemo, useState, type SyntheticEvent } from 'react';

import { parseNumber } from '../../lib/format';
import {
  LIFT_LABELS,
  LIFT_ORDER,
  MAX_BODYWEIGHT_KG,
  MAX_LIFT_KG,
  MIN_BODYWEIGHT_KG,
  MIN_LIFT_KG,
  type LiftId,
  type Sex,
} from '../../lib/strength/standards';
import { MAX_REPS } from '../../lib/onerm';
import {
  diagnose,
  validateInput,
  type Diagnosis,
  type DiagnosisInput,
  type LiftInput,
  type ValidationError,
} from '../../lib/strength/diagnose';
import StrengthResult from './StrengthResult';

/** 1種目分のフォーム入力（文字列のまま保持し、送信時に数値へ変換する）。 */
interface LiftFields {
  weight: string;
  reps: string;
}

const EMPTY_LIFT: LiftFields = { weight: '', reps: '' };

/** 種目ごとの補足。何を入力すればよいかを具体的に示す。 */
const LIFT_HINTS: Record<LiftId, string> = {
  squat: '直近で「あと1回は上がらない」ところまで追い込めたセットの記録',
  bench: '補助なしで挙げられた重量とレップ数',
  deadlift: '1セットで連続して挙げられた重量とレップ数',
};

export default function StrengthForm() {
  const formId = useId();
  const [sex, setSex] = useState<Sex>('M');
  const [bodyweight, setBodyweight] = useState('');
  const [lifts, setLifts] = useState<Record<LiftId, LiftFields>>({
    squat: { ...EMPTY_LIFT },
    bench: { ...EMPTY_LIFT },
    deadlift: { ...EMPTY_LIFT },
  });
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  /** 一度でも送信を試みたか。初回表示でエラーを出さないための制御 */
  const [submitted, setSubmitted] = useState(false);

  /** 文字列のフォーム値から診断入力を組み立てる。 */
  const draft = useMemo<DiagnosisInput>(() => {
    const parsedLifts: Partial<Record<LiftId, LiftInput>> = {};
    for (const lift of LIFT_ORDER) {
      const field = lifts[lift];
      const weightKg = parseNumber(field.weight);
      const reps = parseNumber(field.reps);
      // 重量とレップの両方が入っている種目だけを診断対象にする。
      // 片方だけ入力された種目は「入力途中」とみなし、エラーにはしない。
      if (weightKg == null && reps == null) continue;
      parsedLifts[lift] = {
        weightKg: weightKg ?? Number.NaN,
        reps: reps ?? Number.NaN,
      };
    }
    return {
      sex,
      bodyweightKg: parseNumber(bodyweight) ?? Number.NaN,
      lifts: parsedLifts,
    };
  }, [sex, bodyweight, lifts]);

  /** 送信ボタンを押せる状態か（体重と1種目以上が埋まっているか）。 */
  const canSubmit = useMemo(() => {
    const hasBodyweight = parseNumber(bodyweight) != null;
    const hasAnyLift = LIFT_ORDER.some(
      (lift) =>
        parseNumber(lifts[lift].weight) != null && parseNumber(lifts[lift].reps) != null,
    );
    return hasBodyweight && hasAnyLift;
  }, [bodyweight, lifts]);

  function updateLift(lift: LiftId, key: keyof LiftFields, value: string): void {
    setLifts((previous) => ({
      ...previous,
      [lift]: { ...previous[lift], [key]: value },
    }));
    // 入力を直したら、その場でエラー表示を消す（再送信で作り直す）
    if (submitted) setErrors([]);
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitted(true);

    const found = validateInput(draft);
    setErrors(found);
    if (found.length > 0) {
      setResult(null);
      return;
    }

    setResult(diagnose(draft));
  }

  function handleReset(): void {
    setSex('M');
    setBodyweight('');
    setLifts({
      squat: { ...EMPTY_LIFT },
      bench: { ...EMPTY_LIFT },
      deadlift: { ...EMPTY_LIFT },
    });
    setResult(null);
    setErrors([]);
    setSubmitted(false);
  }

  /** 全体エラー（種目に紐づかないもの）。 */
  const globalErrors = errors.filter((error) => error.lift === null);

  function errorFor(lift: LiftId): ValidationError | undefined {
    return errors.find((error) => error.lift === lift);
  }

  const bodyweightError = globalErrors.find(
    (error) => error.code === 'bodyweight-required' || error.code === 'bodyweight-range',
  );
  const liftRequiredError = globalErrors.find((error) => error.code === 'lift-required');

  return (
    <div className="strength">
      <form className="strength__form card" onSubmit={handleSubmit} noValidate>
        <fieldset className="strength__fieldset">
          <legend className="strength__legend">あなたについて</legend>

          <div className="strength__row">
            <div className="field">
              <span className="field__label" id={`${formId}-sex-label`}>
                性別
              </span>
              <div
                className="segmented"
                role="radiogroup"
                aria-labelledby={`${formId}-sex-label`}
              >
                {(
                  [
                    { value: 'M', label: '男性' },
                    { value: 'F', label: '女性' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={sex === option.value}
                    className="segmented__option"
                    onClick={() => {
                      setSex(option.value);
                      if (submitted) setErrors([]);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="field__hint">
                基準値が男女別にしか存在しないため、2つから近いほうを選んでください。
              </p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor={`${formId}-bodyweight`}>
                体重
                <span className="field__unit">kg</span>
              </label>
              <input
                id={`${formId}-bodyweight`}
                className={`field__input${bodyweightError ? ' field__input--error' : ''}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="70"
                value={bodyweight}
                onChange={(event) => {
                  setBodyweight(event.target.value);
                  if (submitted) setErrors([]);
                }}
                aria-invalid={bodyweightError ? true : undefined}
                aria-describedby={bodyweightError ? `${formId}-bodyweight-error` : undefined}
              />
              {bodyweightError ? (
                <p className="field__error" id={`${formId}-bodyweight-error`} role="alert">
                  {bodyweightError.message}
                </p>
              ) : (
                <p className="field__hint">
                  {MIN_BODYWEIGHT_KG}〜{MAX_BODYWEIGHT_KG}kg
                </p>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="strength__fieldset">
          <legend className="strength__legend">挙上重量とレップ数</legend>
          <p className="strength__lead">
            1種目だけでも診断できます。3種目そろうと合計評価と弱点の指摘が出ます。
          </p>

          {LIFT_ORDER.map((lift) => {
            const error = errorFor(lift);
            const weightId = `${formId}-${lift}-weight`;
            const repsId = `${formId}-${lift}-reps`;
            const errorId = `${formId}-${lift}-error`;
            return (
              <div className="lift-input" key={lift}>
                <div className="lift-input__header">
                  <h3 className="lift-input__name">{LIFT_LABELS[lift]}</h3>
                  <p className="lift-input__hint">{LIFT_HINTS[lift]}</p>
                </div>

                <div className="lift-input__fields">
                  <div className="field field--compact">
                    <label className="field__label" htmlFor={weightId}>
                      重量
                      <span className="field__unit">kg</span>
                    </label>
                    <input
                      id={weightId}
                      className={`field__input${error ? ' field__input--error' : ''}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="100"
                      value={lifts[lift].weight}
                      onChange={(event) => updateLift(lift, 'weight', event.target.value)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </div>

                  <div className="field field--compact">
                    <label className="field__label" htmlFor={repsId}>
                      レップ数
                      <span className="field__unit">回</span>
                    </label>
                    <input
                      id={repsId}
                      className={`field__input${error ? ' field__input--error' : ''}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="5"
                      value={lifts[lift].reps}
                      onChange={(event) => updateLift(lift, 'reps', event.target.value)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </div>
                </div>

                {error ? (
                  <p className="field__error" id={errorId} role="alert">
                    {error.message}
                  </p>
                ) : null}
              </div>
            );
          })}

          <p className="strength__note">
            レップ数は1〜{MAX_REPS}回まで対応しています。それ以上の回数からの1RM推定は
            誤差が大きいため計算しません。重量は{MIN_LIFT_KG}〜{MAX_LIFT_KG}kgの範囲です。
          </p>

          {liftRequiredError ? (
            <p className="field__error" role="alert">
              {liftRequiredError.message}
            </p>
          ) : null}
        </fieldset>

        <div className="strength__actions">
          <button
            type="submit"
            className="button button--large button--block"
            disabled={!canSubmit}
          >
            レベルを判定する
          </button>
          {(result || submitted) && (
            <button type="button" className="button button--secondary" onClick={handleReset}>
              入力をクリア
            </button>
          )}
        </div>

        {!canSubmit && (
          <p className="strength__disabled-hint">
            体重と、1種目以上の重量・レップ数を入力すると判定できます。
          </p>
        )}
      </form>

      {/* 結果は入力フォームの下に出す。判定後に自動スクロールはしない
          （画面が勝手に動くと、入力ミスに気づいたときに戻りにくいため）。 */}
      <div className="strength__result" aria-live="polite">
        {result ? (
          <StrengthResult diagnosis={result} />
        ) : submitted && errors.length > 0 ? (
          <div className="empty-state">
            <strong className="empty-state__title">入力を確認してください</strong>
            <p>上のフォームに表示されているエラーを直すと判定できます。</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
