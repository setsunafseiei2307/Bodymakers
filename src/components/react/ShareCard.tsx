/**
 * 診断結果を1枚の画像にして、保存・共有できるようにする。
 *
 * 結果画面そのものは情報量が多く、そのままスクリーンショットを撮っても投稿しづらい。
 * 共有用には別物として、正方形1枚に要点だけを置いたカードを作る。
 *
 * 画像はブラウザの Canvas で描く。サーバーへ送らないので、
 * 「入力内容は送信されない」という方針を崩さずに済む。
 */

import { useEffect, useRef, useState } from 'react';

import { SITE_NAME } from '../../config/site';
import { buildShareCard, drawShareCard, CARD_SIZE } from '../../lib/strength/shareCard';
import type { Diagnosis } from '../../lib/strength/diagnose';

/** 描画に使う書体。読み込みが終わる前に描くと別の書体になってしまう。 */
const REQUIRED_FONTS = ['900 40px "Noto Sans JP"', '180px Anton', '700 46px "Roboto Mono"'];

type Status = 'drawing' | 'ready' | 'failed';

export default function ShareCard({ diagnosis }: { diagnosis: Diagnosis }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('drawing');
  const [message, setMessage] = useState<string | null>(null);
  /** ブラウザが画像そのものの共有に対応しているか */
  const [canShareFile, setCanShareFile] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const canvas = canvasRef.current;
      if (canvas == null) return;
      const ctx = canvas.getContext('2d');
      if (ctx == null) {
        setStatus('failed');
        return;
      }

      // 書体の読み込みを待つ。失敗しても既定の書体で描いてしまう方がよいので握りつぶす
      try {
        await Promise.all(REQUIRED_FONTS.map((font) => document.fonts.load(font)));
        await document.fonts.ready;
      } catch {
        // 読み込めなくても描画は続ける
      }
      if (cancelled) return;

      drawShareCard(ctx, buildShareCard(diagnosis), SITE_NAME);
      setStatus('ready');
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [diagnosis]);

  // 画像ファイルを共有できるかは端末による。判定してからボタンの出し分けをする
  useEffect(() => {
    try {
      const probe = new File([new Blob()], 'probe.png', { type: 'image/png' });
      setCanShareFile(
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }),
      );
    } catch {
      setCanShareFile(false);
    }
  }, []);

  /** Canvas を PNG の File にする。 */
  function toFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (canvas == null) return resolve(null);
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], 'bodymakers-strength.png', { type: 'image/png' }) : null);
      }, 'image/png');
    });
  }

  async function share() {
    const file = await toFile();
    if (file == null) {
      setMessage('画像を作れませんでした。カードを長押しして保存してください。');
      return;
    }
    try {
      await navigator.share({ files: [file], title: `${SITE_NAME} 筋力レベル診断` });
    } catch (error) {
      // 利用者が共有シートを閉じただけの場合は何も言わない
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('共有できませんでした。カードを長押しして保存してください。');
    }
  }

  async function download() {
    const file = await toFile();
    if (file == null) {
      setMessage('画像を作れませんでした。カードを長押しして保存してください。');
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage('画像を保存しました。');
  }

  return (
    <div className="share">
      <div className="share__frame">
        <canvas
          ref={canvasRef}
          className="share__canvas"
          width={CARD_SIZE}
          height={CARD_SIZE}
          role="img"
          aria-label="診断結果の共有用カード画像"
        />
        {status === 'drawing' && <p className="share__loading">カードを作成中…</p>}
      </div>

      {status === 'failed' ? (
        <p className="note note--warn">
          <span className="note__title">カードを作れませんでした</span>
          お使いのブラウザが画像の生成に対応していないようです。
          結果画面のスクリーンショットをお使いください。
        </p>
      ) : (
        <>
          <div className="share__actions">
            {canShareFile && (
              <button type="button" className="button button--lg button--block" onClick={share}>
                この画像を共有する
              </button>
            )}
            <button
              type="button"
              className={`button button--block${canShareFile ? ' button--ghost' : ' button--lg'}`}
              onClick={download}
            >
              画像を保存する
            </button>
          </div>
          <p className="share__hint">
            カードを長押ししても保存できます。X・Instagram・LINEのどれでも切れずに載る正方形です。
            画像はこの端末の中で作られ、どこにも送信されません。
          </p>
        </>
      )}

      {message && (
        <p className="share__message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
