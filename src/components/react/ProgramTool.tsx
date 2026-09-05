/**
 * プログラム選び。
 *
 * 【なぜ作り直したか】
 * 以前は「実行中」「あなたへのおすすめ3件」「すべてのプログラム（絞り込み付き
 * カードグリッド）」「選択中の詳細」が同時に縦へ積まれていた。
 * はじめて来た人には、名前も知らないプログラムのカードが10枚並ぶだけで、
 * 何を基準に選べばいいのか分からない。
 *
 * いまは順番を変えた。
 *   1. 実行中があればそれだけ（迷う必要がない）
 *   2. 「何をしたい？」を先に聞く
 *   3. 答えに合うものを最大3件
 *   4. 名前から探したい人のために、全一覧は畳んで置く
 * Smolovなどを検索して直接来た人は4から入れるので、経験者も困らない。
 *
 * 計算・保存のロジック（generateLibraryProgram / startActiveProgram）は
 * 一切変えていない。変えたのは見せる順番だけ。
 */

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
import { NumberField, Segmented, Waiting } from './ui';

const LIFT_OPTIONS: readonly { value: LiftId; label: string }[] = [
  { value: 'bench', label: 'ベンチプレス' },
  { value: 'squat', label: 'スクワット' },
  { value: 'deadlift', label: 'デッドリフト' },
];
const LIFT_LABELS: Record<LiftId, string> = {
  bench: 'ベンチプレス',
  squat: 'スクワット',
  deadlift: 'デッドリフト',
};

/**
 * 「何をしたい？」の選択肢。
 * プログラム名やタグの英語をここに出さない。ユーザーの言葉だけで書く。
 */
interface GoalChoice {
  id: string;
  label: string;
  note: string;
  tag: ProgramTag;
}

const GOAL_CHOICES: readonly GoalChoice[] = [
  { id: 'start', label: '筋トレを始めたい', note: 'まず何をやるかが決まっているもの', tag: 'beginner' },
  { id: 'size', label: '筋肉をつけたい', note: '部位ごとの量を確保する組み方', tag: 'hypertrophy' },
  { id: 'strong', label: 'もっと強くなりたい', note: 'BIG3の重量を伸ばす組み方', tag: 'strength' },
  { id: 'plateau', label: '停滞を抜けたい', note: '頻度や刺激を変えて動かす', tag: 'high-frequency' },
];

function difficultyLabel(definition: ProgramDefinition): string {
  if (definition.difficulty === 'beginner') return '初心者向け';
  if (definition.difficulty === 'intermediate') return '中級者向け';
  return '上級者向け';
}

function weeklyLabel(definition: ProgramDefinition): string {
  const { min, max } = definition.daysPerWeek;
  const days = min === max ? `週${min}回` : `週${min}〜${max}回`;
  return definition.durationWeeks > 0 ? `${days} ／ ${definition.durationWeeks}週間` : days;
}

