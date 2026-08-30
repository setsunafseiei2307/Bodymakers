/**
 * 読了時間（分）を本文から求める。
 *
 * 日本語は1分あたり400〜600字が目安とされる幅があるので、
 * 遅めの 500字/分 を採る。実際より短く出て裏切るより、
 * 少し長めに出るほうがましなため。
 *
 * Markdown の記号・URL・frontmatter は読む対象ではないので落とす。
 * 表は数字が多く読む速度が違うが、そこまでの精度は要らないので同じに扱う。
 */
export function readingMinutes(body: string): number {
  const text = body
    // コードブロックは読まない
    .replace(/```[\s\S]*?```/g, '')
    // 画像・リンクは表示文字だけ残す
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 見出し記号・強調・表の罫線
    .replace(/[#>*_`|-]/g, '')
    .replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 500));
}
