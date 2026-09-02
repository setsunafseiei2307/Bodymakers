/**
 * 身体づくり診断。
 *
 * 1画面に1問だけ出す。選択式は選んだら自分で次へ送るので、
 * 「フォームを埋める」というより「答えていくうちに輪郭が出てくる」形にしている。
 *
 * 質問の中身と順番と出し分けは src/lib/diagnosis/questions.ts に置いた。
 * ここは、その表を描いて、位置を進めて、途中経過を端末内に残すだけにしている。
 *
 * 途中で閉じても、答えた内容は bodymakers:diagnosis:draft:v1 に残る。
 * 正式なPlanになるのは、最後まで進んで保存したときだけ。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import { estimateOneRM } from '../../lib/onerm';
import { buildPersonalPlan } from '../../lib/diagnosis/plan';
import {
  clearDiagnosisDraft,
  defaultDiagnosisInput,
  draftQuestionId,
  draftStepLabel,
  emptySetInputs,
  readDiagnosisDraft,
  writeDiagnosisDraft,
  type DiagnosisDraft,
  type StrengthInputMode,
  type StrengthSetInputs,
} from '../../lib/diagnosis/draft';
import {
  DIAGNOSIS_QUESTIONS,
  LIFT_IDS,
  LIFT_LABELS,
  RESULT_STEP,
  autoAdvances,
  interstitialAfter,
  nextQuestionId,
  previousQuestionId,
  questionProgress,
  resolveQuestionId,
  visibleQuestions,
  type ChoiceQuestion,
  type Interstitial,
  type LiftsQuestion,
  type NumberQuestion,
  type Question,
} from '../../lib/diagnosis/questions';
import type { PersonalPlanInput } from '../../lib/diagnosis/types';
import { readData, savePersonalPlan, type SavedProfile } from '../../lib/storage';
import type { LiftId } from '../../lib/strength/standards';
import { url } from '../../lib/url';
import { NumberField, Segmented } from './ui';
import { useQueryDefaults } from './useQueryDefaults';

/** 選んでから次の質問へ移るまでの間。選んだ手応えが見える程度に短く。 */
const AUTO_ADVANCE_MS = 260;

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

function AxisBar({ label, score, reasons }: { label: string; score: number; reasons: string[] }) {
  return <div className="journey-axis"><span>{label}</span><strong className="num">{score}</strong><div><span style={{ width: `${score}%` }} /></div><details><summary>理由を見る</summary>{reasons.map((reason) => <p key={reason}>{reason}</p>)}</details></div>;
}

