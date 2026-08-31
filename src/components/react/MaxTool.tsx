/**
 * 1RM換算とRPE換算をひとつにしたツール。
 *
 * 【なぜ統合したか】
 * どちらも「今日のセットから1RMを知る」ための計算で、入力もほぼ同じ
 * （重量・レップ数）。違うのは余力を申告するかどうかだけなのに、
 * 別ページに分かれていたので、片方を使った人がもう片方に気づけなかった。
 *
 * URLは /tools/one-rep-max と /tools/rpe の両方を残し、
 * 開いたページに応じて最初の計算方法だけを変える。
 * 既存のリンクと検索結果を壊さないため。
 *
 * 【自重種目】
 * 懸垂やディップスは体重ぶんを持ち上げているので、
 * バーベル種目と同じ土俵で見るには体重を足す必要がある。
 * 足し算だけなので推測は入っていない。
 */

import { useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import {
  MAX_REPS,
  buildWarmupSets,
  bodyweightLoad,
  estimateOneRM,
  platesPerSide,
  repTableFromOneRM,
  roundToIncrement,
} from '../../lib/onerm';
import {
  RPE_MAX_REPS,
  RPE_VALUES,
  buildRpeMatrix,
  oneRmFromRpe,
  rpePercent,
} from '../../lib/rpe';
import { BigNumber, NumberField, Segmented, SelectField, Slip, Waiting } from './ui';
import { useQueryDefaults } from './useQueryDefaults';

const MIN_WEIGHT = 1;
const MAX_WEIGHT = 600;
const MIN_BODYWEIGHT = 30;
const MAX_BODYWEIGHT = 300;
/** 重量表の列数。多すぎると横に長くなりすぎる */
const TABLE_MAX_REPS = 8;

/** 計算のしかた。RPEを申告するかどうかだけが違う。 */
type Mode = 'reps' | 'rpe';

/** 種目の種類。自重種目では体重を足して計算する。 */
type LiftType = 'weight' | 'bodyweight';

const RPE_MEANING: Record<string, string> = {
  '10': 'もう1回も上がらない',
  '9.5': 'あと1回できるか怪しい',
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

const MODE_OPTIONS: readonly { value: Mode; label: string }[] = [
  { value: 'reps', label: 'レップ数だけ' },
  { value: 'rpe', label: '余力（RPE）も入れる' },
];

const LIFT_OPTIONS: readonly { value: LiftType; label: string }[] = [
  { value: 'weight', label: 'バーベル・ダンベル' },
  { value: 'bodyweight', label: '懸垂・ディップス' },
];

interface Props {
  /** 開いたページに応じた初期の計算方法 */
  defaultMode?: Mode;
}

export default function MaxTool({ defaultMode = 'reps' }: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [liftType, setLiftType] = useState<LiftType>('weight');

  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('8');
  const [bodyweight, setBodyweight] = useState('');
  const [added, setAdded] = useState('0');
  const [workPercent, setWorkPercent] = useState('80');
  const [barWeight, setBarWeight] = useState('20');

  // 記事から ?reps=5&rpe=8 のように送られてくる。
  // 範囲外・未定義の値は無視して既定値のままにする。
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

    const e = params.get('rpe');
    if (e != null && RPE_VALUES.some((value) => String(value) === e)) {
      setRpe(e);
      // RPEを指定して来たなら、その計算方法で開く
      setMode('rpe');
    }

    if (params.get('mode') === 'rpe') setMode('rpe');
    if (params.get('mode') === 'reps') setMode('reps');
  });

  const bodyweightValue = parseNumber(bodyweight);
  const addedValue = parseNumber(added === '' ? '0' : added);
  const rawWeightValue = parseNumber(weight);
  const repsValue = parseNumber(reps);
  const rpeValue = Number(rpe);

  // レップ数の上限は計算方法で違う。RPEの換算表は12回までしか持っていない。
  const repsLimit = mode === 'rpe' ? RPE_MAX_REPS : MAX_REPS;

  const bodyweightError =
    liftType === 'bodyweight' &&
    bodyweight !== '' &&
    (bodyweightValue == null ||
      bodyweightValue < MIN_BODYWEIGHT ||
      bodyweightValue > MAX_BODYWEIGHT)
      ? `${MIN_BODYWEIGHT}〜${MAX_BODYWEIGHT}kg の範囲で入力してください。`
      : undefined;

  const addedError =
    liftType === 'bodyweight' && added !== '' && (addedValue == null || addedValue < 0)
      ? '0以上で入力してください。加重していなければ0のままで構いません。'
      : undefined;

  const weightError =
    liftType === 'weight' &&
    weight !== '' &&
    (rawWeightValue == null || rawWeightValue < MIN_WEIGHT || rawWeightValue > MAX_WEIGHT)
      ? `${MIN_WEIGHT}〜${MAX_WEIGHT}kg の範囲で入力してください。`
      : undefined;

  const repsError =
    reps !== '' &&
    (repsValue == null ||
      repsValue < 1 ||
      repsValue > repsLimit ||
      !Number.isInteger(repsValue))
      ? `1〜${repsLimit} の整数で入力してください。`
      : undefined;

  /** 実際に持ち上げている重量。自重種目では体重＋加重。 */
  const load = useMemo(() => {
    if (liftType === 'weight') return weightError ? null : rawWeightValue;
    if (bodyweightError || addedError) return null;
    if (bodyweightValue == null || addedValue == null) return null;
    return bodyweightLoad(bodyweightValue, addedValue);
  }, [
    liftType,
    rawWeightValue,
    weightError,
    bodyweightValue,
    addedValue,
    bodyweightError,
    addedError,
  ]);

  /** 推定1RM。計算方法によって求め方が変わる。 */
  const oneRm = useMemo(() => {
    if (load == null || repsValue == null || repsError) return null;
    if (mode === 'rpe') return oneRmFromRpe(load, repsValue, rpeValue);
    const estimate = estimateOneRM(load, repsValue);
    return estimate ? estimate.average : null;
  }, [load, repsValue, repsError, mode, rpeValue]);

  /** レップ数モードでだけ、式ごとの内訳を出す */
  const estimate = useMemo(() => {
    if (mode !== 'reps' || load == null || repsValue == null || repsError) return null;
    return estimateOneRM(load, repsValue);
  }, [mode, load, repsValue, repsError]);

  const percent = useMemo(
    () => (mode === 'rpe' && repsValue != null ? rpePercent(repsValue, rpeValue) : null),
    [mode, repsValue, rpeValue],
  );

  const repTable = useMemo(
    () => (mode === 'reps' && oneRm != null ? repTableFromOneRM(oneRm) : []),
    [mode, oneRm],
  );

  const matrix = useMemo(
    () => (mode === 'rpe' ? buildRpeMatrix(oneRm, TABLE_MAX_REPS) : []),
    [mode, oneRm],
  );
  const repList = Array.from({ length: TABLE_MAX_REPS }, (_, i) => i + 1);
  const workingWeight = useMemo(() => {
    if (oneRm == null) return null;
    return roundToIncrement(oneRm * (Number(workPercent) / 100), 2.5);
  }, [oneRm, workPercent]);
  const warmupSets = useMemo(
    () => workingWeight == null ? [] : buildWarmupSets(workingWeight, Number(barWeight), 2.5),
    [workingWeight, barWeight],
  );
  const plates = useMemo(
    () => workingWeight == null ? null : platesPerSide(workingWeight, Number(barWeight)),
    [workingWeight, barWeight],
  );

  return (
    <div className="tool">
      <Slip code="INPUT" title="今日のセット">
        <div className="tool__form">
          <Segmented
            label="種目"
            options={LIFT_OPTIONS}
            value={liftType}
            onChange={setLiftType}
          />

          {liftType === 'weight' ? (
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
                hint={`1〜${repsLimit}回`}
              />
            </div>
          ) : (
            <>
              <div className="row row--2">
                <NumberField
                  label="体重"
                  unit="kg"
                  value={bodyweight}
                  onChange={setBodyweight}
                  placeholder="70"
                  error={bodyweightError}
                  hint={`${MIN_BODYWEIGHT}〜${MAX_BODYWEIGHT}kg`}
                />
                <NumberField
                  label="加重"
                  unit="kg"
                  value={added}
                  onChange={setAdded}
                  placeholder="0"
                  error={addedError}
                  hint="ベルトなどで足した重量"
                />
              </div>
              <NumberField
                label="レップ数"
                unit="回"
                value={reps}
                onChange={setReps}
                placeholder="8"
                inputMode="numeric"
                error={repsError}
                hint={`1〜${repsLimit}回`}
              />
              <p className="tool__note">
                懸垂やディップスは自分の体を持ち上げる種目なので、
                <strong>体重＋加重</strong>を扱った重量として計算します。
                {load != null && (
                  <>
                    　今回は <strong className="num">{fmt(load, 1)}kg</strong> を扱った扱いです。
                  </>
                )}
              </p>
            </>
          )}

          <Segmented
            label="計算のしかた"
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
          />

          {mode === 'rpe' ? (
            <SelectField
              label="そのセットのRPE"
              options={RPE_OPTIONS}
              value={rpe}
              onChange={setRpe}
              hint="セットを終えた直後に「あと何回できたか」で選びます。"
            />
          ) : (
            <p className="tool__note">
              限界まで追い込んだ前提で計算します。余力を残したセットなら
              「余力（RPE）も入れる」に切り替えたほうが正確です。
              {MAX_REPS}回を超えるレップ数からの推定は誤差が大きいため計算しません。
            </p>
          )}
        </div>
      </Slip>

      {oneRm == null ? (
        <Waiting>
          {liftType === 'bodyweight'
            ? '体重とレップ数を入力すると推定値が出ます。'
            : '重量とレップ数を入力すると推定値が出ます。'}
        </Waiting>
      ) : (
        <>
          <Slip code="RESULT" title="推定1RM">
            <BigNumber
              label={mode === 'rpe' ? 'RPEから逆算' : '7式の平均'}
              value={fmt(oneRm, 1)}
              unit="kg"
              note={
                mode === 'rpe'
                  ? percent != null
                    ? `このセットは1RMの ${fmt(percent, 1)}% にあたります。同じ重量・回数でもRPEが下がるほど余力があるぶん、推定1RMは高くなります。`
                    : undefined
                  : estimate && estimate.spread > 0
                    ? `式による差は ${fmt(estimate.spread, 1)}kg（${fmt(estimate.min, 1)}〜${fmt(estimate.max, 1)}kg）。この幅がそのまま推定の不確かさです。`
                    : '1レップの記録なので、その重量がそのまま1RMです。'
              }
            />

            {liftType === 'bodyweight' && bodyweightValue != null && (
              <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                この値は体重を含んだ総重量です。加重ベルトに載せられる量に直すと
                <strong className="num"> {fmt(oneRm - bodyweightValue, 1)}kg </strong>
                になります。
              </p>
            )}

            {estimate && (
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
            )}
          </Slip>

          {liftType === 'weight' && workingWeight != null && (
            <Slip code="WORK SET" title="今日の重量・ウォームアップ">
              <div className="row">
                <SelectField
                  label="ワーキング強度"
                  value={workPercent}
                  onChange={setWorkPercent}
                  options={[60, 65, 70, 75, 80, 85, 90, 95].map((value) => ({ value: String(value), label: `${value}% 1RM` }))}
                />
                <SelectField
                  label="バー重量"
                  value={barWeight}
                  onChange={setBarWeight}
                  options={[
                    { value: '20', label: '20kg（標準）' },
                    { value: '15', label: '15kg' },
                    { value: '10', label: '10kg' },
                  ]}
                />
              </div>

              <BigNumber
                label={`${workPercent}%・2.5kg刻み`}
                value={fmt(workingWeight, 1)}
                unit="kg"
                note="その日の調子とフォームを優先し、痛みがある場合は中止してください。"
              />

              {plates && (
                <p className="plate-load">
                  <strong>片側:</strong>{' '}
                  {plates.length === 0 ? 'プレートなし' : plates.map((item) => `${item.plateKg}kg × ${item.perSide}`).join(' ＋ ')}
                </p>
              )}

              {warmupSets.length > 0 && (
                <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
                  <table className="rows">
                    <caption className="visually-hidden">ワーキングセットまでのウォームアップ例</caption>
                    <thead><tr><th scope="col">段階</th><th scope="col">重量</th><th scope="col">回数</th></tr></thead>
                    <tbody>
                      {warmupSets.map((set) => (
                        <tr key={`${set.weightKg}-${set.reps}`}>
                          <th scope="row">{set.label}</th>
                          <td className="num">{fmt(set.weightKg, 1)}kg</td>
                          <td className="num">{set.reps}回</td>
                        </tr>
                      ))}
                      <tr className="is-row">
                        <th scope="row">ワーキングセット</th>
                        <td className="num">{fmt(workingWeight, 1)}kg</td>
                        <td>目的に合わせる</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <p className="source-note" style={{ marginTop: 'var(--s3)' }}>
                ウォームアップは一般的な段階例です。固定の処方ではありません。高重量ほど少ない回数で近づき、疲労を残さない構成にしています。
              </p>
            </Slip>
          )}

          {mode === 'reps' ? (
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
          ) : (
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
              <p className="source-note" style={{ marginTop: 'var(--s3)' }}>
                RPEは主観的な指標です。同じ人でも日によってずれますし、慣れるまでは
                余力を多めに見積もりがちだと言われます。
              </p>
            </Slip>
          )}

          <p className="note note--warn">
            <span className="note__title">目安として使ってください</span>
            推定1RMは計算値で、実測とは差が出ます。高重量に挑戦する場合は、
            セーフティバーの使用や補助者の同伴など安全を確保してください。
          </p>
        </>
      )}

      <p className="source-note">
        換算式: Epley (1985) / Brzycki (1993) / Lander (1985) / Lombardi (1989) /
        O&apos;Conner (1989) / Mayhew (1992) / Wathen (1994)。いずれも公表されている
        計算式です。RPE と %1RM の対応は Zourdos et al. (2016) の RIR ベースの
        スケールに基づいています。
      </p>
    </div>
  );
}
