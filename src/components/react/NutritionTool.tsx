/**
 * PFC・カロリー計算ツール。
 *
 * 基礎代謝（BMR）→ 消費カロリー（TDEE）→ 目標カロリー → PFC配分 の順に求める。
 * 体脂肪率を入れると除脂肪体重が出せるので、より精度の高い Katch-McArdle 式が使える。
 *
 * 計算は src/lib/nutrition.ts の純関数で行い、ここは入力と表示だけを担当する。
 */

import { useMemo, useState } from 'react';

import { fmt, fmtComma, parseNumber } from '../../lib/format';
import {
  ACTIVITY_LEVELS,
  GOAL_PRESETS,
  bmi,
  calcMacros,
  leanBodyMass,
  weeksToGoal,
  type BmrFormula,
  type Sex,
} from '../../lib/nutrition';
import { NumberField, Segmented, SelectField, Slip, Waiting } from './ui';
import { url } from '../../lib/url';

/** 入力の受け付け範囲。範囲外は計算式の前提から外れる。 */
const RANGE = {
  age: [10, 100],
  height: [100, 250],
  weight: [25, 300],
  bodyFat: [2, 60],
  goalWeight: [25, 300],
} as const;

const SEX_OPTIONS = [
  { value: 'male' as Sex, label: '男性' },
  { value: 'female' as Sex, label: '女性' },
];

