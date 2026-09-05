/**
 * Today の状態とロジック。
 *
 * 【なぜ切り出したか】
 * TodayTool.tsx は1275行あり、状態・計算・保存・描画が1ファイルに同居していた。
 * 画面を「今日やること」だけの入口へ作り直すにあたって、描画の分割と
 * 状態の持ち方を同時に触ると壊した場所が分からなくなる。
 * そこで、まず状態とロジックをこのhookへそのまま移した。
 * 計算式・保存の呼び出し・localStorageの扱いは1行も変えていない。
 *
 * 返り値の型は ReturnType で自動導出する（TodayViewContext）。
 * 画面側はこのオブジェクトを受け取り、必要なものだけを取り出して描く。
 */

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

import { DEFAULT_GRAMS, MEAL_OPTIONS, SUGGEST_LIMIT } from './constants';

import { parseNumber } from '../../../lib/format';
import { buildPersonalPlan } from '../../../lib/diagnosis/plan';
import { DISHES, dishMealEntries } from '../../../lib/dishes';
import { commonFoods, searchFoods, type Food } from '../../../lib/foods';
import { frequentFoods, lastAmountFor } from '../../../lib/foodHistory';
import { nutritionPriorities, nutritionProgress, recommendFoods } from '../../../lib/foodRecommendations';
import { ACTIVITIES } from '../../../lib/mets';
import { parseMealText, type MealTextResult } from '../../../lib/mealText';
import { musclesWorked } from '../../../lib/exercises';
import { type BodyInput, type Sex } from '../../../lib/nutrition';
import {
  dayBalance,
  groupIntakeItems,
  summarizeExercise,
  summarizeIntake,
  type ExerciseEntry,
  type MealEntry,
  type MealType,
  type MuscleGroup,
} from '../../../lib/today';
import { url } from '../../../lib/url';
import { advanceActiveProgram, applyNutritionAdjustment, localDateKey, readData, resetNutritionAdjustment, saveDailyLog, saveTrainingSession, setNutritionComplete as storeNutritionComplete, todayLog, type BodymakersData, type DailyLog } from '../../../lib/storage';
import type { SavedPersonalPlan } from '../../../lib/diagnosis/types';
import { resolveTodayAction } from '../../../lib/todayAction';
import { adjustSession, adjustmentSummaryLines, emptyTrainingAdjustments, recentAdjustments } from '../../../lib/training/adaptive';
import { blankLog, buildWeeklySummary, summarizeActivity, todayProgress, weeklyProgress } from '../../../lib/activity';
import {
  directionFor,
  nutritionAdherence,
  nutritionTargetReason,
  periodKeyFor,
  recommendNutrition,
  resolveNutritionTarget,
  weightTrend,
} from '../../../lib/nutritionAdaptive';
import { buildWeeklyCoach } from '../../../lib/coach';
import { buildFirstWeekProgress } from '../../../lib/onboarding';
import { draftSessionFromProgram, findSessionLog, hasRecordedSets, previousPerformance, type PreviousPerformance, type TrainingSessionLog } from '../../../lib/training/log';
import { buildNextSessionPreview, buildSessionFeedback, type SessionFeedback } from '../../../lib/training/feedback';
import { programById, sessionForActiveProgram, type ActiveProgram } from '../../../lib/programLibrary';
import type { SavedStrengthDiagnosis } from '../../../lib/strength/history';

