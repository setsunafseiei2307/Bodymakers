/**
 * 「今日の記録」を1枚の画像にする。
 *
 * 筋力診断のカードと同じ 1080×1080・同じ配色で、中身だけが違う。
 * 描画の土台（書体の待ち・保存・共有）は ShareCard コンポーネントが持つ。
 *
 * ここも「何を描くか」を組み立てる純関数と「どう描くか」を分けてある。
 */

import { fmt } from './format';
import { CARD_COLORS, CARD_SIZE } from './strength/shareCard';
import type { DayBalance } from './today';
import type { NutrientTotals } from './today';

export interface TodayCardInput {
  date: string;
  intake: NutrientTotals;
  exerciseKcal: number;
  muscles: readonly string[];
  balance: DayBalance | null;
}

export interface TodayCardData {
  date: string;
  /** 「1,840」 */
  intakeKcal: string;
  exerciseKcal: string;
  macros: { label: string; value: string }[];
  /** 収支。詳しい入力が無ければ null */
  balance: { label: string; value: string; positive: boolean } | null;
  /** 「1か月で −2.4kg」。同上 */
  monthly: string | null;
  muscles: string | null;
  note: string;
}

export function buildTodayCard(input: TodayCardInput): TodayCardData {
  const { intake, exerciseKcal, muscles, balance, date } = input;

  return {
    date,
    intakeKcal: fmt(intake.kcal, 0),
    exerciseKcal: fmt(exerciseKcal, 0),
    macros: [
      { label: 'たんぱく質', value: `${fmt(intake.protein, 0)}g` },
      { label: '脂質', value: `${fmt(intake.fat, 0)}g` },
      { label: '炭水化物', value: `${fmt(intake.carbs, 0)}g` },
    ],
    balance:
      balance == null
        ? null
        : {
            label: '今日の収支',
            value: `${balance.balanceKcal < 0 ? '−' : '+'}${fmt(Math.abs(balance.balanceKcal), 0)} kcal`,
            positive: balance.balanceKcal >= 0,
          },
    monthly:
      balance == null
        ? null
        : `この調子なら1か月で ${balance.monthlyChangeKg < 0 ? '−' : '+'}${fmt(Math.abs(balance.monthlyChangeKg), 1)}kg`,
    muscles: muscles.length > 0 ? muscles.join('・') : null,
    note: '栄養価: 日本食品標準成分表／消費: 身体活動基準2013のメッツ',
  };
}

const PAD = 72;
const BAND_HEIGHT = 132;

/** カードを描く。書体の読み込みが終わってから呼ぶこと。 */
export function drawTodayCard(
  ctx: CanvasRenderingContext2D,
  data: TodayCardData,
  siteName: string,
): void {
  const size = CARD_SIZE;
  const sans = (px: number, weight = 700) => `${weight} ${px}px "Noto Sans JP", sans-serif`;
  const mono = (px: number) => `700 ${px}px "Roboto Mono", monospace`;

  ctx.fillStyle = CARD_COLORS.ground;
  ctx.fillRect(0, 0, size, size);

  // 上端の帯
  ctx.fillStyle = CARD_COLORS.band;
  ctx.fillRect(0, 0, size, BAND_HEIGHT);
  ctx.fillStyle = CARD_COLORS.bandText;
  ctx.font = sans(38, 900);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(siteName.toUpperCase(), PAD, BAND_HEIGHT / 2);
  ctx.font = mono(28);
  ctx.textAlign = 'right';
  ctx.fillText('TODAY', size - PAD, BAND_HEIGHT / 2);

  // 日付
  ctx.textAlign = 'left';
  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = sans(30, 700);
  ctx.fillText(data.date, PAD, BAND_HEIGHT + 64);

  // 摂取と消費を横並びに
  // 日付との間を空ける。近すぎると1行に見える
  const colY = BAND_HEIGHT + 214;
  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = sans(26, 700);
  ctx.fillText('食べた', PAD, colY - 78);
  ctx.fillText('運動で消費', size / 2 + 20, colY - 78);

  ctx.fillStyle = CARD_COLORS.ink;
  ctx.font = mono(84);
  ctx.fillText(data.intakeKcal, PAD, colY);
  ctx.fillStyle = CARD_COLORS.body;
  ctx.fillText(data.exerciseKcal, size / 2 + 20, colY);

  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = sans(24, 700);
  ctx.fillText('kcal', PAD, colY + 62);
  ctx.fillText('kcal', size / 2 + 20, colY + 62);

  // PFC
  let y = colY + 150;
  ctx.fillStyle = CARD_COLORS.hair;
  ctx.fillRect(PAD, y - 44, size - PAD * 2, 1);
  for (let i = 0; i < data.macros.length; i += 1) {
    const x = PAD + i * ((size - PAD * 2) / 3);
    ctx.fillStyle = CARD_COLORS.muted;
    ctx.font = sans(24, 700);
    ctx.fillText(data.macros[i].label, x, y);
    ctx.fillStyle = CARD_COLORS.ink;
    ctx.font = mono(46);
    ctx.fillText(data.macros[i].value, x, y + 56);
  }

  // 収支と1か月の見通し
  y += 172;
  if (data.balance) {
    ctx.fillStyle = CARD_COLORS.ink;
    ctx.fillRect(PAD, y - 48, size - PAD * 2, 3);
    ctx.fillStyle = CARD_COLORS.muted;
    ctx.font = sans(26, 700);
    ctx.fillText(data.balance.label, PAD, y);
    ctx.fillStyle = data.balance.positive ? CARD_COLORS.signal : '#3fd4e6';
    ctx.font = mono(72);
    ctx.fillText(data.balance.value, PAD, y + 78);

    if (data.monthly) {
      ctx.fillStyle = CARD_COLORS.ink;
      ctx.font = sans(34, 900);
      ctx.fillText(data.monthly, PAD, y + 158);
    }
  }

  // 鍛えた部位
  if (data.muscles) {
    ctx.fillStyle = CARD_COLORS.muted;
    ctx.font = sans(26, 700);
    ctx.fillText(`鍛えた部位  ${data.muscles}`, PAD, size - PAD - 76);
  }

  // 出典
  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = sans(22, 400);
  ctx.fillText(data.note, PAD, size - PAD - 6);
}
