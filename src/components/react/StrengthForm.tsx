/**
 * 筋力レベル診断の入力フォーム。
 *
 * 診断自体はその場で行い、利用者が保存ボタンを押した場合だけ端末内へ残す。
 */

import { useEffect, useId, useMemo, useState, type SyntheticEvent } from 'react';

import { parseNumber } from '../../lib/format';
import {
  LIFT_LABELS,
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
import {
  latestStrengthDiagnosis,
  snapshotDiagnosis,
  type SavedStrengthDiagnosis,
} from '../../lib/strength/history';
import { readData, saveStrengthDiagnosis } from '../../lib/storage';
import StrengthResult from './StrengthResult';

/** 1種目分のフォーム入力（文字列のまま保持し、送信時に数値へ変換する）。 */
interface LiftFields {
  weight: string;
  reps: string;
}

const EMPTY_LIFT: LiftFields = { weight: '', reps: '' };
const PICKER_ORDER: readonly LiftId[] = ['bench', 'squat', 'deadlift'];
const LIFT_ENGLISH: Record<LiftId, string> = {
  bench: 'BENCH PRESS',
  squat: 'SQUAT',
  deadlift: 'DEADLIFT',
};

/** 種目ごとの補足。何を入力すればよいかを具体的に示す。 */
const LIFT_HINTS: Record<LiftId, string> = {
  squat: '直近で「あと1回は上がらない」ところまで追い込めたセットの記録',
  bench: '補助なしで挙げられた重量とレップ数',
  deadlift: '1セットで連続して挙げられた重量とレップ数',
};

interface Props {
  /**
   * true にすると「ベンチプレス1種目だけ」で始まる簡易モードになる。
   * トップページに置いて、遷移せずその場で測ってもらうために使う。
   * 結果が出たあと、本人が押せば3種目に広がる。
   */
  quickStart?: boolean;
}

export default function StrengthForm({ quickStart = false }: Props = {}) {
  const formId = useId();
  const [activeLift, setActiveLift] = useState<LiftId>('bench');
  const [includedLifts, setIncludedLifts] = useState<LiftId[]>(['bench']);
  const [sex, setSex] = useState<Sex>('M');
  const [bodyweight, setBodyweight] = useState('');
  const [lifts, setLifts] = useState<Record<LiftId, LiftFields>>({
    squat: { ...EMPTY_LIFT },
    bench: { ...EMPTY_LIFT },
    deadlift: { ...EMPTY_LIFT },
  });
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [previous, setPrevious] = useState<SavedStrengthDiagnosis | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [errors, setErrors] = useState<ValidationError[]>([]);
  /** 一度でも送信を試みたか。初回表示でエラーを出さないための制御 */
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const data = readData();
    const strengthProfile = data.strengthProfile;
    if (strengthProfile) {
      setSex(strengthProfile.sex);
      setBodyweight(String(strengthProfile.bodyweightKg));
      setLifts((current) => {
        const next = { ...current };
        for (const lift of PICKER_ORDER) {
          const savedLift = strengthProfile.lifts[lift];
          if (savedLift) {
            next[lift] = {
              weight: String(savedLift.weightKg),
              reps: String(savedLift.reps),
            };
          }
        }
        return next;
      });
    } else if (data.profile) {
      setSex(data.profile.sex === 'female' ? 'F' : 'M');
      setBodyweight(String(data.profile.weightKg));
    }
  }, []);

  /** 文字列のフォーム値から診断入力を組み立てる。 */
  const draft = useMemo<DiagnosisInput>(() => {
    const parsedLifts: Partial<Record<LiftId, LiftInput>> = {};
    for (const lift of includedLifts) {
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
  }, [sex, bodyweight, lifts, includedLifts]);

  /** 送信ボタンを押せる状態か（体重と1種目以上が埋まっているか）。 */
  const canSubmit = useMemo(() => {
    const hasBodyweight = parseNumber(bodyweight) != null;
    const hasAnyLift = includedLifts.some(
      (lift) =>
        parseNumber(lifts[lift].weight) != null && parseNumber(lifts[lift].reps) != null,
    );
    return hasBodyweight && hasAnyLift;
  }, [bodyweight, lifts, includedLifts]);

  function selectLift(lift: LiftId): void {
    setActiveLift(lift);
    setIncludedLifts((current) => (current.includes(lift) ? current : [...current, lift]));
    if (submitted) setErrors([]);
  }

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

    const data = readData();
    setPrevious(latestStrengthDiagnosis(data.strengthHistory));
    setSaved(false);
    setSaveMessage('');
    setResult(diagnose(draft));
  }

  function handleSave(): void {
    if (result == null) return;
    const success = saveStrengthDiagnosis(snapshotDiagnosis(result));
    setSaved(success);
    setSaveMessage(
      success
        ? 'この端末に保存しました。次回の診断とTodayで再利用できます。'
        : '保存できませんでした。ブラウザの保存設定を確認してください。',
    );
  }

  function handleReset(): void {
    setSex('M');
    setBodyweight('');
    setActiveLift('bench');
    setIncludedLifts(['bench']);
    setLifts({
      squat: { ...EMPTY_LIFT },
      bench: { ...EMPTY_LIFT },
      deadlift: { ...EMPTY_LIFT },
    });
    setResult(null);
    setPrevious(null);
    setSaved(false);
    setSaveMessage('');
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
      <form className="strength__form" onSubmit={handleSubmit} noValidate>
        <fieldset className="strength__fieldset">
          {!quickStart && <legend className="strength__legend">あなたについて</legend>}

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
              {!quickStart && (
                <p className="field__hint">
                  基準値が男女別にしか存在しないため、2つから近いほうを選んでください。
                </p>
              )}
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
              ) : quickStart ? null : (
                <p className="field__hint">
                  {MIN_BODYWEIGHT_KG}〜{MAX_BODYWEIGHT_KG}kg
                </p>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="strength__fieldset">
          <legend className="strength__legend">診断する種目</legend>
          <p className="strength__lead">
            まず1種目を選んでください。ほかの種目を押すとBIG3をまとめて診断できます。
          </p>

          <div className="lift-picker" aria-label="診断するBIG3種目">
            {PICKER_ORDER.map((lift) => {
              const included = includedLifts.includes(lift);
              const hasSavedValue = lifts[lift].weight !== '' && lifts[lift].reps !== '';
              return (
                <button
                  key={lift}
                  type="button"
                  className={activeLift === lift ? 'lift-picker__option lift-picker__option--active' : 'lift-picker__option'}
                  aria-pressed={included}
                  onClick={() => selectLift(lift)}
                >
                  <strong>{LIFT_ENGLISH[lift]}</strong>
                  <span>{LIFT_LABELS[lift]}</span>
                  <small>{included ? '診断に含む' : hasSavedValue ? '保存値あり' : '選択する'}</small>
                </button>
              );
            })}
          </div>

          {[activeLift].map((lift) => {
            const error = errorFor(lift);
            const weightId = `${formId}-${lift}-weight`;
            const repsId = `${formId}-${lift}-reps`;
            const errorId = `${formId}-${lift}-error`;
            return (
              // 種目名は入力欄のまとまりを示すラベルであって、
              // 文書の見出しではない。h3 にしていたためトップページで
              // h1 → h3 と見出しが飛んでいた。group にして名前で結ぶ。
              <div className="lift-input" key={lift} role="group" aria-label={LIFT_LABELS[lift]}>
                <div className="lift-input__header">
                  <span className="lift-input__name">{LIFT_LABELS[lift]}</span>
                  <p className="lift-input__hint">{LIFT_HINTS[lift]}</p>
                </div>

                <div className="lift-input__fields">
                  <div className="field">
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

                  <div className="field">
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
            保存値がある場合は自動入力されますが、診断に含むのは上で選んだ種目だけです。
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
            className="button button--lg button--block"
            disabled={!canSubmit}
          >
            {quickStart ? '筋力レベルを測る' : 'レベルを判定する'}
          </button>
          {(result || submitted) && (
            <button type="button" className="button button--ghost" onClick={handleReset}>
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
          <StrengthResult
            diagnosis={result}
            previous={previous}
            saved={saved}
            saveMessage={saveMessage}
            onSave={handleSave}
          />
        ) : submitted && errors.length > 0 ? (
          <div className="empty">
            <strong className="empty__title">入力を確認してください</strong>
            <p>上のフォームに表示されているエラーを直すと判定できます。</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
