/**
 * PFC・カロリー計算ツール。
 *
 * 基礎代謝（BMR）→ 消費カロリー（TDEE）→ 目標カロリー → PFC配分 の順に求める。
 * 体脂肪率を入れると除脂肪体重が出せるので、より精度の高い Katch-McArdle 式が使える。
 *
 * 計算は src/lib/nutrition.ts の純関数で行い、ここは入力と表示だけを担当する。
 *
 * 【画面の並べ方】
 * 来た人がまず知りたいのは「何kcal食べればいいか」で、BMRやTDEEはその根拠。
 * だから目標カロリーとPFCを先に出し、内訳は畳んで下に置く。
 * 精度を上げるための項目（体脂肪率・目標体重・計算式）も、最初から全部見せない。
 */

import { useEffect, useMemo, useRef, useState } from 'react';

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
import { buildStartQuery } from '../../lib/nutritionCta';
import { readData } from '../../lib/storage';
import { NumberField, Segmented, SelectField } from './ui';
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

/**
 * 目標の言い換え。
 * 「リーンバルク」「TDEE −20%」は、はじめて来た人には通じない。
 * 計算に使う GOAL_PRESETS の値は変えず、表示だけを平易にする。
 */
const GOAL_PLAIN: Record<string, string> = {
  cut: 'しっかり落とす',
  slowcut: 'ゆるやかに落とす',
  maintain: '今の体重をキープ',
  leanbulk: '脂肪を抑えて増やす',
  bulk: 'しっかり増やす',
};

