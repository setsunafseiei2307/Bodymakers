/**
 * 端末内データの書き出し・読み込み。
 *
 * 記録はこの端末にしかないので、機種変更やブラウザデータの削除で消える。
 * ログインを作る前に、まず「自分で持ち出して、自分で戻せる」状態にする。
 */

import { useEffect, useRef, useState } from 'react';

import {
  BACKUP_KEY,
  clearBackup,
  exportFileName,
  exportText,
  parseImport,
  readBackup,
  saveBackup,
  summarize,
  type ImportSummary,
} from '../../lib/dataTransfer';
import { DATA_CHANGED_EVENT, readData, writeData, type BodymakersData } from '../../lib/storage';
import { url } from '../../lib/url';
import { Slip } from './ui';

function describe(data: BodymakersData): { label: string; value: string }[] {
  return [
    { label: '日々の記録', value: `${data.dailyLogs.length}日` },
    { label: '12週間Plan', value: data.personalPlan ? '保存済み' : '未作成' },
    { label: '実行中Program', value: data.activeProgram ? '実行中' : 'なし' },
    { label: '筋力診断', value: `${data.strengthHistory.length}件` },
  ];
}

/** 読み込む前に、いま入っているものと並べて見せる。 */
function SummaryTable({ incoming, current }: { incoming: ImportSummary; current: ImportSummary }) {
  const rows: { label: string; from: string; to: string }[] = [
    { label: '日々の記録', from: `${current.dailyLogs}日`, to: `${incoming.dailyLogs}日` },
    { label: 'トレーニング', from: `${current.trainingSessions}回`, to: `${incoming.trainingSessions}回` },
    { label: '食事の記録', from: `${current.nutritionCompleteDays}日`, to: `${incoming.nutritionCompleteDays}日` },
    { label: '12週間Plan', from: current.hasPersonalPlan ? 'あり' : 'なし', to: incoming.hasPersonalPlan ? 'あり' : 'なし' },
    { label: '重量の調整', from: current.hasTrainingAdjustments ? 'あり' : 'なし', to: incoming.hasTrainingAdjustments ? 'あり' : 'なし' },
    { label: '食事の目安の調整', from: current.hasNutritionAdjustment ? 'あり' : 'なし', to: incoming.hasNutritionAdjustment ? 'あり' : 'なし' },
  ];
  return (
    <div className="import-preview">
      <p className="import-preview__head">
        {incoming.exportedAt == null
          ? 'このバックアップの中身'
          : `${new Date(incoming.exportedAt).toLocaleDateString('ja-JP')} に書き出したバックアップ`}
        {incoming.firstDate && incoming.lastDate && (
          <span className="num">（{incoming.firstDate.replaceAll('-', '/')}〜{incoming.lastDate.replaceAll('-', '/')}）</span>
        )}
      </p>
      <ul className="import-preview__rows">
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span className="num"><small>いま</small> {row.from}</span>
            <span aria-hidden="true">→</span>
            <strong className="num">{row.to}</strong>
          </li>
        ))}
      </ul>
      <p className="import-preview__warn">読み込むと、いまのデータはこの内容に置き換わります。</p>
    </div>
  );
}

function summaryText(summary: ImportSummary): string {
  const parts = [
    `日々の記録 ${summary.dailyLogs}日`,
    `筋力診断 ${summary.strengthHistory}件`,
    summary.hasPersonalPlan ? '12週間Planあり' : '12週間Planなし',
  ];
  return parts.join('・');
}

