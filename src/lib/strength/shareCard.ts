/**
 * 診断結果から、SNS投稿用のカード画像を作る。
 *
 * 結果画面そのものは情報量が多く、そのままスクリーンショットを撮っても
 * 投稿しづらい。共有用には別物として、正方形1枚に要点だけを置いたカードを作る。
 *
 * 【設計上の判断】
 * - サイズは 1080×1080 の正方形。Instagram・X・LINE のどれでも切れずに載る。
 *   4:5 にすると Instagram では有利だが X のタイムラインで上下が切られる。
 * - 配色は閲覧者のテーマに関わらず常に暗い。投稿画像はタイムラインの中で
 *   目に留まる必要があり、また同じブランドの見た目で揃えたいため。
 * - 描画はブラウザの Canvas で行う。サーバーを持たない方針を崩さずに済む。
 *
 * このファイルは「何を描くか」を組み立てる純関数（buildShareCard）と、
 * 「どう描くか」（drawShareCard）に分けてある。前者だけを単体テストできる。
 */

import { fmt } from '../format';
import { LEVELS, LIFT_LABELS, type LevelId, type LiftId } from './standards';
import { type Diagnosis } from './diagnose';

/** カードの一辺（px）。 */
export const CARD_SIZE = 1080;

/**
 * カードの配色。CSSカスタムプロパティは Canvas から読めないので、
 * ここに実際の値を持つ。ダークテーマのトークンと同じ値にしてある。
 */
export const CARD_COLORS = {
  ground: '#0b0d10',
  panel: '#13161b',
  band: '#f2f0ea',
  bandText: '#0b0d10',
  ink: '#f2f0ea',
  body: '#c6c8cc',
  muted: '#8d9199',
  hair: '#2b313a',
  signal: '#ff4459',
} as const;

/** レベルごとの色（ダーク側の値）。 */
export const CARD_LEVEL_COLORS: Record<LevelId, string> = {
  beginner: '#9a9d9f',
  novice: '#59b3ba',
  intermediate: '#3fd4e6',
  advanced: '#f0925a',
  elite: '#ff4459',
};

/** カードに載せる1種目ぶんの行。 */
export interface ShareCardRow {
  label: string;
  /** 「164.0」のように整形済みの推定1RM */
  weight: string;
  levelLabel: string;
  levelId: LevelId;
}

/** 1種目だけの診断で出す、到達重量のはしご。 */
export interface ShareCardLadderRow {
  levelLabel: string;
  levelId: LevelId;
  /** 「82.5」または「—」（基準表の下限より下で数値が出ない段） */
  weight: string;
  /** 現在の段かどうか */
  current: boolean;
}

/** カードに描く内容。描画処理はこれだけを見る。 */
export interface ShareCardData {
  /** 「男性 / 80.0kg」 */
  meta: string;
  /** 「3種目合計」または種目名 */
  scope: string;
  levelLabel: string;
  levelId: LevelId;
  /** 「競技者の35.0%より上」など */
  rank: string;
  /** 段階の進捗（0〜1）。レベル帯の塗り幅に使う */
  progress: number;
  rows: ShareCardRow[];
  /**
   * 1種目だけのときに rows の代わりに描く、5段階の到達重量。
   * 種目が1つだと行が1本しか出ず、カードの下半分が空いてしまう。
   * そこを埋めるためだけでなく、「次に何kgを目指すのか」が1枚で分かるようにする。
   */
  ladder: ShareCardLadderRow[] | null;
  /** 「合計 458.9kg ／ 体重の5.74倍」 */
  summary: string;
  /** 「上級まで +6.1kg」。最上位なら null */
  nextTarget: string | null;
  /** 出典の1行 */
  source: string;
}

/**
 * 診断結果を、カードに描ける形へ整える。
 *
 * 情報は絞る。投稿画像で読めるのはせいぜい5〜6要素で、
 * 結果画面と同じ密度にすると何も伝わらない。
 */
