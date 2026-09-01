import type {
  DiagnosisAxis,
  DiagnosisResult,
  GoalId,
  PersonalPlanInput,
  PriorityAction,
} from './types';

const GOAL_LABEL: Record<GoalId, string> = {
  muscle: '筋肉を増やす',
  'fat-loss': '体脂肪を落とす',
  recomp: '筋肉を残して絞る',
  strength: '筋力を伸ばす',
  health: '健康的な身体を作る',
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function desiredTrainingDays(goal: GoalId): number {
  return goal === 'health' ? 2 : 3;
}

function bodyAxis(input: PersonalPlanInput): DiagnosisAxis {
  const hasWeightGoal = input.targets.weightKg != null;
  const hasLiftGoal = Object.keys(input.targets.lifts).length > 0;
  const score = clamp(45 + (hasWeightGoal ? 25 : 0) + (hasLiftGoal ? 20 : 0) + (input.body.bodyFatPercent != null ? 10 : 0));
  const reasons = [
    `目標は「${GOAL_LABEL[input.goal]}」です。`,
    hasWeightGoal ? `体重の目標 ${input.targets.weightKg}kg を設定しています。` : '目標体重は未設定です。必要になったときに追加できます。',
  ];
  if (hasLiftGoal) reasons.push('目標BIG3を設定しているため、差分を追えます。');
  return { id: 'body', label: '身体づくり準備度', score, reasons };
}

function strengthAxis(input: PersonalPlanInput): DiagnosisAxis {
  const count = Object.keys(input.strength).length;
  const score = count === 3 ? 82 : count > 0 ? 62 : 35;
  const reasons = count === 0
    ? ['現在のBIG3は未入力です。強さの優劣ではなく、出発点を記録すると伸びが見えやすくなります。']
    : [`BIG3のうち${count}種目を記録しています。`, '入力した1RMは、目標との差分とトレーニングの優先順位に使います。'];
  return { id: 'strength', label: '筋力状況', score, reasons };
}

function trainingAxis(input: PersonalPlanInput): DiagnosisAxis {
  const desired = desiredTrainingDays(input.goal);
  const daysScore = input.training.daysPerWeek >= desired ? 45 : input.training.daysPerWeek === desired - 1 ? 30 : 16;
  const timeScore = input.training.sessionMinutes >= 45 ? 22 : 12;
  const placeScore = input.training.location === 'both' || input.training.location === 'gym' ? 18 : 12;
  const experienceScore = input.training.experience === 'none' ? 5 : 15;
  const score = clamp(daysScore + timeScore + placeScore + experienceScore);
  const reasons = [
    `週${input.training.daysPerWeek}回・1回${input.training.sessionMinutes}分の予定です。`,
    input.training.daysPerWeek < desired
      ? `${GOAL_LABEL[input.goal]}を進めるには、まず週${desired}回を固定できると組みやすくなります。`
      : '選んだ頻度なら、12週間の基本プランを無理なく組めます。',
  ];
  return { id: 'training', label: 'トレーニング環境', score, reasons };
}

function nutritionAxis(input: PersonalPlanInput): DiagnosisAxis {
  const protein = { everyMeal: 42, oneToTwo: 28, rarely: 12, unknown: 12 }[input.food.protein];
  const meals = input.food.mealsPerDay >= 3 ? 18 : input.food.mealsPerDay === 2 ? 10 : 5;
  const vegetables = { high: 18, normal: 12, low: 6 }[input.food.vegetables];
  const amount = input.goal === 'muscle'
    ? { veryLow: 3, low: 8, normal: 18, high: 22, veryHigh: 18, unknown: 10 }[input.food.amount]
    : input.goal === 'fat-loss' || input.goal === 'recomp'
      ? { veryLow: 8, low: 16, normal: 22, high: 15, veryHigh: 8, unknown: 10 }[input.food.amount]
      : 18;
  const breakfast = { daily: 8, sometimes: 5, rarely: 2 }[input.food.breakfast];
  const outside = { daily: 4, threeToFour: 6, oneToTwo: 8, rarely: 10 }[input.food.outsideMeals];
  const score = clamp(protein + meals + vegetables + amount + breakfast + outside);
  const reasons = [
    `たんぱく質は「${{ everyMeal: '毎食意識', oneToTwo: '1日1〜2食', rarely: 'ほとんど意識していない', unknown: '分からない' }[input.food.protein]}」という回答です。`,
    input.food.protein === 'everyMeal'
      ? '食事のたびにたんぱく質を意識できています。'
      : 'まず次の食事で、たんぱく質を1品追加するところから始められます。',
  ];
  return { id: 'nutrition', label: '食事習慣', score, reasons };
}

function recoveryAxis(input: PersonalPlanInput): DiagnosisAxis {
  const duration = { under5: 10, fiveToSix: 22, sixToSeven: 34, sevenToEight: 44, overEight: 40 }[input.lifestyle.sleepDuration];
  const quality = { good: 22, normal: 14, poor: 6 }[input.lifestyle.sleepQuality];
  const stress = { low: 20, normal: 14, high: 6 }[input.lifestyle.stress];
  const alcohol = { none: 12, oneToTwo: 10, threeToFour: 6, daily: 2 }[input.lifestyle.alcohol];
  const activity = { desk: 4, someWalk: 7, walk: 10, active: 12 }[input.lifestyle.dailyActivity];
  const score = clamp(duration + quality + stress + alcohol + activity - (input.lifestyle.smoking ? 8 : 0) - (input.lifestyle.painOrInjury ? 15 : 0));
  const reasons = [
    `睡眠は「${{ under5: '5時間未満', fiveToSix: '5〜6時間', sixToSeven: '6〜7時間', sevenToEight: '7〜8時間', overEight: '8時間以上' }[input.lifestyle.sleepDuration]}」・質は「${{ good: '良い', normal: '普通', poor: '悪い' }[input.lifestyle.sleepQuality]}」です。`,
  ];
  if (input.lifestyle.smoking) reasons.push('喫煙ありという回答でした。ここでは医療的な評価はせず、回復の習慣を優先するPlanにします。');
  if (input.lifestyle.painOrInjury) reasons.push('痛み・怪我ありのため、負荷を無理に上げないことを最優先にします。');
  return { id: 'recovery', label: '回復習慣', score, reasons };
}

function priorities(input: PersonalPlanInput, axes: DiagnosisAxis[]): PriorityAction[] {
  const actions: PriorityAction[] = [];
  const desired = desiredTrainingDays(input.goal);
  if (input.food.protein !== 'everyMeal') actions.push({
    id: 'protein', axis: 'nutrition', priority: 1, title: '食事ごとにたんぱく質を決める',
    action: '次の食事で、たんぱく質を含む食品を1品追加するところから始めましょう。',
    why: `たんぱく質は「${input.food.protein === 'oneToTwo' ? '1日1〜2食' : input.food.protein === 'rarely' ? 'ほとんど意識していない' : '分からない'}」という回答でした。`,
  });
  if (input.lifestyle.sleepDuration === 'under5' || input.lifestyle.sleepDuration === 'fiveToSix' || input.lifestyle.sleepQuality === 'poor') actions.push({
    id: 'sleep', axis: 'recovery', priority: 2, title: '睡眠を30〜60分増やす',
    action: '就寝時刻を固定し、まず30分だけ長く眠る余地を作りましょう。',
    why: `睡眠は「${input.lifestyle.sleepDuration === 'under5' ? '5時間未満' : input.lifestyle.sleepDuration === 'fiveToSix' ? '5〜6時間' : '質が悪い'}」という回答でした。`,
  });
  if (input.training.daysPerWeek < desired) actions.push({
    id: 'frequency', axis: 'training', priority: 3, title: `週${desired}回のトレーニングを固定する`,
    action: 'まず曜日を決め、短い日でも予定どおり始めることを優先しましょう。',
    why: `現在は週${input.training.daysPerWeek}回の予定です。`,
  });
  if (Object.keys(input.strength).length === 0) actions.push({
    id: 'strength-record', axis: 'strength', priority: 4, title: 'BIG3の現在地を1つ記録する',
    action: 'ベンチプレスだけでも、重量と回数から推定1RMを残しましょう。',
    why: '現在のBIG3が未入力のため、伸びを比べる基準がありません。',
  });
  if (input.lifestyle.painOrInjury) actions.push({
    id: 'safety', axis: 'recovery', priority: 0, title: '痛みがある日は負荷を上げない',
    action: '痛みを我慢して続けず、必要に応じて医療・運動の専門家に相談してください。',
    why: '痛み・怪我ありという回答でした。この診断は医療判断を行いません。',
  });
  if (actions.length < 3) {
    for (const axis of [...axes].sort((a, b) => a.score - b.score)) {
      if (actions.some((item) => item.axis === axis.id)) continue;
      actions.push({ id: `keep-${axis.id}`, axis: axis.id, priority: 10 + actions.length, title: `${axis.label}を続ける`, action: '今できている行動を、次の7日間も同じ形で続けましょう。', why: axis.reasons[0] ?? '入力した内容をもとにしています。' });
      if (actions.length >= 3) break;
    }
  }
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

export function diagnosePersonalPlan(input: PersonalPlanInput): DiagnosisResult {
  const axes = [bodyAxis(input), strengthAxis(input), trainingAxis(input), nutritionAxis(input), recoveryAxis(input)];
  const gaps = [];
  if (input.targets.weightKg != null) {
    const difference = input.targets.weightKg - input.body.weightKg;
    gaps.push({ id: 'weight', label: '体重', current: `${input.body.weightKg}kg`, target: `${input.targets.weightKg}kg`, difference: `${difference >= 0 ? '+' : ''}${difference.toFixed(1)}kg` });
  }
  for (const lift of ['bench', 'squat', 'deadlift'] as const) {
    const current = input.strength[lift];
    const target = input.targets.lifts[lift];
    if (current == null || target == null) continue;
    const difference = target - current;
    gaps.push({ id: lift, label: lift === 'bench' ? 'Bench' : lift === 'squat' ? 'Squat' : 'Deadlift', current: `${current}kg`, target: `${target}kg`, difference: `${difference >= 0 ? '+' : ''}${difference.toFixed(1)}kg` });
  }
  const desired = desiredTrainingDays(input.goal);
  if (input.training.daysPerWeek < desired) gaps.push({ id: 'training', label: 'Training', current: `週${input.training.daysPerWeek}回`, target: `週${desired}回`, difference: `あと${desired - input.training.daysPerWeek}回` });
  return { axes, priorities: priorities(input, axes), gaps };
}
