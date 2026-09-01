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
 * 【端末内に保存】
 * 明示的に保存した日の記録だけ localStorage に残す。サーバーには送らない。
 */

import { useEffect, useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import { DISHES, calcDish } from '../../lib/dishes';
import { commonFoods, searchFoods, type Food } from '../../lib/foods';
import { ACTIVITIES, activityGroups } from '../../lib/mets';
import { parseMealText, type MealTextResult } from '../../lib/mealText';
import { exercisesByEquipment, findExercise, musclesWorked } from '../../lib/exercises';
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
import { buildTodayCard, drawTodayCard } from '../../lib/todayCard';
import { SITE_NAME } from '../../config/site';
import { url } from '../../lib/url';
import { localDateKey, readData, saveDailyLog, todayLog, type SavedDietPlan } from '../../lib/storage';
import type { SavedStrengthDiagnosis } from '../../lib/strength/history';
import ShareCard from './ShareCard';
import SavedStrengthSummary from './SavedStrengthSummary';
import { NumberField, Segmented, SelectField, Slip } from './ui';

/** 検索していないときに出す候補の数 */
const SUGGEST_LIMIT = 8;
/** 追加した食品の初期グラム数 */
const DEFAULT_GRAMS = 100;

export default function TodayTool() {
  const [weight, setWeight] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [steps, setSteps] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [dietPlan, setDietPlan] = useState<SavedDietPlan | null>(null);
  const [strengthHistory, setStrengthHistory] = useState<SavedStrengthDiagnosis[]>([]);

  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [query, setQuery] = useState('');
  const [mealText, setMealText] = useState('');
  const [mealTextResult, setMealTextResult] = useState<MealTextResult | null>(null);

  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [activityId, setActivityId] = useState(ACTIVITIES[0].id);
  const [minutes, setMinutes] = useState('30');

  const [muscles, setMuscles] = useState<MuscleGroup[]>([]);
  /**
   * やった筋トレ種目。部位だけを選ぶ形だと「胸」としか残らず、
   * ベンチプレスもダンベルフライも同じ記録になってしまう。
   */
  const [doneExercises, setDoneExercises] = useState<string[]>([]);

  // 「1か月で何kg」を出すのに要る情報。押した人だけ入力する
  const [detailed, setDetailed] = useState(false);
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');

  useEffect(() => {
    const data = readData();
    const saved = todayLog(data);
    const latest = [...data.dailyLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .find((item) => item.weightKg != null);
    const profile = data.profile;
    setDietPlan(data.dietPlan);
    setStrengthHistory(data.strengthHistory);

    const savedWeight =
      saved?.weightKg ??
      latest?.weightKg ??
      profile?.weightKg ??
      data.strengthProfile?.bodyweightKg;
    if (savedWeight != null) setWeight(String(savedWeight));
    if (saved) {
      setMeals(saved.meals);
      setExercises(saved.exercises);
      setMuscles(saved.muscles);
      setDoneExercises(saved.doneExercises);
      setManualCalories(saved.manualIntake.kcal == null ? '' : String(saved.manualIntake.kcal));
      setManualProtein(saved.manualIntake.protein == null ? '' : String(saved.manualIntake.protein));
      setSteps(saved.steps == null ? '' : String(saved.steps));
      setSleepHours(saved.sleepHours == null ? '' : String(saved.sleepHours));
    }
    if (profile) {
      setDetailed(true);
      setSex(profile.sex);
      setAge(String(profile.age));
      setHeight(String(profile.heightCm));
    }
  }, []);

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
  const manualKcalValue = parseNumber(manualCalories);
  const manualProteinValue = parseNumber(manualProtein);
  const stepsValue = parseNumber(steps);
  const sleepValue = parseNumber(sleepHours);
  const caloriesError = manualCalories !== '' && (manualKcalValue == null || manualKcalValue < 0 || manualKcalValue > 20_000)
    ? '0〜20,000kcalの範囲で入力してください。'
    : undefined;
  const proteinError = manualProtein !== '' && (manualProteinValue == null || manualProteinValue < 0 || manualProteinValue > 1_000)
    ? '0〜1,000gの範囲で入力してください。'
    : undefined;
  const stepsError = steps !== '' && (stepsValue == null || stepsValue < 0 || stepsValue > 200_000 || !Number.isInteger(stepsValue))
    ? '0〜200,000の整数で入力してください。'
    : undefined;
  const sleepError = sleepHours !== '' && (sleepValue == null || sleepValue < 0 || sleepValue > 24)
    ? '0〜24時間の範囲で入力してください。'
    : undefined;
  const intakeTotals = useMemo(
    () => ({
      ...intake.totals,
      kcal: manualKcalValue ?? intake.totals.kcal,
      protein: manualProteinValue ?? intake.totals.protein,
    }),
    [intake.totals, manualKcalValue, manualProteinValue],
  );
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
    return dayBalance(body, intakeTotals.kcal, exercise.kcal);
  }, [detailed, weightKg, exercise, intakeTotals.kcal, sex, age, height]);

  function addMeal(food: Food) {
    setMeals((list) => [...list, { foodId: food.id, grams: DEFAULT_GRAMS }]);
    setQuery('');
  }

  function addMealText() {
    const parsed = parseMealText(mealText);
    setMealTextResult(parsed);
    if (parsed.meals.length > 0) {
      setMeals((list) => [...list, ...parsed.meals]);
      setMealText('');
    }
  }

  /**
   * 料理をまとめて追加する。
   * 料理は材料の組み合わせとして持っているので、その材料をそのまま入れる。
   * 内訳が記録に残るので、あとから「卵は1個だった」と直せる。
   */
  function addDish(dishId: string) {
    const dish = DISHES.find((d) => d.id === dishId);
    if (dish == null) return;
    setMeals((list) => [
      ...list,
      ...dish.ingredients.map((i) => ({ foodId: i.foodId, grams: i.grams })),
    ]);
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

  /**
   * 鍛えた部位。選んだ種目から出したものと、手で足したものを合わせる。
   * 種目から出したほうを主働筋、手で足したぶんもそこに含める
   * （手で足す人は「狙って鍛えた部位」を入れているため）。
   */
  const worked = useMemo(() => {
    const fromExercises = musclesWorked(doneExercises);
    const primary = [...new Set<string>([...fromExercises.primary, ...muscles])];
    const secondary = fromExercises.secondary.filter((muscle) => !primary.includes(muscle));
    return { primary, secondary };
  }, [doneExercises, muscles]);

  function toggleExercise(id: string) {
    setDoneExercises((list) =>
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
    );
  }

  function toggleMuscle(group: MuscleGroup) {
    setMuscles((list) =>
      list.includes(group) ? list.filter((g) => g !== group) : [...list, group],
    );
  }

  // 筋トレの種目や部位だけを記録したい日もあるので、それだけでも集計を出す
  const hasAnything =
    meals.length > 0 ||
    exercises.length > 0 ||
    doneExercises.length > 0 ||
    muscles.length > 0 ||
    manualCalories !== '' ||
    manualProtein !== '' ||
    weight !== '' ||
    steps !== '' ||
    sleepHours !== '';

  function saveTodayRecord() {
    if (weightError || caloriesError || proteinError || stepsError || sleepError) {
      setSaveMessage('赤く表示された入力を確認してください。');
      return;
    }
    const saved = saveDailyLog({
      date: localDateKey(),
      savedAt: new Date().toISOString(),
      weightKg: weightKg ?? null,
      meals,
      exercises,
      muscles,
      doneExercises,
      manualIntake: {
        kcal: manualKcalValue != null && manualKcalValue >= 0 ? manualKcalValue : null,
        protein: manualProteinValue != null && manualProteinValue >= 0 ? manualProteinValue : null,
      },
      steps: stepsValue != null && stepsValue >= 0 ? stepsValue : null,
      sleepHours: sleepValue != null && sleepValue >= 0 && sleepValue <= 24 ? sleepValue : null,
    });
    setSaveMessage(saved ? '今日の記録を保存しました。' : '保存できませんでした。ブラウザの保存設定を確認してください。');
  }

  return (
    <div className="tool">
      <Slip code="QUICK" title="10秒で今日を記録">
        <NumberField
          label="今日の体重"
          unit="kg"
          value={weight}
          onChange={setWeight}
          placeholder="70"
          error={weightError}
          hint="前回の記録があれば自動で入ります。"
        />
        <div className="row">
          <NumberField
            label="摂取カロリー"
            unit="kcal"
            value={manualCalories}
            onChange={setManualCalories}
            placeholder="2050"
            inputMode="numeric"
            hint="食品を細かく追加しない日は合計だけでOK"
            error={caloriesError}
          />
          <NumberField
            label="たんぱく質"
            unit="g"
            value={manualProtein}
            onChange={setManualProtein}
            placeholder="142"
            inputMode="decimal"
            error={proteinError}
          />
        </div>
        {dietPlan && (
          <div className="today__targets" aria-label="今日の計画達成状況">
            <div>
              <span>今日</span>
              <strong className="num">{fmt(intakeTotals.kcal, 0)} / {fmt(dietPlan.targetCalories, 0)} kcal</strong>
              <progress value={Math.min(intakeTotals.kcal, dietPlan.targetCalories)} max={dietPlan.targetCalories} />
            </div>
            <div>
              <span>Protein</span>
              <strong className="num">{fmt(intakeTotals.protein, 0)} / {fmt(dietPlan.proteinGrams, 0)}g</strong>
              <progress value={Math.min(intakeTotals.protein, dietPlan.proteinGrams)} max={dietPlan.proteinGrams} />
            </div>
          </div>
        )}
        <details className="today__quickDetails">
          <summary>歩数・睡眠も記録する</summary>
          <div className="row">
            <NumberField label="歩数" unit="歩" value={steps} onChange={setSteps} placeholder="8000" inputMode="numeric" error={stepsError} />
            <NumberField label="睡眠" unit="時間" value={sleepHours} onChange={setSleepHours} placeholder="7.5" error={sleepError} />
          </div>
        </details>
        <button type="button" className="button button--block button--lg" onClick={saveTodayRecord}>
          今日の記録を保存
        </button>
        {saveMessage && <p className="tool__status" role="status">{saveMessage}</p>}
        <p className="tool__note">この端末にのみ保存します。サーバーへの送信はありません。</p>
      </Slip>

      <SavedStrengthSummary history={strengthHistory} title="今日の筋力目標" />

      {/* --- 食べたもの --- */}
      <Slip code="EAT" title="食べたもの">
        <div className="today__natural">
          <NumberField
            label="まとめて入力"
            value={mealText}
            onChange={setMealText}
            placeholder="卵2個、ご飯200g、納豆"
            hint="料理辞書・部分一致・数量だけで解析します。AIへの送信はありません。"
          />
          <button type="button" className="button button--block" onClick={addMealText} disabled={mealText.trim() === ''}>
            食事リストに追加
          </button>
          {mealTextResult && (
            <div className="today__parseResult" role="status">
              {mealTextResult.matched.length > 0 && <p><strong>追加:</strong> {mealTextResult.matched.join('、')}</p>}
              {mealTextResult.assumptions.length > 0 && <p><strong>分量の仮定:</strong> {mealTextResult.assumptions.join('／')}</p>}
              {mealTextResult.unmatched.length > 0 && <p><strong>判断できなかったもの:</strong> {mealTextResult.unmatched.join('、')}（推測では追加していません）</p>}
            </div>
          )}
        </div>

        <NumberField
          label="食品を追加"
          value={query}
          onChange={setQuery}
          placeholder="ごはん / 鶏むね / ビール"
          hint="押すと100gで追加します。あとから分量を変えられます。"
        />

        {/* よく食べる料理は、材料をまとめて入れられるようにする */}
        <div className="today__dishes">
          <span className="field__label">料理からまとめて追加</span>
          <div className="today__chips">
            {DISHES.map((dish) => (
              <button
                key={dish.id}
                type="button"
                className="today__chip"
                onClick={() => addDish(dish.id)}
              >
                <span aria-hidden="true">{dish.emoji} </span>
                {dish.name}
                <span className="today__chip-kcal">
                  {Math.round(calcDish(dish).totals.kcal)}
                </span>
              </button>
            ))}
          </div>
        </div>

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

        {/* やった種目を選ぶ。部位は種目から決まるので入力させない */}
        <details className="today__exercises">
          <summary className="today__exercisesSummary">
            筋トレの種目を選ぶ
            {doneExercises.length > 0 && <span className="num"> （{doneExercises.length}種目）</span>}
          </summary>
          {exercisesByEquipment().map((group) => (
            <fieldset key={group.equipment} className="today__muscles">
              <legend className="field__label">{group.equipment}</legend>
              <div className="today__chips">
                {group.exercises.map((exercise) => (
                  <button
                    key={exercise.id}
                    type="button"
                    className={`today__chip${doneExercises.includes(exercise.id) ? ' is-on' : ''}`}
                    aria-pressed={doneExercises.includes(exercise.id)}
                    onClick={() => toggleExercise(exercise.id)}
                  >
                    {exercise.name}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </details>

        {/* 種目を選ばずに部位だけ残したい人のための入力。
            種目を選んでいればそちらが優先されるので、その旨を出す。 */}
        <fieldset className="today__muscles">
          <legend className="field__label">
            {doneExercises.length > 0
              ? '部位を手で足す（種目から出したものに加算されます）'
              : '鍛えた部位（種目を選ばない場合）'}
          </legend>
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
                <span className="stat__value num">{fmt(intakeTotals.kcal, 0)}</span>
                <span className="stat__unit">kcal</span>
              </div>
              <div className="stat">
                <span className="stat__label">運動で消費</span>
                <span className="stat__value num">{fmt(exercise?.kcal ?? 0, 0)}</span>
                <span className="stat__unit">kcal</span>
              </div>
              <div className="stat stat--primary">
                <span className="stat__label">たんぱく質</span>
                <span className="stat__value num">{fmt(intakeTotals.protein, 0)}</span>
                <span className="stat__unit">g</span>
              </div>
            </div>

            <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
              <table className="rows">
                <caption className="visually-hidden">今日の栄養素の合計</caption>
                <tbody>
                  <tr>
                    <th scope="row">脂質</th>
                    <td>{fmt(intakeTotals.fat, 1)} g</td>
                    <th scope="row">炭水化物</th>
                    <td>{fmt(intakeTotals.carbs, 1)} g</td>
                  </tr>
                  <tr>
                    <th scope="row">食物繊維</th>
                    <td>{fmt(intakeTotals.fiber, 1)} g</td>
                    <th scope="row">食塩</th>
                    <td>{fmt(intakeTotals.salt, 1)} g</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {Object.keys(intake.missing).length > 0 && (
              <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                成分表で未測定の項目があった食品が含まれています。その分は合計に足していません。
              </p>
            )}

            {worked.primary.length > 0 && (
              <p className="today__muscle-result">
                鍛えた部位: <strong>{worked.primary.join('・')}</strong>
                {worked.secondary.length > 0 && (
                  <span className="today__muscle-sub">
                    　補助的に使った部位: {worked.secondary.join('・')}
                  </span>
                )}
              </p>
            )}

            {doneExercises.length > 0 && (
              <p className="today__done">
                やった種目:{' '}
                {doneExercises
                  .map((id) => findExercise(id)?.name)
                  .filter(Boolean)
                  .join('・')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- 共有カード。記録の要点だけを1枚にする --- */}
      {hasAnything && intakeTotals.kcal > 0 && (
        <Slip code="SHARE" title="今日の記録を保存・共有する">
          <ShareCard
            draw={(ctx) =>
              drawTodayCard(
                ctx,
                buildTodayCard({
                  date: new Date().toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                  intake: intakeTotals,
                  exerciseKcal: exercise?.kcal ?? 0,
                  muscles: worked.primary,
                  balance,
                }),
                SITE_NAME,
              )
            }
            filename="bodymakers-today.png"
            title="今日の記録"
            revision={`${Math.round(intakeTotals.kcal)}-${Math.round(exercise?.kcal ?? 0)}-${worked.primary.join()}-${balance ? Math.round(balance.balanceKcal) : 'x'}`}
          />
        </Slip>
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
        <span className="note__title">保存先はこの端末だけです</span>
        「今日の記録を保存」を押した内容はブラウザのlocalStorageに保存されます。
        Bodymakersのサーバーには送信されません。ホームの「端末内データを削除」から全履歴を消せます。
      </p>

      <p className="next">
        <a href={url('/articles/energy-balance-basics')}>ダイエットの仕組みを読む →</a>
        <a href={url('/tools/plan')}>ダイエット計画を立てる →</a>
        <a href={url('/tools/burn')}>運動の消費カロリーを調べる →</a>
      </p>
    </div>
  );
}
