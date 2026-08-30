/**
 * 今日の記録。
 *
 * 食べたものと動いたものを1画面で足し合わせ、
 * 摂取・消費・その差し引きと、「この調子なら1か月で何kg」を出す。
 *
 * 【入力の設計】
 * 体重だけで摂取と消費の合計は出る。
 * 「1か月で何kg」は基礎代謝が要るので、身長・年齢を入れた人にだけ出す。
 * 全部入力しないと何も出ない作りにはしない。
 *
 * 【保存しない】
 * 入力はこのページの state にしか無い。リロードすれば消える。
 */

import { useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import { commonFoods, searchFoods, type Food } from '../../lib/foods';
import { ACTIVITIES, activityGroups } from '../../lib/mets';
import { type BodyInput, type Sex } from '../../lib/nutrition';
import {
  MUSCLE_GROUPS,
  dayBalance,
  summarizeExercise,
  summarizeIntake,
  type ExerciseEntry,
  type MealEntry,
  type MuscleGroup,
} from '../../lib/today';
import { url } from '../../lib/url';
import { NumberField, Segmented, SelectField, Slip } from './ui';

/** 検索していないときに出す候補の数 */
const SUGGEST_LIMIT = 8;
/** 追加した食品の初期グラム数 */
const DEFAULT_GRAMS = 100;

export default function TodayTool() {
  const [weight, setWeight] = useState('');

  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [query, setQuery] = useState('');

  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [activityId, setActivityId] = useState(ACTIVITIES[0].id);
  const [minutes, setMinutes] = useState('30');

  const [muscles, setMuscles] = useState<MuscleGroup[]>([]);

  // 「1か月で何kg」を出すのに要る情報。押した人だけ入力する
  const [detailed, setDetailed] = useState(false);
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');

  const weightKg = parseNumber(weight);
  const weightError =
    weight !== '' && (weightKg == null || weightKg < 30 || weightKg > 300)
      ? '30〜300kg の範囲で入力してください。'
      : undefined;

  /** 検索語があれば検索、無ければよく食べる食品から候補を出す */
  const suggestions = useMemo<Food[]>(() => {
    if (query.trim() !== '') return searchFoods(query, { limit: SUGGEST_LIMIT });
    return commonFoods().slice(0, SUGGEST_LIMIT);
  }, [query]);

  const intake = useMemo(() => summarizeIntake(meals), [meals]);
  const exercise = useMemo(
    () => (weightKg == null ? null : summarizeExercise(exercises, weightKg)),
    [exercises, weightKg],
  );

  const balance = useMemo(() => {
    if (!detailed || weightKg == null || exercise == null) return null;
    const ageValue = parseNumber(age);
    const heightValue = parseNumber(height);
    if (ageValue == null || heightValue == null) return null;
    const body: BodyInput = {
      sex,
      age: ageValue,
      heightCm: heightValue,
      weightKg,
      bodyFatPercent: null,
    };
    return dayBalance(body, intake.totals.kcal, exercise.kcal);
  }, [detailed, weightKg, exercise, intake.totals.kcal, sex, age, height]);

  function addMeal(food: Food) {
    setMeals((list) => [...list, { foodId: food.id, grams: DEFAULT_GRAMS }]);
    setQuery('');
  }

  function setGrams(index: number, value: string) {
    const grams = parseNumber(value);
    setMeals((list) =>
      list.map((entry, i) => (i === index ? { ...entry, grams: grams ?? 0 } : entry)),
    );
  }

  function addExercise() {
    const value = parseNumber(minutes);
    if (value == null || value <= 0) return;
    setExercises((list) => [...list, { activityId, minutes: value }]);
  }

  function toggleMuscle(group: MuscleGroup) {
    setMuscles((list) =>
      list.includes(group) ? list.filter((g) => g !== group) : [...list, group],
    );
  }

  const hasAnything = meals.length > 0 || exercises.length > 0;

  return (
    <div className="tool">
      <Slip code="BODY" title="はじめに">
        <NumberField
          label="今の体重"
          unit="kg"
          value={weight}
          onChange={setWeight}
          placeholder="70"
          error={weightError}
          hint="消費カロリーの計算に使います。これだけ入れれば合計は出ます。"
        />
      </Slip>

      {/* --- 食べたもの --- */}
      <Slip code="EAT" title="食べたもの">
        <NumberField
          label="食品を追加"
          value={query}
          onChange={setQuery}
          placeholder="ごはん / 鶏むね / ビール"
          hint="押すと100gで追加します。あとから分量を変えられます。"
        />

        <ul className="today__suggest">
          {suggestions.map((food) => (
            <li key={food.id}>
              <button type="button" className="today__add" onClick={() => addMeal(food)}>
                <span className="today__add-name">
                  {food.emoji && <span aria-hidden="true">{food.emoji} </span>}
                  {food.name}
                </span>
                <span className="today__add-kcal num">
                  {fmt(food.kcal, 0)}
                  <small> kcal/100g</small>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {meals.length > 0 && (
          <ul className="today__list">
            {intake.items.map((item, index) => (
              <li className="today__row" key={`${item.foodId}-${index}`}>
                <span className="today__row-name">{item.name}</span>
                <input
                  className="today__grams"
                  type="text"
                  inputMode="decimal"
                  value={String(meals[index]?.grams ?? '')}
                  onChange={(event) => setGrams(index, event.target.value)}
                  aria-label={`${item.name}のグラム数`}
                />
                <span className="today__row-unit">g</span>
                <span className="today__row-kcal num">
                  {item.kcal == null ? 'データなし' : `${fmt(item.kcal, 0)} kcal`}
                </span>
                <button
                  type="button"
                  className="today__remove"
                  onClick={() => setMeals((list) => list.filter((_, i) => i !== index))}
                  aria-label={`${item.name}を削除`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Slip>

      {/* --- 動いたもの --- */}
      <Slip code="MOVE" title="動いたもの">
        <div className="row">
          <SelectField
            label="何をした？"
            value={activityId}
            onChange={setActivityId}
            options={activityGroups().flatMap((g) =>
              g.items.map((a) => ({ value: a.id, label: `${g.group}／${a.label}` })),
            )}
          />
          <NumberField
            label="何分"
            unit="分"
            value={minutes}
            onChange={setMinutes}
            placeholder="30"
            inputMode="numeric"
          />
        </div>

        <button type="button" className="button button--block" onClick={addExercise}>
          運動を追加する
        </button>

        {exercise && exercise.items.length > 0 && (
          <ul className="today__list">
            {exercise.items.map((item, index) => (
              <li className="today__row" key={`${item.activityId}-${index}`}>
                <span className="today__row-name">{item.label}</span>
                <span className="today__row-unit">{item.minutes}分</span>
                <span className="today__row-kcal num">{fmt(item.kcal, 0)} kcal</span>
                <button
                  type="button"
                  className="today__remove"
                  onClick={() => setExercises((list) => list.filter((_, i) => i !== index))}
                  aria-label={`${item.label}を削除`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {exercises.length === 0 && weightKg == null && (
          <p className="tool__note">体重を入れると、運動の消費カロリーを計算できます。</p>
        )}

        {/* 部位は計算で求まるものではなく、選んだ内容をそのまま記録する */}
        <fieldset className="today__muscles">
          <legend className="field__label">鍛えた部位（筋トレをした場合）</legend>
          <div className="today__chips">
            {MUSCLE_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                className={`today__chip${muscles.includes(group) ? ' is-on' : ''}`}
                aria-pressed={muscles.includes(group)}
                onClick={() => toggleMuscle(group)}
              >
                {group}
              </button>
            ))}
          </div>
        </fieldset>
      </Slip>

      {/* --- 集計 --- */}
      {hasAnything && (
        <div className="slip record lv-intermediate">
          <div className="slip__band">
            <span>TODAY</span>
            <span>今日の合計</span>
          </div>
          <div className="record__body">
            <div className="stats">
              <div className="stat">
                <span className="stat__label">食べた</span>
                <span className="stat__value num">{fmt(intake.totals.kcal, 0)}</span>
                <span className="stat__unit">kcal</span>
              </div>
              <div className="stat">
                <span className="stat__label">運動で消費</span>
                <span className="stat__value num">{fmt(exercise?.kcal ?? 0, 0)}</span>
                <span className="stat__unit">kcal</span>
              </div>
              <div className="stat stat--primary">
                <span className="stat__label">たんぱく質</span>
                <span className="stat__value num">{fmt(intake.totals.protein, 0)}</span>
                <span className="stat__unit">g</span>
              </div>
            </div>

            <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
              <table className="rows">
                <caption className="visually-hidden">今日の栄養素の合計</caption>
                <tbody>
                  <tr>
                    <th scope="row">脂質</th>
                    <td>{fmt(intake.totals.fat, 1)} g</td>
                    <th scope="row">炭水化物</th>
                    <td>{fmt(intake.totals.carbs, 1)} g</td>
                  </tr>
                  <tr>
                    <th scope="row">食物繊維</th>
                    <td>{fmt(intake.totals.fiber, 1)} g</td>
                    <th scope="row">食塩</th>
                    <td>{fmt(intake.totals.salt, 1)} g</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {Object.keys(intake.missing).length > 0 && (
              <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                成分表で未測定の項目があった食品が含まれています。その分は合計に足していません。
              </p>
            )}

            {muscles.length > 0 && (
              <p className="today__muscle-result">
                鍛えた部位: <strong>{muscles.join('・')}</strong>
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- 1か月の見通し --- */}
      {hasAnything && (
        <Slip code="PACE" title="この調子だと">
          {!detailed ? (
            <div className="plan__upgrade">
              <p className="plan__upgrade-text">
                身長・年齢を入れると、今日の収支から
                <strong>1か月でどれくらい体重が動くか</strong>まで出せます。
              </p>
              <button
                type="button"
                className="button button--block"
                onClick={() => setDetailed(true)}
              >
                1か月の見通しを出す
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

              {balance ? (
                <>
                  <div className="stats" style={{ marginTop: 'var(--s4)' }}>
                    <div className="stat">
                      <span className="stat__label">消費の合計</span>
                      <span className="stat__value num">{fmt(balance.burnKcal, 0)}</span>
                      <span className="stat__unit">kcal</span>
                    </div>
                    <div className="stat stat--primary">
                      <span className="stat__label">今日の収支</span>
                      <span className="stat__value num">
                        {balance.balanceKcal < 0 ? '−' : '+'}
                        {fmt(Math.abs(balance.balanceKcal), 0)}
                      </span>
                      <span className="stat__unit">kcal</span>
                    </div>
                    <div className="stat">
                      <span className="stat__label">1か月で</span>
                      <span className="stat__value num">
                        {balance.monthlyChangeKg < 0 ? '−' : '+'}
                        {fmt(Math.abs(balance.monthlyChangeKg), 1)}
                      </span>
                      <span className="stat__unit">kg</span>
                    </div>
                  </div>

                  <p className="note" style={{ marginTop: 'var(--s4)' }}>
                    <span className="note__title">運動ぶんを二重に数えないようにしています</span>
                    土台の消費は「基礎代謝 × 1.2（運動をしない日）」で見積もり、
                    そこへ入力された運動ぶんを足しています。活動レベルの係数で消費を出すと、
                    その中に運動ぶんが含まれてしまうためです。
                  </p>

                  <p className="note note--warn" style={{ marginTop: 'var(--s3)' }}>
                    <span className="note__title">1か月の数字は「今日と同じ日が30日続いたら」の計算です</span>
                    実際には体重が減れば基礎代謝も下がるため、同じ割合では進みません。
                    体重の増減には水分も含まれ、体脂肪だけが動くわけでもありません。目安として見てください。
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
      )}

      <p className="note">
        <span className="note__title">入力は保存されません</span>
        食べたものも運動も、この画面の中だけで計算しています。送信も保存もしていないので、
        ページを閉じると消えます。残したい場合はスクリーンショットを撮ってください。
      </p>

      <p className="next">
        <a href={url('/tools/plan')}>ダイエット計画を立てる →</a>
        <a href={url('/tools/burn')}>運動の消費カロリーを調べる →</a>
      </p>
    </div>
  );
}