export default function ProgramTool() {
  const [personalPlan, setPersonalPlan] = useState<SavedPersonalPlan | null>(null);
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [selectedId, setSelectedId] = useState<ProgramId | null>(null);
  const [goal, setGoal] = useState<GoalChoice | null>(null);
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
  }, []);

  /** 診断済みの人には、その回答から選んだ順番をそのまま使う。 */
  const planRecommendations = useMemo(
    () => recommendPrograms(personalPlan?.input ?? null),
    [personalPlan],
  );

  /** 「何をしたい？」に答えたら、それに合うものを最大3件。 */
  const suggested = useMemo<ProgramDefinition[]>(() => {
    if (goal == null) return [];
    const matching = PROGRAM_LIBRARY.filter(
      (program) => program.tags.includes(goal.tag) && program.implementationType === 'generated',
    );
    // 診断済みならその順番を優先し、足りなければタグ一致で埋める
    const ordered = [
      ...planRecommendations
        .map((item) => item.definition)
        .filter((definition) => matching.some((match) => match.id === definition.id)),
      ...matching,
    ];
    const seen = new Set<ProgramId>();
    return ordered.filter((item) => !seen.has(item.id) && seen.add(item.id)).slice(0, 3);
  }, [goal, planRecommendations]);

  const selected = selectedId == null ? null : programById(selectedId);
  const trainingMaxes = useMemo<Partial<Record<LiftId, number>>>(() => {
    const values: [LiftId, string][] = [['bench', bench], ['squat', squat], ['deadlift', deadlift]];
    return Object.fromEntries(
      values.flatMap(([lift, value]) => {
        const parsed = parseNumber(value);
        return parsed != null && parsed > 0 && parsed <= 600 ? [[lift, parsed]] : [];
      }),
    ) as Partial<Record<LiftId, number>>;
  }, [bench, squat, deadlift]);
  const requiredLifts = selected ? programRequiredLifts(selected, primaryLift) : [];
  const generated = useMemo(
    () =>
      selected?.implementationType === 'generated'
        ? generateLibraryProgram(selected.id, trainingMaxes, primaryLift)
        : null,
    [selected, trainingMaxes, primaryLift],
  );
  const activeSession = activeProgram ? sessionForActiveProgram(activeProgram) : null;
  const activeDefinition = activeProgram ? programById(activeProgram.programId) : null;

  function openProgram(id: ProgramId) {
    setSelectedId(id);
    setStartMessage('');
    requestAnimationFrame(() => {
      document.getElementById('program-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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

  return (
    <div className="prog">
      {/* 実行中があるなら、選び直す前にまずそれを出す。 */}
      {activeDefinition && activeProgram && (
        <section className="prog__active">
          <p className="prog__active-label">実行中</p>
          <strong>{activeDefinition.name}</strong>
          <p className="prog__active-pos num">
            Week {activeProgram.currentWeek} / Day {activeProgram.currentDay}
          </p>
          {activeSession && <p className="prog__active-note">{activeSession.label}</p>}
          <a className="ux-cta" href={url('/tools/today')}>今日のトレーニングを開く</a>
        </section>
      )}

      {/* 1. 何をしたい？ */}
      <section className="ux-section">
        <h2>何をしたい？</h2>
        <ul className="ux-picker">
          {GOAL_CHOICES.map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                aria-pressed={goal?.id === choice.id}
                onClick={() => {
                  setGoal(choice);
                  setSelectedId(null);
                }}
              >
                <strong>{choice.label}</strong>
                <small>{choice.note}</small>
                <span aria-hidden="true">{goal?.id === choice.id ? '✓' : '→'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 2. 答えに合うものだけ */}
      {goal != null && (
        <section className="ux-section">
          <h2>{goal.label}人におすすめ</h2>
          {suggested.length === 0 ? (
            <p className="ux-note">
              この目的に合うプログラムがまだありません。下の一覧から名前で探せます。
            </p>
          ) : (
            <ul className="ux-rows">
              {suggested.map((definition) => (
                <li key={definition.id}>
                  <button type="button" onClick={() => openProgram(definition.id)}>
                    <strong>{definition.name}</strong>
                    <small>
                      {difficultyLabel(definition)} ・ {weeklyLabel(definition)}
                    </small>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!personalPlan && (
            <p className="ux-note">
              診断を済ませると、トレーニング歴や週の頻度まで踏まえた並びになります。
              <a href={url('/start')}>診断をはじめる →</a>
            </p>
          )}
        </section>
      )}

      {/* 3. 名前から探す。検索で直接来た経験者のために残すが、最初には見せない。 */}
      <details className="ux-details">
        <summary>プログラム名から探す（{PROGRAM_LIBRARY.length}件）</summary>
        <div>
          <ul className="ux-rows">
            {PROGRAM_LIBRARY.map((definition) => (
              <li key={definition.id}>
                <button type="button" onClick={() => openProgram(definition.id)}>
                  <strong>{definition.name}</strong>
                  <small>
                    {difficultyLabel(definition)} ・ {weeklyLabel(definition)}
                  </small>
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>

      {/* 4. 選んだプログラムの中身 */}
      {selected && (
        <section className="prog__detail" id="program-detail">
          <h2>{selected.name}</h2>
          <p className="prog__meta">
            {difficultyLabel(selected)} ・ {weeklyLabel(selected)}
          </p>
          <p className="prog__summary">{selected.summary}</p>
          <p className="prog__audience">
            <strong>こんな人向け：</strong>
            {selected.audience}
          </p>

          <details className="ux-details">
            <summary>特徴と1週間の例</summary>
            <div>
              <ul className="prog__list">
                {selected.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <h3>1週間の例</h3>
              <ul className="prog__list">
                {selected.weekExample.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>進め方</h3>
              <p className="ux-note">{selected.progression}</p>
            </div>
          </details>

          {selected.warnings.length > 0 && (
            <p className="prog__warn">{selected.warnings.join(' ')}</p>
          )}

          {selected.implementationType === 'reference' ? (
            <p className="ux-note">
              紹介のみ。{selected.sourceName}。重量の生成には対応していないため、
              詳細は原典を確認してください。
            </p>
          ) : (
            <>
              {selected.requiresPrimaryLift && (
                <Segmented label="主種目" options={LIFT_OPTIONS} value={primaryLift} onChange={setPrimaryLift} />
              )}
              <div className="prog__maxes">
                {requiredLifts.map((lift) => (
                  <NumberField
                    key={lift}
                    label={`${LIFT_LABELS[lift]}の1RM`}
                    unit="kg"
                    value={{ bench, squat, deadlift }[lift]}
                    onChange={{ bench: setBench, squat: setSquat, deadlift: setDeadlift }[lift]}
                    placeholder="100"
                    hint="保存済みの筋力情報があれば自動入力されます"
                  />
                ))}
              </div>
              {!generated ? (
                <Waiting>
                  {requiredLifts.map((lift) => LIFT_LABELS[lift]).join('・')}
                  の1RMを入力すると、実際に組める2.5kg刻みの重量を表示します。
                </Waiting>
              ) : (
                <>
                  <section className="prog__session">
                    <p className="prog__session-head num">WEEK 1 / DAY 1</p>
                    <strong>{generated.weeks[0]?.label}</strong>
                    <ul>
                      {generated.weeks[0]?.exercises.map((exercise) => (
                        <li key={exercise.exerciseId}>
                          <span>{exercise.label}</span>
                          <strong className="num">
                            {exercise.weightKg == null
                              ? exercise.note ?? 'フォームを保てる負荷で'
                              : `${fmt(exercise.weightKg, 1)}kg`}
                          </strong>
                          <small className="num">
                            {exercise.sets}セット × {exercise.reps}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <button type="button" className="ux-cta" onClick={startProgram}>
                    このプログラムを開始
                  </button>
                  {startMessage && (
                    <p className="ux-note" role="status">
                      {startMessage}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
