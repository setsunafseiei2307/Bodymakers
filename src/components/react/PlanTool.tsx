/**
 * 減量・増量の計画ツール。
 *
 * 「◯月までに◯kg落としたい」に、必要な速さと現実性を返す。
 *
 * 【入力の設計】
 * 体重・目標体重・目標日の3つだけで結果が出る。身長や年齢の入力を必須にすると、
 * その場で試す人が離れるため。詳しく入れた人にだけ、1日の目標カロリーと
 * PFCまで出す（精度は上がるが、無くても計画の判定はできる）。
 */

import { useMemo, useState, type SyntheticEvent } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import {
  ACTIVITY_LEVELS,
  KCAL_PER_KG_FAT,
  calcBMR,
  calcMacros,
  type BodyInput,
  type Sex,
} from '../../lib/nutrition';
import {
  PACE_BANDS,
  PACE_SOURCES,
  buildPlan,
  validatePlanInput,
  weeksUntil,
  type PaceVerdict,
  type PlanResult,
} from '../../lib/plan';
import { url } from '../../lib/url';
import { DateField, NumberField, SelectField, Segmented, Slip } from './ui';

/**
 * 判定ごとの見出しと色。
 *
 * 目標を持って来た人に「無理だ」と言い渡す画面にはしない。
 * どの速さでも計算結果は出したうえで、その速さで何が起きやすいかを添える。
 * 見出しは可否ではなく、速さの度合いだけを表す言葉にしている。
 */
const VERDICT_TEXT: Record<PaceVerdict, { label: string; tone: string }> = {
  gentle: { label: 'じっくりコース', tone: 'lv-novice' },
  recommended: { label: 'ちょうどいいペース', tone: 'lv-intermediate' },
  fast: { label: 'ややがんばるペース', tone: 'lv-advanced' },
  aggressive: { label: 'かなり攻めたペース', tone: 'lv-elite' },
};

/** 今日から数えて既定で置く目標日（3か月後）。 */
function defaultTargetDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return toDateValue(d);
}

function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** YYYY-MM-DD を「2026年11月30日」にする。 */
function formatDate(value: string): string {
  const [y, m, d] = value.split('-').map((n) => Number(n));
  if (!y || !m || !d) return value;
  return `${y}年${m}月${d}日`;
}

/** 週数を今日からの日付に直す。 */
function dateAfterWeeks(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return formatDate(toDateValue(d));
}

