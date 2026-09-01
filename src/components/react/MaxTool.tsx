/**
 * 1RM換算とRPE換算をひとつにしたツール。
 * BIG3を最短入力で計算し、補助的な種目とRPEは追加機能として扱う。
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
const TABLE_MAX_REPS = 8;

type Mode = 'reps' | 'rpe';
type MainLift = 'bench' | 'squat' | 'deadlift' | 'other';
type OtherLift = 'dumbbell' | 'pullup' | 'dip' | 'weighted';

const MAIN_LIFT_OPTIONS: readonly { value: MainLift; label: string }[] = [
  { value: 'bench', label: 'ベンチプレス' },
  { value: 'squat', label: 'スクワット' },
  { value: 'deadlift', label: 'デッドリフト' },
  { value: 'other', label: 'その他' },
];

const OTHER_LIFT_OPTIONS: readonly { value: OtherLift; label: string }[] = [
  { value: 'dumbbell', label: 'ダンベルプレス' },
  { value: 'pullup', label: '懸垂' },
  { value: 'dip', label: 'ディップス' },
  { value: 'weighted', label: 'その他の加重種目' },
];

const LIFT_NAMES: Record<Exclude<MainLift, 'other'>, string> = {
  bench: 'ベンチプレス',
  squat: 'スクワット',
  deadlift: 'デッドリフト',
};

const OTHER_LIFT_NAMES: Record<OtherLift, string> = {
  dumbbell: 'ダンベルプレス',
  pullup: '懸垂',
  dip: 'ディップス',
  weighted: 'その他の加重種目',
};

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
  { value: 'reps', label: '通常の1RM換算' },
  { value: 'rpe', label: 'RPEも入れる' },
];

interface Props {
  defaultMode?: Mode;
}

export default function MaxTool({ defaultMode = 'reps' }: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [mainLift, setMainLift] = useState<MainLift>('bench');
  const [otherLift, setOtherLift] = useState<OtherLift>('dumbbell');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('8');
  const [bodyweight, setBodyweight] = useState('');
  const [added, setAdded] = useState('0');
  const [workPercent, setWorkPercent] = useState('80');
  const [barWeight, setBarWeight] = useState('20');

  useQueryDefaults((params) => {
    const weightParam = parseNumber(params.get('weight') ?? '');
    if (weightParam != null && weightParam >= MIN_WEIGHT && weightParam <= MAX_WEIGHT) {
      setWeight(String(weightParam));
    }

    const repsParam = parseNumber(params.get('reps') ?? '');
    if (repsParam != null && Number.isInteger(repsParam) && repsParam >= 1 && repsParam <= MAX_REPS) {
      setReps(String(repsParam));
    }

    const rpeParam = params.get('rpe');
    if (rpeParam != null && RPE_VALUES.some((value) => String(value) === rpeParam)) {
      setRpe(rpeParam);
      setMode('rpe');
    }
    if (params.get('mode') === 'rpe') setMode('rpe');
    if (params.get('mode') === 'reps') setMode('reps');
  });

  const isOther = mainLift === 'other';
  const isBodyweight = isOther && (otherLift === 'pullup' || otherLift === 'dip');
  const liftName = isOther ? OTHER_LIFT_NAMES[otherLift] : LIFT_NAMES[mainLift];
  const bodyweightValue = parseNumber(bodyweight);
  const addedValue = parseNumber(added === '' ? '0' : added);
  const rawWeightValue = parseNumber(weight);
  const repsValue = parseNumber(reps);
  const rpeValue = Number(rpe);
  const repsLimit = mode === 'rpe' ? RPE_MAX_REPS : MAX_REPS;

  const bodyweightError =
    isBodyweight && bodyweight !== '' &&
    (bodyweightValue == null || bodyweightValue < MIN_BODYWEIGHT || bodyweightValue > MAX_BODYWEIGHT)
      ? `${MIN_BODYWEIGHT}〜${MAX_BODYWEIGHT}kg の範囲で入力してください。`
      : undefined;
  const addedError =
    isBodyweight && added !== '' && (addedValue == null || addedValue < 0)
      ? '0以上で入力してください。加重していなければ0のままで構いません。'
      : undefined;
  const weightError =
    !isBodyweight && weight !== '' &&
    (rawWeightValue == null || rawWeightValue < MIN_WEIGHT || rawWeightValue > MAX_WEIGHT)
      ? `${MIN_WEIGHT}〜${MAX_WEIGHT}kg の範囲で入力してください。`
      : undefined;
  const repsError =
    reps !== '' &&
    (repsValue == null || repsValue < 1 || repsValue > repsLimit || !Number.isInteger(repsValue))
      ? `1〜${repsLimit} の整数で入力してください。`
      : undefined;

  const load = useMemo(() => {
    if (!isBodyweight) return weightError ? null : rawWeightValue;
    if (bodyweightError || addedError || bodyweightValue == null || addedValue == null) return null;
    return bodyweightLoad(bodyweightValue, addedValue);
  }, [isBodyweight, weightError, rawWeightValue, bodyweightError, addedError, bodyweightValue, addedValue]);

  const oneRm = useMemo(() => {
    if (load == null || repsValue == null || repsError) return null;
    if (mode === 'rpe') return oneRmFromRpe(load, repsValue, rpeValue);
    return estimateOneRM(load, repsValue)?.average ?? null;
  }, [load, repsValue, repsError, mode, rpeValue]);

  const estimate = useMemo(
    () => (mode === 'reps' && load != null && repsValue != null && !repsError ? estimateOneRM(load, repsValue) : null),
    [mode, load, repsValue, repsError],
  );
  const percent = useMemo(
    () => (mode === 'rpe' && repsValue != null ? rpePercent(repsValue, rpeValue) : null),
    [mode, repsValue, rpeValue],
  );
  const repTable = useMemo(() => (oneRm == null ? [] : repTableFromOneRM(oneRm)), [oneRm]);
  const rmMatrix = useMemo(() => repTable.map((row) => ({
    weight: row.weight,
    estimates: repTable.map((target) => estimateOneRM(row.weight, target.reps)?.average ?? null),
  })), [repTable]);
  const matrix = useMemo(() => (mode === 'rpe' ? buildRpeMatrix(oneRm, TABLE_MAX_REPS) : []), [mode, oneRm]);
  const repList = Array.from({ length: TABLE_MAX_REPS }, (_, index) => index + 1);
  const workingWeight = useMemo(() => {
    if (oneRm == null || isBodyweight) return null;
    return roundToIncrement(oneRm * (Number(workPercent) / 100), 2.5);
  }, [oneRm, isBodyweight, workPercent]);
  const warmupSets = useMemo(
    () => (workingWeight == null ? [] : buildWarmupSets(workingWeight, Number(barWeight), 2.5)),
    [workingWeight, barWeight],
  );
  const plates = useMemo(
    () => (workingWeight == null ? null : platesPerSide(workingWeight, Number(barWeight))),
    [workingWeight, barWeight],
  );

  return (
    <div className="tool">
      <Slip code="INPUT" title="今日のセット">
        <div className="tool__form">
          <Segmented label="種目" options={MAIN_LIFT_OPTIONS} value={mainLift} onChange={setMainLift} />

          {isOther && (
            <Segmented label="その他の種目" options={OTHER_LIFT_OPTIONS} value={otherLift} onChange={setOtherLift} />
          )}

          {isBodyweight ? (
            <>
              <div className="row row--2">
                <NumberField label="体重" unit="kg" value={bodyweight} onChange={setBodyweight} placeholder="70" error={bodyweightError} hint={`${MIN_BODYWEIGHT}〜${MAX_BODYWEIGHT}kg`} />
                <NumberField label="加重" unit="kg" value={added} onChange={setAdded} placeholder="0" error={addedError} hint="ベルトなどで足した重量" />
              </div>
              <NumberField label="レップ数" unit="回" value={reps} onChange={setReps} placeholder="8" inputMode="numeric" error={repsError} hint={`1〜${repsLimit}回`} />
              <p className="tool__note">{liftName}は<strong>体重＋加重</strong>を扱った重量として計算します。{load != null && <>　今回は <strong className="num">{fmt(load, 1)}kg</strong> を扱った計算です。</>}</p>
            </>
          ) : (
            <div className="row row--2">
              <NumberField label="重量" unit="kg" value={weight} onChange={setWeight} placeholder="100" error={weightError} hint={`${MIN_WEIGHT}〜${MAX_WEIGHT}kg`} />
              <NumberField label="レップ数" unit="回" value={reps} onChange={setReps} placeholder="5" inputMode="numeric" error={repsError} hint={`1〜${repsLimit}回`} />
            </div>
          )}

          <Segmented label="詳細な計算" options={MODE_OPTIONS} value={mode} onChange={setMode} />
          {mode === 'rpe' ? (
            <SelectField label="そのセットのRPE" options={RPE_OPTIONS} value={rpe} onChange={setRpe} hint="追加機能です。セットを終えた直後に、あと何回できたかで選びます。" />
          ) : (
            <p className="tool__note">通常の1RM換算です。余力を残したセットならRPEを使うと参考情報を追加できます。</p>
          )}
        </div>
      </Slip>

      {oneRm == null ? (
        <Waiting>{isBodyweight ? '体重・加重・レップ数を入力すると推定値が出ます。' : '重量とレップ数を入力すると推定値が出ます。'}</Waiting>
      ) : (
        <>
          <Slip code="RESULT" title="推定1RM">
            <BigNumber
              label={`${liftName} 推定1RM`}
              value={fmt(oneRm, 1)}
              unit="kg"
              note={mode === 'rpe'
                ? percent != null ? `RPE ${rpe}での推定です。このセットは1RMの ${fmt(percent, 1)}% にあたります。` : undefined
                : estimate && estimate.spread > 0 ? `7式の平均による推定値です。式による差は ${fmt(estimate.spread, 1)}kg（${fmt(estimate.min, 1)}〜${fmt(estimate.max, 1)}kg）。` : '1レップの記録なので、その重量がそのまま1RMです。'}
            />
            {isBodyweight && bodyweightValue != null && (
              <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>この値は体重を含んだ総重量です。加重ベルトに載せられる量に直すと<strong className="num"> {fmt(oneRm - bodyweightValue, 1)}kg </strong>です。</p>
            )}
          </Slip>

          <Slip code="TABLE" title="レップ換算表">
            <div className="table-scroll">
              <table className="rows">
                <caption className="visually-hidden">推定1RMから求めた1〜12回の換算表</caption>
                <thead><tr><th scope="col">レップ数</th><th scope="col">%1RM</th><th scope="col">推定重量</th></tr></thead>
                <tbody>{repTable.map((row) => <tr key={row.reps} className={row.reps === repsValue ? 'is-row' : undefined}><th scope="row">{row.reps}回</th><td>{row.percent}%</td><td>{fmt(row.weight, 1)} kg</td></tr>)}</tbody>
              </table>
            </div>
            <p className="source-note" style={{ marginTop: 'var(--s3)' }}>推定値の換算表なので、ここでは2.5kg刻みに丸めません。実際に組む重量は次のワーキング重量で2.5kg刻みにします。</p>
          </Slip>

          <Slip code="RM MAP" title="重量 × 回数 RM換算表">
            <p className="tool__note">縦の重量と横の回数を交差させると、そのセットからの推定1RMが分かります。横に動かして確認できます。</p>
            <div className="table-scroll rm-table" style={{ marginTop: 'var(--s3)' }}>
              <table className="rows">
                <caption className="visually-hidden">重量と回数ごとの推定1RM換算表</caption>
                <thead><tr><th scope="col">重量</th>{repTable.map((row) => <th scope="col" key={row.reps}>{row.reps}回</th>)}</tr></thead>
                <tbody>{rmMatrix.map((row) => <tr key={row.weight}><th scope="row" className="num">{fmt(row.weight, 1)}kg</th>{row.estimates.map((estimate, index) => <td key={repTable[index]?.reps} className={row.weight === load && repTable[index]?.reps === repsValue ? 'is-now' : undefined}>{estimate == null ? '—' : `${fmt(estimate, 1)}kg`}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <p className="source-note" style={{ marginTop: 'var(--s3)' }}>各セルはBodymakers既存の1RM推定式から動的に計算した参考値です。実際にプレートを組む重量ではありません。</p>
          </Slip>

          {!isBodyweight && workingWeight != null && (
            <Slip code="WORK SET" title="ワーキング重量・ウォームアップ">
              <div className="row">
                <SelectField label="ワーキング強度" value={workPercent} onChange={setWorkPercent} options={[60, 65, 70, 75, 80, 85, 90, 95].map((value) => ({ value: String(value), label: `${value}% 1RM` }))} />
                <SelectField label="バー重量" value={barWeight} onChange={setBarWeight} options={[{ value: '20', label: '20kg（標準）' }, { value: '15', label: '15kg' }, { value: '10', label: '10kg' }]} />
              </div>
              <BigNumber label={`${workPercent}%・2.5kg刻み`} value={fmt(workingWeight, 1)} unit="kg" note="プレートを組むための実用的な重量です。体調とフォームを優先してください。" />
              {plates && <p className="plate-load"><strong>片側:</strong> {plates.length === 0 ? 'プレートなし' : plates.map((item) => `${item.plateKg}kg × ${item.perSide}`).join(' ＋ ')}</p>}
              {warmupSets.length > 0 && <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}><table className="rows"><caption className="visually-hidden">ワーキングセットまでのウォームアップ例</caption><thead><tr><th scope="col">段階</th><th scope="col">重量</th><th scope="col">回数</th></tr></thead><tbody>{warmupSets.map((set) => <tr key={`${set.weightKg}-${set.reps}`}><th scope="row">{set.label}</th><td className="num">{fmt(set.weightKg, 1)}kg</td><td className="num">{set.reps}回</td></tr>)}<tr className="is-row"><th scope="row">ワーキングセット</th><td className="num">{fmt(workingWeight, 1)}kg</td><td>目的に合わせる</td></tr></tbody></table></div>}
            </Slip>
          )}

          {mode === 'rpe' && (
            <Slip code="RPE" title="RPEごとの次セット重量">
              <p className="tool__note" style={{ marginBottom: 'var(--s3)' }}>RPEは追加の目安です。行がRPE、列がレップ数です。</p>
              <div className="table-scroll"><table className="rows"><caption className="visually-hidden">RPEとレップ数ごとの目安重量</caption><thead><tr><th scope="col">RPE</th>{repList.map((value) => <th scope="col" key={value}>{value}回</th>)}</tr></thead><tbody>{matrix.map((row, rowIndex) => { const rowRpe = RPE_VALUES[rowIndex]; return <tr key={rowRpe} className={rowRpe === rpeValue ? 'is-row' : undefined}><th scope="row">{rowRpe}</th>{row.map((cell) => <td key={cell.reps} className={cell.rpe === rpeValue && cell.reps === repsValue ? 'is-now' : undefined}>{cell.weight == null ? '—' : fmt(cell.weight, 1)}</td>)}</tr>; })}</tbody></table></div>
            </Slip>
          )}

          {estimate && (
            <Slip code="METHOD" title="推定方法の内訳">
              <div className="table-scroll"><table className="rows"><caption className="visually-hidden">換算式ごとの推定1RM</caption><thead><tr><th scope="col">換算式</th><th scope="col">推定1RM</th></tr></thead><tbody>{estimate.results.map((result) => <tr key={result.name}><th scope="row">{result.name}</th><td>{fmt(result.value, 1)} kg</td></tr>)}</tbody></table></div>
            </Slip>
          )}
        </>
      )}
    </div>
  );
}
