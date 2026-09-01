/**
 * 記事のOGP画像を作る。
 *
 * 【なぜビルド時ではなく、手で走らせて結果を commit するのか】
 * OGP画像の生成には Canvas のネイティブ実装が要る。これをビルドの
 * 経路に入れると、デプロイ先で入らなかったときにサイト全体が落ちる。
 * 画像はめったに変わらないので、生成物をリポジトリに置くほうが安全で、
 * 差分もレビューできる。
 *
 * 【使い方】
 *   npm run og
 * 記事を足したら実行して、public/og/ の差分ごとコミットする。
 * 実行を忘れた場合は src/test/og.test.ts が落ちる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES = path.join(ROOT, 'src/content/articles');
const OUT = path.join(ROOT, 'public/og');

/** OGPの標準的な比率。1200×630 は各SNSがこの比率で切る。 */
const W = 1200;
const H = 630;
const PAD = 72;

/** 配色。共有カードと同じ値を使う（src/lib/strength/shareCard.ts と対）。 */
const C = {
  ground: '#0b0d10',
  panel: '#13161b',
  ink: '#f2f0ea',
  body: '#c6c8cc',
  muted: '#8d9199',
  hair: '#2b313a',
  signal: '#ff4459',
};

/** カテゴリの表示名。src/config/site.ts の CATEGORIES と対で管理する。 */
const CATEGORY_LABEL = {
  strength: '筋力・データ',
  training: 'トレーニング',
  nutrition: '栄養・食事',
  diet: 'ダイエット',
};

/** システムに入っている日本語フォントを登録する。無ければ既定にまかせる。 */
function registerFonts() {
  // 日本語が描ける書体を優先して探す。
  // 見つからないと日本語が豆腐（□）になるので、登録できたかを必ず返す。
  const candidates = [
    '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ];
  let registered = 0;
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      GlobalFonts.registerFromPath(file, 'OgFont');
      registered += 1;
    }
  }
  return registered;
}

/** frontmatter から必要な項目だけ拾う簡易パーサ。 */
function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const raw = match[1];
  const scalar = (key) => {
    const m = raw.match(new RegExp(`^${key}: (.*)$`, 'm'));
    if (!m) return undefined;
    return m[1].trim().replace(/^['"]|['"]$/g, '');
  };
  return {
    title: scalar('title') ?? '',
    category: scalar('category') ?? '',
  };
}

/**
 * 太字で描く。
 *
 * font に bold を指定すると、太字の字面を持たない書体では
 * 別の書体に置き換えられ、日本語が豆腐（□）になる。
 * IPAゴシックがまさにそれなので、通常の字面を塗ってから
 * 同じ色で細く縁取りして太さを出す。
 */
function fillBold(ctx, text, x, y, thickness) {
  ctx.fillText(text, x, y);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = thickness;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.restore();
}

/**
 * 文字列を指定幅で折り返す。
 * 日本語は単語の区切りが無いので、1文字ずつ入るか試す。
 */
function wrap(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line !== '') {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line !== '' && lines.length < maxLines) lines.push(line);
  return lines;
}

function draw(title, categoryKey) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, W, H);

  // 左端の赤い帯。サイトの記事ページと同じ合図にする
  ctx.fillStyle = C.signal;
  ctx.fillRect(0, 0, 14, H);

  // 右下にうっすら面を敷いて、単調な黒地にしない
  ctx.fillStyle = C.panel;
  ctx.fillRect(W * 0.55, H * 0.55, W * 0.45, H * 0.45);

  // カテゴリ
  const label = CATEGORY_LABEL[categoryKey] ?? '';
  if (label) {
    ctx.font = '26px OgFont, sans-serif';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = C.signal;
    ctx.fillRect(PAD, PAD, textWidth + 32, 48);
    ctx.fillStyle = C.ink;
    fillBold(ctx, label, PAD + 16, PAD + 34, 1.2);
  }

  // タイトル。長いものは3行で打ち切って「…」を付ける
  ctx.font = '58px OgFont, sans-serif';
  ctx.fillStyle = C.ink;
  const maxLines = 3;
  const lines = wrap(ctx, title, W - PAD * 2, maxLines);
  const consumed = lines.join('').length;
  if (consumed < title.length && lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`;
  }
  lines.forEach((line, i) => {
    fillBold(ctx, line, PAD, PAD + 150 + i * 78, 2);
  });

  // 下段の区切りとサイト名
  ctx.strokeStyle = C.hair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, H - PAD - 58);
  ctx.lineTo(W - PAD, H - PAD - 58);
  ctx.stroke();

  ctx.font = '34px OgFont, sans-serif';
  ctx.fillStyle = C.ink;
  fillBold(ctx, 'Bodymakers', PAD, H - PAD - 10, 1.4);

  ctx.font = '24px OgFont, sans-serif';
  ctx.fillStyle = C.muted;
  const note = '出典つきの解説と、登録不要の計算ツール';
  ctx.fillText(note, W - PAD - ctx.measureText(note).width, H - PAD - 12);

  return canvas.toBuffer('image/png');
}

const fontCount = registerFonts();
if (fontCount === 0) {
  // 日本語が豆腐になった画像を配るくらいなら、作らないほうがよい
  console.error('日本語フォントが見つかりませんでした。中止します。');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(ARTICLES).filter((f) => f.endsWith('.md'));
let written = 0;
for (const file of files) {
  const source = fs.readFileSync(path.join(ARTICLES, file), 'utf8');
  const front = parseFrontmatter(source);
  if (!front) {
    console.error(`${file}: frontmatter を読めませんでした`);
    process.exitCode = 1;
    continue;
  }
  const slug = file.replace(/\.md$/, '');
  fs.writeFileSync(path.join(OUT, `${slug}.png`), draw(front.title, front.category));
  written += 1;
}

// サイト全体で使う既定の1枚（トップやツールページ用）
fs.writeFileSync(
  path.join(OUT, 'default.png'),
  draw('自分の筋力は上位何%か、データで調べる', 'strength'),
);

// 記事を消したときに、古い画像が残らないようにする
const valid = new Set([...files.map((f) => f.replace(/\.md$/, '.png')), 'default.png']);
let removed = 0;
for (const existing of fs.readdirSync(OUT)) {
  if (!valid.has(existing)) {
    fs.unlinkSync(path.join(OUT, existing));
    removed += 1;
  }
}

console.log(`OGP画像: ${written}本ぶん + 既定1枚を書き出しました（削除 ${removed}件）`);