export function useTodayState() {
  const [weight, setWeight] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [steps, setSteps] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [personalPlan, setPersonalPlan] = useState<SavedPersonalPlan | null>(null);
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [activeProgramMessage, setActiveProgramMessage] = useState('');
  const [nutritionMessage, setNutritionMessage] = useState('');
  const [strengthHistory, setStrengthHistory] = useState<SavedStrengthDiagnosis[]>([]);
  /** 継続日数と直近7日の集計に使う、端末内データそのもの。 */
  const [savedData, setSavedData] = useState<BodymakersData | null>(null);
  /** いま記録中のセッション。予定値から作り、押した内容をここへ入れていく。 */
  const [sessionLog, setSessionLog] = useState<TrainingSessionLog | null>(null);
  /** 完了直後だけ出すまとめ。閉じたら消える一時的な表示。 */
  const [sessionFeedback, setSessionFeedback] = useState<SessionFeedback | null>(null);
  /** その日の食事記録が揃ったという印。 */
  const [nutritionComplete, setNutritionComplete] = useState(false);
  const [nutritionMessage2, setNutritionMessage2] = useState('');
  /** 直前に追加した食品の数。押し間違いをその場で戻せるようにする。 */
  const [lastAddedCount, setLastAddedCount] = useState(0);

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
    setPersonalPlan(data.personalPlan);
    setActiveProgram(data.activeProgram);
    setStrengthHistory(data.strengthHistory);
    setSavedData(data);

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
      setNutritionComplete(saved.nutritionComplete);
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
  /**
   * 提示重量は、Programが出した重量に実績から積み上げたズレを足したもの。
   * Program側の週次progressionはそのまま使うので、二重には足さない。
   */
  const trainingAdjustments = savedData?.trainingAdjustments ?? emptyTrainingAdjustments();
  const activeProgramSession = useMemo(() => {
    if (activeProgram == null) return null;
    const session = sessionForActiveProgram(activeProgram);
    return session == null ? null : adjustSession(session, trainingAdjustments);
  }, [activeProgram, trainingAdjustments]);
  /**
   * 記録用の下敷きを用意する。
   * すでに押した実績が保存されていればそれを、無ければ予定値から作る。
   */
  useEffect(() => {
    if (activeProgram == null || activeProgramSession == null || savedData == null) {
      setSessionLog(null);
      return;
    }
    setSessionLog((current) => {
      const key = `${activeProgram.programId}:w${activeProgram.currentWeek}d${activeProgram.currentDay}`;
      if (current != null && current.sessionKey === key) return current;
      return findSessionLog(savedData.trainingSessions, key)
        ?? draftSessionFromProgram(activeProgram, activeProgramSession, localDateKey());
    });
  }, [activeProgram, activeProgramSession, savedData]);

  /** 種目ごとの前回実績。今日の提示重量には影響させず、参考として横に出すだけ。 */
  const previousByExercise = useMemo(() => {
    const map = new Map<string, PreviousPerformance>();
    if (savedData == null || sessionLog == null) return map;
    for (const exercise of sessionLog.exercises) {
      const last = previousPerformance(savedData.trainingSessions, exercise.exerciseId, sessionLog.sessionKey);
      if (last != null) map.set(exercise.exerciseId, last);
    }
    return map;
  }, [savedData, sessionLog]);

  /**
   * 次回の予定。Todayが出す重量と同じ経路で作るので、表示がずれない。
   * 保存済みデータから毎回作り直すため、読み込み直しても同じ結果になる。
   */
  const nextPreview = useMemo(
    () => buildNextSessionPreview(activeProgram, trainingAdjustments),
    [activeProgram, trainingAdjustments],
  );

  /**
   * よく食べるもの。保存済みの記録からその場で数えるので、
   * お気に入り用の保存領域は持たない。
   */
  const frequent = useMemo(
    () => (savedData == null ? [] : frequentFoods(savedData.dailyLogs, { limit: 6 })),
    [savedData],
  );

  /** 使いはじめの段階。初週のあいだは重い集計を前に出さない。 */
  const firstWeek = useMemo(() => (savedData == null ? null : buildFirstWeekProgress(savedData)), [savedData]);

  /** 今週のまとめ。Todayでは「今日やること」より小さく扱う。 */
  const coach = useMemo(() => (savedData == null ? null : buildWeeklyCoach(savedData)), [savedData]);

  const adjustmentLines = useMemo(() => adjustmentSummaryLines(trainingAdjustments), [trainingAdjustments]);
  const adjustmentHistory = useMemo(() => recentAdjustments(trainingAdjustments, 5), [trainingAdjustments]);
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

  /**
   * 画面で編集中の内容を、今日の1日分として組み立てる。
   * 保存前でも「記録済み」に変わるので、入れた手応えがその場で返る。
   */
  const liveTodayLog = useMemo<DailyLog>(() => ({
    ...blankLog(localDateKey()),
    weightKg: weightKg ?? null,
    meals,
    exercises,
    muscles,
    doneExercises,
    manualIntake: { kcal: manualKcalValue ?? null, protein: manualProteinValue ?? null },
    steps: stepsValue ?? null,
    sleepHours: sleepValue ?? null,
  }), [weightKg, meals, exercises, muscles, doneExercises, manualKcalValue, manualProteinValue, stepsValue, sleepValue]);

  /** 継続の集計は、保存済みの記録に「編集中の今日」を重ねてから数える。 */
  const liveData = useMemo<BodymakersData | null>(() => {
    if (savedData == null) return null;
    const today = liveTodayLog.date;
    return { ...savedData, dailyLogs: [...savedData.dailyLogs.filter((log) => log.date !== today), liveTodayLog] };
  }, [savedData, liveTodayLog]);

  const activitySummary = useMemo(() => liveData ? summarizeActivity(liveData) : null, [liveData]);
  const dailyProgress = useMemo(() => liveData ? todayProgress(liveData, liveTodayLog) : null, [liveData, liveTodayLog]);
  const week = useMemo(() => liveData ? weeklyProgress(liveData) : null, [liveData]);
  const weeklySummary = useMemo(() => liveData ? buildWeeklySummary(liveData) : null, [liveData]);

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
  /**
   * 1日の栄養目標。Plan・Record・Reviewと同じ resolver を使う。
   * 画面ごとに別の計算を持たない。
   */
  const nutritionTarget = useMemo(
    () => (savedData == null ? null : resolveNutritionTarget(savedData)),
    [savedData],
  );
  const nutritionReason = useMemo(() => nutritionTargetReason(nutritionTarget), [nutritionTarget]);

  /** 直近2週間の体重と、今週の食事記録から出す見直しの提案。 */
  const nutritionReview = useMemo(() => {
    if (savedData == null) return null;
    const trend = weightTrend(savedData.dailyLogs);
    const adherence = nutritionAdherence(savedData.dailyLogs, nutritionTarget);
    const recommendation = recommendNutrition({
      direction: directionFor(savedData),
      trend,
      adherence,
      currentCalories: nutritionTarget?.calories ?? null,
      currentOffsetKcal: nutritionTarget?.offsetKcal ?? 0,
      alreadyAdjustedThisPeriod: savedData.nutritionAdjustments.lastPeriodKey === periodKeyFor(localDateKey()),
    });
    return { trend, adherence, recommendation };
  }, [savedData, nutritionTarget]);
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
    // 押したセットの実績を一緒に渡す。あれば実績で、無ければ完了/スキップで判定される。
    const finished = sessionLog;
    const finishedKey = activeProgram == null ? '' : `${activeProgram.programId}:w${activeProgram.currentWeek}d${activeProgram.currentDay}`;
    const result = advanceActiveProgram(action, finished);
    if (result == null) {
      setActiveProgramMessage('進行を保存できませんでした。ブラウザの保存設定を確認してください。');
      return;
    }
    setActiveProgram(result.activeProgram);
    // 調整結果を含めて読み直す。次回の提示重量がその場で変わる。
    setSavedData(readData());
    setSessionLog(null);

    // 終わった直後のまとめ。判定結果をそのまま読むので、Todayの提示と食い違わない。
    setSessionFeedback(buildSessionFeedback({
      log: finished,
      evaluations: result.evaluations,
      adjustments: result.adjustments,
      sessionKey: finishedKey,
      source: result.source,
      skipped: action === 'skip',
      programCompleted: result.completed,
      nextActiveProgram: result.activeProgram,
    }));
    const recorded = result.source === 'sets' ? '記録した内容から次回の重量を決めました。' : '';
    setActiveProgramMessage(
      result.completed
        ? `プログラムを完了しました。履歴に保存しました。${recorded}`
        : action === 'complete'
          ? `完了を記録して、次のDayへ進みました。${recorded}`
          : 'このDayをスキップして、次へ進みました。',
    );
  }

  function applyNutrition() {
    if (nutritionReview == null) return;
    const applied = applyNutritionAdjustment(
      nutritionReview.recommendation.deltaKcal,
      nutritionReview.recommendation.headline,
    );
    if (applied == null) {
      setNutritionMessage2('保存できませんでした。ブラウザの保存設定を確認してください。');
      return;
    }
    setSavedData(readData());
    setNutritionMessage2(`次の7日間は${applied.calories}kcalを目安にします。`);
  }

  function keepNutrition() {
    setNutritionMessage2('今の目標のまま続けます。次の7日間の記録を見て、また見直します。');
  }

  function resetNutrition() {
    if (!resetNutritionAdjustment()) {
      setNutritionMessage2('戻せる調整がありませんでした。');
      return;
    }
    setSavedData(readData());
    setNutritionMessage2('Planの目安に戻しました。');
  }

  /** その日の食事記録が揃ったという印。押しても記録は消えず、あとから外せる。 */
  function toggleNutritionComplete() {
    const next = !nutritionComplete;
    setNutritionComplete(next);
    if (storeNutritionComplete(localDateKey(), next)) setSavedData(readData());
  }

  /** 押した内容をその場で残す。完了を押す前に閉じても消えない。 */
  function updateSessionLog(next: TrainingSessionLog) {
    setSessionLog(next);
    if (hasRecordedSets(next)) saveTrainingSession(next);
  }

  function addRecommendedFood(food: Food, grams: number) {
    setMeals((list) => [...list, { foodId: food.id, grams, mealType }]);
    setNutritionMessage(`${food.name}を${MEAL_OPTIONS.find((option) => option.value === mealType)?.label ?? '食事'}に追加しました。`);
  }

  /**
   * 食品を1つ追加する。
   * 前にその食品を食べていれば、そのときの分量を初期値にする。
   * 毎回100gから打ち直さなくて済む。
   */
  function addMeal(food: Food, grams?: number) {
    const amount = grams
      ?? (savedData == null ? null : lastAmountFor(savedData.dailyLogs, food.id))
      ?? DEFAULT_GRAMS;
    setMeals((list) => [...list, { foodId: food.id, grams: amount, mealType }]);
    setQuery('');
    setLastAddedCount(1);
  }

  /** 直前に追加したぶんだけを取り消す。 */
  function undoLastAdd() {
    if (lastAddedCount <= 0) return;
    setMeals((list) => list.slice(0, Math.max(0, list.length - lastAddedCount)));
    setLastAddedCount(0);
  }

  function addMealText() {
    const parsed = parseMealText(mealText);
    setMealTextResult(parsed);
    if (parsed.meals.length > 0) {
      setMeals((list) => [...list, ...parsed.meals.map((meal) => ({ ...meal, mealType }))]);
      setMealText('');
      setLastAddedCount(parsed.meals.length);
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
    const entries = dishMealEntries(dish, mealType, `${dish.id}-${Date.now()}`);
    setMeals((list) => [...list, ...entries]);
    setLastAddedCount(entries.length);
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
      nutritionComplete,
    });
    setSaveMessage(saved ? '今日の記録を保存しました。' : '保存できませんでした。ブラウザの保存設定を確認してください。');
    if (saved) setSavedData(readData());
  }

  /** 「今日の一手」の行き先。ページ内アンカーはそのまま、ページはベースパスを付ける。 */
  function actionHref(href: string): string {
    return href.startsWith('#') ? href : url(href);
  }

  return {
    weight,
    setWeight,
    manualCalories,
    setManualCalories,
    manualProtein,
    setManualProtein,
    steps,
    setSteps,
    sleepHours,
    setSleepHours,
    saveMessage,
    setSaveMessage,
    personalPlan,
    setPersonalPlan,
    activeProgram,
    setActiveProgram,
    activeProgramMessage,
    setActiveProgramMessage,
    nutritionMessage,
    setNutritionMessage,
    strengthHistory,
    setStrengthHistory,
    savedData,
    setSavedData,
    sessionLog,
    setSessionLog,
    sessionFeedback,
    setSessionFeedback,
    nutritionComplete,
    setNutritionComplete,
    nutritionMessage2,
    setNutritionMessage2,
    lastAddedCount,
    setLastAddedCount,
    meals,
    setMeals,
    query,
    setQuery,
    mealText,
    setMealText,
    mealTextResult,
    setMealTextResult,
    mealType,
    setMealType,
    exercises,
    setExercises,
    activityId,
    setActivityId,
    minutes,
    setMinutes,
    muscles,
    setMuscles,
    doneExercises,
    setDoneExercises,
    detailed,
    setDetailed,
    sex,
    setSex,
    age,
    setAge,
    height,
    setHeight,
    weightKg,
    weightError,
    suggestions,
    intake,
    mealCards,
    manualKcalValue,
    manualProteinValue,
    stepsValue,
    sleepValue,
    caloriesError,
    proteinError,
    stepsError,
    sleepError,
    intakeTotals,
    generatedPersonalPlan,
    activeProgramDefinition,
    trainingAdjustments,
    activeProgramSession,
    previousByExercise,
    nextPreview,
    frequent,
    firstWeek,
    coach,
    adjustmentLines,
    adjustmentHistory,
    todayAction,
    liveTodayLog,
    liveData,
    activitySummary,
    dailyProgress,
    week,
    weeklySummary,
    referenceAge,
    referenceSex,
    nutritionProgressItems,
    nutritionPriorityItems,
    foodRecommendations,
    nutritionTarget,
    nutritionReason,
    nutritionReview,
    exercise,
    balance,
    advanceProgram,
    applyNutrition,
    keepNutrition,
    resetNutrition,
    toggleNutritionComplete,
    updateSessionLog,
    addRecommendedFood,
    addMeal,
    undoLastAdd,
    addMealText,
    addDish,
    setGrams,
    addExercise,
    worked,
    toggleExercise,
    toggleMuscle,
    hasAnything,
    saveTodayRecord,
    actionHref,
  };
}

export type TodayViewContext = ReturnType<typeof useTodayState>;
