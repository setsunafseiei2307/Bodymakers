export interface FitnessInput {
  bodyweightKg?: number;
  benchKg?: number;
  squatKg?: number;
  deadliftKg?: number;
  pullUps?: number;
  fiveKmMinutes?: number;
  plankSeconds?: number;
}

export interface FitnessComponent {
  key: 'strength' | 'pullups' | 'run' | 'plank';
  label: string;
  score: number;
  value: string;
  next: string;
}

export interface FitnessScore {
  score: number;
  level: string;
  description: string;
  components: FitnessComponent[];
}

interface Point {
  value: number;
  score: number;
  label: string;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

function interpolate(value: number, points: readonly Point[]): number {
  const sorted = [...points].sort((a, b) => a.value - b.value);
  if (value <= sorted[0].value) return sorted[0].score;
  if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].score;
  for (let index = 1; index < sorted.length; index += 1) {
    const upper = sorted[index];
    const lower = sorted[index - 1];
    if (value <= upper.value) {
      const progress = (value - lower.value) / (upper.value - lower.value);
      return lower.score + (upper.score - lower.score) * progress;
    }
  }
  return 0;
}

function nextAscending(value: number, points: readonly Point[]): string {
  return [...points].sort((a, b) => a.value - b.value).find((point) => point.value > value)?.label ?? '最高マイルストーン達成';
}

function nextDescending(value: number, points: readonly Point[]): string {
  return [...points].sort((a, b) => b.value - a.value).find((point) => point.value < value)?.label ?? '最高マイルストーン達成';
}

const STRENGTH_POINTS: readonly Point[] = [
  { value: 0, score: 0, label: 'BIG3合計＝体重の1倍' },
  { value: 1, score: 20, label: 'BIG3合計＝体重の1倍' },
  { value: 2, score: 40, label: 'BIG3合計＝体重の2倍' },
  { value: 3, score: 60, label: 'BIG3合計＝体重の3倍' },
  { value: 4, score: 80, label: 'BIG3合計＝体重の4倍' },
  { value: 5, score: 100, label: 'BIG3合計＝体重の5倍' },
];

const PULLUP_POINTS: readonly Point[] = [
  { value: 0, score: 0, label: '懸垂1回' },
  { value: 1, score: 20, label: '懸垂1回' },
  { value: 5, score: 40, label: '懸垂5回' },
  { value: 10, score: 60, label: '懸垂10回' },
  { value: 15, score: 80, label: '懸垂15回' },
  { value: 20, score: 100, label: '懸垂20回' },
];

const RUN_POINTS: readonly Point[] = [
  { value: 17.5, score: 100, label: '5km 17分30秒' },
  { value: 20, score: 80, label: '5km 20分' },
  { value: 25, score: 60, label: '5km 25分' },
  { value: 30, score: 40, label: '5km 30分' },
  { value: 35, score: 20, label: '5km 35分' },
  { value: 45, score: 0, label: '5km 45分' },
];

const PLANK_POINTS: readonly Point[] = [
  { value: 0, score: 0, label: 'プランク30秒' },
  { value: 30, score: 20, label: 'プランク30秒' },
  { value: 60, score: 40, label: 'プランク60秒' },
  { value: 120, score: 70, label: 'プランク2分' },
  { value: 180, score: 100, label: 'プランク3分' },
];

function describe(score: number): Pick<FitnessScore, 'level' | 'description'> {
  if (score >= 85) return { level: '複数分野で高い到達点', description: '得意分野を保ちながら、最も低い項目を伸ばす段階です。' };
  if (score >= 70) return { level: 'かなり強い土台', description: '筋力・持久力の両方に、はっきりした積み上げがあります。' };
  if (score >= 50) return { level: 'バランスのよい土台', description: '継続の成果が見える位置です。次のマイルストーンを一つ選びましょう。' };
  if (score >= 25) return { level: '土台づくりが進行中', description: '記録を残せていることが最初の成果です。低い項目から少しずつ伸ばせます。' };
  return { level: 'スタート地点を記録', description: '順位ではなく、今日の自分を次回と比べるための基準点です。' };
}

export function calculateFitnessScore(input: FitnessInput): FitnessScore | null {
  const components: FitnessComponent[] = [];
  const total = (input.benchKg ?? 0) + (input.squatKg ?? 0) + (input.deadliftKg ?? 0);

  if ((input.bodyweightKg ?? 0) > 0 && total > 0) {
    const ratio = total / input.bodyweightKg!;
    components.push({ key: 'strength', label: '体重比筋力', score: clamp(interpolate(ratio, STRENGTH_POINTS)), value: `BIG3合計 ${total.toFixed(1)}kg / 体重の${ratio.toFixed(2)}倍`, next: nextAscending(ratio, STRENGTH_POINTS) });
  }
  if (input.pullUps != null && input.pullUps >= 0) {
    components.push({ key: 'pullups', label: '自重筋力', score: clamp(interpolate(input.pullUps, PULLUP_POINTS)), value: `懸垂 ${input.pullUps}回`, next: nextAscending(input.pullUps, PULLUP_POINTS) });
  }
  if ((input.fiveKmMinutes ?? 0) > 0) {
    components.push({ key: 'run', label: '心肺持久力', score: clamp(interpolate(input.fiveKmMinutes!, RUN_POINTS)), value: `5km ${input.fiveKmMinutes!.toFixed(1)}分`, next: nextDescending(input.fiveKmMinutes!, RUN_POINTS) });
  }
  if (input.plankSeconds != null && input.plankSeconds >= 0) {
    components.push({ key: 'plank', label: '体幹持久力', score: clamp(interpolate(input.plankSeconds, PLANK_POINTS)), value: `プランク ${input.plankSeconds}秒`, next: nextAscending(input.plankSeconds, PLANK_POINTS) });
  }
  if (components.length === 0) return null;
  const score = Math.round(components.reduce((sum, component) => sum + component.score, 0) / components.length);
  return { score, components, ...describe(score) };
}
