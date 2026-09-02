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
import { buildPersonalPlan } from '../../lib/diagnosis/plan';
import { DISHES, calcDish, dishMealEntries } from '../../lib/dishes';
import { commonFoods, searchFoods, type Food, type NutrientKey } from '../../lib/foods';
import { nutritionPriorities, nutritionProgress, recommendFoods } from '../../lib/foodRecommendations';
import { NUTRITION_REFERENCE_SOURCE } from '../../lib/nutritionReference';
import { ACTIVITIES, activityGroups } from '../../lib/mets';
import { parseMealText, type MealTextResult } from '../../lib/mealText';
import { exercisesByEquipment, findExercise, musclesWorked } from '../../lib/exercises';
import { type BodyInput, type Sex } from '../../lib/nutrition';
import {
  MUSCLE_GROUPS,
  dayBalance,
  groupIntakeItems,
  summarizeExercise,
  summarizeIntake,
  type ExerciseEntry,
  type MealEntry,
  type MealType,
  type MuscleGroup,
} from '../../lib/today';
import { buildTodayCard, drawTodayCard } from '../../lib/todayCard';
import { SITE_NAME } from '../../config/site';
import { url } from '../../lib/url';
import { advanceActiveProgram, localDateKey, readData, saveDailyLog, todayLog, type SavedDietPlan } from '../../lib/storage';
import type { SavedPersonalPlan } from '../../lib/diagnosis/types';
import { resolveTodayAction } from '../../lib/todayAction';
import { programById, sessionForActiveProgram, type ActiveProgram } from '../../lib/programLibrary';
import type { SavedStrengthDiagnosis } from '../../lib/strength/history';
import ShareCard from './ShareCard';
import SavedStrengthSummary from './SavedStrengthSummary';
import { NumberField, Segmented, SelectField, Slip } from './ui';

/** 検索していないときに出す候補の数 */
const SUGGEST_LIMIT = 8;
/** 追加した食品の初期グラム数 */
const DEFAULT_GRAMS = 100;
const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: '朝食' }, { value: 'lunch', label: '昼食' },
  { value: 'dinner', label: '夕食' }, { value: 'snack', label: '間食' },
];

const TODAY_MICRONUTRIENTS: { key: NutrientKey; label: string; unit: string; digits: number }[] = [
  { key: 'vitaminA', label: 'ビタミンA', unit: 'μg RAE', digits: 0 }, { key: 'vitaminD', label: 'ビタミンD', unit: 'μg', digits: 1 },
  { key: 'vitaminB1', label: 'ビタミンB1', unit: 'mg', digits: 2 }, { key: 'vitaminB2', label: 'ビタミンB2', unit: 'mg', digits: 2 },
  { key: 'vitaminB6', label: 'ビタミンB6', unit: 'mg', digits: 2 }, { key: 'vitaminB12', label: 'ビタミンB12', unit: 'μg', digits: 1 },
  { key: 'folate', label: '葉酸', unit: 'μg', digits: 0 }, { key: 'vitaminC', label: 'ビタミンC', unit: 'mg', digits: 0 },
  { key: 'potassium', label: 'カリウム', unit: 'mg', digits: 0 }, { key: 'calcium', label: 'カルシウム', unit: 'mg', digits: 0 },
  { key: 'magnesium', label: 'マグネシウム', unit: 'mg', digits: 0 }, { key: 'iron', label: '鉄', unit: 'mg', digits: 1 },
  { key: 'zinc', label: '亜鉛', unit: 'mg', digits: 1 },
];

