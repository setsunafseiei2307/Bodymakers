/**
 * 1RM換算ツール。
 *
 * 挙上重量とレップ数から、7つの換算式で1RMを推定する。
 * 式ごとの値も出すのは、平均値だけを見せると推定の幅が見えなくなるため。
 */

import { useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import { estimateOneRM, repTableFromOneRM, MAX_REPS } from '../../lib/onerm';
import { BigNumber, NumberField, Slip, Waiting } from './ui';
import { useQueryDefaults } from './useQueryDefaults';

/** 受け付ける重量の範囲（kg）。 */
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 600;

export default function OneRmTool() {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');

  // 記事から /tools/one-rep-max?weight=100&reps=5 のように送られてくる。
  useQueryDefaults((params) => {
    const w = params.get('weight');
    const weightParam = w == null ? null : parseNumber(w);
    if (weightParam != null && weightParam >= MIN_WEIGHT && weightParam <= MAX_WEIGHT) {
      setWeight(String(weightParam));
    }

    const r = params.get('reps');
    const repsParam = r == null ? null : parseNumber(r);
    if (
      repsParam != null &&
      Number.isInteger(repsParam) &&
      repsParam >= 1 &&
      repsParam <= MAX_REPS
    ) {
      setReps(String(repsParam));
    }
  });

  const weightValue = parseNumber(weight);
  const repsValue = parseNumber(reps);

  const weightError =
    weight !== '' && (weightValue == null || weightValue < MIN_WEIGHT || weightValue > MAX_WEIGHT)
      ? `${MIN_WEIGHT}〜${MAX_WEIGHT}kg の範囲で入力してください。`
      : undefined;

  const repsError =
    reps !== '' &&
    (repsValue == null || repsValue < 1 || repsValue > MAX_REPS || !Number.isInteger(repsValue))
      ? `1〜${MAX_REPS} の整数で入力してください。`
      : undefined;

  const estimate = useMemo(() => {
    if (weightError || repsError) return null;
    if (weightValue == null || repsValue == null) return null;
    return estimateOneRM(weightValue, repsValue);
  }, [weightValue, repsValue, weightError, repsError]);

  const repTable = useMemo(
    () => (estimate ? repTableFromOneRM(estimate.average) : []),
    [estimate],
  );

  return (
    <div className="tool">
      <Slip code="INPUT" title="挙上した記録">
        <div className="tool__form">
          <div className="row row--2">
            <NumberField
              label="重量"
              unit="kg"
              value={weight}
              onChange={setWeight}
              placeholder="100"
              error={weightError}
              hint={`${MIN_WEIGHT}〜${MAX_WEIGHT}kg`}
            />
            <NumberField
              label="レップ数"
              unit="回"
              value={reps}
              onChange={setReps}
              placeholder="5"
              inputMode="numeric"
              error={repsError}
              hint={`1〜${MAX_REPS}回`}
            />
          </div>
          <p className="tool__note">
            {MAX_REPS}回を超えるレップ数からの推定は誤差が大きいため計算しません。
            レップ数が少ないほど推定は正確になります。
          </p>
        </div>
      </Slip>

      {estimate == null ? (
        <Waiting>重量とレップ数を入力すると推定値が出ます。</Waiting>
      ) : (
        <>
          <Slip code="RESULT" title="推定1RM">
            <BigNumber
              label="7式の平均"
              value={fmt(estimate.average, 1)}
              unit="kg"
              note={
                estimate.spread > 0
                  ? `式による差は ${fmt(estimate.spread, 1)}kg（${fmt(estimate.min, 1)}〜${fmt(estimate.max, 1)}kg）。この幅がそのまま推定の不確かさです。`
                  : '1レップの記録なので、その重量がそのまま1RMです。'
              }
            />

            <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
              <table className="rows">
                <caption className="visually-hidden">換算式ごとの推定1RM</caption>
                <thead>
                  <tr>
                    <th scope="col">換算式</th>
                    <th scope="col">推定1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.results.map((result) => (
                    <tr key={result.name}>
                      <th scope="row">{result.name}</th>
                      <td>{fmt(result.value, 1)} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Slip>

          <Slip code="TABLE" title="レップ数ごとの目安重量">
            <div className="table-scroll">
              <table className="rows">
                <caption className="visually-hidden">
                  推定1RMから求めたレップ数ごとの目安重量
                </caption>
                <thead>
                  <tr>
                    <th scope="col">レップ数</th>
                    <th scope="col">%1RM</th>
                    <th scope="col">重量</th>
                  </tr>
                </thead>
                <tbody>
                  {repTable.map((row) => (
                    <tr key={row.reps} className={row.reps === repsValue ? 'is-row' : undefined}>
                      <th scope="row">{row.reps} 回</th>
                      <td>{row.percent}%</td>
                      <td>{fmt(row.weight, 1)} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="source-note" style={{ marginTop: 'var(--s3)' }}>
              %1RM は一般的な換算表の値です。実際に扱える重量は種目・個人差・当日の
              コンディションで変わります。
            </p>
          </Slip>

          <p className="note note--warn">
            <span className="note__title">目安として使ってください</span>
            推定1RMは計算値で、実測とは差が出ます。高重量に挑戦する場合は、
            セーフティバーの使用や補助者の同伴など安全を確保してください。
          </p>
        </>
      )}

      <p className="source-note">
        換算式: Epley (1985) / Brzycki (1993) / Lander (1985) / Lombardi (1989) /
        O&apos;Conner (1989) / Mayhew (1992) / Wathen (1994)。
        いずれも公表されている計算式です。
      </p>
    </div>
  );
}