export function buildShareCard(diagnosis: Diagnosis): ShareCardData {
  const { total, lifts, sex, bodyweightKg } = diagnosis;
  const headline = total ?? lifts[0];

  const levelIndex = LEVELS.findIndex((level) => level.id === headline.level.id);
  const nextThreshold =
    levelIndex >= 0 && levelIndex < LEVELS.length - 1
      ? headline.thresholds[levelIndex + 1]
      : null;

  const rank =
    headline.bound === 'below'
      ? '基準表の範囲外'
      : headline.bound === 'above'
        ? `上位 ${fmt(100 - headline.percentile, 0)}% 以内`
        : `競技者の ${fmt(headline.percentile, 1)}% より上`;

  return {
    meta: `${sex === 'M' ? '男性' : '女性'}  /  体重 ${fmt(bodyweightKg, 1)}kg`,
    scope: total ? '3種目合計' : LIFT_LABELS[lifts[0].lift as LiftId],
    levelLabel: headline.level.label,
    levelId: headline.level.id,
    rank,
    // 5段階のうち何段目かを 0〜1 に直す。帯の塗り幅に使う
    progress: (levelIndex + 1) / LEVELS.length,
    rows:
      lifts.length === 1
        ? []
        : lifts.map((lift) => ({
            label: LIFT_LABELS[lift.lift],
            weight: fmt(lift.oneRmKg, 1),
            levelLabel: lift.level.label,
            levelId: lift.level.id,
          })),
    ladder:
      lifts.length === 1
        ? headline.thresholds.map((threshold) => ({
            levelLabel: threshold.level.label,
            levelId: threshold.level.id,
            // 基準表の下限より下の段は重量が出ない。推測で埋めず「—」にする
            weight: threshold.weightKg > 0 ? fmt(threshold.weightKg, 1) : '—',
            current: threshold.level.id === headline.level.id,
          }))
        : null,
    summary: total
      ? `合計 ${fmt(total.oneRmKg, 1)}kg  ／  体重の ${fmt(total.oneRmKg / bodyweightKg, 2)} 倍`
      : `推定1RM ${fmt(headline.oneRmKg, 1)}kg  ／  体重の ${fmt(headline.oneRmKg / bodyweightKg, 2)} 倍`,
    nextTarget:
      nextThreshold == null
        ? null
        : `${nextThreshold.level.label}まで +${fmt(Math.max(0, nextThreshold.weightKg - headline.oneRmKg), 1)}kg`,
    source: '基準: 公式競技会ノーギア記録 387,265人（OpenPowerlifting）',
  };
}

/**
 * カード内の位置（px）。
 *
 * 縦は上から順に積む。文字は textBaseline='middle' で描くので、
 * ここの数値は「その行の中心」を指す。書体の大きさに対して余裕を持たせないと、
 * 大きな見出し（レベル名）が次の行に被る。
 */
const PAD = 72;
const BAND_HEIGHT = 132;
const META_Y = BAND_HEIGHT + 64;
const LEVEL_SIZE = 156;
const LEVEL_Y = META_Y + 132;
const RANK_Y = LEVEL_Y + 120;
const BAR_Y = RANK_Y + 40;
const BAR_HEIGHT = 16;
const ROWS_Y = BAR_Y + BAR_HEIGHT + 46;
/** 1種目ぶんの高さ（罫線 → 文字 → 余白）。 */
const ROW_STEP = 92;
const ROW_TEXT_OFFSET = 62;
/** はしごは5段あるので、1段ぶんは種目行より低くする。 */
const LADDER_STEP = 56;
const LADDER_TEXT_OFFSET = 36;

/**
 * 種目行の右側は「数値 / 単位 / レベル名」の3列。
 * レベル名は「エリート」で4文字ぶんの幅を取るので、単位との間を固定で空けておく。
 */
const LEVEL_COL_RIGHT = CARD_SIZE - PAD;
const UNIT_RIGHT = CARD_SIZE - PAD - 130;
const NUM_RIGHT = UNIT_RIGHT - 36;

/**
 * カードを描く。呼び出す前にフォントの読み込みを終えておくこと
 * （終わっていないとフォールバックの書体で描かれてしまう）。
 */