export default function NutritionTool() {
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [activityKey, setActivityKey] = useState(ACTIVITY_LEVELS[2].key);
  const [goalKey, setGoalKey] = useState(GOAL_PRESETS[2].key);
  const [formula, setFormula] = useState<BmrFormula>('mifflin');

  const ageValue = parseNumber(age);
  const heightValue = parseNumber(height);
  const weightValue = parseNumber(weight);
  const bodyFatValue = parseNumber(bodyFat);
  const goalWeightValue = parseNumber(goalWeight);

  function rangeError(value: number | null, raw: string, key: keyof typeof RANGE, unit: string) {
    if (raw === '') return undefined;
    const [min, max] = RANGE[key];
    if (value == null || value < min || value > max) {
      return `${min}〜${max}${unit} の範囲で入力してください。`;
    }
    return undefined;
  }

  const ageError = rangeError(ageValue, age, 'age', '歳');
  const heightError = rangeError(heightValue, height, 'height', 'cm');
  const weightError = rangeError(weightValue, weight, 'weight', 'kg');
  const bodyFatError = rangeError(bodyFatValue, bodyFat, 'bodyFat', '%');
  const goalWeightError = rangeError(goalWeightValue, goalWeight, 'goalWeight', 'kg');

  const hasErrors = Boolean(
    ageError || heightError || weightError || bodyFatError || goalWeightError,
  );
  const ready = !hasErrors && ageValue != null && heightValue != null && weightValue != null;

  /** Katch-McArdle は除脂肪体重が要るので、体脂肪率が無いと選べない。 */
  const canUseKatch = bodyFatValue != null && !bodyFatError;
  const effectiveFormula: BmrFormula = formula === 'katch' && !canUseKatch ? 'mifflin' : formula;

  const activity = ACTIVITY_LEVELS.find((a) => a.key === activityKey) ?? ACTIVITY_LEVELS[2];
  const goal = GOAL_PRESETS.find((g) => g.key === goalKey) ?? GOAL_PRESETS[2];

  const result = useMemo(() => {
    if (!ready) return null;
    return calcMacros(
      {
        sex,
        age: ageValue,
        heightCm: heightValue,
        weightKg: weightValue,
        bodyFatPercent: canUseKatch ? bodyFatValue : null,
      },
      activity.factor,
      goal.ratio,
      effectiveFormula,
      // 目標ごとに推奨されるたんぱく質量が違うので、プリセットの値を渡す
      { proteinPerKg: goal.protein },
    );
  }, [
    ready, sex, ageValue, heightValue, weightValue, bodyFatValue,
    canUseKatch, activity, goal, effectiveFormula,
  ]);

  const lbm = canUseKatch && weightValue != null ? leanBodyMass(weightValue, bodyFatValue) : null;
  const bmiValue = weightValue != null && heightValue != null ? bmi(weightValue, heightValue) : null;

  /** 目標体重を入れたときだけ、到達までの週数を出す。 */
  const weeks =
    result != null && weightValue != null && goalWeightValue != null && !goalWeightError
      ? weeksToGoal(weightValue, goalWeightValue, result.weeklyWeightChangeKg)
      : null;

  return (
    <div className="tool">
      <Slip code="BODY" title="体のデータ">
        <div className="tool__form">
          <Segmented label="性別" options={SEX_OPTIONS} value={sex} onChange={setSex} />
          <div className="row row--3">
            <NumberField
              label="年齢" unit="歳" value={age} onChange={setAge}
              placeholder="30" inputMode="numeric" error={ageError}
            />
            <NumberField
              label="身長" unit="cm" value={height} onChange={setHeight}
              placeholder="172" error={heightError}
            />
            <NumberField
              label="体重" unit="kg" value={weight} onChange={setWeight}
              placeholder="70" error={weightError}
            />
          </div>
          <NumberField
            label="体脂肪率" unit="%（任意）" value={bodyFat} onChange={setBodyFat}
            placeholder="未入力でも計算できます" error={bodyFatError}
            hint="入力すると除脂肪体重が出て、Katch-McArdle式が選べます。"
          />
        </div>
      </Slip>

      <Slip code="GOAL" title="活動量と目標">
        <div className="tool__form">
          <SelectField
            label="1週間の運動量"
            options={ACTIVITY_LEVELS.map((a) => ({
              value: a.key,
              label: `${a.label} — ${a.detail}`,
            }))}
            value={activityKey}
            onChange={setActivityKey}
          />
          <SelectField
            label="目標"
            options={GOAL_PRESETS.map((g) => ({
              value: g.key,
              label: `${g.label} — ${g.detail}・たんぱく質 体重×${g.protein}g`,
            }))}
            value={goalKey}
            onChange={setGoalKey}
          />
          <div className="row row--2">
            <SelectField
              label="基礎代謝の計算式"
              options={[
                { value: 'mifflin' as BmrFormula, label: 'Mifflin-St Jeor（推奨）' },
                { value: 'harris' as BmrFormula, label: 'Harris-Benedict 改訂版' },
                ...(canUseKatch
                  ? [{ value: 'katch' as BmrFormula, label: 'Katch-McArdle' }]
                  : []),
              ]}
              value={effectiveFormula}
              onChange={setFormula}
              hint={canUseKatch ? undefined : '体脂肪率を入れると Katch-McArdle が選べます。'}
            />
            <NumberField
              label="目標体重" unit="kg（任意）" value={goalWeight} onChange={setGoalWeight}
              placeholder="65" error={goalWeightError}
              hint="入れると到達までの週数が出ます。"
            />
          </div>
        </div>
      </Slip>

      {result == null ? (
        <Waiting>年齢・身長・体重を入力すると計算されます。</Waiting>
      ) : (
        <>
          <Slip code="ENERGY" title="1日のカロリー">
            <div className="stats">
              <div>
                <span className="stat__label">基礎代謝（BMR）</span>
                <span className="stat__value">
                  {fmtComma(result.bmr)}
                  <span className="stat__unit">kcal</span>
                </span>
              </div>
              <div>
                <span className="stat__label">消費カロリー（TDEE）</span>
                <span className="stat__value">
                  {fmtComma(result.tdee)}
                  <span className="stat__unit">kcal</span>
                </span>
              </div>
              <div>
                <span className="stat__label">目標カロリー</span>
                <span className="stat__value" style={{ color: 'var(--signal)' }}>
                  {fmtComma(result.targetCalories)}
                  <span className="stat__unit">kcal</span>
                </span>
              </div>
            </div>

            <div className="stats" style={{ marginTop: 'var(--s4)' }}>
              {bmiValue != null && (
                <div>
                  <span className="stat__label">BMI</span>
                  <span className="stat__value">{fmt(bmiValue, 1)}</span>
                </div>
              )}
              {lbm != null && (
                <div>
                  <span className="stat__label">除脂肪体重</span>
                  <span className="stat__value">
                    {fmt(lbm, 1)}
                    <span className="stat__unit">kg</span>
                  </span>
                </div>
              )}
              <div>
                <span className="stat__label">週あたりの体重変化</span>
                <span className="stat__value">
                  {result.weeklyWeightChangeKg > 0 ? '+' : ''}
                  {fmt(result.weeklyWeightChangeKg, 2)}
                  <span className="stat__unit">kg</span>
                </span>
              </div>
              {weeks != null && weeks > 0 && (
                <div>
                  <span className="stat__label">目標体重まで</span>
                  <span className="stat__value">
                    {fmt(weeks, 1)}
                    <span className="stat__unit">週</span>
                  </span>
                </div>
              )}
            </div>

            {weeks == null && goalWeight !== '' && !goalWeightError && (
              <p className="note" style={{ marginTop: 'var(--s4)' }}>
                今の目標設定では、その体重に近づきません。
                目標（減量／維持／増量）の選択を見直してください。
              </p>
            )}

            {result.warnings.length > 0 && (
              <div className="note note--warn" style={{ marginTop: 'var(--s4)' }}>
                <span className="note__title">注意</span>
                <ul style={{ paddingLeft: '1.2em' }}>
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </Slip>

          <Slip code="MACROS" title="PFCの配分">
            <div
              className="macro-bar"
              role="img"
              aria-label={`たんぱく質 ${fmt(result.protein.percent, 0)}%、脂質 ${fmt(result.fat.percent, 0)}%、炭水化物 ${fmt(result.carbs.percent, 0)}%`}
            >
              <span className="macro-bar__part macro-bar__part--p" style={{ width: `${result.protein.percent}%` }} />
              <span className="macro-bar__part macro-bar__part--f" style={{ width: `${result.fat.percent}%` }} />
              <span className="macro-bar__part macro-bar__part--c" style={{ width: `${result.carbs.percent}%` }} />
            </div>
            <ul className="macro-legend">
              <li><i className="p" />たんぱく質 {fmt(result.protein.percent, 0)}%</li>
              <li><i className="f" />脂質 {fmt(result.fat.percent, 0)}%</li>
              <li><i className="c" />炭水化物 {fmt(result.carbs.percent, 0)}%</li>
            </ul>

            <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
              <table className="rows">
                <caption className="visually-hidden">1日あたりのPFC目標量</caption>
                <thead>
                  <tr>
                    <th scope="col">栄養素</th>
                    <th scope="col">1日あたり</th>
                    <th scope="col">カロリー</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">たんぱく質</th>
                    <td>{fmt(result.protein.grams, 0)} g</td>
                    <td>{fmtComma(result.protein.kcal)} kcal</td>
                  </tr>
                  <tr>
                    <th scope="row">脂質</th>
                    <td>{fmt(result.fat.grams, 0)} g</td>
                    <td>{fmtComma(result.fat.kcal)} kcal</td>
                  </tr>
                  <tr>
                    <th scope="row">炭水化物</th>
                    <td>{fmt(result.carbs.grams, 0)} g</td>
                    <td>{fmtComma(result.carbs.kcal)} kcal</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="source-note" style={{ marginTop: 'var(--s3)' }}>
              たんぱく質は体重1kgあたり {goal.protein}g（目標「{goal.label}」の設定）、
              脂質は総カロリーの25%を基準にし、炭水化物に残りを割り当てています。
              ホルモンの維持のため、脂質は体重1kgあたり0.7gを下限にしています。
            </p>

            <p className="next" style={{ marginTop: 'var(--s4)' }}>
              <a href={url('/tools/foods')}>食品ごとのPFCを調べる →</a>
            </p>
          </Slip>

          <p className="note note--warn">
            <span className="note__title">目安として使ってください</span>
            計算式はいずれも統計的な推定で、実際の代謝には個人差があります。
            2〜3週間続けて体重の変化を見ながら調整してください。
            持病がある方や通院中の方は、食事内容を変える前に医師にご相談ください。
          </p>
        </>
      )}

      <p className="source-note">
        基礎代謝の計算式: Mifflin-St Jeor (1990) / Harris-Benedict 改訂版 (Roza &amp; Shizgal 1984) /
        Katch-McArdle。いずれも公表されている計算式です。
        体重の変化は体脂肪1kg ≒ 7,200kcal として換算しています。
      </p>
    </div>
  );
}