export default function TodayTool() {
  const [weight, setWeight] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [steps, setSteps] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [dietPlan, setDietPlan] = useState<SavedDietPlan | null>(null);
  const [personalPlan, setPersonalPlan] = useState<SavedPersonalPlan | null>(null);
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [activeProgramMessage, setActiveProgramMessage] = useState('');
  const [nutritionMessage, setNutritionMessage] = useState('');
  const [strengthHistory, setStrengthHistory] = useState<SavedStrengthDiagnosis[]>([]);

  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [query, setQuery] = useState('');
  const [mealText, setMealText] = useState('');
  const [mealTextResult, setMealTextResult] = useState<MealTextResult | null>(null);
  const [mealType, setMealType] = useState<MealType>('snack');

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
    setPersonalPlan(data.personalPlan);
    setActiveProgram(data.activeProgram);
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
  const mealCards = useMemo(() => groupIntakeItems(intake.items), [intake.items]);
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
  const generatedPersonalPlan = useMemo(
    () => (personalPlan ? buildPersonalPlan(personalPlan.input) : null),
    [personalPlan],
  );
  const activeProgramDefinition = useMemo(() => activeProgram ? programById(activeProgram.programId) : null, [activeProgram]);
  const activeProgramSession = useMemo(() => activeProgram ? sessionForActiveProgram(activeProgram) : null, [activeProgram]);
  /**
   * 画面のいちばん上に出す「今日の一手」。
   * 食事や栄養の詳細より前に、次の1アクションだけを見せる。
   */
  const todayAction = useMemo(
    () => resolveTodayAction({
      activeProgram,
      activeProgramName: activeProgramDefinition?.name ?? null,
      activeProgramSession,
      personalPlan,
      planWorkoutLabel: generatedPersonalPlan?.todayWorkout?.label ?? null,
      trainedToday: doneExercises.length > 0 || muscles.length > 0,
      ateToday: meals.length > 0,
    }),
    [activeProgram, activeProgramDefinition, activeProgramSession, personalPlan, generatedPersonalPlan, doneExercises, muscles, meals],
  );
  const referenceAge = parseNumber(age);
  const referenceSex = sex;
  const nutritionProgressItems = useMemo(
    () => referenceAge != null ? nutritionProgress(intake.totals, referenceSex, referenceAge) : [],
    [intake.totals, referenceSex, referenceAge],
  );
  const nutritionPriorityItems = useMemo(() => nutritionPriorities(nutritionProgressItems), [nutritionProgressItems]);
  const foodRecommendations = useMemo(
    () => referenceAge != null ? recommendFoods(intake.totals, referenceSex, referenceAge, 4) : [],
    [intake.totals, referenceSex, referenceAge],
  );
  const nutritionTarget = useMemo(() => {
    if (dietPlan) return {
      calories: dietPlan.targetCalories,
      protein: dietPlan.proteinGrams,
      fat: dietPlan.fatGrams,
      carbs: dietPlan.carbsGrams,
    };
    if (generatedPersonalPlan?.nutrition) return {
      calories: generatedPersonalPlan.nutrition.calories,
      protein: generatedPersonalPlan.nutrition.protein,
      fat: generatedPersonalPlan.nutrition.fat,
      carbs: generatedPersonalPlan.nutrition.carbs,
    };
    return null;
  }, [dietPlan, generatedPersonalPlan]);
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

  function advanceProgram(action: 'complete' | 'skip') {
    const result = advanceActiveProgram(action);
    if (result == null) {
      setActiveProgramMessage('進行を保存できませんでした。ブラウザの保存設定を確認してください。');
      return;
    }
    setActiveProgram(result.activeProgram);
    setActiveProgramMessage(result.completed ? 'プログラムを完了しました。履歴に保存しました。' : action === 'complete' ? '完了を記録して、次のDayへ進みました。' : 'このDayをスキップして、次へ進みました。');
  }

  function addRecommendedFood(food: Food, grams: number) {
    setMeals((list) => [...list, { foodId: food.id, grams, mealType }]);
    setNutritionMessage(`${food.name}を${MEAL_OPTIONS.find((option) => option.value === mealType)?.label ?? '食事'}に追加しました。`);
  }

  function addMeal(food: Food) {
    setMeals((list) => [...list, { foodId: food.id, grams: DEFAULT_GRAMS, mealType }]);
    setQuery('');
  }

  function addMealText() {
    const parsed = parseMealText(mealText);
    setMealTextResult(parsed);
    if (parsed.meals.length > 0) {
      setMeals((list) => [...list, ...parsed.meals.map((meal) => ({ ...meal, mealType }))]);
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
    setMeals((list) => [...list, ...dishMealEntries(dish, mealType, `${dish.id}-${Date.now()}`)]);
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

  /** 「今日の一手」の行き先。ページ内アンカーはそのまま、ページはベースパスを付ける。 */
  function actionHref(href: string): string {
    return href.startsWith('#') ? href : url(href);
  }

  return (
    <div className="tool">
      {/* 今日の一手。状態にかかわらず、いちばん上に1枚だけ出す。 */}
      <Slip code={todayAction.code} title={todayAction.heading}>
        <div className={`today-action today-action--${todayAction.kind}`}>
          <strong className="today-action__title">{todayAction.title}</strong>
          <p className="today-action__detail">{todayAction.detail}</p>
          <a className="button button--block button--lg" href={actionHref(todayAction.cta.href)}>{todayAction.cta.label}</a>
          {todayAction.secondary && (
            <a className="today-action__secondary" href={actionHref(todayAction.secondary.href)}>{todayAction.secondary.label} →</a>
          )}
        </div>
      </Slip>

      {activeProgram && activeProgramDefinition && (
        <Slip code="ACTIVE" title="今日のトレーニング">
          <div id="active-program" className="today__active-program">
            <span>{activeProgramDefinition.name}</span>
            <strong>Week {activeProgram.currentWeek} / Day {activeProgram.currentDay}</strong>
            {activeProgramSession ? <><p>{activeProgramSession.label}／{activeProgramSession.focus}</p><ul>{activeProgramSession.exercises.map((item) => <li key={item.exerciseId}><span>{item.label}</span><strong>{item.weightKg == null ? item.note ?? 'フォームを保てる負荷で' : `${fmt(item.weightKg, 1)}kg`}</strong><small>{item.sets}セット × {item.reps}回</small></li>)}</ul></> : <p>現在のDayを読み込めませんでした。Program Libraryで条件を確認してください。</p>}
            <a className="button button--block" href={url('/tools/today#workout')}>トレーニングを開始</a>
            <div className="today__active-actions"><button type="button" className="button" onClick={() => advanceProgram('complete')}>完了</button><button type="button" className="button button--quiet" onClick={() => advanceProgram('skip')}>スキップ</button></div>
            {activeProgramMessage && <p className="tool__status" role="status">{activeProgramMessage}</p>}
          </div>
        </Slip>
      )}

      {/* Training → Nutrition → Recovery の順で今日の状態をまとめる。 */}
      {generatedPersonalPlan && (
        <Slip code="TODAY" title="今日やること">
          <div className="today__plan-actions">
            <section>
              <span>今日のトレーニング</span>
              {generatedPersonalPlan.todayWorkout ? <><strong>{generatedPersonalPlan.todayWorkout.label}</strong><p>{generatedPersonalPlan.todayWorkout.exerciseIds.map((id) => findExercise(id)?.name).filter(Boolean).join('・')}</p><a className="button button--block" href={url('/tools/today#workout')}>トレーニングを開始</a></> : <p>今週のトレーニングを予定に入れましょう。</p>}
            </section>
            <section>
              <span>NUTRITION</span>
              {nutritionTarget ? <><strong className="num">{fmt(intakeTotals.kcal, 0)} / {fmt(nutritionTarget.calories, 0)} kcal</strong><p className="num">P {fmt(intakeTotals.protein, 0)} / {nutritionTarget.protein}g</p><a href="#quick-record">食事を記録する →</a></> : <p>Planで栄養目標を確認できます。</p>}
            </section>
            <section>
              <span>RECOVERY</span>
              <strong className="num">{sleepValue == null ? '—' : `${fmt(sleepValue, 1)}h`}</strong><p>{stepsValue == null ? '歩数は未記録' : `${fmt(stepsValue, 0)}歩`}</p>
            </section>
          </div>
          {generatedPersonalPlan.diagnosis.priorities[0] && <div className="today__next-action"><span>NEXT ACTION</span><strong>{generatedPersonalPlan.diagnosis.priorities[0].title}</strong><p>{generatedPersonalPlan.diagnosis.priorities[0].action}</p></div>}
          <p className="next"><a href={url('/plan')}>12週間Planを見る →</a><a href={url('/tools/one-rep-max')}>1RMを更新する →</a></p>
        </Slip>
      )}

      <SavedStrengthSummary history={strengthHistory} title="今日の筋力目標" />

      <div id="quick-record"><Slip code="QUICK" title="今日の食事">
        <section className="today__macro-dashboard" aria-label="今日の食事の摂取量">
          <p className="today__dashboard-title">今日の食事</p>
          {[
            { label: 'kcal', value: intakeTotals.kcal, target: nutritionTarget?.calories ?? null, unit: 'kcal' },
            { label: 'P', value: intakeTotals.protein, target: nutritionTarget?.protein ?? null, unit: 'g' },
            { label: 'F', value: intakeTotals.fat, target: nutritionTarget?.fat ?? null, unit: 'g' },
            { label: 'C', value: intakeTotals.carbs, target: nutritionTarget?.carbs ?? null, unit: 'g' },
          ].map((item) => (
            <div className="today__macro-card" key={item.label}>
              <span>{item.label}</span>
              <strong className="num">{fmt(item.value, 0)} <small>{item.target == null ? item.unit : `/ ${fmt(item.target, 0)}${item.unit}`}</small></strong>
              {item.target != null && <progress value={Math.min(item.value, item.target)} max={item.target} />}
            </div>
          ))}
        </section>
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
      </Slip></div>

      <Slip code="BALANCE" title="今日の栄養バランス">
        {nutritionProgressItems.length === 0 ? <p className="tool__note">プロフィールまたは診断で年齢・性別を保存すると、厚労省の食事摂取基準（2025年版）との今日の進捗を表示します。</p> : <>
          <div className="nutrition-progress__featured">
            {(nutritionPriorityItems.length > 0 ? nutritionPriorityItems : nutritionProgressItems.filter((item) => item.kind !== 'dg-max').slice(0, 6)).slice(0, 6).map((item) => <section key={item.nutrient} className={`nutrition-progress nutrition-progress--${item.state}`}>
              <div><strong>{item.label}</strong><span className="num">{fmt(item.intake, item.digits)} / {fmt(item.value, item.digits)} {item.unit}</span></div>
              <progress value={Math.min(item.intake, item.value)} max={item.value} />
              <small>{item.remaining != null && item.remaining > 0 ? `今日の目安まであと${fmt(item.remaining, item.digits)} ${item.unit}` : '今日の目安に到達'}</small>
            </section>)}
          </div>
          <details className="tool__details nutrition-progress__details"><summary>すべての栄養素を見る</summary>
            {[['ビタミン', ['vitaminA','vitaminD','vitaminE','vitaminK','vitaminB1','vitaminB2','vitaminB6','vitaminB12','folate','pantothenic','biotin','vitaminC']], ['ミネラル', ['potassium','calcium','magnesium','phosphorus','iron','zinc','copper','manganese']], ['その他', ['fiber','salt']]].map(([title, keys]) => <section key={String(title)} className="nutrition-progress__group"><h3>{title}</h3>{nutritionProgressItems.filter((item) => (keys as string[]).includes(item.nutrient)).map((item) => <div key={item.nutrient} className={`nutrition-progress nutrition-progress--${item.state}`}><div><strong>{item.label}</strong>{item.status === 'unresolved' ? <span>基準未確定</span> : <span className="num">{fmt(item.intake, item.digits)} / {fmt(item.value, item.digits)} {item.unit}</span>}</div>{item.status === 'unresolved' ? <small>{item.unresolvedReason}</small> : item.kind === 'dg-max' ? <small>{item.state === 'over' ? '今日は目安を超えています' : `目標上限まであと${fmt(item.remaining ?? 0, item.digits)} ${item.unit}`}</small> : <><progress value={Math.min(item.intake, item.value)} max={item.value} /><small>{item.remaining != null && item.remaining > 0 ? `今日の目安まであと${fmt(item.remaining, item.digits)} ${item.unit}` : '今日の目安に到達'}</small></>}</div>)}</section>)}
          </details>
          {/* 食品候補は最初から開くと情報の壁になる。必要な人だけ開く。 */}
          <details className="tool__details"><summary>今日あと何食べる？を見る</summary>
          <section className="nutrition-recommendations"><div className="nutrition-recommendations__heading"><span>WHAT TO EAT</span><h3>今日あと何食べる？</h3><p>成分表の食品から、今日の目安までの距離を埋めやすい候補を出します。</p></div><Segmented label="追加する食事" options={MEAL_OPTIONS} value={mealType} onChange={setMealType} />
            {foodRecommendations.length === 0 ? <p className="tool__note">表示できる範囲の栄養素は、今日の目安に到達しています。</p> : <div className="nutrition-recommendations__grid">{foodRecommendations.map((recommendation) => <article key={recommendation.food.id} className="nutrition-recommendation-card"><span className="nutrition-recommendation-card__emoji" aria-hidden="true">{recommendation.food.emoji ?? '🍽️'}</span><div><strong>{recommendation.food.name}</strong><small>{recommendation.serving.label}</small></div><p>{recommendation.reason}</p><ul>{recommendation.contributions.slice(0, 2).map((contribution) => <li key={contribution.nutrient.nutrient}>{contribution.nutrient.label} <strong>+{fmt(contribution.value, contribution.nutrient.digits)} {contribution.nutrient.unit}</strong></li>)}</ul><button type="button" className="button button--block" onClick={() => addRecommendedFood(recommendation.food, recommendation.serving.grams)}>今日の食事に追加</button></article>)}</div>}
            {nutritionMessage && <p className="tool__status" role="status">{nutritionMessage}</p>}
          </section>
          </details>
          <p className="tool__note">1日の値だけで栄養状態を診断するものではありません。栄養成分: 日本食品標準成分表（八訂）増補2023年／基準値: {NUTRITION_REFERENCE_SOURCE.title}・{NUTRITION_REFERENCE_SOURCE.publisher}</p>
        </>}
      </Slip>

      {/* --- 食べたもの --- */}
      <Slip code="EAT" title="食べたもの">
        <Segmented label="食事区分" options={MEAL_OPTIONS} value={mealType} onChange={setMealType} />
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

        <div id="meals" className="today__meal-cards">
          {MEAL_OPTIONS.map((group) => {
            const cards = mealCards.filter((item) => item.mealType === group.value);
            const kcal = cards.reduce((sum, item) => sum + (item.kcal ?? 0), 0);
            return (
              <section key={group.value} className="today__meal-card">
                <h3><span>{group.label}</span><strong className="num">{cards.length === 0 ? '—' : `${fmt(kcal, 0)} kcal`}</strong></h3>
                {cards.length === 0 ? <p className="today__meal-empty">まだ追加されていません</p> : <ul className="today__list">
                  {cards.map((card) => <li className={`today__food-card${card.dishId ? ' today__food-card--dish' : ''}`} key={card.id}>
                    <div className="today__food-card-head">
                      <div><strong>{card.name}</strong><span className="num">{card.kcal == null ? 'データなし' : `${fmt(card.kcal, 0)} kcal`}　P {card.protein == null ? '—' : fmt(card.protein, 0)} / F {card.fat == null ? '—' : fmt(card.fat, 0)} / C {card.carbs == null ? '—' : fmt(card.carbs, 0)}</span></div>
                      <button type="button" className="today__remove" onClick={() => setMeals((list) => list.filter((_, index) => !card.entryIndexes.includes(index)))} aria-label={`${card.name}を削除`}>×</button>
                    </div>
                    {card.dishId ? <details className="today__dish-ingredients"><summary>材料を見る（{card.ingredients.length}品）</summary><ul>{card.ingredients.map((ingredient) => <li key={ingredient.entryIndex}><span>{ingredient.name}</span><input className="today__grams" type="text" inputMode="decimal" value={String(meals[ingredient.entryIndex]?.grams ?? '')} onChange={(event) => setGrams(ingredient.entryIndex, event.target.value)} aria-label={`${ingredient.name}のグラム数`} /><span>g</span></li>)}</ul></details> : <div className="today__food-card-single"><input className="today__grams" type="text" inputMode="decimal" value={String(meals[card.entryIndexes[0]]?.grams ?? '')} onChange={(event) => setGrams(card.entryIndexes[0]!, event.target.value)} aria-label={`${card.name}のグラム数`} /><span>g</span></div>}
                  </li>)}
                </ul>}
              </section>
            );
          })}
        </div>
      </Slip>

      {/* --- 動いたもの --- */}
      <div id="workout">
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

      </div>

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

            <details className="food__nutrient-group" style={{ marginTop: 'var(--s4)' }}>
              <summary>今日のビタミン・ミネラル摂取量</summary>
              <div className="food__nutrient-grid" style={{ marginTop: 'var(--s2)' }}>
                {TODAY_MICRONUTRIENTS.map((nutrient) => (
                  <div key={nutrient.key} className="food__nutrient-card">
                    <span className="food__nutrient-label">{nutrient.label}</span>
                    <strong className="food__nutrient-value num">{fmt(intakeTotals[nutrient.key], nutrient.digits)}</strong>
                    <span className="food__nutrient-unit">{nutrient.unit}</span>
                  </div>
                ))}
              </div>
              <p className="tool__note" style={{ marginTop: 'var(--s2)' }}>上部の「今日の栄養バランス」で、年齢・性別に応じた目安との進捗を確認できます。</p>
            </details>

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