export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  siteName: string,
): void {
  const size = CARD_SIZE;
  const levelColor = CARD_LEVEL_COLORS[data.levelId];

  const display = (px: number) => `${px}px Anton, "Noto Sans JP", sans-serif`;
  const sans = (px: number, weight = 700) =>
    `${weight} ${px}px "Noto Sans JP", sans-serif`;
  const mono = (px: number) => `700 ${px}px "Roboto Mono", monospace`;

  // --- 地 ---
  ctx.fillStyle = CARD_COLORS.ground;
  ctx.fillRect(0, 0, size, size);

  // --- 上端の帯 ---
  ctx.fillStyle = CARD_COLORS.band;
  ctx.fillRect(0, 0, size, BAND_HEIGHT);
  ctx.fillStyle = CARD_COLORS.bandText;
  ctx.font = sans(38, 900);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(siteName.toUpperCase(), PAD, BAND_HEIGHT / 2);
  ctx.font = mono(28);
  ctx.textAlign = 'right';
  ctx.fillText('STRENGTH RECORD', size - PAD, BAND_HEIGHT / 2);

  // --- 属性 ---
  ctx.textAlign = 'left';
  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = sans(30, 700);
  ctx.fillText(`${data.meta}   /   ${data.scope}`, PAD, META_Y);

  // --- レベル名。カードで一番大きく出す ---
  ctx.fillStyle = levelColor;
  ctx.font = display(LEVEL_SIZE);
  ctx.fillText(data.levelLabel, PAD, LEVEL_Y);

  // --- 順位 ---
  ctx.fillStyle = CARD_COLORS.ink;
  ctx.font = sans(42, 900);
  ctx.fillText(data.rank, PAD, RANK_Y);

  // --- 5段階の帯。何段目かを塗って示す ---
  const barWidth = size - PAD * 2;
  ctx.fillStyle = CARD_COLORS.hair;
  ctx.fillRect(PAD, BAR_Y, barWidth, BAR_HEIGHT);
  ctx.fillStyle = levelColor;
  ctx.fillRect(PAD, BAR_Y, barWidth * data.progress, BAR_HEIGHT);

  let y = ROWS_Y;

  if (data.ladder) {
    // --- 1種目のときは、5段階それぞれの到達重量を出す ---
    ctx.textAlign = 'left';
    ctx.fillStyle = CARD_COLORS.muted;
    ctx.font = sans(22, 700);
    ctx.fillText('この体重帯で各レベルに必要な推定1RM', PAD, ROWS_Y - 20);

    for (const step of data.ladder) {
      const textY = y + LADDER_TEXT_OFFSET;

      if (step.current) {
        // 現在の段だけ背景を敷いて、目で追えるようにする
        ctx.fillStyle = CARD_COLORS.panel;
        ctx.fillRect(PAD - 16, y + 4, barWidth + 32, LADDER_STEP - 8);
        ctx.fillStyle = CARD_LEVEL_COLORS[step.levelId];
        ctx.fillRect(PAD - 16, y + 4, 5, LADDER_STEP - 8);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = step.current ? CARD_LEVEL_COLORS[step.levelId] : CARD_COLORS.body;
      ctx.font = sans(30, step.current ? 900 : 700);
      ctx.fillText(step.levelLabel, PAD, textY);

      ctx.textAlign = 'right';
      ctx.fillStyle = step.current ? CARD_COLORS.ink : CARD_COLORS.body;
      ctx.font = mono(34);
      ctx.fillText(step.weight, NUM_RIGHT, textY);

      ctx.font = sans(20, 700);
      ctx.fillStyle = CARD_COLORS.muted;
      ctx.fillText(step.weight === '—' ? '' : 'kg', UNIT_RIGHT, textY);

      if (step.current) {
        ctx.fillStyle = CARD_COLORS.muted;
        ctx.font = sans(22, 900);
        ctx.fillText('現在', LEVEL_COL_RIGHT, textY);
      }

      y += LADDER_STEP;
    }

    // 最下段の文字と、この下に引く太罫が触れないように少しだけ空ける
    y += 12;
  }

  // --- 種目ごとの行 ---
  for (const row of data.rows) {
    ctx.fillStyle = CARD_COLORS.hair;
    ctx.fillRect(PAD, y, barWidth, 1);

    const textY = y + ROW_TEXT_OFFSET;

    ctx.textAlign = 'left';
    ctx.fillStyle = CARD_COLORS.ink;
    ctx.font = sans(34, 700);
    ctx.fillText(row.label, PAD, textY);

    ctx.textAlign = 'right';
    ctx.font = mono(46);
    ctx.fillText(row.weight, NUM_RIGHT, textY);

    ctx.font = sans(22, 700);
    ctx.fillStyle = CARD_COLORS.muted;
    ctx.fillText('kg', UNIT_RIGHT, textY);

    ctx.fillStyle = CARD_LEVEL_COLORS[row.levelId];
    ctx.font = sans(26, 900);
    ctx.fillText(row.levelLabel, LEVEL_COL_RIGHT, textY);

    y += ROW_STEP;
  }

  // --- 合計と次の目標 ---
  ctx.fillStyle = CARD_COLORS.ink;
  ctx.fillRect(PAD, y, barWidth, 3);
  y += 62;
  ctx.textAlign = 'left';
  ctx.fillStyle = CARD_COLORS.ink;
  ctx.font = sans(34, 700);
  ctx.fillText(data.summary, PAD, y);

  if (data.nextTarget) {
    y += 52;
    ctx.fillStyle = CARD_COLORS.signal;
    ctx.font = sans(34, 900);
    ctx.fillText(data.nextTarget, PAD, y);
  }

  // --- 下端の出典 ---
  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = sans(22, 400);
  ctx.textAlign = 'left';
  ctx.fillText(data.source, PAD, size - PAD - 6);
}
