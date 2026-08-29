/**
 * Smolov プログラム生成ツール。
 *
 * Smolov はロシア発の高頻度・高ボリュームなスクワット専門プログラム。
 * Jr.（3週＋テスト週・週4回）と Base（本家・週4回）の2種類を生成する。
 *
 * 負荷が非常に高いプログラムなので、画面には注意書きを必ず添える。
 */

import { useMemo, useState } from 'react';

import { fmt, fmtComma, parseNumber } from '../../lib/format';
import { buildSmolov, smolovToText, type SmolovVariant } from '../../lib/smolov';
import { NumberField, Segmented, Slip, Waiting } from './ui';

const MIN_ONE_RM = 20;
const MAX_ONE_RM = 600;

const VARIANTS = [
  { value: 'jr' as SmolovVariant, label: 'Jr.（3週＋テスト週）' },
  { value: 'base' as SmolovVariant, label: 'Base（本家）' },
];

const EXERCISES = [
  { value: 'スクワット', label: 'スクワット' },
  { value: 'ベンチプレス', label: 'ベンチプレス' },
  { value: 'デッドリフト', label: 'デッドリフト' },
];

export default function SmolovTool() {
  const [oneRm, setOneRm] = useState('');
  const [variant, setVariant] = useState<SmolovVariant>('jr');
  const [exercise, setExercise] = useState('スクワット');
  const [weekly, setWeekly] = useState('');
  const [copied, setCopied] = useState(false);

  const oneRmValue = parseNumber(oneRm);
  const weeklyValue = parseNumber(weekly);

  const oneRmError =
    oneRm !== '' && (oneRmValue == null || oneRmValue < MIN_ONE_RM || oneRmValue > MAX_ONE_RM)
      ? `${MIN_ONE_RM}〜${MAX_ONE_RM}kg の範囲で入力してください。`
      : undefined;

  const weeklyError =
    weekly !== '' && (weeklyValue == null || weeklyValue < 0 || weeklyValue > 20)
      ? '0〜20kg の範囲で入力してください。'
      : undefined;

  const plan = useMemo(() => {
    if (oneRmError || weeklyError || oneRmValue == null) return null;
    return buildSmolov(oneRmValue, variant, {
      weeklyIncrement: weeklyValue ?? undefined,
    });
  }, [oneRmValue, variant, weeklyValue, oneRmError, weeklyError]);

  async function copyPlan() {
    if (plan == null) return;
    try {
      await navigator.clipboard.writeText(smolovToText(plan, exercise));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では黙って何もしない。
      // 表の内容は画面に出ているので、手で写せば済む。
    }
  }

  return (
    <div className="tool">
      <p className="note note--danger">
        <span className="note__title">はじめに読んでください</span>
        Smolov は週4回・高重量で行う負荷の非常に高いプログラムです。
        トレーニング歴が浅い段階や、フォームが固まっていない状態では
        けがのリスクが高くなります。十分な睡眠と食事を確保できる時期に、
        安全な環境（セーフティバー・補助者）で行ってください。
        体調に不安がある場合は実施しないでください。
      </p>

      <Slip code="INPUT" title="設定">
        <div className="tool__form">
          <Segmented
            label="種目"
            options={EXERCISES}
            value={exercise}
            onChange={setExercise}
            hint="計算は同じです。表示と書き出しの名前が変わります。"
          />
          <Segmented
            label="バリエーション"
            options={VARIANTS}
            value={variant}
            onChange={setVariant}
          />
          <div className="row row--2">
            <NumberField
              label="現在の1RM"
              unit="kg"
              value={oneRm}
              onChange={setOneRm}
              placeholder="150"
              error={oneRmError}
              hint={`${MIN_ONE_RM}〜${MAX_ONE_RM}kg`}
            />
            <NumberField
              label="週ごとの増量幅"
              unit="kg（任意）"
              value={weekly}
              onChange={setWeekly}
              placeholder="未入力なら 2.5"
              error={weeklyError}
              hint="ベンチ 2.5kg / スクワット 5kg が目安です。"
            />
          </div>
          <p className="tool__note">
            1RMが分からない場合は
            <a href="/tools/one-rep-max"> 1RM換算ツール </a>
            で推定してください。
          </p>
        </div>
      </Slip>

      {plan == null ? (
        <Waiting>1RMを入力するとプログラムが出ます。</Waiting>
      ) : (
        <>
          <Slip code="SUMMARY" title="プログラムの概要">
            <div className="stats">
              <div>
                <span className="stat__label">総挙上重量</span>
                <span className="stat__value">
                  {fmtComma(plan.tonnage)}
                  <span className="stat__unit">kg</span>
                </span>
              </div>
              <div>
                <span className="stat__label">総レップ数</span>
                <span className="stat__value">
                  {fmtComma(plan.totalReps)}
                  <span className="stat__unit">回</span>
                </span>
              </div>
              <div>
                <span className="stat__label">週ごとの増量</span>
                <span className="stat__value">
                  +{fmt(plan.increment, 1)}
                  <span className="stat__unit">kg</span>
                </span>
              </div>
            </div>
            <button type="button" className="button button--ghost" onClick={copyPlan}
              style={{ marginTop: 'var(--s4)' }}>
              {copied ? 'コピーしました' : 'テキストでコピー'}
            </button>
          </Slip>

          {plan.weeks.map((week, index) => (
            <Slip
              key={index}
              code={`WEEK ${index + 1}`}
              title={week.isTestWeek ? 'テスト週' : `第${index + 1}週`}
            >
              <p className="tool__note" style={{ marginBottom: 'var(--s3)' }}>
                {week.note}
              </p>
              <div className="table-scroll">
                <table className="rows">
                  <caption className="visually-hidden">
                    第{index + 1}週のトレーニング内容
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">日</th>
                      <th scope="col">重量</th>
                      <th scope="col">セット×レップ</th>
                      <th scope="col">挙上重量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {week.days.map((day, dayIndex) => (
                      <tr key={dayIndex}>
                        <th scope="row">{day.label}</th>
                        <td>{fmt(day.weight, 1)} kg</td>
                        <td>
                          {day.sets} × {day.reps}
                        </td>
                        <td>{fmtComma(day.tonnage)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Slip>
          ))}

          <p className="note note--warn">
            <span className="note__title">目安として使ってください</span>
            表の重量は計算値です。プログラムの途中で挙がらなくなった場合は、
            無理に続けず重量を落とすか中止してください。
            関節や腰に痛みが出た場合はただちに中止し、医療機関にご相談ください。
          </p>
        </>
      )}
    </div>
  );
}
