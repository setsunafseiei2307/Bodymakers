/**
 * BIG3を最短入力で換算し、実際に組む重量までつなげる1RMツール。
 */

import { useEffect, useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import {
  MAX_REPS,
  buildWarmupSets,
  bodyweightLoad,
  estimateOneRM,
  platesPerSide,
  repTableFromOneRM,
  rmDisplayRange,
  roundToIncrement,
  type RmDisplayRange,
} from '../../lib/onerm';
import {
  RPE_MAX_REPS,
  RPE_VALUES,
  buildRpeMatrix,
  oneRmFromRpe,
  rpePercent,
} from '../../lib/rpe';
import { readData } from '../../lib/storage';
import { latestStrengthLifts, type SavedStrengthLift } from '../../lib/strength/history';
import {
  LEVELS,
  LIFT_LABELS,
  buildStrengthLevelTable,
  type LevelId,
  type LiftId,
  type Sex as StrengthSex,
} from '../../lib/strength/standards';
import { STRENGTH_STANDARDS } from '../../lib/strength/standardsData';
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
type MatrixRange = Exclude<RmDisplayRange, 'high'>;

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

const RM_RANGE_OPTIONS: readonly { value: MatrixRange; label: string }[] = [
  { value: 'standard', label: '1〜12回' },
  { value: 'extended', label: '13〜20回（参考）' },
  { value: 'reference', label: '21〜30回（参考）' },
];

const REP_GUIDES = [
  { range: '1〜5回', label: '高重量・筋力寄り' },
  { range: '6〜12回', label: '筋力＋筋肥大で使いやすい範囲' },
  { range: '13〜30回', label: '筋肥大・筋持久力寄り' },
  { range: '30回超', label: '高回数・筋持久力寄り' },
] as const;

interface Props {
  defaultMode?: Mode;
}

function plateLabels(plates: NonNullable<ReturnType<typeof platesPerSide>>): string[] {
  return plates.flatMap((item) => Array.from({ length: item.perSide }, () => fmt(item.plateKg, 2)));
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
  const [matrixRange, setMatrixRange] = useState<MatrixRange>('standard');
  const [standardsLift, setStandardsLift] = useState<LiftId>('bench');
  const [standardsSex, setStandardsSex] = useState<StrengthSex>('M');
  const [savedBodyweight, setSavedBodyweight] = useState<number | null>(null);
  const [savedLifts, setSavedLifts] = useState<Partial<Record<LiftId, SavedStrengthLift>>>({});

  useEffect(() => {
    const data = readData();
    const profile = data.strengthProfile;
    if (profile) {
      setStandardsSex(profile.sex);
      setSavedBodyweight(profile.bodyweightKg);
    } else if (data.profile) {
      setStandardsSex(data.profile.sex === 'female' ? 'F' : 'M');
      setSavedBodyweight(data.profile.weightKg);
    }
    setSavedLifts(latestStrengthLifts(data.strengthHistory));
  }, []);

  useQueryDefaults((params) => {
    const weightParam = parseNumber(params.get('weight') ?? '');
    if (weightParam != null && weightParam >= MIN_WEIGHT && weightParam <= MAX_WEIGHT) setWeight(String(weightParam));
    const repsParam = parseNumber(params.get('reps') ?? '');
    if (repsParam != null && Number.isInteger(repsParam) && repsParam >= 1 && repsParam <= MAX_REPS) setReps(String(repsParam));
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
  const bodyweightError = isBodyweight && bodyweight !== '' && (bodyweightValue == null || bodyweightValue < MIN_BODYWEIGHT || bodyweightValue > MAX_BODYWEIGHT)
    ? `${MIN_BODYWEIGHT}〜${MAX_BODYWEIGHT}kg の範囲で入力してください。` : undefined;
  const addedError = isBodyweight && added !== '' && (addedValue == null || addedValue < 0) ? '0以上で入力してください。加重していなければ0のままで構いません。' : undefined;
  const weightError = !isBodyweight && weight !== '' && (rawWeightValue == null || rawWeightValue < MIN_WEIGHT || rawWeightValue > MAX_WEIGHT)
    ? `${MIN_WEIGHT}〜${MAX_WEIGHT}kg の範囲で入力してください。` : undefined;
  const repsError = reps !== '' && (repsValue == null || repsValue < 1 || repsValue > repsLimit || !Number.isInteger(repsValue))
    ? `1〜${repsLimit} の整数で入力してください。` : undefined;

  const load = useMemo(() => {
    if (!isBodyweight) return weightError ? null : rawWeightValue;
    if (bodyweightError || addedError || bodyweightValue == null || addedValue == null) return null;
    return bodyweightLoad(bodyweightValue, addedValue);
  }, [isBodyweight, weightError, rawWeightValue, bodyweightError, addedError, bodyweightValue, addedValue]);
  const oneRm = useMemo(() => {
    if (load == null || repsValue == null || repsError) return null;
    return mode === 'rpe' ? oneRmFromRpe(load, repsValue, rpeValue) : estimateOneRM(load, repsValue)?.average ?? null;
  }, [load, repsValue, repsError, mode, rpeValue]);
  const estimate = useMemo(() => mode === 'reps' && load != null && repsValue != null && !repsError ? estimateOneRM(load, repsValue) : null, [mode, load, repsValue, repsError]);
  const percent = useMemo(() => mode === 'rpe' && repsValue != null ? rpePercent(repsValue, rpeValue) : null, [mode, repsValue, rpeValue]);
  const repTable = useMemo(() => oneRm == null ? [] : repTableFromOneRM(oneRm), [oneRm]);
  const rmMatrix = useMemo(() => repTable.map((row) => ({
    weight: row.weight,
    estimates: repTable.map((target) => estimateOneRM(row.weight, target.reps)?.average ?? null),
  })), [repTable]);
  const nearestMatrixWeight = useMemo(() => {
    if (load == null || rmMatrix.length === 0) return null;
    return rmMatrix.reduce((closest, row) => Math.abs(row.weight - load) < Math.abs(closest - load) ? row.weight : closest, rmMatrix[0]!.weight);
  }, [load, rmMatrix]);
  const matrix = useMemo(() => mode === 'rpe' ? buildRpeMatrix(oneRm, TABLE_MAX_REPS) : [], [mode, oneRm]);
  const repList = Array.from({ length: TABLE_MAX_REPS }, (_, index) => index + 1);
  const workingWeight = useMemo(() => oneRm == null || isBodyweight ? null : roundToIncrement(oneRm * (Number(workPercent) / 100), 2.5), [oneRm, isBodyweight, workPercent]);
  const warmupSets = useMemo(() => workingWeight == null ? [] : buildWarmupSets(workingWeight, Number(barWeight), 2.5), [workingWeight, barWeight]);
  const plates = useMemo(() => workingWeight == null ? null : platesPerSide(workingWeight, Number(barWeight)), [workingWeight, barWeight]);
  const standardsRows = useMemo(() => buildStrengthLevelTable(STRENGTH_STANDARDS, standardsSex, standardsLift), [standardsSex, standardsLift]);
  const closestStandardWeight = useMemo(() => {
    if (savedBodyweight == null || standardsRows.length === 0) return null;
    return standardsRows.reduce((closest, row) => Math.abs(row.bodyweightKg - savedBodyweight) < Math.abs(closest - savedBodyweight) ? row.bodyweightKg : closest, standardsRows[0]!.bodyweightKg);
  }, [savedBodyweight, standardsRows]);
  const savedLevel = savedLifts[standardsLift]?.levelId;
  const plateSide = workingWeight == null ? null : (workingWeight - Number(barWeight)) / 2;

  function selectMainLift(lift: MainLift) {
    setMainLift(lift);
    if (lift !== 'other') setStandardsLift(lift);
  }

  return (
    <div className="tool">
      <Slip code="INPUT" title="今日のセット">
        <div className="tool__form">
          <Segmented label="種目" options={MAIN_LIFT_OPTIONS} value={mainLift} onChange={selectMainLift} />
          {isOther && <Segmented label="その他の種目" options={OTHER_LIFT_OPTIONS} value={otherLift} onChange={setOtherLift} />}
          {isBodyweight ? <>
            <div className="row row--2">
              <NumberField label="体重" unit="kg" value={bodyweight} onChange={setBodyweight} placeholder="70" error={bodyweightError} hint={`${MIN_BODYWEIGHT}〜${MAX_BODYWEIGHT}kg`} />
              <NumberField label="加重" unit="kg" value={added} onChange={setAdded} placeholder="0" error={addedError} hint="ベルトなどで足した重量" />
            </div>
            <NumberField label="レップ数" unit="回" value={reps} onChange={setReps} placeholder="8" inputMode="numeric" error={repsError} hint={`1〜${repsLimit}回`} />
            <p className="tool__note">{liftName}は<strong>体重＋加重</strong>を扱った重量として計算します。{load != null && <> 今回は <strong className="num">{fmt(load, 1)}kg</strong> を扱った計算です。</>}</p>
          </> : <div className="row row--2">
            <NumberField label="重量" unit="kg" value={weight} onChange={setWeight} placeholder="100" error={weightError} hint={`${MIN_WEIGHT}〜${MAX_WEIGHT}kg`} />
            <NumberField label="レップ数" unit="回" value={reps} onChange={setReps} placeholder="5" inputMode="numeric" error={repsError} hint={`1〜${repsLimit}回`} />
          </div>}
          <details className="tool__details" open={mode === 'rpe'}>
            <summary>RPEなど詳細設定</summary>
            <Segmented label="計算方法" options={MODE_OPTIONS} value={mode} onChange={setMode} />
            {mode === 'rpe' ? <SelectField label="そのセットのRPE" options={RPE_OPTIONS} value={rpe} onChange={setRpe} hint="セットを終えた直後に、あと何回できたかで選びます。" /> : <p className="tool__note">通常の1RM換算です。余力を残したセットならRPEを使うと参考情報を追加できます。</p>}
          </details>
        </div>
      </Slip>

      {oneRm == null ? <Waiting>{isBodyweight ? '体重・加重・レップ数を入力すると推定値が出ます。' : '重量とレップ数を入力すると推定値が出ます。'}</Waiting> : <>
        <Slip code="RESULT" title="推定1RM">
          <BigNumber label={`${liftName} 推定1RM`} value={fmt(oneRm, 1)} unit="kg" note={mode === 'rpe'
            ? percent != null ? `RPE ${rpe}での推定です。このセットは1RMの ${fmt(percent, 1)}% にあたります。` : undefined
            : estimate && estimate.spread > 0 ? `7式の平均による推定値です。式による差は ${fmt(estimate.spread, 1)}kg（${fmt(estimate.min, 1)}〜${fmt(estimate.max, 1)}kg）。` : '1レップの記録なので、その重量がそのまま1RMです。'} />
          {isBodyweight && bodyweightValue != null && <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>この値は体重を含んだ総重量です。加重ベルトに載せられる量に直すと<strong className="num"> {fmt(oneRm - bodyweightValue, 1)}kg </strong>です。</p>}
        </Slip>

        <Slip code="TABLE" title="レップ換算表">
          <div className="table-scroll"><table className="rows"><caption className="visually-hidden">推定1RMから求めた1〜12回の換算表</caption><thead><tr><th scope="col">レップ数</th><th scope="col">%1RM</th><th scope="col">推定重量</th></tr></thead><tbody>{repTable.map((row) => <tr key={row.reps} className={row.reps === repsValue ? 'is-row' : undefined}><th scope="row">{row.reps}回</th><td>{row.percent}%</td><td>{fmt(row.weight, 1)} kg</td></tr>)}</tbody></table></div>
          <p className="source-note" style={{ marginTop: 'var(--s3)' }}>推定値の換算表なので、ここでは2.5kg刻みに丸めません。実際に組む重量は次のワーキング重量で2.5kg刻みにします。</p>
        </Slip>

        <Slip code="RM MAP" title="重量 × 回数 RM換算表">
          <div className="rm-map__guides" aria-label="回数帯の目安">{REP_GUIDES.map((guide) => <div key={guide.range}><strong>{guide.range}</strong><span>{guide.label}</span></div>)}</div>
          <Segmented label="表示する回数" options={RM_RANGE_OPTIONS} value={matrixRange} onChange={setMatrixRange} />
          {matrixRange === 'standard' ? <>
            <p className="tool__note">縦の重量と横の回数を交差させると、そのセットからの推定1RMが分かります。入力に近い行・列を強調しています。</p>
            <div className="table-scroll rm-table" style={{ marginTop: 'var(--s3)' }}><table className="rows"><caption className="visually-hidden">重量と回数ごとの推定1RM換算表</caption><thead><tr><th scope="col">重量</th>{repTable.map((row) => <th scope="col" className={row.reps === repsValue ? 'is-input-column' : undefined} key={row.reps}>{row.reps}回</th>)}</tr></thead><tbody>{rmMatrix.map((row) => <tr key={row.weight} className={row.weight === nearestMatrixWeight ? 'is-near-input' : undefined}><th scope="row" className="num">{fmt(row.weight, 1)}kg</th>{row.estimates.map((value, index) => { const matrixReps = repTable[index]!.reps; const current = row.weight === nearestMatrixWeight && matrixReps === repsValue; return <td key={matrixReps} className={`${matrixReps === repsValue ? 'is-input-column' : ''}${current ? ' is-now' : ''}`.trim()}>{value == null ? '—' : `${fmt(value, 1)}kg`}</td>; })}</tr>)}</tbody></table></div>
            <p className="source-note" style={{ marginTop: 'var(--s3)' }}>各セルはBodymakers既存の7式から動的に計算した参考値です。実際にプレートを組む重量ではありません。</p>
          </> : <div className="rm-map__reference" role="note"><strong>{matrixRange === 'extended' ? '13〜20回は高回数の参考ゾーンです。' : '21〜30回は筋持久力寄りの参考ゾーンです。'}</strong><p>Bodymakersの既存7式は誤差を抑えるため<strong>1〜12回</strong>の推定に限定しています。この帯では具体的な1RM kgを正式な結果として出しません。30回を超える高回数セットからの1RM推定は誤差が大きく、筋力評価には向きません。</p><div>{Array.from({ length: matrixRange === 'extended' ? 8 : 10 }, (_, index) => { const value = matrixRange === 'extended' ? index + 13 : index + 21; return <span key={value}>{value}回</span>; })}</div></div>}
        </Slip>

        {!isOther && <Slip code="LEVEL" title="体重 × 挙上重量 Strength Level表">
          <div className="row row--2"><Segmented label="種目" options={(['bench', 'squat', 'deadlift'] as LiftId[]).map((lift) => ({ value: lift, label: LIFT_LABELS[lift] }))} value={standardsLift} onChange={setStandardsLift} /><Segmented label="区分" options={[{ value: 'M', label: '男性' }, { value: 'F', label: '女性' }]} value={standardsSex} onChange={setStandardsSex} /></div>
          <div className="table-scroll strength-level-table" style={{ marginTop: 'var(--s3)' }}><table className="rows"><caption className="visually-hidden">{LIFT_LABELS[standardsLift]}の体重別Strength Level表</caption><thead><tr><th scope="col">体重</th>{LEVELS.map((level) => <th scope="col" key={level.id}>{level.label}</th>)}</tr></thead><tbody>{standardsRows.map((row) => <tr key={row.bodyweightKg} className={row.bodyweightKg === closestStandardWeight ? 'is-near-input' : undefined}><th scope="row" className="num">{fmt(row.bodyweightKg, 0)}kg</th>{LEVELS.map((level) => <td key={level.id} className={row.bodyweightKg === closestStandardWeight && savedLevel === level.id ? 'is-now' : undefined}>{row.levels[level.id] == null ? '—' : `${fmt(row.levels[level.id]!, 1)}kg`}</td>)}</tr>)}</tbody></table></div>
          <p className="source-note" style={{ marginTop: 'var(--s3)' }}>保存済みの体重に近い行と、保存済みの現在レベルを強調しています。基準の母集団は一般のジム利用者ではなく、OpenPowerliftingの公式競技会出場者です。各列はその競技者集団で次のレベルに入る下限重量を示します。</p>
        </Slip>}

        {!isBodyweight && workingWeight != null && <Slip code="WORK SET" title="ワーキング重量・ウォームアップ">
          <div className="row"><SelectField label="ワーキング強度" value={workPercent} onChange={setWorkPercent} options={[60, 65, 70, 75, 80, 85, 90, 95].map((value) => ({ value: String(value), label: `${value}% 1RM` }))} /><SelectField label="バー重量" value={barWeight} onChange={setBarWeight} options={[{ value: '20', label: '20kg（標準）' }, { value: '15', label: '15kg' }, { value: '10', label: '10kg' }]} /></div>
          <section className="workset__summary"><span>今日は</span><strong className="num">{fmt(workingWeight, 1)}kg</strong><span>を組みます</span><div><span>合計: {fmt(workingWeight, 1)}kg</span><span>バー: {fmt(Number(barWeight), 1)}kg</span><span>左側: {fmt(plateSide ?? 0, 1)}kg</span><span>右側: {fmt(plateSide ?? 0, 1)}kg</span></div></section>
          {plates && <section className="plate-diagram" aria-label={`左右それぞれ ${fmt(plateSide ?? 0, 1)}kg のプレート構成`}><div>{plateLabels(plates).join(' | ') || 'プレートなし'}</div><strong>BAR {fmt(Number(barWeight), 1)}kg</strong><div>{[...plateLabels(plates)].reverse().join(' | ') || 'プレートなし'}</div></section>}
          {warmupSets.length > 0 && <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}><table className="rows"><caption className="visually-hidden">ワーキングセットまでのウォームアップ例</caption><thead><tr><th scope="col">段階</th><th scope="col">重量</th><th scope="col">回数</th></tr></thead><tbody>{warmupSets.map((set) => <tr key={`${set.weightKg}-${set.reps}`}><th scope="row">{set.label}</th><td className="num">{fmt(set.weightKg, 1)}kg</td><td className="num">{set.reps}回</td></tr>)}<tr className="is-row"><th scope="row">本セット</th><td className="num">{fmt(workingWeight, 1)}kg</td><td>目的に合わせる</td></tr></tbody></table></div>}
        </Slip>}

        {mode === 'rpe' && <Slip code="RPE" title="RPEごとの次セット重量"><p className="tool__note" style={{ marginBottom: 'var(--s3)' }}>RPEは追加の目安です。行がRPE、列がレップ数です。</p><div className="table-scroll"><table className="rows"><caption className="visually-hidden">RPEとレップ数ごとの目安重量</caption><thead><tr><th scope="col">RPE</th>{repList.map((value) => <th scope="col" key={value}>{value}回</th>)}</tr></thead><tbody>{matrix.map((row, rowIndex) => { const rowRpe = RPE_VALUES[rowIndex]; return <tr key={rowRpe} className={rowRpe === rpeValue ? 'is-row' : undefined}><th scope="row">{rowRpe}</th>{row.map((cell) => <td key={cell.reps} className={cell.rpe === rpeValue && cell.reps === repsValue ? 'is-now' : undefined}>{cell.weight == null ? '—' : fmt(cell.weight, 1)}</td>)}</tr>; })}</tbody></table></div></Slip>}

        {estimate && <details className="tool__details"><summary>1RMの計算方法について</summary><div className="table-scroll" style={{ marginTop: 'var(--s3)' }}><table className="rows"><caption className="visually-hidden">換算式ごとの推定1RM</caption><thead><tr><th scope="col">換算式</th><th scope="col">推定1RM</th></tr></thead><tbody>{estimate.results.map((result) => <tr key={result.name}><th scope="row">{result.name}</th><td>{fmt(result.value, 1)} kg</td></tr>)}</tbody></table></div></details>}
      </>}
    </div>
  );
}
