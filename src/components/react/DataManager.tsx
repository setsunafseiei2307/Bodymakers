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

  /** 読み込みは上書き。実行前に必ず本人へ確認する。 */
  function applyImport(raw: string) {
    const result = parseImport(raw);
    if (!result.ok) {
      setMessage('');
      setError(result.error);
      return;
    }
    const confirmed = window.confirm(
      `読み込むと、この端末の現在のBodymakersデータは上書きされます。\n\n読み込む内容: ${summaryText(result.summary)}\n\n続けますか？（元のデータは「元に戻す」用に一時保存します）`,
    );
    if (!confirmed) {
      setError('');
      setMessage('読み込みを取り消しました。現在のデータはそのままです。');
      return;
    }
    const backedUp = saveBackup();
    if (!writeData(result.data)) {
      setMessage('');
      setError('保存できませんでした。ブラウザの保存設定を確認してください。');
      return;
    }
    setData(readData());
    setHasBackup(backedUp);
    setError('');
    setMessage(
      backedUp
        ? `データを読み込みました（${summaryText(result.summary)}）。元のデータは一時保存してあります。`
        : `データを読み込みました（${summaryText(result.summary)}）。`,
    );
  }

  function importFromFile(file: File) {
    const reader = new FileReader();
    reader.onerror = () => {
      setMessage('');
      setError('ファイルを読めませんでした。もう一度選び直してください。');
    };
    reader.onload = () => {
      applyImport(typeof reader.result === 'string' ? reader.result : '');
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
        <p className="tool__note">書き出す内容は、この端末の記録・Plan・Programだけです。パスワードや連携用の鍵は含みません。</p>
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
          <button type="button" className="button button--block" onClick={() => applyImport(pasted)} disabled={pasted.trim() === ''}>
            貼り付けた内容を読み込む
          </button>
        </details>
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
