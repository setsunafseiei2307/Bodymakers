/**
 * ビルド結果のサイト内リンクが、実在するページを指しているかを確かめる。
 *
 * サブディレクトリ配信（GitHub Pages など）では、href="/tools" のように
 * ベースパスを付け忘れたリンクが 404 になる。ページを足すたびに手で見て回るのは
 * 現実的でないので、ビルドのたびに機械で確認する。
 *
 * 使い方: node scripts/check-links.mjs [dist ディレクトリ]
 *   ベースパスは dist/index.html の中の実際のリンクから読み取る。
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const BASE = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

/** 走査対象。HTMLだけでなく、JS内に文字列で埋まったリンクも見る。 */
const SCANNED = new Set(['.html', '.js', '.xml']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCANNED.has(extname(full))) out.push(full);
  }
  return out;
}

/** そのリンク先がビルド結果に存在するか。 */
function resolves(target) {
  let path = target.split('#')[0].split('?')[0];
  if (BASE !== '') {
    if (!path.startsWith(BASE)) return false;
    path = path.slice(BASE.length);
  }
  if (path === '' || path === '/') path = '/index.html';
  const rel = path.replace(/^\//, '');
  return (
    (existsSync(join(DIST, rel)) && statSync(join(DIST, rel)).isFile()) ||
    existsSync(join(DIST, rel, 'index.html')) ||
    existsSync(join(DIST, `${rel}.html`))
  );
}

if (!existsSync(DIST)) {
  console.error(`ビルド結果が見つかりません: ${DIST}`);
  process.exit(1);
}

const broken = [];
for (const file of walk(DIST)) {
  const source = readFileSync(file, 'utf8');
  const targets = new Set();

  // HTML の属性と、JSX がバンドルされた後の文字列の両方を拾う
  for (const m of source.matchAll(/(?:href|src)="(\/[^"]*)"/g)) targets.add(m[1]);
  for (const m of source.matchAll(/(?:href|src)=\\?["'](\/[^"'\\]*)/g)) targets.add(m[1]);

  for (const target of targets) {
    // 外部URLの省略形（//example.com）は対象外
    if (target.startsWith('//')) continue;
    const decoded = target.replaceAll('&#38;', '&').replaceAll('&amp;', '&');
    if (!resolves(decoded)) broken.push(`${relative(DIST, file)} → ${decoded}`);
  }
}

if (broken.length > 0) {
  console.error(`リンク切れ ${broken.length} 件${BASE ? `（ベースパス ${BASE}）` : ''}:`);
  for (const line of broken) console.error('  ' + line);
  process.exit(1);
}

console.log(`サイト内リンクはすべて解決しました${BASE ? `（ベースパス ${BASE}）` : ''}。`);