export default function PlanTool() {
  const [weight, setWeight] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(defaultTargetDate);
  const [submitted, setSubmitted] = useState(false);

  // 詳しい入力。開いた人にだけ1日の目標カロリーとPFCまで出す
  const [detailed, setDetailed] = useState(false);
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [activity, setActivity] = useState(ACTIVITY_LEVELS[2].key);

  const weightKg = parseNumber(weight);
  const targetWeightKg = parseNumber(target);
  const weeks = useMemo(() => {
    if (date === '') return null;
    const [y, m, d] = date.split('-').map(Number);
    if (!y || !m || !d) return null;
    return weeksUntil(new Date(y, m - 1, d));
  }, [date]);

  const errors = useMemo(() => {
    if (!submitted) return [];
    return validatePlanInput({
      weightKg: weightKg ?? NaN,
      targetWeightKg: targetWeightKg ?? NaN,
      weeks: weeks ?? NaN,
    });
  }, [submitted, weightKg, targetWeightKg, weeks]);

  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  const plan = useMemo<PlanResult | null>(() => {
    if (!submitted || weightKg == null || targetWeightKg == null || weeks == null) return null;
    return buildPlan({ weightKg, targetWeightKg, weeks });
  }, [submitted, weightKg, targetWeightKg, weeks]);

  /** 詳しい入力がそろっていれば、1日の目標カロリーとPFCを出す。 */
  const macros = useMemo(() => {
    if (plan == null || !detailed) return null;
    const ageValue = parseNumber(age);
    const heightValue = parseNumber(height);
    if (ageValue == null || heightValue == null || weightKg == null) return null;

    const body: BodyInput = {
      sex,
      age: ageValue,
      heightCm: heightValue,
      weightKg,
      bodyFatPercent: null,
    };
    const factor = ACTIVITY_LEVELS.find((a) => a.key === activity)?.factor;
    const bmr = calcBMR(body);
    if (factor == null || bmr == null) return null;

    const tdee = bmr * factor;

    // 期限が無理な計画では、そこから出た過不足をそのまま摂取カロリーに直すと
    // 飢餓状態の数字が「1日の目標」として出てしまう。
    // その場合は推奨ペースの上限から出した過不足に置き換える。
    const capped = plan.verdict === 'aggressive';
    const gap = capped ? plan.recommendedDailyKcalGap.steepest : plan.dailyKcalGap;

    const ratio = gap / tdee;
    const result = calcMacros(body, factor, ratio, 'mifflin', {
      proteinPerKg: plan.mode === 'cut' ? 2.2 : 1.8,
    });
    return result == null ? null : { ...result, capped };
  }, [plan, detailed, sex, age, height, activity, weightKg]);

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    setSubmitted(true);
  }

  function reset() {
    setWeight('');
    setTarget('');
    setDate(defaultTargetDate());
    setSubmitted(false);
    setDetailed(false);
    setAge('');
    setHeight('');
  }

  const verdict = plan ? VERDICT_TEXT[plan.verdict] : null;
  const band = plan ? PACE_BANDS[plan.mode] : null;

  return (
    <div className="tool">
      <form onSubmit={submit} noValidate>
        <Slip code="PLAN" title="いつまでに、何kg">
          <div className="row">
            <NumberField
              label="今の体重"
              unit="kg"
              value={weight}
              onChange={setWeight}
              placeholder="80"
              error={errorFor('weightKg')}
            />
            <NumberField
              label="目標体重"
              unit="kg"
              value={target}
              onChange={setTarget}
              placeholder="72"
              error={errorFor('targetWeightKg')}
            />
          </div>

          <DateField
            label="目標日"
            value={date}
            onChange={setDate}
            min={toDateValue(new Date())}
            error={errorFor('weeks')}
            hint="この日までに届くかどうかを判定します。"
          />

          <div className="tool__actions">
            <button type="submit" className="button button--lg button--block">
              計画を立てる
            </button>
            {submitted && (
              <button type="button" className="button button--ghost button--block" onClick={reset}>
                入力をクリア
              </button>
            )}
          </div>

          <p className="tool__note">
            入力した内容は送信も保存もされません。この端末の中だけで計算しています。
          </p>
        </Slip>
      </form>

      {plan && verdict && band && (
        <>
          <div className={`slip record ${verdict.tone}`}>
            <div className="slip__band">
              <span>{plan.mode === 'cut' ? 'FAT LOSS PLAN' : 'WEIGHT GAIN PLAN'}</span>
              <span>{formatDate(date)}まで</span>
            </div>

            <div className="record__body">
              <p className="record__meta">
                <span>
                  {fmt(plan.totalChangeKg, 1)}kg {plan.mode === 'cut' ? '減らす' : '増やす'}
                </span>
                <span>あと{fmt(plan.weeks, 0)}週</span>
              </p>

              <div className="record__head">
                <p className="record__level">{verdict.label}</p>
                <p className="record__ratio">
                  <span>週あたり</span>
                  <em className="num">{fmt(plan.weeklyPercent, 2)}%</em>
                </p>
              </div>

              <div className="record__bar" aria-hidden="true" />

              <p className="record__total">
                週 <b className="num">{fmt(plan.weeklyChangeKg, 2)}</b> kg
                <span className="record__sep">/</span>1日
                <b className="num">
                  {' '}
                  {plan.dailyKcalGap < 0 ? '−' : '+'}
                  {fmt(Math.abs(plan.dailyKcalGap), 0)}
                </b>{' '}
                kcal
              </p>

              <div className="record__rule" />

              <p className="plan__verdict">
                {plan.verdict === 'recommended' && (
                  <>
                    いいペースです。この速さは
                    {plan.mode === 'cut'
                      ? '、落ちるぶんに筋肉が含まれにくいとされる'
                      : '、増えるぶんの脂肪を抑えやすいとされる'}
                    <strong>週{band.min}〜{band.max}%</strong>の範囲に収まっています。
                    生活を大きく変えずに続けやすい範囲でもあります。
                  </>
                )}
                {plan.verdict === 'gentle' && (
                  <>
                    余裕のあるペースです。多少ゆらいでも取り返せるので、
                    はじめての方や、長く続けたい方に向いています。
                    もう少し早めたいときは、
                    <strong>{dateAfterWeeks(plan.recommendedWeeks.slowest)}</strong>
                    あたりを目標にする手もあります。
                  </>
                )}
                {plan.verdict === 'fast' && (
                  <>
                    ややがんばりが要るペースです。計算上はこの期限で届きます。
                    ただ{plan.mode === 'cut'
                      ? '、体には環境に慣れようとする働き（ホメオスタシス）があり、減量が進むほど消費カロリーも下がっていきます。後半は同じ食事量でも落ちにくくなるかもしれません。'
                      : '、増えるスピードが上がるほど、増えた体重に占める脂肪の割合も上がっていきます。'}
                    <strong>{dateAfterWeeks(plan.recommendedWeeks.fastest)}</strong>
                    ごろまで見ておくと、気持ちに余裕を持って進められます。
                  </>
                )}
                {plan.verdict === 'aggressive' && (
                  <>
                    かなり攻めたペースです。理論上は1日
                    <strong>
                      {plan.dailyKcalGap < 0 ? '−' : '+'}
                      {fmt(Math.abs(plan.dailyKcalGap), 0)}kcal
                    </strong>
                    で届く計算になります。
                    {plan.mode === 'cut' ? (
                      <>
                        {' '}
                        ただ正直なところ、この速さを保つのは簡単ではありません。
                        体には環境に慣れようとする働き（ホメオスタシス）があり、
                        減量が進むと消費カロリーが体重の減少以上に下がることが報告されています。
                        後半は同じ食事量でも落ちにくくなり、日常生活もしんどくなりがちです。
                      </>
                    ) : (
                      <>
                        {' '}
                        ただこの速さだと、増えた体重の多くが脂肪になりやすくなります。
                        あとで落とす手間を考えると、急がないほうが近道かもしれません。
                      </>
                    )}{' '}
                    <strong>{dateAfterWeeks(plan.recommendedWeeks.fastest)}</strong>
                    ごろを目安にすると、続けながら届きやすくなります。
                  </>
                )}
              </p>

              <div className="plan__grid">
                <div className="plan__cell">
                  <span className="plan__cell-label">推奨ペースなら</span>
                  <span className="plan__cell-value num">
                    {fmt(plan.recommendedWeeks.fastest, 0)}〜{fmt(plan.recommendedWeeks.slowest, 0)}週
                  </span>
                  <span className="plan__cell-note">
                    {dateAfterWeeks(plan.recommendedWeeks.fastest)}〜
                    {dateAfterWeeks(plan.recommendedWeeks.slowest)}
                  </span>
                </div>
                <div className="plan__cell">
                  <span className="plan__cell-label">この期限で届く範囲</span>
                  <span className="plan__cell-value num">
                    {fmt(plan.reachableChangeKg.min, 1)}〜{fmt(plan.reachableChangeKg.max, 1)}kg
                  </span>
                  <span className="plan__cell-note">推奨ペースで進めた場合</span>
                </div>
              </div>
            </div>
          </div>

          {/* --- 詳しく入れた人にだけ、1日の目標カロリーとPFCを出す --- */}
          <Slip code="INTAKE" title="1日の目標カロリー">
            {!detailed ? (
              <div className="plan__upgrade">
                <p className="plan__upgrade-text">
                  身長・年齢・活動量を入れると、この計画に必要な
                  <strong>1日の目標カロリーとPFC</strong>まで出せます。
                </p>
                <button
                  type="button"
                  className="button button--block"
                  onClick={() => setDetailed(true)}
                >
                  もっと正確に出す
                </button>
              </div>
            ) : (
              <>
                <Segmented
                  label="性別"
                  value={sex}
                  onChange={setSex}
                  options={[
                    { value: 'male', label: '男性' },
                    { value: 'female', label: '女性' },
                  ]}
                  hint="基礎代謝の推定式が男女で異なるため使います。"
                />
                <div className="row">
                  <NumberField
                    label="身長"
                    unit="cm"
                    value={height}
                    onChange={setHeight}
                    placeholder="172"
                  />
                  <NumberField
                    label="年齢"
                    unit="歳"
                    value={age}
                    onChange={setAge}
                    placeholder="30"
                    inputMode="numeric"
                  />
                </div>
                <SelectField
                  label="活動量"
                  value={activity}
                  onChange={setActivity}
                  options={ACTIVITY_LEVELS.map((a) => ({
                    value: a.key,
                    label: `${a.label}（${a.detail}）`,
                  }))}
                />

                {macros ? (
                  <>
                    {macros.capped && (
                      <p className="note note--warn" style={{ marginTop: 'var(--s4)' }}>
                        <span className="note__title">続けやすいペースで計算しています</span>
                        設定した目標日に合わせると食事量がかなり少なくなってしまうため、
                        ここでは週{PACE_BANDS[plan.mode].max}%
                        （{plan.mode === 'cut' ? '筋肉を保ちやすいとされる上限' : '脂肪を抑えやすいとされる上限'}）
                        で進めた場合の数字を出しています。目標日を少し後ろにずらすと、
                        この食事量のまま届きます。
                      </p>
                    )}

                    <div className="stats" style={{ marginTop: 'var(--s4)' }}>
                      <div className="stat">
                        <span className="stat__label">消費（推定）</span>
                        <span className="stat__value num">{fmt(macros.tdee, 0)}</span>
                        <span className="stat__unit">kcal</span>
                      </div>
                      <div className="stat stat--primary">
                        <span className="stat__label">1日の目標</span>
                        <span className="stat__value num">{fmt(macros.targetCalories, 0)}</span>
                        <span className="stat__unit">kcal</span>
                      </div>
                      <div className="stat">
                        <span className="stat__label">基礎代謝</span>
                        <span className="stat__value num">{fmt(macros.bmr, 0)}</span>
                        <span className="stat__unit">kcal</span>
                      </div>
                    </div>

                    <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
                      <table className="rows">
                        <caption className="visually-hidden">1日のPFC目標</caption>
                        <thead>
                          <tr>
                            <th scope="col">栄養素</th>
                            <th scope="col">1日</th>
                            <th scope="col">割合</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <th scope="row">たんぱく質</th>
                            <td>{fmt(macros.protein.grams, 0)} g</td>
                            <td>{fmt(macros.protein.percent, 0)}%</td>
                          </tr>
                          <tr>
                            <th scope="row">脂質</th>
                            <td>{fmt(macros.fat.grams, 0)} g</td>
                            <td>{fmt(macros.fat.percent, 0)}%</td>
                          </tr>
                          <tr>
                            <th scope="row">炭水化物</th>
                            <td>{fmt(macros.carbs.grams, 0)} g</td>
                            <td>{fmt(macros.carbs.percent, 0)}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {macros.warnings.map((warning) => (
                      <p className="note note--warn" key={warning} style={{ marginTop: 'var(--s3)' }}>
                        {warning}
                      </p>
                    ))}

                    <p className="next" style={{ marginTop: 'var(--s4)' }}>
                      <a href={url('/articles/energy-balance-basics')}>
                        ダイエットの仕組みを読む →
                      </a>
                      <a href={url('/articles/pfc-balance-basics')}>PFCの決め方を読む →</a>
                      <a href={url('/tools/foods')}>食品の栄養価を調べる →</a>
                    </p>
                  </>
                ) : (
                  <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                    身長と年齢を入れると計算します。
                  </p>
                )}
              </>
            )}
          </Slip>

          <Slip code="SOURCE" title="この判定の根拠">
            <p className="note">
              <span className="note__title">体重1kgあたり{KCAL_PER_KG_FAT.toLocaleString('ja-JP')}kcalで計算しています</span>
              体脂肪1kgぶんのエネルギーは出典によって幅があり、厚生労働省の解説では約7,000kcal、
              脂肪組織の約8割が脂質という前提での計算値は7,200kcal、
              原典とされる Wishnofsky (1958) は約7,700kcal です。
              当サイトは日本で広く使われている7,200kcalを採っています。
              どれを使っても1割前後の差が出るため、<strong>結果は目安として扱ってください</strong>。
              また、体重の増減には水分や消化管の内容物も含まれ、体脂肪だけが動くわけではありません。
            </p>

            <ul className="plan__sources">
              {PACE_SOURCES.map((source) => (
                <li key={source.id}>
                  <span className="plan__source-label">{source.label}</span>
                  <span className="plan__source-note">{source.note}</span>
                  <span className="plan__source-cite">
                    {source.citation}{' '}
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      原文
                    </a>
                  </span>
                </li>
              ))}
            </ul>

            <p className="note note--warn" style={{ marginTop: 'var(--s4)' }}>
              <span className="note__title">結果の読み方</span>
              推奨の範囲は研究で示された目安であり、必ずこの通りに体重が動くことを保証するものでは
              ありません。体組成・年齢・服薬・持病によって適切な速さは変わります。
              健康状態に不安がある場合は、自己判断で進めず医療機関にご相談ください。
            </p>
          </Slip>
        </>
      )}
    </div>
  );
}
