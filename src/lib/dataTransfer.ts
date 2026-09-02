/**
 * 端末内データの書き出しと読み込み。
 *
 * Bodymakersの記録は、その人のブラウザの localStorage にしかない。
 * 機種変更やブラウザデータの削除で消えると、取り戻す手段が無い。
 *
 * ログインもクラウド同期もまだ作らないので、代わりに
 * 「自分でファイルとして持ち出して、自分で戻せる」状態にする。
 *
 * 読み込みは、他人が編集したかもしれないJSONを受け取る処理になる。
 * 何が入っていてもアプリを壊さないよう、必ず検証して、
 * 最後は既存の parseStoredData を通してから保存する。
 */

import { SITE_NAME } from '../config/site';
import { STORAGE_KEY, parseStoredData, type BodymakersData } from './storage';

/** 書き出したファイルがBodymakersのものだと判別するための印。 */
export const EXPORT_FORMAT = 'bodymakers-export';
/** 包み側の形式のバージョン。中身のデータ形式（schema）とは別に数える。 */
export const EXPORT_FORMAT_VERSION = 1;
/** 中身のデータ形式。将来 v2 を作るときは、この値で移行先を決める。 */
export const EXPORT_SCHEMA = STORAGE_KEY;
/** 読み込み前の現在データを一時的に置く場所。 */
export const BACKUP_KEY = 'bodymakers:data:backup:v1';

export interface BodymakersExport {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  /** 中身のデータ形式のキー名。移行の判断はここを見る。 */
  schema: string;
  exportedAt: string;
  app: string;
  data: BodymakersData;
}

export function buildExport(data: BodymakersData, now = new Date()): BodymakersExport {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    schema: EXPORT_SCHEMA,
    exportedAt: now.toISOString(),
    app: SITE_NAME,
    data,
  };
}

export function exportFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `bodymakers-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
}

export function exportText(data: BodymakersData, now = new Date()): string {
  return JSON.stringify(buildExport(data, now), null, 2);
}

export interface ImportSummary {
  dailyLogs: number;
  strengthHistory: number;
  programHistory: number;
  hasPersonalPlan: boolean;
  hasActiveProgram: boolean;
  exportedAt: string | null;
}

export type ImportResult =
  | { ok: true; data: BodymakersData; summary: ImportSummary }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function summarize(data: BodymakersData, exportedAt: string | null): ImportSummary {
  return {
    dailyLogs: data.dailyLogs.length,
    strengthHistory: data.strengthHistory.length,
    programHistory: data.programHistory.length,
    hasPersonalPlan: data.personalPlan != null,
    hasActiveProgram: data.activeProgram != null,
    exportedAt,
  };
}

/**
 * 読み込むJSONの検証。
 *
 * 受け付けるのは2つだけ。
 * 1. Bodymakersが書き出した包み（format/schema付き）
 * 2. `bodymakers:data:v1` の中身そのもの（手で取り出した人のため）
 *
 * どちらでもない、または形式が違うものは、理由を付けて断る。
 * 中身の個々の値は最後に parseStoredData へ通し、壊れた項目は落とす。
 */
export function parseImport(raw: string): ImportResult {
  const text = raw.trim();
  if (text === '') return { ok: false, error: '読み込むデータが空です。' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: 'JSONとして読み取れませんでした。書き出したファイルをそのまま選んでください。' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Bodymakersのデータではありません。' };
  }

  // 包みなし。localStorage の中身をそのまま貼った場合。
  if (parsed.format === undefined && parsed.version === 1) {
    const data = parseStoredData(JSON.stringify(parsed));
    return { ok: true, data, summary: summarize(data, null) };
  }

  if (parsed.format !== EXPORT_FORMAT) {
    return { ok: false, error: 'Bodymakersが書き出したファイルではありません。' };
  }
  if (typeof parsed.formatVersion !== 'number' || parsed.formatVersion > EXPORT_FORMAT_VERSION) {
    return { ok: false, error: 'このBodymakersより新しい形式です。アプリを更新してから読み込んでください。' };
  }
  if (typeof parsed.schema !== 'string' || parsed.schema !== EXPORT_SCHEMA) {
    // 将来 v2 を作ったときは、ここで v1 → v2 の移行を挟む。
    return { ok: false, error: '対応していないデータ形式です。' };
  }
  if (!isRecord(parsed.data) || parsed.data.version !== 1) {
    return { ok: false, error: 'データ本体が見つかりませんでした。' };
  }

  const data = parseStoredData(JSON.stringify(parsed.data));
  const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null;
  return { ok: true, data, summary: summarize(data, exportedAt) };
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 読み込みで上書きする前の現在データを、同じ端末内に1つだけ残す。
 * 「読み込んだが、やはり前のデータに戻したい」を救うための保険。
 */
export function saveBackup(storage: Storage | null = browserStorage()): boolean {
  if (storage == null) return false;
  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current == null) {
      storage.removeItem(BACKUP_KEY);
      return false;
    }
    storage.setItem(BACKUP_KEY, current);
    return true;
  } catch {
    return false;
  }
}

export function readBackup(storage: Storage | null = browserStorage()): BodymakersData | null {
  if (storage == null) return null;
  try {
    const raw = storage.getItem(BACKUP_KEY);
    return raw == null ? null : parseStoredData(raw);
  } catch {
    return null;
  }
}

export function clearBackup(storage: Storage | null = browserStorage()): boolean {
  if (storage == null) return false;
  try {
    storage.removeItem(BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
}
