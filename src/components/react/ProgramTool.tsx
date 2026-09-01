import { useEffect, useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import {
  buildTrainingProgram,
  programDefaultsFromPersonalPlan,
  programOneRmFromPersonalPlan,
  type TrainingExperience,
  type TrainingGoal,
} from '../../lib/programs';
import { readData } from '../../lib/storage';
import type { SavedPersonalPlan } from '../../lib/diagnosis/types';
import { NumberField, Segmented, SelectField, Slip, Waiting } from './ui';

const EXERCISES = ['ベンチプレス', 'スクワット', 'デッドリフト', 'オーバーヘッドプレス', 'バーベルロー'];

const EXPERIENCE_OPTIONS: { value: TrainingExperience; label: string }[] = [
  { value: 'beginner', label: '初心者' },
  { value: 'intermediate', label: '中級' },
  { value: 'advanced', label: '経験者' },
];

function experienceHint(experience: TrainingExperience): string {
  return experience === 'beginner' ? '始めたばかり〜半年程度' : experience === 'intermediate' ? '半年〜2年程度' : '2年以上';
}

function recommendationReason(plan: SavedPersonalPlan): string {
  const defaults = programDefaultsFromPersonalPlan(plan.input);
  const goal = defaults.goal === 'strength' ? '筋力向上' : defaults.goal === 'muscle' ? '筋量アップ' : '習慣づくり';
  return `週${defaults.daysPerWeek}回・${experienceHint(defaults.experience)}・${goal}の入力をもとにしています。`;
}

export default function ProgramTool() {
  const [exercise, setExercise] = useState('スクワット');
  const [oneRm, setOneRm] = useState('');
  const [experience, setExperience] = useState<TrainingExperience>('beginner');
  const [days, setDays] = useState('3');
  const [goal, setGoal] = useState<TrainingGoal>('strength');
  const [personalPlan, setPersonalPlan] = useState<SavedPersonalPlan | null>(null);

  useEffect(() => {
    const saved = readData().personalPlan;
    if (saved == null) return;
    const defaults = programDefaultsFromPersonalPlan(saved.input);
    setPersonalPlan(saved);
    setExperience(defaults.experience);
    setDays(String(defaults.daysPerWeek));
    setGoal(defaults.goal);
    const savedOneRm = programOneRmFromPersonalPlan(saved.input, exercise);
    if (savedOneRm != null) setOneRm(String(savedOneRm));
  }, []);

  const plan = useMemo(() => {
    const value = parseNumber(oneRm);
    if (value == null) return null;
    return buildTrainingProgram({ exercise, oneRmKg: value, experience, daysPerWeek: Number(days), goal });
  }, [exercise, oneRm, experience, days, goal]);

  function changeExercise(value: string) {
    setExercise(value);
    const fromPlan = personalPlan ? programOneRmFromPersonalPlan(personalPlan.input, value) : null;
    if (fromPlan != null) setOneRm(String(fromPlan));
  }

  const coreControls = <>
    <SelectField label="伸ばしたい種目" value={exercise} onChange={changeExercise} options={EXERCISES.map((name) => ({ value: name, label: name }))} />
    <NumberField label="現在の1RM" unit="kg" value={oneRm} onChange={setOneRm} placeholder="100" hint="実測または1RM換算ツールの推定値" />
  </>;
  const conditionControls = <>
    <Segmented label="トレーニング歴" value={experience} onChange={setExperience} options={EXPERIENCE_OPTIONS} hint={experienceHint(experience)} />
    <div className="row">
      <SelectField label="週に通える回数" value={days} onChange={setDays} options={[2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: `週${value}回` }))} />
      <SelectField label="目的" value={goal} onChange={(value) => setGoal(value as TrainingGoal)} options={[{ value: 'strength', label: '筋力を伸ばす' }, { value: 'muscle', label: '筋量を増やす' }, { value: 'habit', label: '習慣を作る' }]} />
    </div>
  </>;

  return (
    <div className="tool">
      <Slip code="PROGRAM" title="4週間の土台を作る">
        {personalPlan ? <section className="program__recommendation">
          <span>あなたへのおすすめ</span>
          <strong>{experienceHint(experience)}／週{days}回／{goal === 'strength' ? '筋力向上' : goal === 'muscle' ? '筋量アップ' : '習慣づくり'}</strong>
          <p>{recommendationReason(personalPlan)}</p>
          <div className="program__quick-input">{coreControls}</div>
          <details className="tool__details"><summary>条件を変更</summary>{conditionControls}</details>
        </section> : <>{coreControls}{conditionControls}</>}
      </Slip>

      {!plan ? <Waiting>1RMを入力すると、経験と頻度に合う4週間を作ります。</Waiting> : <>
        <Slip code={plan.id.toUpperCase()} title={plan.name}>
          <p className="tool__lead">{plan.summary}</p>
          <p className="note"><span className="note__title">進め方</span>{plan.progression}</p>
        </Slip>
        {[1, 2, 3, 4].map((week) => <Slip key={week} code={`WEEK ${week}`} title={week === 4 ? '4週目・疲労を抜く' : `${week}週目`}>
          <div className="table-scroll"><table className="rows"><caption className="visually-hidden">{week}週目の{exercise}メニュー</caption><thead><tr><th scope="col">日</th><th scope="col">目的</th><th scope="col">重量</th><th scope="col">セット</th></tr></thead><tbody>{plan.sessions.filter((session) => session.week === week).map((session) => <tr key={session.day}><th scope="row">Day {session.day}</th><td>{session.label}<small className="program__note">{session.note}</small></td><td className="num">{fmt(session.weightKg, 1)}kg<small className="program__note">{fmt(session.percent, 1)}%</small></td><td className="num">{session.sets} × {session.reps}</td></tr>)}</tbody></table></div>
        </Slip>)}
        <p className="note note--warn"><span className="note__title">Bodymakers独自の一般的なテンプレートです</span>医学的な処方や他社の有料プログラムの複製ではありません。痛みや回復不良がある日は重量を下げるか休み、フォームを優先してください。</p>
      </>}
    </div>
  );
}
