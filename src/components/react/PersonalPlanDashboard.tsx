import { useEffect, useMemo, useState } from 'react';

import { buildPersonalPlan } from '../../lib/diagnosis/plan';
import { fmt } from '../../lib/format';
import { findExercise } from '../../lib/exercises';
import { DATA_CHANGED_EVENT, readData, todayLog, type BodymakersData } from '../../lib/storage';
import { summarizeIntake } from '../../lib/today';
import { url } from '../../lib/url';

function Progress({ value, max }: { value: number; max: number }) {
  return <progress value={Math.min(value, max)} max={max} aria-label={`${fmt(value, 0)} / ${fmt(max, 0)}`} />;
}

export default function PersonalPlanDashboard() {
  const [data, setData] = useState<BodymakersData | null>(null);
  useEffect(() => {
    const refresh = () => setData(readData());
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DATA_CHANGED_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);

  const result = useMemo(() => data?.personalPlan ? buildPersonalPlan(data.personalPlan.input) : null, [data]);
  const today = data ? todayLog(data) : null;
  const intake = useMemo(() => today ? summarizeIntake(today.meals) : null, [today]);
  const calories = today?.manualIntake.kcal ?? intake?.totals.kcal ?? 0;
  const protein = today?.manualIntake.protein ?? intake?.totals.protein ?? 0;

  if (data == null) return <div className="personal-plan personal-plan--loading" aria-hidden="true" />;
  if (result == null || data.personalPlan == null) return (
    <section className="personal-plan personal-plan--empty">
      <p className="journey-kicker">YOUR PLAN</p>
      <h1>まず、なりたい身体を決めましょう。</h1>
      <p>身体・筋力・食事・生活習慣を順に選ぶと、今の条件に合う12週間の最初の一歩を作れます。</p>
      <a className="button button--lg" href={url('/start')}>診断をはじめる</a>
      <p className="journey-privacy">約2〜3分・登録不要・保存先はこの端末だけです。</p>
    </section>
  );

  const { input } = data.personalPlan;
  const nutrition = result.nutrition;
  const workout = result.todayWorkout;
  const action = result.diagnosis.priorities[0];

  return (
    <section className="personal-plan">
      <header className="personal-plan__head">
        <p className="journey-kicker">YOUR PLAN</p>
        <h1>あなたのBodymakers Plan</h1>
        <p>保存日 {new Date(data.personalPlan.createdAt).toLocaleDateString('ja-JP')} ・ 12週間の最初の一歩を、今日の行動へつなげます。</p>
      </header>

      <section className="personal-plan__today" aria-labelledby="personal-today-title">
        <p className="personal-plan__code">TODAY</p>
        <h2 id="personal-today-title">今日やること</h2>
        <div className="personal-plan__today-grid">
          <article>
            <span>今日のトレーニング</span>
            {workout ? <><strong>{workout.label}</strong><p>{workout.focus}・{workout.exerciseIds.length}種目</p><a className="button button--block" href={url('/tools/today')}>トレーニングを開始</a></> : <p>今週のトレーニングを予定に入れましょう。</p>}
          </article>
          <article>
            <span>NUTRITION</span>
            {nutrition ? <><strong className="num">{fmt(calories, 0)} <small>/ {fmt(nutrition.calories, 0)} kcal</small></strong><p className="num">P {fmt(protein, 0)} / {nutrition.protein}g</p><a href={url('/tools/foods')}>食事を追加する →</a></> : <p>体格を入力すると、既存のPFC計算につなげられます。</p>}
          </article>
          <article>
            <span>RECOVERY</span>
            <strong className="num">{today?.sleepHours == null ? '—' : `${fmt(today.sleepHours, 1)}h`}</strong><p>{today?.steps == null ? '歩数は未記録' : `${fmt(today.steps, 0)}歩`}</p><a href={url('/tools/today')}>今日を記録する →</a>
          </article>
        </div>
        {nutrition && <div className="personal-plan__nutrition-progress"><span>今日のカロリー</span><Progress value={calories} max={nutrition.calories} /><span>Protein</span><Progress value={protein} max={nutrition.protein} /></div>}
        {action && <div className="personal-plan__action"><span>NEXT ACTION</span><strong>{action.title}</strong><p>{action.action}</p></div>}
      </section>

      <section className="personal-plan__section">
        <div className="personal-plan__section-head"><div><p>12 WEEKS</p><h2>12週間Plan</h2></div><a href={url('/start')}>診断をやり直す →</a></div>
        <div className="personal-plan__phases">{result.phases.map((phase) => <article key={phase.id}><span>{phase.label} / {phase.weeks}</span><h3>{phase.title}</h3><p>{phase.detail}</p></article>)}</div>
      </section>

      <section className="personal-plan__section">
        <div className="personal-plan__section-head"><div><p>TRAINING</p><h2>今週の基本メニュー</h2></div><a href={url('/tools/programs')}>PROGRAM LIBRARYを見る →</a></div>
        <div className="personal-plan__workouts">{result.workouts.map((day) => <article key={day.id}><span>{day.label}</span><h3>{day.focus}</h3><ul>{day.exerciseIds.map((id) => <li key={id}>{findExercise(id)?.name ?? id}</li>)}</ul></article>)}</div>
        <p className="tool__note">これは目的・頻度・場所から選ぶ説明可能な基本テンプレートです。重量・セット数は、既存の1RM・プログラムツールで調整してください。</p>
      </section>

      {nutrition && <section className="personal-plan__section">
        <div className="personal-plan__section-head"><div><p>NUTRITION</p><h2>1日の目安</h2></div><a href={url('/tools/nutrition')}>PFCを詳しく調整する →</a></div>
        <div className="personal-plan__macros"><div><span>kcal</span><strong className="num">{nutrition.calories}</strong></div><div><span>P</span><strong className="num">{nutrition.protein}g</strong></div><div><span>F</span><strong className="num">{nutrition.fat}g</strong></div><div><span>C</span><strong className="num">{nutrition.carbs}g</strong></div></div>
        <p className="tool__note">{nutrition.note}</p><p className="next"><a href={url('/tools/foods')}>食品を追加する →</a><a href={url('/tools/today')}>今日の食事を見る →</a></p>
      </section>}

      {result.diagnosis.gaps.length > 0 && <section className="personal-plan__section"><div className="personal-plan__section-head"><div><p>GAP</p><h2>ゴールとの差</h2></div></div><div className="journey-gaps">{result.diagnosis.gaps.map((gap) => <div key={gap.id}><span>{gap.label}</span><strong>{gap.current} → {gap.target}</strong><small>{gap.difference}</small></div>)}</div></section>}
      {input.lifestyle.painOrInjury && <p className="note note--warn"><span className="note__title">痛み・怪我あり</span>痛みがある場合は無理に負荷を上げないでください。このPlanは医療判断を行いません。</p>}
    </section>
  );
}
