# Bodymakers

筋トレ・食事・フィットネスの総合サイト。
記事メディアと、登録不要で使える診断・計算ツールを同じサイトで提供する。

> サイト名は暫定。変更は `src/config/site.ts` の `SITE_NAME` を書き換えるだけで全体に反映される。

## 中核機能: 筋力レベル診断

ベンチプレス・スクワット・デッドリフトの記録から、
同じ性別・体重の人と比べた位置を判定する。

- 推定1RM（7つの換算式の平均）
- 体重帯内パーセンタイル
- 5段階レベル（初心者 / 初級 / 中級 / 上級 / エリート）
- レベル別の到達重量表と「次のレベルまであと◯kg」
- 種目間の順位差から弱点部位を指摘

判定基準は OpenPowerlifting が公開する公式競技会の記録
（パブリックドメイン）から算出した、**387,265人分**の分位数表。
推測値による補完は一切していない。
詳細は [docs/strength-standards.md](docs/strength-standards.md)。

## データを保存しない

会員登録・ログイン・データベースを持たない。
診断の入力値はブラウザの state にしか存在せず、送信も保存もされない。
結果はスクリーンショットで残してもらう前提。

例外は配色（ライト/ダーク）の設定のみで、これは個人を識別する情報ではない。

## 技術構成

- **Astro 7** — SSG。記事は静的HTML、ツールだけReactアイランドとして水和
- **React 19** — 診断ツールのみ
- **TypeScript**（strict）
- **Vitest 4** — `src/lib` の純関数を対象にユニットテスト
- **素のCSS** — カスタムプロパティによるデザイントークン。ライト/ダーク対応
- バックエンド・DBなし

実測で、記事ページに配られる外部JSは0本（Reactは診断ページのみ）。
判断の理由は [docs/architecture.md](docs/architecture.md)。

## セットアップ

```
npm install
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（http://localhost:4321） |
| `npm run build` | 型チェック後に `dist/` へ静的出力 |
| `npm run preview` | ビルド結果をローカルで確認 |
| `npm test` | ユニットテストを1回実行 |
| `npm run test:watch` | テストの監視実行 |
| `npm run typecheck` | 型チェックのみ |
| `npm run check` | 型チェック + テスト |

## 記事の追加

`src/content/articles/` に `.md` を置くと、次のビルドで
`/articles/<ファイル名>` が生成される。

```markdown
---
title: 記事タイトル
description: 一覧カードとmeta descriptionに使う説明
publishedAt: 2026-08-29
category: training   # training | nutrition | basics
tags:
  - タグ1
references:
  - title: 出典のタイトル
    url: https://example.com
    note: 補足
draft: false
---

本文（Markdown）
```

frontmatter は `src/content.config.ts` の Zod スキーマで検証される。
必須項目の書き忘れや日付の書式誤りはビルド時にエラーになる。

`draft: true` の記事は開発サーバーでのみ表示され、本番ビルドには含まれない。

## データの出典

| データ | 出典 | ライセンス |
|---|---|---|
| 筋力の基準値 | [OpenPowerlifting](https://www.openpowerlifting.org) | パブリックドメイン |
| 食品の栄養価（2,538件） | 文部科学省「日本食品標準成分表（八訂）増補2023年」 | — |
| 1RM推定式（7式） | Epley (1985) ほか | 公表されている計算式 |

> This page uses data from the OpenPowerlifting project,
> https://www.openpowerlifting.org.
> You may download a copy of the data at https://gitlab.com/openpowerlifting/opl-data.

方針:

- AIによる推測値・補完値をデータに加えない
- すべての数値に出典を記録し、画面上にも表示する
- データが存在しない場合は「データなし」と表示する
- 集計スクリプトをリポジトリに含め、同じ手順で同じ数値を再現できるようにする

再生成の手順は [docs/strength-standards.md](docs/strength-standards.md) と
[docs/food-data.md](docs/food-data.md) に記載。

## 表現の方針

- 医療行為と誤解される表現を使わない
- 「必ず痩せる」「必ず筋肥大する」等、効果を断定する表現を使わない
- 健康・トレーニングに関する記述は、根拠を出典として示せるものに限る
- 診断結果には「あくまで目安である」旨の注記を必ず入れる

## デプロイ

静的出力なので、どの静的ホスティングでも動く。

```
SITE_URL=https://example.com npm run build
```

`dist/` を配信する。`SITE_URL` は sitemap・RSS・canonical・OGP に使われる。
サブディレクトリ配信が必要なら `BASE_PATH` を設定する。

CI（`.github/workflows/ci.yml`）は push のたびに
型チェック → テスト → ビルド を実行する。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 構成・設計判断・ディレクトリの役割・拡張の余地 |
| [docs/strength-standards.md](docs/strength-standards.md) | 筋力基準値の出典・集計方法・再生成手順 |
| [docs/food-data.md](docs/food-data.md) | 食品データの出典・記号の扱い・再生成手順 |