/** 活動量の言い換え。ACTIVITY_LEVELS の値は変えない。 */
const ACTIVITY_PLAIN: Record<string, string> = {
  sedentary: 'ほぼ運動なし（デスクワーク中心）',
  light: '軽め（週1〜3回）',
  moderate: '普通（週3〜5回）',
  active: '高め（週6〜7回）',
  athlete: '非常に高い（1日2回・肉体労働あり）',
};

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
  /** 保存済みプロフィールから初期値を入れたかどうか。表示の出し分けだけに使う。 */
  const [restored, setRestored] = useState(false);

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

  /** 維持に必要なカロリーとの差。ユーザーが最初に知りたいのはこの向きと量。 */
  const diff = result != null ? result.targetCalories - result.tdee : null;

  /**
   * 端末に保存済みのプロフィールがあれば、最初の1回だけ初期値に使う。
   * 読むだけで、この画面からは何も保存しない。
   * すでに何か入力していれば触らない。
   */
  const restoreCheckedRef = useRef(false);
  useEffect(() => {
    if (restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    // 入力が初期状態のときだけ補う。
    if (age !== '' || height !== '' || weight !== '') return;
    try {
      const profile = readData().profile;
      if (profile == null) return;
      setSex(profile.sex);
      setAge(String(profile.age));
      setHeight(String(profile.heightCm));
      setWeight(String(profile.weightKg));
      const matched = ACTIVITY_LEVELS.find((item) => item.key === profile.activity);
      if (matched != null) setActivityKey(matched.key);
      setRestored(true);
    } catch {
      // 保存領域を読めない環境でも、手入力で普通に使えればよい。
    }
  }, []);

  function clearRestored() {
    setAge('');
    setHeight('');
    setWeight('');
    setBodyFat('');
    setGoalWeight('');
    setRestored(false);
  }

  /** 結果が初めて出たときだけ、結果まで送る。以降は勝手に動かさない。 */
  const resultRef = useRef<HTMLElement>(null);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!ready || scrolledRef.current) return;
    scrolledRef.current = true;
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [ready]);

  return (
    <div className="tool nutri">
      {/* --- 目標 --- */}
      <section className="nutri-card nutri-goal">
        <h2 id="nutri-goal-label">目標を選ぶ</h2>
        <p className="nutri-sub">いちばん近いものを1つ選んでください。あとから変えられます。</p>

        <div className="nutri-choices" role="radiogroup" aria-labelledby="nutri-goal-label">
          {GOAL_PRESETS.map((preset) => {
            const selected = preset.key === goalKey;
            return (
              <button
                key={preset.key}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`nutri-choice${selected ? ' is-selected' : ''}`}
                onClick={() => setGoalKey(preset.key)}
              >
                <span className="nutri-choice__label">{GOAL_PLAIN[preset.key] ?? preset.label}</span>
                <span className="nutri-choice__detail">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* --- 体のデータ --- */}
      <section className="nutri-card">
        <h2>体のデータ</h2>
        <p className="nutri-sub">年齢・身長・体重の3つだけで計算できます。</p>

        {restored && (
          <p className="nutri-restored" role="status">
            前回の入力から復元しました
            <button type="button" onClick={clearRestored}>クリア</button>
          </p>
        )}

        <div className="tool__form">
          <Segmented label="性別" options={SEX_OPTIONS} value={sex} onChange={setSex} />
          <div className="nutri-row3">
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
          <SelectField
            label="1週間の運動量"
            options={ACTIVITY_LEVELS.map((a) => ({
              value: a.key,
              label: ACTIVITY_PLAIN[a.key] ?? `${a.label} — ${a.detail}`,
            }))}
            value={activityKey}
            onChange={setActivityKey}
          />
        </div>

        <details className="nutri-details">
          <summary>精度を上げる（任意）</summary>
          <div className="tool__form nutri-details__body">
            <NumberField
              label="体脂肪率" unit="%（任意）" value={bodyFat} onChange={setBodyFat}
              placeholder="例: 18" error={bodyFatError}
              hint="入力すると除脂肪体重が出て、Katch-McArdle式が選べます。"
            />
            <NumberField
              label="目標体重" unit="kg（任意）" value={goalWeight} onChange={setGoalWeight}
              placeholder="例: 65" error={goalWeightError}
              hint="入れると到達までの週数が出ます。"
            />
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
          </div>
        </details>
      </section>

      {/* --- 目標カロリー。未入力でも場所を空けておく。 --- */}
      <section ref={resultRef} className="nutri-card nutri-primary" aria-live="polite">
        <h2>あなたの1日の目安</h2>

        <p className="nutri-kcal">
          <span className="nutri-kcal__value">{result == null ? '—' : fmtComma(result.targetCalories)}</span>
          <span className="nutri-kcal__unit">kcal</span>
        </p>

        {result == null || diff == null ? (
          <p className="nutri-sub">年齢・身長・体重を入れると、ここに目標カロリーが出ます</p>
        ) : (
          <p className="nutri-sub">
            {diff === 0
              ? '維持に必要なカロリーと同じです'
              : `維持に必要な ${fmtComma(result.tdee)} kcal より ${fmtComma(Math.abs(diff))} kcal ${diff < 0 ? '少なめ' : '多め'}です`}
          </p>
        )}

        {result != null && result.warnings.length > 0 && (
          <div className="note note--warn" style={{ marginTop: 'var(--s4)' }}>
            <span className="note__title">注意</span>
            <ul style={{ paddingLeft: '1.2em' }}>
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {result != null && (
        <>
          {/* --- PFC --- */}
          <section className="nutri-card">
            <h2>1日に食べる量の目安</h2>

            <div className="nutri-macros">
              <div>
                <span className="nutri-macro__label">たんぱく質</span>
                <span className="nutri-macro__value">{fmt(result.protein.grams, 0)}<small> g</small></span>
                <span className="nutri-macro__percent">{fmt(result.protein.percent, 0)}%</span>
              </div>
              <div>
                <span className="nutri-macro__label">脂質</span>
                <span className="nutri-macro__value">{fmt(result.fat.grams, 0)}<small> g</small></span>
                <span className="nutri-macro__percent">{fmt(result.fat.percent, 0)}%</span>
              </div>
              <div>
                <span className="nutri-macro__label">炭水化物</span>
                <span className="nutri-macro__value">{fmt(result.carbs.grams, 0)}<small> g</small></span>
                <span className="nutri-macro__percent">{fmt(result.carbs.percent, 0)}%</span>
              </div>
            </div>

            <div
              className="macro-bar"
              role="img"
              aria-label={`たんぱく質 ${fmt(result.protein.percent, 0)}%、脂質 ${fmt(result.fat.percent, 0)}%、炭水化物 ${fmt(result.carbs.percent, 0)}%`}
            >
              <span className="macro-bar__part macro-bar__part--p" style={{ width: `${result.protein.percent}%` }} />
              <span className="macro-bar__part macro-bar__part--f" style={{ width: `${result.fat.percent}%` }} />
              <span className="macro-bar__part macro-bar__part--c" style={{ width: `${result.carbs.percent}%` }} />
            </div>

            <p className="next nutri-secondary-link">
              <a href={url('/tools/foods')}>食品ごとのPFCを調べる →</a>
            </p>
          </section>

          <p className="note note--warn">
            <span className="note__title">目安として使ってください</span>
            計算式はいずれも統計的な推定で、実際の代謝には個人差があります。
            2〜3週間続けて体重の変化を見ながら調整してください。
            持病がある方や通院中の方は、食事内容を変える前に医師にご相談ください。
          </p>

          {/* --- 続けられる形へつなぐ --- */}
          <section className="nutri-card nutri-cta">
            <h2>この数字を、続けられる計画にしませんか</h2>
            <p className="nutri-sub">
              1〜2分の質問に答えると、12週間の計画と「今日やること」まで出ます。登録不要です。
            </p>
            <a
              className="button button--block button--lg"
              href={`${url('/start')}${buildStartQuery(weightValue, goalWeightValue)}`}
            >
              この結果から自分用のPlanを作る
            </a>
            <p className="nutri-sub">
              この計算結果は保存されません。Planを作成すると、その後の記録はこの端末に保存されます。
            </p>
          </section>

          {/* --- 内訳。根拠は畳んで下に置く。 --- */}
          <details className="nutri-card nutri-details nutri-breakdown">
            <summary>計算の内訳を見る</summary>
            <div className="nutri-details__body">
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
            </div>
          </details>
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