export default function Onboarding() {
  const [input, setInputState] = useState<PersonalPlanInput>(() => defaultInput(null, {}));
  const [questionId, setQuestionIdState] = useState<string>(() => DIAGNOSIS_QUESTIONS[0]!.id);
  const [interstitial, setInterstitial] = useState<Interstitial | null>(null);
  const [strengthMode, setStrengthModeState] = useState<StrengthInputMode>('oneRm');
  const [setInputs, setSetInputsState] = useState<StrengthSetInputs>(() => emptySetInputs());
  const [saveMessage, setSaveMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [ready, setReady] = useState(false);
  /** 前回の途中入力。どうするか選んでもらうまで、下書きには触らない。 */
  const [pendingDraft, setPendingDraft] = useState<DiagnosisDraft | null>(null);

  const journeyRef = useRef<HTMLElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 本人が1つでも答えたか。初期表示だけで下書きを作らないための印。 */
  const touchedRef = useRef(false);
  /** 端末の戻るボタン用に積んだ履歴の数。 */
  const pushedRef = useRef(0);

  const setInput: typeof setInputState = (value) => {
    touchedRef.current = true;
    setInputState(value);
  };

  function clearAdvanceTimer() {
    if (advanceTimer.current != null) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }

  useEffect(() => clearAdvanceTimer, []);

  useEffect(() => {
    const data = readData();
    if (data.personalPlan) {
      setInputState(data.personalPlan.input);
    } else {
      const lifts: Partial<Record<LiftId, number>> = {};
      for (const lift of LIFT_IDS) {
        const saved = data.strengthProfile?.lifts[lift];
        if (saved) lifts[lift] = saved.oneRmKg;
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

  /** 答えるたびに端末内へ下書きを残す。正式なPlanは最後に保存したときだけ。 */
  useEffect(() => {
    if (!ready || pendingDraft != null || !touchedRef.current) return;
    if (questionId === RESULT_STEP) return;
    writeDiagnosisDraft({ step: 0, questionId, input, strengthMode, setInputs });
  }, [ready, pendingDraft, questionId, input, strengthMode, setInputs]);

  const questions = useMemo(() => visibleQuestions(input), [input]);
  const progress = useMemo(() => questionProgress(input, questionId), [input, questionId]);
  const question = useMemo<Question | null>(
    () => questions.find((item) => item.id === questionId) ?? null,
    [questions, questionId],
  );
  const result = useMemo(() => buildPersonalPlan(input), [input]);

  /** 画面が変わったら、質問の先頭が見えるところまで戻す。 */
  useEffect(() => {
    if (!ready || pendingDraft != null) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    journeyRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [ready, pendingDraft, questionId, interstitial]);

  const stepBack = useCallback(() => {
    clearAdvanceTimer();
    setShowError(false);
    setInterstitial(null);
    setQuestionIdState((current) => previousQuestionId(input, current) ?? current);
  }, [input]);

  /**
   * 端末の戻るボタンで前の質問に戻れるようにする。
   * answers は下書きに残っているので、ここで失われることはない。
   */
  useEffect(() => {
    if (!ready || pendingDraft != null || typeof window === 'undefined') return;
    function onPopState() {
      pushedRef.current = Math.max(0, pushedRef.current - 1);
      stepBack();
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [ready, pendingDraft, stepBack]);

  function goToQuestion(next: string) {
    if (typeof window !== 'undefined' && next !== questionId) {
      try {
        window.history.pushState({ bodymakers: 'diagnosis' }, '');
        pushedRef.current += 1;
      } catch {
        // 履歴を触れない環境でも、診断そのものは進められる。
      }
    }
    setQuestionIdState(next);
  }

  function goBack() {
    if (pushedRef.current > 0 && typeof window !== 'undefined') {
      window.history.back();
      return;
    }
    stepBack();
  }

  /** 答え終わった質問から次へ。区切りでは短い声かけを挟む。 */
  function advanceFrom(fromId: string, nextInput: PersonalPlanInput) {
    clearAdvanceTimer();
    setShowError(false);
    const feedback = interstitialAfter(nextInput, fromId);
    goToQuestion(nextQuestionId(nextInput, fromId));
    setInterstitial(feedback);
  }

  function chooseOption(target: ChoiceQuestion, value: string) {
    clearAdvanceTimer();
    const nextInput = target.set(input, value);
    setInput(nextInput);
    if (!autoAdvances(target)) return;
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      advanceFrom(target.id, nextInput);
    }, AUTO_ADVANCE_MS);
  }

  /** 重量×回数から1RMを見積もる。入力のない種目はそのまま。 */
  function withSetEstimates(current: PersonalPlanInput): PersonalPlanInput {
    if (strengthMode !== 'set') return current;
    const next = { ...current.strength };
    for (const lift of LIFT_IDS) {
      const weight = parseNumber(setInputs[lift].weight);
      const reps = parseNumber(setInputs[lift].reps);
      const estimate = weight != null && reps != null ? estimateOneRM(weight, reps)?.average : null;
      if (estimate != null) next[lift] = Math.round(estimate * 10) / 10;
    }
    return { ...current, strength: next };
  }

  function submitCurrent() {
    if (question == null) return;
    if (question.kind === 'number' && question.ready != null && !question.ready(input)) {
      setShowError(true);
      return;
    }
    if (question.kind === 'lifts' && question.target === 'strength') {
      const nextInput = withSetEstimates(input);
      setInput(nextInput);
      advanceFrom(question.id, nextInput);
      return;
    }
    advanceFrom(question.id, input);
  }

  function updateLift(target: 'strength' | 'targets', lift: LiftId, raw: string) {
    const value = raw === '' ? undefined : parseNumber(raw);
    setInput((current) => {
      const base = target === 'strength' ? current.strength : current.targets.lifts;
      const next = { ...base };
      if (value == null || value <= 0) delete next[lift]; else next[lift] = value;
      return target === 'strength' ? { ...current, strength: next } : { ...current, targets: { ...current.targets, lifts: next } };
    });
  }

  function resumeDraft() {
    if (pendingDraft == null) return;
    setInputState(pendingDraft.input);
    setStrengthModeState(pendingDraft.strengthMode);
    setSetInputsState(pendingDraft.setInputs);
    setQuestionIdState(draftQuestionId(pendingDraft));
    touchedRef.current = true;
    setPendingDraft(null);
  }

  function discardDraft() {
    clearDiagnosisDraft();
    touchedRef.current = false;
    setPendingDraft(null);
    setQuestionIdState(resolveQuestionId(input, null));
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

  if (questionId === RESULT_STEP) {
    const targetWeightText = input.targets.weightKg == null ? '設定なし' : `${fmt(input.targets.weightKg, 1)}kg`;
    const nutrition = result.nutrition;
    return (
      <section ref={journeyRef} className="journey journey--result quiz-appear" aria-live="polite">
        <div className="quiz-progress quiz-progress--done">
          <span className="quiz-progress__count">COMPLETE</span>
          <div className="quiz-progress__bar"><span style={{ width: '100%' }} /></div>
        </div>
        <p className="journey-kicker">YOUR RESULT</p>
        <h2>いまの位置と、12週間後。</h2>
        <p className="journey-lead">点数は優劣ではなく、選んだ目標に対して今どこを整えると進みやすいかの目安です。健康状態の判断はしません。</p>

        <div className="journey-result-map">
          <div><span>現在</span><strong className="num">{fmt(input.body.weightKg, 1)}kg</strong></div>
          <span aria-hidden="true">→</span>
          <div><span>12週間後の目標</span><strong className="num">{targetWeightText}</strong></div>
        </div>

        <section className="quiz-result-cards">
          <article className="quiz-result-card quiz-result-card--training">
            <span>TRAINING</span>
            <strong>{input.training.daysPerWeek}日 / 週・{input.training.sessionMinutes}分</strong>
            <p>{result.workouts.length > 0 ? result.workouts.map((day) => day.label).join('・') : '続けやすい頻度から組み立てます。'}</p>
          </article>
          <article className="quiz-result-card quiz-result-card--nutrition">
            <span>NUTRITION</span>
            {nutrition
              ? <><strong className="num">{fmt(nutrition.calories, 0)} kcal / 日</strong><p className="num">P {fmt(nutrition.protein, 0)}g・F {fmt(nutrition.fat, 0)}g・C {fmt(nutrition.carbs, 0)}g</p></>
              : <><strong>目安をこれから作ります</strong><p>身体の入力がそろうと、1日の目安を出せます。</p></>}
          </article>
          <article className="quiz-result-card quiz-result-card--direction">
            <span>DIRECTION</span>
            <strong>{result.phases[0]?.title ?? '土台づくりから'}</strong>
            <p>{result.phases[0]?.detail ?? 'まずは続く形を作ります。'}</p>
          </article>
        </section>

        <section className="journey-panel"><h2>今の5つの軸</h2>{result.diagnosis.axes.map((axis) => <AxisBar key={axis.id} label={axis.label} score={axis.score} reasons={axis.reasons} />)}</section>
        <section className="journey-panel"><h2>最初に整えるTOP 3</h2><ol className="journey-priorities">{result.diagnosis.priorities.map((item, index) => <li key={item.id}><span>{index + 1}</span><div><strong>{item.title}</strong><p>{item.action}</p><details><summary>なぜ？</summary><p>{item.why}</p></details></div></li>)}</ol></section>
        {result.diagnosis.gaps.length > 0 && <section className="journey-panel"><h2>ゴールとの差</h2><div className="journey-gaps">{result.diagnosis.gaps.map((gap) => <div key={gap.id}><span>{gap.label}</span><strong>{gap.current} → {gap.target}</strong><small>{gap.difference}</small></div>)}</div></section>}

        <div className="quiz-result-next">
          <span>NEXT</span>
          <strong>{result.diagnosis.priorities[0]?.title ?? '今日から記録をはじめる'}</strong>
          <p>{result.diagnosis.priorities[0]?.action ?? 'まずは今日の食事とトレーニングを記録してみましょう。'}</p>
        </div>

        {input.lifestyle.painOrInjury && <p className="note note--warn"><span className="note__title">痛みがある場合</span>無理に負荷を上げないでください。この診断は医療判断を行いません。</p>}

        <button type="button" className="button button--block button--lg" onClick={saveAndOpenPlan}>このPlanを保存して12週間を見る</button>
        {saveMessage && <p className="tool__status" role="status">{saveMessage}</p>}
        <p className="next">
          <a href={url('/tools/one-rep-max')}>1RMを詳しく計算する →</a>
          <a href={url('/strength-standards')}>競技リフター基準で診断する →</a>
          <a href={url('/tools/programs')}>Programを選ぶ →</a>
          <a href={url('/tools/today')}>今日の記録を見る →</a>
        </p>
        <button type="button" className="journey-back-link" onClick={goBack}>← 回答を見直す</button>
      </section>
    );
  }

  if (interstitial != null) {
    return (
      <section ref={journeyRef} className="journey quiz" aria-live="polite">
        <div className="quiz-progress" aria-hidden="true">
          <span className="quiz-progress__count">{progress.position} / {progress.total}</span>
          <div className="quiz-progress__bar"><span style={{ width: `${progress.percent}%` }} /></div>
        </div>
        <div className="quiz-interstitial quiz-appear" key={interstitial.id}>
          <p className="quiz-interstitial__kicker">{interstitial.kicker}</p>
          <h2>{interstitial.title}</h2>
          {interstitial.lines.map((line) => <p key={line}>{line}</p>)}
          <div className="quiz-interstitial__dots" aria-hidden="true"><span /><span /><span /></div>
        </div>
        <div className="quiz-actions">
          <button type="button" className="button button--block button--lg" onClick={() => setInterstitial(null)}>続ける</button>
          <button type="button" className="quiz-back" onClick={goBack}>← 前の質問</button>
        </div>
      </section>
    );
  }

  if (question == null) {
    // 質問表と位置がずれた場合の逃げ道。答えは残したまま最初の質問へ戻す。
    return (
      <section ref={journeyRef} className="journey quiz">
        <p className="journey-lead">質問を読み込めませんでした。</p>
        <button type="button" className="button button--block" onClick={() => setQuestionIdState(resolveQuestionId(input, null))}>最初の質問へ戻る</button>
      </section>
    );
  }

  const numberQuestion = question.kind === 'number' ? (question as NumberQuestion) : null;
  const liftsQuestion = question.kind === 'lifts' ? (question as LiftsQuestion) : null;
  const blocked = numberQuestion?.ready != null && !numberQuestion.ready(input);
  const isLast = progress.position >= progress.total;

  return (
    <section ref={journeyRef} className="journey quiz">
      <div className="quiz-progress">
        <span className="quiz-progress__count" aria-label={`全${progress.total}問中${progress.position}問目`}>
          {progress.position} <small>/ {progress.total}</small>
        </span>
        <div className="quiz-progress__bar"><span style={{ width: `${progress.percent}%` }} /></div>
      </div>

      <div className="quiz-question quiz-appear" key={question.id}>
        <p className="quiz-question__kicker">{question.kicker}</p>
        <h2 className="quiz-question__title">{question.title}</h2>
        {question.lead && <p className="quiz-question__lead">{question.lead}</p>}

        {question.kind === 'choice' && (
          <div className={`quiz-choices quiz-choices--${question.columns}`} role="group" aria-label={question.title}>
            {question.options.map((option) => {
              const selected = question.get(input) === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`quiz-choice${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => chooseOption(question, option.value)}
                >
                  {option.icon && <span className="quiz-choice__icon" aria-hidden="true">{option.icon}</span>}
                  <span className="quiz-choice__label">{option.label}</span>
                  {option.detail && <span className="quiz-choice__detail">{option.detail}</span>}
                  <span className="quiz-choice__check" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}

        {numberQuestion && (
          <div className={numberQuestion.fields.length > 1 ? 'row row--2' : 'quiz-number'}>
            {numberQuestion.fields.map((field) => (
              <NumberField
                key={field.id}
                label={field.label}
                unit={field.unit}
                value={field.get(input)}
                onChange={(value) => setInput((current) => field.set(current, value))}
                placeholder={field.placeholder}
                inputMode={field.inputMode}
              />
            ))}
          </div>
        )}
        {numberQuestion?.hint && <p className="quiz-hint">{numberQuestion.hint}</p>}
        {numberQuestion && showError && blocked && <p className="field__error">{numberQuestion.errorText}</p>}

        {liftsQuestion && (
          <>
            {liftsQuestion.target === 'strength' && (
              <Segmented
                label="入力方法"
                value={strengthMode}
                onChange={(value) => { touchedRef.current = true; setStrengthModeState(value); }}
                options={[{ value: 'oneRm', label: '1RMを知っている' }, { value: 'set', label: '重量×回数から' }]}
              />
            )}
            <div className="quiz-lifts">
              {LIFT_IDS.map((lift) => (
                liftsQuestion.target === 'targets' || strengthMode === 'oneRm'
                  ? <NumberField
                      key={lift}
                      label={liftsQuestion.target === 'targets' ? `${LIFT_LABELS[lift]} 目標` : `${LIFT_LABELS[lift]} 推定1RM`}
                      unit="kg"
                      value={String((liftsQuestion.target === 'targets' ? input.targets.lifts[lift] : input.strength[lift]) ?? '')}
                      onChange={(value) => updateLift(liftsQuestion.target, lift, value)}
                      placeholder="100"
                    />
                  : <div key={lift} className="quiz-set-card">
                      <strong>{LIFT_LABELS[lift]}</strong>
                      <div className="row row--2">
                        <NumberField label="重量" unit="kg" value={setInputs[lift].weight} onChange={(value) => { touchedRef.current = true; setSetInputsState((current) => ({ ...current, [lift]: { ...current[lift], weight: value } })); }} placeholder="80" />
                        <NumberField label="回数" unit="回" value={setInputs[lift].reps} onChange={(value) => { touchedRef.current = true; setSetInputsState((current) => ({ ...current, [lift]: { ...current[lift], reps: value } })); }} placeholder="5" inputMode="numeric" />
                      </div>
                    </div>
              ))}
            </div>
            {liftsQuestion.hint && <p className="quiz-hint">{liftsQuestion.hint}</p>}
          </>
        )}
      </div>

      <div className="quiz-actions">
        {(question.kind !== 'choice' || !autoAdvances(question)) && (
          <button type="button" className="button button--block button--lg" onClick={submitCurrent}>
            {isLast ? '結果を見る' : (numberQuestion?.optional || liftsQuestion) ? '次へ（スキップ可）' : '次へ'}
          </button>
        )}
        {progress.position > 1 && <button type="button" className="quiz-back" onClick={goBack}>← 前の質問</button>}
      </div>

      <p className="journey-privacy">登録不要・途中の入力はこの端末にだけ残ります。サーバーへの送信はありません。</p>
    </section>
  );
}
