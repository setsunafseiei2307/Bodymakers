import { useEffect, useMemo, useState } from 'react';

import { buildPersonalPlan } from '../../lib/diagnosis/plan';
import { fmt } from '../../lib/format';
import { programById, sessionForActiveProgram } from '../../lib/programLibrary';
import { DATA_CHANGED_EVENT, readData, todayLog, type BodymakersData } from '../../lib/storage';
import { summarizeIntake } from '../../lib/today';
import { url } from '../../lib/url';

export default function HomeExperience() {
  const [data, setData] = useState<BodymakersData | null>(null);

  useEffect(() => {
    const refresh = () => setData(readData());
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const today = data ? todayLog(data) : null;
  const intake = useMemo(() => today ? summarizeIntake(today.meals) : null, [today]);
  const personal = useMemo(() => data?.personalPlan ? buildPersonalPlan(data.personalPlan.input) : null, [data]);
  const definition = data?.activeProgram ? programById(data.activeProgram.programId) : null;
  const session = data?.activeProgram ? sessionForActiveProgram(data.activeProgram) : null;
  const targetCalories = data?.dietPlan?.targetCalories ?? personal?.nutrition?.calories ?? null;
  const targetProtein = data?.dietPlan?.proteinGrams ?? personal?.nutrition?.protein ?? null;
  const kcal = today?.manualIntake.kcal ?? intake?.totals.kcal ?? 0;
  const protein = today?.manualIntake.protein ?? intake?.totals.protein ?? 0;
  const hasJourney = Boolean(data?.personalPlan || data?.activeProgram || data?.dailyLogs.length || data?.dietPlan);

  // 初回ユーザー向けの説明はSSRでもそのまま出す。localStorageはhydration後に読み、
  // 保存済みの人だけをToday中心のホームへ切り替える。
  if (!data || !hasJourney) return <section className="home-experience home-experience--new">
    <div className="home-experience__hero">
      <p className="app-kicker">BODYMAKERS DAILY</p>
      <h1>理想の身体まで、<br /><span>今日やることを迷わない。</span></h1>
      <p>身体・筋力・食事・生活をひとつにつなげて、あなたのPlanと毎日の行動を作ります。</p>
      <a className="button button--lg" href={url('/start')}>無料で診断をはじめる</a>
      <small>約3分・登録不要・保存先はこの端末だけ</small>
    </div>
    <ol className="home-steps">
      <li><span>01</span><strong>現在地を知る</strong><p>身体と習慣を、無理のない質問で確認。</p></li>
      <li><span>02</span><strong>Planを作る</strong><p>12週間の方向性と、続けやすい頻度を決める。</p></li>
      <li><span>03</span><strong>今日から実行</strong><p>トレーニングと食事の次の一手が分かる。</p></li>
    </ol>
    <div className="home-experience__secondary"><a href={url('/library')}>まず機能を見る →</a><a href={url('/tools/one-rep-max')}>BIG3を測る →</a></div>
  </section>;

  const nextAction = personal?.diagnosis.priorities[0];
  return <section className="home-experience home-experience--member" aria-labelledby="home-today-title">
    <header className="home-member__head"><div><p className="app-kicker">TODAY</p><h1 id="home-today-title">今日やること</h1></div><a href={url('/record')}>今週の記録 →</a></header>
    <div className="home-member__cards">
      <article className="home-action-card home-action-card--training"><span>TRAINING</span>{definition && data.activeProgram && session ? <><h2>{session.label}</h2><p>{definition.name} · Week {data.activeProgram.currentWeek} / Day {data.activeProgram.currentDay}</p><strong>{session.exercises.length}種目</strong><a className="button button--block" href={url('/tools/today#active-program')}>トレーニングを開始</a></> : <><h2>次のProgramを選ぼう</h2><p>あなたの目的と頻度から、まず1本を選べます。</p><a className="button button--block" href={url('/tools/programs')}>PROGRAM LIBRARYを見る</a></>}</article>
      <article className="home-action-card home-action-card--nutrition"><span>NUTRITION</span><h2><strong className="num">{fmt(kcal, 0)}</strong>{targetCalories != null && <small> / {fmt(targetCalories, 0)} kcal</small>}</h2><p><strong className="num">P {fmt(protein, 0)}{targetProtein != null && ` / ${targetProtein}g`}</strong></p><a className="button button--ghost button--block" href={url('/tools/today#meals')}>食事を追加する</a></article>
      <article className="home-action-card home-action-card--recovery"><span>RECOVERY</span><h2>{today?.sleepHours == null ? '回復を記録' : `${fmt(today.sleepHours, 1)}h`}</h2><p>{today?.sleepHours == null ? '睡眠を入れると、今日の状態が振り返れます。' : `${today.steps == null ? '歩数は未記録' : `${fmt(today.steps, 0)}歩`}`}</p><a href={url('/tools/today#quick-record')}>睡眠・活動を記録 →</a></article>
    </div>
    {nextAction && <aside className="home-next-action"><span>NEXT ACTION</span><strong>{nextAction.title}</strong><p>{nextAction.action}</p><a href={url('/plan')}>Planを開く →</a></aside>}
  </section>;
}