export default function DataManager() {
  const [data, setData] = useState<BodymakersData | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hasBackup, setHasBackup] = useState(false);
  /** ファイルを選べない環境のための、貼り付け用の逃げ道。 */
  const [pasted, setPasted] = useState('');
  const [exportedText, setExportedText] = useState('');
  /** 読み込む前に中身を見せる。確認するまで書き込まない。 */
  const [pending, setPending] = useState<{ data: BodymakersData; summary: ImportSummary } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => {
      setData(readData());
      setHasBackup(readBackup() != null);
    };
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (data == null) return <div className="tool" aria-hidden="true" />;

  function downloadExport() {
    if (data == null) return;
    const text = exportText(data);
    setError('');
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = exportFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setMessage('データを書き出しました。ダウンロードしたファイルを、別の端末やクラウドに保管してください。');
    } catch {
      // ダウンロードできない環境では、本文を出して手で控えられるようにする。
      setExportedText(text);
      setMessage('ファイルを保存できませんでした。下の内容をコピーして保管してください。');
    }
  }

  function showExportText() {
    if (data == null) return;
    setError('');
    setExportedText(exportText(data));
    setMessage('この内容がバックアップです。すべて選択してコピーしてください。');
  }

  /**
   * まず中身を読み取って見せるだけ。ここでは保存しない。
   * 上書きは、内訳を見たうえで確認したときだけ起きる。
   */
  function previewImport(raw: string) {
    const result = parseImport(raw);
    if (!result.ok) {
      setMessage('');
      setPending(null);
      setError(result.error);
      return;
    }
    setError('');
    setMessage('');
    setPending({ data: result.data, summary: result.summary });
  }

  /** 内訳を見たうえでの実行。元のデータは先に退避する。 */
  function confirmImport() {
    if (pending == null) return;
    const backedUp = saveBackup();
    if (!writeData(pending.data)) {
      setMessage('');
      setError('保存できませんでした。ブラウザの保存設定を確認してください。');
      return;
    }
    setData(readData());
    setHasBackup(backedUp);
    setPending(null);
    setPasted('');
    setError('');
    setMessage(
      backedUp
        ? `データを読み込みました（${summaryText(pending.summary)}）。元のデータは一時保存してあるので、戻せます。`
        : `データを読み込みました（${summaryText(pending.summary)}）。`,
    );
  }

  function cancelImport() {
    setPending(null);
    setError('');
    setMessage('読み込みを取り消しました。現在のデータはそのままです。');
  }

  function importFromFile(file: File) {
    const reader = new FileReader();
    reader.onerror = () => {
      setMessage('');
      setError('ファイルを読めませんでした。もう一度選び直してください。');
    };
    reader.onload = () => {
      previewImport(typeof reader.result === 'string' ? reader.result : '');
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsText(file);
  }

  function restore() {
    const backup = readBackup();
    if (backup == null) {
      setError('戻せるデータが見つかりませんでした。');
      return;
    }
    if (!window.confirm('読み込む前のデータに戻します。いま入っているデータは失われます。続けますか？')) return;
    if (!writeData(backup)) {
      setError('保存できませんでした。ブラウザの保存設定を確認してください。');
      return;
    }
    clearBackup();
    setData(readData());
    setHasBackup(false);
    setError('');
    setMessage('読み込む前のデータに戻しました。');
  }

  return (
    <div className="tool">
      <Slip code="EXPORT" title="データを書き出す">
        <p className="tool__note">
          Bodymakersの記録はこの端末のブラウザにだけあります。機種変更やブラウザデータの削除に備えて、
          ときどきファイルに書き出して保管してください。
        </p>
        <div className="data-manager__summary">
          {describe(data).map((item) => (
            <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
          ))}
        </div>
        <button type="button" className="button button--block button--lg" onClick={downloadExport}>データを書き出す</button>
        <button type="button" className="button button--ghost button--block" onClick={showExportText}>画面に表示してコピーする</button>
        {exportedText !== '' && (
          <textarea className="data-manager__text" readOnly value={exportedText} rows={8} aria-label="書き出したデータ" />
        )}
        <p className="tool__note">
          書き出すのは、12週間Plan・日々の記録・トレーニングの記録・食事の記録・
          実績から積み上げた重量と食事の目安の調整です。パスワードや連携用の鍵は含みません。
        </p>
      </Slip>

      <Slip code="IMPORT" title="データを読み込む">
        <p className="note note--warn">
          <span className="note__title">上書きされます</span>
          読み込むと、この端末の現在のBodymakersデータは読み込んだ内容に置き換わります。
          実行前に確認を出し、元のデータはこの端末に一時保存します。
        </p>
        <label className="field">
          <span className="field__label">書き出したファイルを選ぶ</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importFromFile(file);
            }}
          />
        </label>
        <details className="tool__details">
          <summary>ファイルではなく、内容を貼り付ける</summary>
          <textarea
            className="data-manager__text"
            value={pasted}
            rows={6}
            onChange={(event) => setPasted(event.target.value)}
            placeholder='{"format":"bodymakers-export", ...}'
            aria-label="読み込むデータ"
          />
          <button type="button" className="button button--block" onClick={() => previewImport(pasted)} disabled={pasted.trim() === ''}>
            貼り付けた内容を確認する
          </button>
        </details>
        {/* 中身を見せてから確認する。ここを通らずに上書きされることはない。 */}
        {pending && (
          <div className="import-confirm">
            <SummaryTable incoming={pending.summary} current={summarize(data)} />
            <button type="button" className="button button--block button--lg" onClick={confirmImport}>
              この内容で読み込む
            </button>
            <button type="button" className="button button--ghost button--block" onClick={cancelImport}>
              やめる
            </button>
          </div>
        )}

        {hasBackup && (
          <button type="button" className="button button--ghost button--block" onClick={restore}>読み込む前のデータに戻す</button>
        )}
        {message !== '' && <p className="tool__status" role="status">{message}</p>}
        {error !== '' && <p className="field__error" role="alert">{error}</p>}
        <p className="tool__note">
          一時保存は同じ端末の <code>{BACKUP_KEY}</code> に置きます。ブラウザのデータを消すと、これも消えます。
        </p>
      </Slip>

      <p className="next"><a href={url('/tools/today')}>今日を記録する →</a><a href={url('/record')}>今週の記録を見る →</a></p>
    </div>
  );
}
