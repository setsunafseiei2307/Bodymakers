/**
 * RPE換算ツール。
 *
 * RPE（主観的運動強度）は「あと何回できたか」で強度を表す指標。
 * RPE10 = 限界、RPE8 = あと2回できた、という対応になっている。
 *
 * 同じ重量×レップ数でも、RPEが低いほど余力があるぶん推定1RMは高くなる。
 * その関係を使って、実際のセットから1RMを逆算し、次のセットの重量表を出す。
 */

import { useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import { buildRpeMatrix, oneRmFromRpe, rpePercent, RPE_MAX_REPS, RPE_VALUES } from '../../lib/rpe';
import { useQueryDefaults } from './useQueryDefaults';
import { BigNumber, NumberField, SelectField, Slip, Waiting } from './ui';

const MIN_WEIGHT = 1;
const MAX_WEIGHT = 600;

/** 表に出すレップ数の上限。横に長くなりすぎないよう8までにする。 */
const TABLE_MAX_REPS = 8;

/** RPEの意味。数字だけでは伝わらないので選択肢に添える。 */
const RPE_MEANING: Record<string, string> = {
  '10': '限界。もう1回も上がらない',
  '9.5': 'あと1回できたかどうか',
  '9': 'あと1回できた',
  '8.5': 'あと1〜2回できた',
  '8': 'あと2回できた',
  '7.5': 'あと2〜3回できた',
  '7': 'あと3回できた',
  '6.5': 'あと3〜4回できた',
  '6': 'あと4回できた',
};

const RPE_OPTIONS = RPE_VALUES.map((value) => ({
  value: String(value),
  label: `RPE ${value} — ${RPE_MEANING[String(value)]}`,
}));

export default function RpeTool() {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('8');

  // 記事から /tools/rpe?reps=5&rpe=8 のように送られてくる。
  // 換算表に無い組み合わせは無視して既定値のままにする。
  useQueryDefaults((params) => {
    const r = params.get('reps');
    const repsParam = r == null ? null : parseNumber(r);
    if (
      repsParam != null &&
      Number.isInteger(repsParam) &&
      repsParam >= 1 &&
      repsParam <= RPE_MAX_REPS
    ) {
      setReps(String(repsParam));
    }

    const e = params.get('rpe');
    if (e != null && RPE_VALUES.some((value) => String(value) === e)) setRpe(e);

    const w = params.get('weight');
    const weightParam = w == null ? null : parseNumber(w);
    if (weightParam != null && weightParam >= MIN_WEIGHT && weightParam <= MAX_WEIGHT) {
      setWeight(String(weightParam));
    }
  });

  const weightValue = parseNumber(weight);
  const repsValue = parseNumber(reps);
  const rpeValue = Number(rpe);

  const weightError =
    weight !== '' && (weightValue == null || weightValue < MIN_WEIGHT || weightValue > MAX_WEIGHT)
      ? `${MIN_WEIGHT}〜${MAX_WEIGHT}kg の範囲で入力してください。`
      : undefined;

  const repsError =
    reps !== '' &&
    (repsValue == null ||
      repsValue < 1 ||
      repsValue > RPE_MAX_REPS ||
      !Number.isInteger(repsValue))
      ? `1〜${RPE_MAX_REPS} の整数で入力してください。`
      : undefined;

  const oneRm = useMemo(() => {
    if (weightError || repsError) return null;
    if (weightValue == null || repsValue == null) return null;
    return oneRmFromRpe(weightValue, repsValue, rpeValue);
  }, [weightValue, repsValue, rpeValue, weightError, repsError]);

  const percent = useMemo(
    () => (repsValue != null ? rpePercent(repsValue, rpeValue) : null),
    [repsValue, rpeValue],
  );

  const matrix = useMemo(() => buildRpeMatrix(oneRm, TABLE_MAX_REPS), [oneRm]);
  const repList = Array.from({ length: TABLE_MAX_REPS }, (_, i) => i + 1);

  return (
    <div className="tool">
      <Slip code="INPUT" title="実施したセット">
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
              hint={`1〜${RPE_MAX_REPS}回`}
            />
          </div>
          <SelectField
            label="そのセットのRPE"
            options={RPE_OPTIONS}
            value={rpe}
            onChange={setRpe}
            hint="セットを終えた直後に「あと何回できたか」で選びます。"
          />
        </div>
      </Slip>

      {oneRm == null ? (
        <Waiting>重量・レップ数・RPEを入力すると推定値が出ます。</Waiting>
      ) : (
        <>
          <Slip code="RESULT" title="推定1RM">
            <BigNumber
              label="RPEから逆算"
              value={fmt(oneRm, 1)}
              unit="kg"
              note={
                percent != null
                  ? `このセットは1RMの ${fmt(percent, 1)}% にあたります。同じ重量・回数でもRPEが下がるほど余力があるぶん、推定1RMは高くなります。`
                  : undefined
              }
            />
          </Slip>

          <Slip code="TABLE" title="次のセットの重量表">
            <p className="tool__note" style={{ marginBottom: 'var(--s3)' }}>
              行がRPE、列がレップ数です。入力したセットの位置を赤で示しています。
            </p>
            <div className="table-scroll">
              <table className="rows">
                <caption className="visually-hidden">
                  RPEとレップ数の組み合わせごとの目安重量
                </caption>
                <thead>
                  <tr>
                    <th scope="col">RPE</th>
                    {repList.map((n) => (
                      <th scope="col" key={n}>
                        {n}回
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, rowIndex) => {
                    const rowRpe = RPE_VALUES[rowIndex];
                    return (
                      <tr key={rowRpe} className={rowRpe === rpeValue ? 'is-row' : undefined}>
                        <th scope="row">{rowRpe}</th>
                        {row.map((cell) => {
                          const isNow = cell.rpe === rpeValue && cell.reps === repsValue;
                          return (
                            <td key={cell.reps} className={isNow ? 'is-now' : undefined}>
                              {cell.weight == null ? '—' : fmt(cell.weight, 1)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Slip>

          <p className="note note--warn">
            <span className="note__title">目安として使ってください</span>
            RPEは主観的な指標です。同じ人でも日によってずれますし、慣れるまでは
            実際より低く（余力があると）見積もりがちです。
          </p>
        </>
      )}

      <p className="source-note">
        RPE と %1RM の対応は Zourdos et al. (2016)
        「Novel Resistance Training-Specific Rating of Perceived Exertion Scale
        Measuring Repetitions in Reserve」で提案された RIR ベースのスケールに基づいています。
      </p>
    </div>
  );
}
