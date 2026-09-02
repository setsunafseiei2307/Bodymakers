import { useEffect, useMemo, useRef, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import { estimateOneRM } from '../../lib/onerm';
import { buildPersonalPlan } from '../../lib/diagnosis/plan';
import {
  DIAGNOSIS_STEP_TITLES,
  clearDiagnosisDraft,
  defaultDiagnosisInput,
  draftStepLabel,
  emptySetInputs,
  readDiagnosisDraft,
  writeDiagnosisDraft,
  type DiagnosisDraft,
  type StrengthInputMode,
  type StrengthSetInputs,
} from '../../lib/diagnosis/draft';
import type { GoalId, PersonalPlanInput } from '../../lib/diagnosis/types';
import { readData, savePersonalPlan, type SavedProfile } from '../../lib/storage';
import type { LiftId } from '../../lib/strength/standards';
import { url } from '../../lib/url';
import { NumberField, Segmented } from './ui';
import { useQueryDefaults } from './useQueryDefaults';

const LIFTS: { id: LiftId; label: string }[] = [
  { id: 'bench', label: 'ベンチプレス' },
  { id: 'squat', label: 'スクワット' },
  { id: 'deadlift', label: 'デッドリフト' },
];

const GOALS: { value: GoalId; icon: string; title: string; detail: string }[] = [
  { value: 'muscle', icon: '↗', title: '筋肉を増やしたい', detail: '体を大きくしたい' },
  { value: 'fat-loss', icon: '◒', title: '体脂肪を落としたい', detail: '引き締まった身体にしたい' },
  { value: 'recomp', icon: '◐', title: '筋肉を残して絞りたい', detail: '見た目を良くしたい' },
  { value: 'strength', icon: '▰', title: '筋力を伸ばしたい', detail: 'BIG3を強くしたい' },
  { value: 'health', icon: '◎', title: '健康的な身体を作りたい', detail: '運動・食事習慣を整えたい' },
];
const STEP_TITLES = DIAGNOSIS_STEP_TITLES;

type SetInput = StrengthSetInputs;

function defaultInput(profile: SavedProfile | null, strength: Partial<Record<LiftId, number>>): PersonalPlanInput {
  const base = defaultDiagnosisInput();
  return {
    ...base,
    body: {
      ...base.body,
      sex: profile?.sex ?? base.body.sex,
      age: profile?.age ?? base.body.age,
      heightCm: profile?.heightCm ?? base.body.heightCm,
      weightKg: profile?.weightKg ?? base.body.weightKg,
    },
    strength,
  };
}

function ChoiceCards<T extends string>({
  label, options, value, onChange, columns = 2,
}: {
  label: string;
  options: readonly { value: T; label: string; detail?: string; icon?: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <fieldset className="journey-choice-group">
      <legend>{label}</legend>
      <div className={`journey-choices journey-choices--${columns}`}>
        {options.map((option) => (
          <button key={option.value} type="button" className={`journey-choice${value === option.value ? ' is-selected' : ''}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.icon && <span className="journey-choice__icon" aria-hidden="true">{option.icon}</span>}
            <span className="journey-choice__label">{option.label}</span>
            {option.detail && <span className="journey-choice__detail">{option.detail}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AxisBar({ label, score, reasons }: { label: string; score: number; reasons: string[] }) {
  return <div className="journey-axis"><span>{label}</span><strong className="num">{score}</strong><div><span style={{ width: `${score}%` }} /></div><details><summary>理由を見る</summary>{reasons.map((reason) => <p key={reason}>{reason}</p>)}</details></div>;
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [input, setInputState] = useState<PersonalPlanInput>(() => defaultInput(null, {}));
  const [strengthMode, setStrengthModeState] = useState<StrengthInputMode>('oneRm');
  const [setInputs, setSetInputsState] = useState<SetInput>(() => emptySetInputs());
  const [saveMessage, setSaveMessage] = useState('');
  const [ready, setReady] = useState(false);
  /** 前回の途中入力。答えるかどうかを本人に選んでもらうまで、下書きは触らない。 */
  const [pendingDraft, setPendingDraft] = useState<DiagnosisDraft | null>(null);
  const journeyRef = useRef<HTMLElement>(null);
  /**
   * 本人が1つでも答えたか。
   * 初期表示やURLパラメータの反映だけで下書きを作ると、
   * 何もしていない人に「前回の続きがあります」と出てしまう。
   */
  const touchedRef = useRef(false);

  /** 本人の操作による更新。ここを通ったものだけ下書きに残す。 */
  const setInput: typeof setInputState = (value) => {
    touchedRef.current = true;
    setInputState(value);
  };
  const setStrengthMode: typeof setStrengthModeState = (value) => {
    touchedRef.current = true;
    setStrengthModeState(value);
  };
  const setSetInputs: typeof setSetInputsState = (value) => {
    touchedRef.current = true;
    setSetInputsState(value);
  };

  useEffect(() => {
    const data = readData();
    if (data.personalPlan) {
      setInputState(data.personalPlan.input);
    } else {
      const lifts: Partial<Record<LiftId, number>> = {};
      for (const lift of LIFTS) {
        const saved = data.strengthProfile?.lifts[lift.id];
        if (saved) lifts[lift.id] = saved.oneRmKg;
      }
      setInputState(defaultInput(data.profile, lifts));
    }
    setPendingDraft(readDiagnosisDraft());
    setReady(true);
  }, []);

  useQueryDefaults((params) => {
    const weight = parseNumber(params.get('weight') ?? '');
    const target = parseNumber(params.get('target') ?? '');
    setInputState((current) => ({
      ...current,
      body: weight != null && weight >= 30 && weight <= 300 ? { ...current.body, weightKg: weight } : current.body,
      targets: target != null && target >= 30 && target <= 300 ? { ...current.targets, weightKg: target } : current.targets,
    }));
  });

  /** 答えるたびに端末内へ下書きを残す。正式なPlanは診断を終えたときだけ保存する。 */
  useEffect(() => {
    if (!ready || pendingDraft != null || !touchedRef.current) return;
    if (step >= STEP_TITLES.length) return;
    writeDiagnosisDraft({ step, input, strengthMode, setInputs });
  }, [ready, pendingDraft, step, input, strengthMode, setInputs]);

  function resumeDraft() {
    if (pendingDraft == null) return;
    setInputState(pendingDraft.input);
    setStrengthModeState(pendingDraft.strengthMode);
    setSetInputsState(pendingDraft.setInputs);
    setStep(pendingDraft.step);
    touchedRef.current = true;
    setPendingDraft(null);
  }

  function discardDraft() {
    clearDiagnosisDraft();
    touchedRef.current = false;
    setPendingDraft(null);
    setStep(0);
  }

  const result = useMemo(() => buildPersonalPlan(input), [input]);
  const bodyReady = input.body.age >= 13 && input.body.age <= 120 && input.body.heightCm >= 100 && input.body.heightCm <= 250 && input.body.weightKg >= 30 && input.body.weightKg <= 300;

  useEffect(() => {
    if (!ready || pendingDraft != null || step === 0) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    journeyRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [ready, pendingDraft, step]);

  function updateBody(key: keyof PersonalPlanInput['body'], raw: string) {
    const value = raw === '' ? 0 : parseNumber(raw) ?? 0;
    setInput((current) => ({ ...current, body: { ...current.body, [key]: value } }));
  }
  function updateTargetWeight(raw: string) {
    const value = raw === '' ? null : parseNumber(raw);
    setInput((current) => ({ ...current, targets: { ...current.targets, weightKg: value ?? null } }));
  }
  function updateLift(kind: 'strength' | 'target', lift: LiftId, raw: string) {
    const value = raw === '' ? undefined : parseNumber(raw);
    setInput((current) => {
      const base = kind === 'strength' ? current.strength : current.targets.lifts;
      const next = { ...base };
      if (value == null || value <= 0) delete next[lift]; else next[lift] = value;
      return kind === 'strength' ? { ...current, strength: next } : { ...current, targets: { ...current.targets, lifts: next } };
    });
  }
  function applySetEstimates() {
    if (strengthMode !== 'set') return;
    setInput((current) => {
      const next = { ...current.strength };
      for (const lift of LIFTS) {
        const weight = parseNumber(setInputs[lift.id].weight);
        const reps = parseNumber(setInputs[lift.id].reps);
        const estimate = weight != null && reps != null ? estimateOneRM(weight, reps)?.average : null;
        if (estimate != null) next[lift.id] = Math.round(estimate * 10) / 10;
      }
      return { ...current, strength: next };
    });
  }
  function next() {
    if (step === 1 && !bodyReady) return;
    if (step === 3) applySetEstimates();
    setStep((current) => Math.min(current + 1, STEP_TITLES.length));
  }
  function saveAndOpenPlan() {
    const saved = savePersonalPlan({ version: 1, createdAt: new Date().toISOString(), input });
    if (!saved) {
      setSaveMessage('保存できませんでした。ブラウザの保存設定を確認してください。');
      return;
    }
    // 正式なPlanになったので、途中保存はもう要らない。
    clearDiagnosisDraft();
    window.location.assign(url('/plan'));
  }

  if (!ready) return <div className="journey journey--loading" aria-hidden="true" />;

  if (pendingDraft != null) {
    return (
      <section ref={journeyRef} className="journey journey--resume" aria-live="polite">
        <p className="journey-kicker">RESUME</p>
        <h2>前回の続きがあります</h2>
        <p className="journey-lead">
          この端末に、途中まで答えた診断が残っています。続きから再開すると、入力し直さずに終わりまで進められます。
        </p>
        <div className="journey-resume__meta">
          <span>前回の位置</span>
          <strong>{draftStepLabel(pendingDraft)}</strong>
        </div>
        <button type="button" className="button button--block button--lg" onClick={resumeDraft}>続きから再開する</button>
        <button type="button" className="button button--ghost button--block" onClick={discardDraft}>最初からやり直す</button>
        <p className="journey-privacy">途中の入力もこの端末にだけ残ります。サーバーへの送信はありません。</p>
      </section>
    );
  }

  if (step === STEP_TITLES.length) {
    return (
      <section ref={journeyRef} className="journey journey--result" aria-live="polite">
        <div className="journey-progress"><span>RESULT</span><strong>診断結果</strong><div><span style={{ width: '100%' }} /></div></div>
        <p className="journey-kicker">あなたのBodymakers Plan</p>
        <h2>現在から、12週間後へ。</h2>
        <p className="journey-lead">点数は健康や人としての優劣ではなく、選んだ目標に対して今どこを整えると進めやすいかの目安です。</p>
        <div className="journey-result-map">
          <div><span>現在</span><strong className="num">{fmt(input.body.weightKg, 1)}kg</strong></div>
          <span aria-hidden="true">→</span>
          <div><span>12週間後の目標</span><strong className="num">{input.targets.weightKg == null ? '設定なし' : `${fmt(input.targets.weightKg, 1)}kg`}</strong></div>
        </div>
        <section className="journey-panel"><h2>今の5つの軸</h2>{result.diagnosis.axes.map((axis) => <AxisBar key={axis.id} label={axis.label} score={axis.score} reasons={axis.reasons} />)}</section>
        <section className="journey-panel"><h2>最初に整えるTOP 3</h2><ol className="journey-priorities">{result.diagnosis.priorities.map((item, index) => <li key={item.id}><span>{index + 1}</span><div><strong>{item.title}</strong><p>{item.action}</p><details><summary>なぜ？</summary><p>{item.why}</p></details></div></li>)}</ol></section>
        {result.diagnosis.gaps.length > 0 && <section className="journey-panel"><h2>ゴールとの差</h2><div className="journey-gaps">{result.diagnosis.gaps.map((gap) => <div key={gap.id}><span>{gap.label}</span><strong>{gap.current} → {gap.target}</strong><small>{gap.difference}</small></div>)}</div></section>}
        {input.lifestyle.painOrInjury && <p className="note note--warn"><span className="note__title">痛みがある場合</span>無理に負荷を上げないでください。この診断は医療判断を行いません。</p>}
        <button type="button" className="button button--block button--lg" onClick={saveAndOpenPlan}>このPlanを保存して12週間を見る</button>
        <p className="next"><a href={url('/tools/one-rep-max')}>1RMを詳しく計算する →</a><a href={url('/strength-standards')}>競技リフター基準で診断する →</a><a href={url('/tools/foods')}>食品を追加する →</a><a href={url('/tools/today')}>今日の記録を見る →</a></p>
        {saveMessage && <p className="tool__status" role="status">{saveMessage}</p>}
        <button type="button" className="journey-back-link" onClick={() => setStep(STEP_TITLES.length - 1)}>← 診断を見直す</button>
      </section>
    );
  }

  return (
    <section ref={journeyRef} className="journey">
      <div className="journey-progress" aria-label={`診断 ${step + 1} / ${STEP_TITLES.length}`}><span>{step + 1} / {STEP_TITLES.length}</span><strong>{STEP_TITLES[step]}</strong><div><span style={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }} /></div></div>
      <div className="journey-step" key={step}>
        {step === 0 && <>
          <p className="journey-kicker">GOAL</p><h2>なりたい身体は？</h2><p className="journey-lead">いちばん近いものを1つ選んでください。あとから変えられます。</p>
          <ChoiceCards label="目的" value={input.goal} onChange={(goal) => setInput((current) => ({ ...current, goal }))} options={GOALS.map((goal) => ({ value: goal.value, label: goal.title, detail: goal.detail, icon: goal.icon }))} columns={1} />
          {(input.goal === 'muscle' || input.goal === 'fat-loss' || input.goal === 'recomp') && <NumberField label="目標体重（任意）" unit="kg" value={input.targets.weightKg == null ? '' : String(input.targets.weightKg)} onChange={updateTargetWeight} placeholder="70" hint="今は決めなくても大丈夫です。" />}
          {input.goal === 'strength' && <div className="journey-lift-inputs"><p>目標BIG3（任意）</p>{LIFTS.map((lift) => <NumberField key={lift.id} label={lift.label} unit="kg" value={input.targets.lifts[lift.id] == null ? '' : String(input.targets.lifts[lift.id])} onChange={(value) => updateLift('target', lift.id, value)} placeholder="100" />)}</div>}
        </>}
        {step === 1 && <>
          <p className="journey-kicker">BODY</p><h2>現在の身体</h2><p className="journey-lead">以前に保存したプロフィールがあれば、最初から入っています。</p>
          <Segmented label="性別" value={input.body.sex} onChange={(sex) => setInput((current) => ({ ...current, body: { ...current.body, sex } }))} options={[{ value: 'male', label: '男性' }, { value: 'female', label: '女性' }]} />
          <div className="row row--2"><NumberField label="年齢" unit="歳" value={input.body.age ? String(input.body.age) : ''} onChange={(value) => updateBody('age', value)} placeholder="30" inputMode="numeric" /><NumberField label="身長" unit="cm" value={input.body.heightCm ? String(input.body.heightCm) : ''} onChange={(value) => updateBody('heightCm', value)} placeholder="170" /></div>
          <div className="row row--2"><NumberField label="体重" unit="kg" value={input.body.weightKg ? String(input.body.weightKg) : ''} onChange={(value) => updateBody('weightKg', value)} placeholder="70" /><NumberField label="体脂肪率（任意）" unit="%" value={input.body.bodyFatPercent == null ? '' : String(input.body.bodyFatPercent)} onChange={(value) => setInput((current) => ({ ...current, body: { ...current.body, bodyFatPercent: value === '' ? null : parseNumber(value) } }))} placeholder="20" /></div>
          {!bodyReady && <p className="field__error">年齢・身長・体重を確認してください。</p>}
        </>}
        {step === 2 && <>
          <p className="journey-kicker">TRAINING</p><h2>筋トレの状況</h2><p className="journey-lead">今の生活で続けられる条件を選んでください。</p>
          <ChoiceCards label="トレーニング歴" value={input.training.experience} onChange={(experience) => setInput((current) => ({ ...current, training: { ...current.training, experience } }))} options={[{ value: 'none', label: '未経験' }, { value: 'under3', label: '3ヶ月未満' }, { value: 'threeToSix', label: '3〜6ヶ月' }, { value: 'sixToTwelve', label: '6〜12ヶ月' }, { value: 'oneToThree', label: '1〜3年' }, { value: 'overThree', label: '3年以上' }]} />
          <ChoiceCards label="週何回できる？" value={String(input.training.daysPerWeek)} onChange={(value) => setInput((current) => ({ ...current, training: { ...current.training, daysPerWeek: Number(value) as PersonalPlanInput['training']['daysPerWeek'] } }))} options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: value === 5 ? '5+' : String(value) }))} />
          <ChoiceCards label="1回の時間" value={String(input.training.sessionMinutes)} onChange={(value) => setInput((current) => ({ ...current, training: { ...current.training, sessionMinutes: Number(value) as PersonalPlanInput['training']['sessionMinutes'] } }))} options={[30, 45, 60, 90].map((value) => ({ value: String(value), label: value === 90 ? '90分+' : `${value}分` }))} />
          <ChoiceCards label="場所" value={input.training.location} onChange={(location) => setInput((current) => ({ ...current, training: { ...current.training, location } }))} options={[{ value: 'home', label: '自宅' }, { value: 'gym', label: 'ジム' }, { value: 'both', label: '両方' }]} />
          <ChoiceCards label="主目的" value={input.training.focus} onChange={(focus) => setInput((current) => ({ ...current, training: { ...current.training, focus } }))} options={[{ value: 'hypertrophy', label: '筋肥大' }, { value: 'strength', label: '筋力' }, { value: 'both', label: '両方' }, { value: 'health', label: '健康' }]} />
        </>}
        {step === 3 && <>
          <p className="journey-kicker">STRENGTH</p><h2>現在の筋力</h2><p className="journey-lead">1RMを知っている種目だけで大丈夫です。入力がない項目は推測しません。</p>
          <Segmented label="入力方法" value={strengthMode} onChange={setStrengthMode} options={[{ value: 'oneRm', label: '1RMを知っている' }, { value: 'set', label: '重量×回数から計算' }]} />
          <div className="journey-lift-inputs">{LIFTS.map((lift) => strengthMode === 'oneRm' ? <NumberField key={lift.id} label={`${lift.label} 推定1RM`} unit="kg" value={input.strength[lift.id] == null ? '' : String(input.strength[lift.id])} onChange={(value) => updateLift('strength', lift.id, value)} placeholder="100" /> : <div key={lift.id} className="journey-set-card"><strong>{lift.label}</strong><div className="row row--2"><NumberField label="重量" unit="kg" value={setInputs[lift.id].weight} onChange={(value) => setSetInputs((current) => ({ ...current, [lift.id]: { ...current[lift.id], weight: value } }))} placeholder="80" /><NumberField label="回数" unit="回" value={setInputs[lift.id].reps} onChange={(value) => setSetInputs((current) => ({ ...current, [lift.id]: { ...current[lift.id], reps: value } }))} placeholder="5" inputMode="numeric" /></div></div>)}</div>
          {/* 診断の途中に外部ツールへの導線を置くと、そこで離脱して入力が中断する。
              詳しい計算は診断結果の画面から案内する。 */}
          <p className="journey-hint">1RMが分からない種目は空のままで大丈夫です。詳しい計算は診断結果から開けます。</p>
        </>}
        {step === 4 && <>
          <p className="journey-kicker">FOOD</p><h2>ふだんの食生活</h2><p className="journey-lead">正確なカロリーではなく、普段の傾向を選んでください。</p>
          <ChoiceCards label="1日の食事回数" value={String(input.food.mealsPerDay)} onChange={(value) => setInput((current) => ({ ...current, food: { ...current.food, mealsPerDay: Number(value) as PersonalPlanInput['food']['mealsPerDay'] } }))} options={[{ value: '1', label: '1〜2回' }, { value: '3', label: '3回' }, { value: '4', label: '4回+' }]} />
          <ChoiceCards label="朝食" value={input.food.breakfast} onChange={(breakfast) => setInput((current) => ({ ...current, food: { ...current.food, breakfast } }))} options={[{ value: 'rarely', label: 'ほぼ食べない' }, { value: 'sometimes', label: '時々' }, { value: 'daily', label: '毎日' }]} />
          <ChoiceCards label="たんぱく質" value={input.food.protein} onChange={(protein) => setInput((current) => ({ ...current, food: { ...current.food, protein } }))} options={[{ value: 'everyMeal', label: '毎食意識している' }, { value: 'oneToTwo', label: '1日1〜2食' }, { value: 'rarely', label: 'ほとんど意識していない' }, { value: 'unknown', label: '分からない' }]} />
          <ChoiceCards label="野菜・果物" value={input.food.vegetables} onChange={(vegetables) => setInput((current) => ({ ...current, food: { ...current.food, vegetables } }))} options={[{ value: 'high', label: 'かなり食べる' }, { value: 'normal', label: '普通' }, { value: 'low', label: '少ない' }]} />
          <ChoiceCards label="外食・コンビニ" value={input.food.outsideMeals} onChange={(outsideMeals) => setInput((current) => ({ ...current, food: { ...current.food, outsideMeals } }))} options={[{ value: 'daily', label: 'ほぼ毎日' }, { value: 'threeToFour', label: '週3〜4回' }, { value: 'oneToTwo', label: '週1〜2回' }, { value: 'rarely', label: 'ほぼ無し' }]} />
          <ChoiceCards label="食事量" value={input.food.amount} onChange={(amount) => setInput((current) => ({ ...current, food: { ...current.food, amount } }))} options={[{ value: 'veryLow', label: 'かなり少ない' }, { value: 'low', label: '少なめ' }, { value: 'normal', label: '普通' }, { value: 'high', label: '多め' }, { value: 'veryHigh', label: 'かなり多い' }, { value: 'unknown', label: '分からない' }]} />
        </>}
        {step === 5 && <>
          <p className="journey-kicker">LIFESTYLE</p><h2>生活習慣</h2><p className="journey-lead">できるだけ正直に。診断は医療判断ではなく、Planの負荷を調整するためのものです。</p>
          <ChoiceCards label="睡眠時間" value={input.lifestyle.sleepDuration} onChange={(sleepDuration) => setInput((current) => ({ ...current, lifestyle: { ...current.lifestyle, sleepDuration } }))} options={[{ value: 'under5', label: '5時間未満' }, { value: 'fiveToSix', label: '5〜6時間' }, { value: 'sixToSeven', label: '6〜7時間' }, { value: 'sevenToEight', label: '7〜8時間' }, { value: 'overEight', label: '8時間+' }]} />
          <ChoiceCards label="睡眠の質" value={input.lifestyle.sleepQuality} onChange={(sleepQuality) => setInput((current) => ({ ...current, lifestyle: { ...current.lifestyle, sleepQuality } }))} options={[{ value: 'good', label: '良い' }, { value: 'normal', label: '普通' }, { value: 'poor', label: '悪い' }]} />
          <ChoiceCards label="日常活動" value={input.lifestyle.dailyActivity} onChange={(dailyActivity) => setInput((current) => ({ ...current, lifestyle: { ...current.lifestyle, dailyActivity } }))} options={[{ value: 'desk', label: 'ほぼ座り仕事' }, { value: 'someWalk', label: '少し歩く' }, { value: 'walk', label: 'よく歩く' }, { value: 'active', label: 'かなり動く' }]} />
          <ChoiceCards label="飲酒" value={input.lifestyle.alcohol} onChange={(alcohol) => setInput((current) => ({ ...current, lifestyle: { ...current.lifestyle, alcohol } }))} options={[{ value: 'none', label: '飲まない' }, { value: 'oneToTwo', label: '週1〜2' }, { value: 'threeToFour', label: '週3〜4' }, { value: 'daily', label: 'ほぼ毎日' }]} />
          <ChoiceCards label="喫煙" value={input.lifestyle.smoking ? 'yes' : 'no'} onChange={(value) => setInput((current) => ({ ...current, lifestyle: { ...current.lifestyle, smoking: value === 'yes' } }))} options={[{ value: 'no', label: '吸わない' }, { value: 'yes', label: '吸う' }]} />
          <ChoiceCards label="ストレス" value={input.lifestyle.stress} onChange={(stress) => setInput((current) => ({ ...current, lifestyle: { ...current.lifestyle, stress } }))} options={[{ value: 'low', label: '低い' }, { value: 'normal', label: '普通' }, { value: 'high', label: '高い' }]} />
          <ChoiceCards label="痛み・怪我" value={input.lifestyle.painOrInjury ? 'yes' : 'no'} onChange={(value) => setInput((current) => ({ ...current, lifestyle: { ...current.lifestyle, painOrInjury: value === 'yes' } }))} options={[{ value: 'no', label: 'なし' }, { value: 'yes', label: 'あり' }]} />
        </>}
      </div>
      <div className="journey-actions">
        {step > 0 && <button type="button" className="button button--ghost" onClick={() => setStep((current) => current - 1)}>← 戻る</button>}
        <button type="button" className="button button--lg" onClick={next}>{step === STEP_TITLES.length - 1 ? '診断結果を見る' : '次へ →'}</button>
      </div>
      <p className="journey-privacy">登録不要・途中の入力はこの端末にだけ残ります。サーバーへの送信はありません。</p>
    </section>
  );
}
