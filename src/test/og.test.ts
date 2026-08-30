import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

/**
 * OGP画像が記事とそろっているかを検査する。
 *
 * 画像はビルド時ではなく `npm run og` で作って commit する運用にしている
 * （生成に Canvas のネイティブ実装が要り、ビルド経路に入れると
 * デプロイ先で入らなかったときにサイトごと落ちるため）。
 *
 * その代わり、記事を足して実行を忘れると画像だけ無い記事ができる。
 * SNSに貼られたときに空白のカードが出るが、サイトを見ても気づけない。
 * ここで落とす。
 */

const ARTICLES = path.join(process.cwd(), 'src/content/articles');
const OG = path.join(process.cwd(), 'public/og');

const slugs = fs
  .readdirSync(ARTICLES)
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.replace(/\.md$/, ''));

/** PNGの先頭8バイトは決まっている。中身が本当に画像かを確かめる。 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPng(file: string) {
  const buffer = fs.readFileSync(file);
  return {
    isPng: buffer.subarray(0, 8).equals(PNG_SIGNATURE),
    // IHDR の幅・高さはビッグエンディアンで 16〜24 バイト目にある
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
  };
}

describe('OGP画像', () => {
  it('og ディレクトリがある', () => {
    expect(fs.existsSync(OG), 'public/og がありません。npm run og を実行してください').toBe(true);
  });

  it.each(slugs)('%s の画像がある', (slug) => {
    const file = path.join(OG, `${slug}.png`);
    expect(
      fs.existsSync(file),
      `public/og/${slug}.png がありません。npm run og を実行してください`,
    ).toBe(true);

    const png = readPng(file);
    expect(png.isPng, `${slug}.png がPNGではありません`).toBe(true);
    // OGPの標準的な比率。ここがずれるとSNS側で切られる
    expect(png.width).toBe(1200);
    expect(png.height).toBe(630);
    expect(png.bytes).toBeGreaterThan(1000);
  });

  it('既定の画像がある（トップやツールページで使う）', () => {
    const file = path.join(OG, 'default.png');
    expect(fs.existsSync(file)).toBe(true);
    const png = readPng(file);
    expect(png.width).toBe(1200);
    expect(png.height).toBe(630);
  });

  it('記事が無いのに残っている画像がない', () => {
    const expected = new Set([...slugs.map((s) => `${s}.png`), 'default.png']);
    for (const file of fs.readdirSync(OG)) {
      expect(expected, `public/og/${file} に対応する記事がありません`).toContain(file);
    }
  });
});
