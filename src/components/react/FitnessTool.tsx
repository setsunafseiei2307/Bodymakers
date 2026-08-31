import { useMemo, useState } from 'react';

import { calculateFitnessScore } from '../../lib/fitness';
import { parseNumber } from '../../lib/format';
import { NumberField, Slip, Waiting } from './ui';

const optionalNumber = (value: string) => value.trim() === '' ? undefined : parseNumber(value) ?? undefined;

export default function FitnessTool() {
  const [bodyweight, setBodyweight] = useState('');
  const [bench, setBench] = useState('');
  const [squat, setSquat] = useState('');
  const [deadlift, setDeadlift] = useState('');
  const [pullUps, setPullUps] = useState('');
  const [fiveKm, setFiveKm] = useState('');
  const [plank, setPlank] = useState('');

  const result = useMemo(() => calculateFitnessScore({
    bodyweightKg: optionalNumber(bodyweight),
    benchKg: optionalNumber(bench),
    squatKg: optionalNumber(squat),
    deadliftKg: optionalNumber(deadlift),
    pullUps: optionalNumber(pullUps),
    fiveKmMinutes: optionalNumber(fiveKm),
    plankSeconds: optionalNumber(plank),
  }), [bodyweight, bench, squat, deadlift, pullUps, fiveKm, plank]);

  return (
    <div className="tool">
      <Slip code="BODYMAKERS SCORE" title="測った種目だけ入力">
        <p className="tool__lead">空欄の種目は採点に含めません。比較するときは、毎回同じ種目を入力してください。</p>
        <div className="row">
          <NumberField label="体重" unit="kg" value={bodyweight} onChange={setBodyweight} placeholder="70" />
          <NumberField label="懸垂（反動なし）" unit="回" value={pullUps} onChange={setPullUps} placeholder="8" inputMode="numeric" />
        </div>
        <div className="row">
          <NumberField label="ベンチプレス 1RM" unit="kg" value={bench} onChange={setBench} placeholder="80" />
          <NumberField label="スクワット 1RM" unit="kg" value={squat} onChange={setSquat} placeholder="110" />
          <NumberField label="デッドリフト 1RM" unit="kg" value={deadlift} onChange={setDeadlift} placeholder="140" />
        </div>
        <div className="row">
          <NumberField label="5kmタイム" unit="分" value={fiveKm} onChange={setFiveKm} placeholder="28.5" hint="28分30秒なら28.5" />
          <NumberField label="プランク" unit="秒" value={plank} onChange={setPlank} placeholder="90" inputMode="numeric" />
        </div>
      </Slip>

      {!result ? <Waiting>懸垂、5km、プランク、または体重とBIG3を入力すると現在地が出ます。</Waiting> : (
        <>
          <Slip code={`${result.components.length} CATEGORIES`} title="BODYMAKERS SCORE">
            <div className="fitness-score">
              <p className="fitness-score__number num">{result.score}<span>/ 100</span></p>
              <strong>{result.level}</strong>
              <p>{result.description}</p>
            </div>
            <div className="fitness-components">
              {result.components.map((component) => (
                <section className="fitness-component" key={component.key}>
                  <div><strong>{component.label}</strong><span className="num">{Math.round(component.score)}</span></div>
                  <div className="fitness-component__bar"><span style={{ width: `${component.score}%` }} /></div>
                  <p>{component.value}</p>
                  <small>次の目印：{component.next}</small>
                </section>
              ))}
            </div>
          </Slip>
          <p className="note note--warn"><span className="note__title">Bodymakers独自の進捗スコアです</span>一般人口の順位、医学的な体力判定、性別・年齢別の標準値ではありません。公開統計が不足する項目で架空のパーセンタイルを作らず、明示したマイルストーンへの到達度を平均しています。入力項目数が違うスコア同士は比較できません。</p>
          <p className="next"><a href="/strength-standards">BIG3を競技者データで詳しく見る →</a><a href="/tools/one-rep-max">推定1RMを計算する →</a><a href="/tools/programs">次の4週間を作る →</a></p>
        </>
      )}
    </div>
  );
}
