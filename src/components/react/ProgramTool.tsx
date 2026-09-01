import { useEffect, useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import { url } from '../../lib/url';
import {
  PROGRAM_LIBRARY,
  generateLibraryProgram,
  programById,
  programRequiredLifts,
  recommendPrograms,
  sessionForActiveProgram,
  type ActiveProgram,
  type ProgramDefinition,
  type ProgramId,
  type ProgramTag,
} from '../../lib/programLibrary';
import { readData, startActiveProgram } from '../../lib/storage';
import type { SavedPersonalPlan } from '../../lib/diagnosis/types';
import type { LiftId } from '../../lib/strength/standards';
import { NumberField, Segmented, Slip, Waiting } from './ui';

const LIFT_OPTIONS: readonly { value: LiftId; label: string }[] = [
  { value: 'bench', label: 'ベンチプレス' },
  { value: 'squat', label: 'スクワット' },
  { value: 'deadlift', label: 'デッドリフト' },
];
const LIFT_LABELS: Record<LiftId, string> = { bench: 'ベンチプレス', squat: 'スクワット', deadlift: 'デッドリフト' };
const FILTERS: readonly { value: 'all' | ProgramTag; label: string }[] = [
  { value: 'all', label: 'すべて' }, { value: 'strength', label: '筋力' }, { value: 'hypertrophy', label: '筋肥大' },
  { value: 'beginner', label: '初心者' }, { value: 'high-frequency', label: '高頻度' }, { value: 'short', label: '短時間' },
];

function difficultyLabel(definition: ProgramDefinition): string {
  return definition.difficulty === 'beginner' ? 'BEGINNER／基礎' : definition.difficulty === 'intermediate' ? 'INTERMEDIATE／中級' : 'ADVANCED／上級';
}

function tags(definition: ProgramDefinition): string[] {
  return definition.tags.map((tag) => ({ strength: 'STRENGTH', hypertrophy: 'HYPERTROPHY', health: 'HEALTH', beginner: 'BEGINNER', 'high-frequency': 'HIGH FREQUENCY', short: 'SHORT' }[tag]));
}

function ProgramCard({ definition, onOpen }: { definition: ProgramDefinition; onOpen: () => void }) {
  return <article className="program-library__card">
    <div className="program-library__card-head"><span>{definition.shortName}</span><small>{difficultyLabel(definition)}</small></div>
    <h3>{definition.name}</h3>
    <p>{definition.summary}</p>
    <dl className="program-library__meta"><div><dt>週回数</dt><dd>週{definition.daysPerWeek.min}{definition.daysPerWeek.min === definition.daysPerWeek.max ? '' : `〜${definition.daysPerWeek.max}`}回</dd></div><div><dt>期間</dt><dd>{definition.durationWeeks > 0 ? `${definition.durationWeeks}週間` : '紹介のみ'}</dd></div></dl>
    <div className="program-library__tags">{tags(definition).map((tag) => <span key={tag}>{tag}</span>)}</div>
    <button type="button" className="button button--block" onClick={onOpen}>詳しく見る</button>
  </article>;
}

export default function ProgramTool() {
  const [personalPlan, setPersonalPlan] = useState<SavedPersonalPlan | null>(null);
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [selectedId, setSelectedId] = useState<ProgramId>('bodymakers-linear');
  const [filter, setFilter] = useState<'all' | ProgramTag>('all');
  const [primaryLift, setPrimaryLift] = useState<LiftId>('bench');
  const [bench, setBench] = useState('');
  const [squat, setSquat] = useState('');
  const [deadlift, setDeadlift] = useState('');
  const [startMessage, setStartMessage] = useState('');

  useEffect(() => {
    const data = readData();
    setPersonalPlan(data.personalPlan);
    setActiveProgram(data.activeProgram);
    const lifts = data.strengthProfile?.lifts;
    const input = data.personalPlan?.input.strength;
    const benchMax = lifts?.bench?.oneRmKg ?? input?.bench;
    const squatMax = lifts?.squat?.oneRmKg ?? input?.squat;
    const deadliftMax = lifts?.deadlift?.oneRmKg ?? input?.deadlift;
    if (benchMax != null) setBench(String(benchMax));
    if (squatMax != null) setSquat(String(squatMax));
    if (deadliftMax != null) setDeadlift(String(deadliftMax));
    const recommended = recommendPrograms(data.personalPlan?.input ?? null)[0]?.definition;
    if (recommended) setSelectedId(recommended.id);
  }, []);

  const recommendations = useMemo(() => recommendPrograms(personalPlan?.input ?? null), [personalPlan]);
  const selected = programById(selectedId);
  const trainingMaxes = useMemo<Partial<Record<LiftId, number>>>(() => {
    const values: [LiftId, string][] = [['bench', bench], ['squat', squat], ['deadlift', deadlift]];
    return Object.fromEntries(values.flatMap(([lift, value]) => {
      const parsed = parseNumber(value);
      return parsed != null && parsed > 0 && parsed <= 600 ? [[lift, parsed]] : [];
    })) as Partial<Record<LiftId, number>>;
  }, [bench, squat, deadlift]);
  const requiredLifts = selected ? programRequiredLifts(selected, primaryLift) : [];
  const generated = useMemo(() => selected?.implementationType === 'generated'
    ? generateLibraryProgram(selected.id, trainingMaxes, primaryLift)
    : null, [selected, trainingMaxes, primaryLift]);
  const visiblePrograms = filter === 'all' ? PROGRAM_LIBRARY : PROGRAM_LIBRARY.filter((program) => program.tags.includes(filter));
  const activeSession = activeProgram ? sessionForActiveProgram(activeProgram) : null;
  const activeDefinition = activeProgram ? programById(activeProgram.programId) : null;

  function openProgram(id: ProgramId) {
    setSelectedId(id);
    setStartMessage('');
    document.getElementById('program-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startProgram() {
    if (selected == null || generated == null) return;
    const program: ActiveProgram = {
      programId: selected.id,
      startedAt: new Date().toISOString(),
      currentWeek: 1,
      currentDay: 1,
      trainingMaxes,
      daysPerWeek: generated.daysPerWeek,
      durationWeeks: selected.durationWeeks,
      primaryLift,
      completedSessions: 0,
    };
    if (!startActiveProgram(program)) {
      setStartMessage('この端末へ保存できませんでした。ブラウザの保存設定を確認してください。');
      return;
    }
    setActiveProgram(program);
    setStartMessage('プログラムを開始しました。今日のトレーニングでDay 1を確認できます。');
  }

  return <div className="tool program-library">
    {activeDefinition && <Slip code="ACTIVE" title="実行中のプログラム">
      <div className="program-library__active"><span>{activeDefinition.name}</span><strong>Week {activeProgram?.currentWeek} / Day {activeProgram?.currentDay}</strong>{activeSession && <p>{activeSession.label}：{activeSession.exercises.map((exercise) => exercise.label).join('・')}</p>}<a className="button button--block" href="#program-detail">内容を確認する</a><a href={url('/tools/today')}>今日のトレーニングを開く →</a></div>
    </Slip>}

    <Slip code="RECOMMENDED" title="あなたへのおすすめ">
      <p className="tool__lead">診断の目的・頻度・トレーニング歴をもとに、始めやすい3本を選びます。</p>
      <div className="program-library__recommendations">{recommendations.map(({ definition, reasons }) => <article className="program-library__recommendation" key={definition.id}><span>{definition.shortName}</span><strong>{definition.name}</strong><p>なぜおすすめ？ {reasons.join('・')}</p><button type="button" className="button" onClick={() => openProgram(definition.id)}>詳しく見る</button></article>)}</div>
      {!personalPlan && <p className="note">診断を完了すると、目的・頻度・トレーニング歴に合わせておすすめの理由が変わります。<a href={url('/start')}>診断をはじめる →</a></p>}
    </Slip>

    <Slip code="LIBRARY" title="すべてのプログラム">
      <Segmented label="絞り込み" options={FILTERS} value={filter} onChange={setFilter} />
      <div className="program-library__grid">{visiblePrograms.map((definition) => <ProgramCard key={definition.id} definition={definition} onOpen={() => openProgram(definition.id)} />)}</div>
    </Slip>

    {selected && <Slip code={selected.shortName} title={selected.name}>
      <div id="program-detail" className="program-library__detail">
        <div className="program-library__hero"><span>{difficultyLabel(selected)}</span><strong>週{selected.daysPerWeek.min}{selected.daysPerWeek.min === selected.daysPerWeek.max ? '' : `〜${selected.daysPerWeek.max}`}回 {selected.durationWeeks > 0 ? `／ ${selected.durationWeeks}週間` : '／ 紹介枠'}</strong><p>{selected.summary}</p></div>
        <p><strong>こんな人向け：</strong>{selected.audience}</p>
        <details className="tool__details"><summary>特徴と1週間の例を見る</summary><ul>{selected.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><h3>1週間の例</h3><ul>{selected.weekExample.map((item) => <li key={item}>{item}</li>)}</ul><h3>進め方</h3><p>{selected.progression}</p></details>
        {selected.warnings.length > 0 && <p className="note note--warn"><span className="note__title">注意点</span>{selected.warnings.join(' ')}</p>}
        {selected.implementationType === 'reference' ? <p className="note"><span className="note__title">紹介枠</span>{selected.sourceName}。今回、完全な重量生成は提供しません。公式の詳細は原典を確認してください。</p> : <>
          {selected.requiresPrimaryLift && <Segmented label="主種目" options={LIFT_OPTIONS} value={primaryLift} onChange={setPrimaryLift} />}
          <div className="program-library__maxes">{requiredLifts.map((lift) => <NumberField key={lift} label={`${LIFT_LABELS[lift]}の1RM`} unit="kg" value={{ bench, squat, deadlift }[lift]} onChange={{ bench: setBench, squat: setSquat, deadlift: setDeadlift }[lift]} placeholder="100" hint="保存済みの筋力情報があれば自動入力されます" />)}</div>
          {!generated ? <Waiting>{requiredLifts.map((lift) => LIFT_LABELS[lift]).join('・')}の1RMを入力すると、実際に組める2.5kg刻みの重量を表示します。</Waiting> : <>
            <section className="program-library__session"><span>WEEK 1 / DAY 1</span><strong>{generated.weeks[0]?.label}</strong><p>{generated.weeks[0]?.focus}</p><ul>{generated.weeks[0]?.exercises.map((exercise) => <li key={exercise.exerciseId}><span>{exercise.label}</span><strong>{exercise.weightKg == null ? exercise.note ?? 'フォームを保てる負荷で' : `${fmt(exercise.weightKg, 1)}kg`}</strong><small>{exercise.sets}セット × {exercise.reps}{exercise.note && exercise.weightKg != null ? `／${exercise.note}` : ''}</small></li>)}</ul></section>
            <button type="button" className="button button--block button--lg" onClick={startProgram}>このプログラムを開始</button>{startMessage && <p className="tool__status" role="status">{startMessage}</p>}
          </>}
        </>}
      </div>
    </Slip>}
  </div>;
}
