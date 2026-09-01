/**
 * ツール画面で共通に使う入力パーツ。
 *
 * どのツールも「数値を入れて結果を見る」という形なので、
 * 入力欄・選択肢・結果票の3つだけを共通化してある。
 * スタイルは src/styles/tools.css にまとめてあり、ここでは構造だけを持つ。
 *
 * 入力値はすべて呼び出し側が管理する。通常は state のみで、
 * 計画・日次記録は利用者が保存ボタンを押した場合だけ localStorage に書く。
 */

import { useId, type ReactNode } from 'react';

/** 数値入力欄。文字列のまま受け渡しし、変換は呼び出し側の責務にする。 */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  placeholder,
  hint,
  error,
  inputMode = 'decimal',
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  inputMode?: 'decimal' | 'numeric';
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {unit && <span className="field__unit">{unit}</span>}
      </label>
      <input
        id={id}
        className={`field__input${error ? ' field__input--error' : ''}`}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** 日付入力。端末の日付ピッカーをそのまま使う。 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  error,
}: {
  label: string;
  /** YYYY-MM-DD */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`field__input${error ? ' field__input--error' : ''}`}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** 排他選択。選択肢が2〜4個までのときに使う。 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <span className="field__label" id={id}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className="segmented__option"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

/** 選択肢が多い場合のプルダウン。 */
export function SelectField<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="field__select"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

/** 見出し帯つきの票。ツールの入力ブロックと結果ブロックの両方に使う。 */
export function Slip({
  code,
  title,
  children,
}: {
  /** 帯の左に出す英字ラベル。票の識別に使う */
  code: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="slip">
      {/* 帯のタイトルは、このまとまりの見出しそのもの。
          span のままだと、ページ内の見出しが h1 の次にいきなり h3 になり
          （表やパネルの中の見出しが h3 のため）階層が飛んでいた。 */}
      <div className="slip__band">
        <span>{code}</span>
        <h2 className="slip__title">{title}</h2>
      </div>
      <div className="slip__body">{children}</div>
    </section>
  );
}

/** 大きく1つの数値を見せる表示。 */
export function BigNumber({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="bignum">
      <span className="bignum__label">{label}</span>
      <p className="bignum__value">
        {value}
        {unit && <span className="bignum__unit">{unit}</span>}
      </p>
      {note && <p className="bignum__note">{note}</p>}
    </div>
  );
}

/** 入力がまだ足りないときの表示。 */
export function Waiting({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
