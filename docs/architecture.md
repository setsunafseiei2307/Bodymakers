# 構成と設計判断

## 技術構成

| 領域 | 採用 | 理由 |
|---|---|---|
| フレームワーク | Astro 7 | 記事はSSGで静的HTML、ツールだけReactを水和するアイランド構成が取れる |
| UI（ツール部分） | React 19 | 移植元がReact。診断ツールのような状態を持つUIに向く |
| 言語 | TypeScript（strict） | 移植したロジックが純TypeScript。`noUnusedLocals` / `noUnusedParameters` も有効 |
| テスト | Vitest 4 | Astro の実体が Vite なので設定が共通化できる |
| スタイル | 素のCSS（カスタムプロパティ） | 依存を増やさず、ライト/ダークのトークンを1か所で管理する |
| データ生成 | Python 3（標準ライブラリのみ） | 移植元の食品データ生成スクリプトと揃える |
| バックエンド | なし | 静的出力のみ。DBもAPIも持たない |

### Next.js を採らなかった理由

`output: export` による静的出力は可能だが、Reactランタイムが全記事ページに乗る。
広告収益を前提とする記事メディアでは LCP / INP が直接収益に効くため、
記事ページのJSをゼロにできる Astro を採った。

実測（`npm run build` 後の `dist/`）:

| ページ | 外部JS | インラインJS |
|---|---|---|
| トップ | 0本 | 893 B（配色切替） |
| 記事ページ | 0本 | 893 B（同上） |
| 診断ページ | 2本（React 184KB + フォーム 32KB） | 5.4 KB |

Reactは診断ページにしか配られていない。

### CSSフレームワークを採らなかった理由

診断結果カード（スクリーンショット共有前提）の作り込みと、
ライト/ダーク双方のトークン設計を細かく制御したかった。
`src/styles/global.css` にトークンとベース、
`src/styles/strength.css` に診断画面固有のスタイルを置き、後者は診断ページでのみ読み込む。

## ディレクトリ構成

```
src/
├─ config/site.ts          サイト名・ナビ・カテゴリ。名称変更はここだけ
├─ content.config.ts       記事コレクションのスキーマ（Zod）
├─ content/articles/       記事のMarkdown。置けばページが増える
├─ layouts/
│  ├─ BaseLayout.astro     <head>・ヘッダー・フッター・スキップリンク
│  └─ ArticleLayout.astro  記事の型（パンくず・参考文献・注記・回遊導線）
├─ components/             .astro の共通部品（React非依存）
│  └─ react/               Reactアイランド。ここだけJSが配られる
├─ lib/                    ロジック層。UI非依存の純関数
│  ├─ format.ts            全ロジックの土台
│  ├─ onerm.ts rpe.ts plates.ts smolov.ts nutrition.ts
│  ├─ foods.ts foodData.ts 食品300件
│  ├─ articles.ts          記事コレクションの取得ヘルパー
│  └─ strength/            筋力レベル診断
│     ├─ standards.ts      型・補間・分位数の正逆引き・レベル定義
│     ├─ standardsData.ts  自動生成の基準表
│     └─ diagnose.ts       入力検証と診断の組み立て
├─ pages/                  URLと1対1
├─ styles/                 global.css（全ページ）/ strength.css（診断のみ）
└─ test/                   Vitest。src/lib のみを対象にする
```

### レイヤ間の依存方向

```
pages/  →  layouts/  →  components/  →  lib/
                            ↓
                        lib/（React非依存）
```

`lib/` から `components/` や `pages/` への依存はゼロ。
これにより、`lib/` のロジックは Vitest から `environment: 'node'` のまま検証できる。

`lib/` 内部の依存は `format.ts` を末端とする木構造:

- `format.ts` … 依存なし
- `onerm.ts` / `rpe.ts` / `plates.ts` / `smolov.ts` / `nutrition.ts` → `format.ts`
- `foods.ts` → `format.ts` + `foodData.ts`、`foodData.ts` → `foods.ts`（型のみ）
- `strength/standards.ts` → `format.ts`
- `strength/diagnose.ts` → `standards.ts` + `standardsData.ts` + `onerm.ts` + `format.ts`

## データを保存しない設計

会員登録・ログイン・データベースを持たない。
診断の入力値は React の state にしか存在せず、
サーバーへ送信されず、localStorage にも書かない。ページを閉じれば消える。

**例外は配色（ライト/ダーク）の設定のみ。**
これは個人を識別する情報ではなく、
保存しないとページ遷移のたびに画面が切り替わって読みにくい。
キーは `bodymakers:theme`。

この設計により、個人情報の保管責任を負わずに診断機能を提供できる。

## 記事の運用

`src/content/articles/` に `.md` を1つ置けば、次のビルドで
`/articles/<ファイル名>` が生成される。frontmatter は
`src/content.config.ts` の Zod スキーマで検証され、
必須項目の書き忘れや日付の書式誤りはビルド時にエラーになる。

frontmatter の項目:

| 項目 | 必須 | 内容 |
|---|---|---|
| `title` | ○ | 1〜120文字 |
| `description` | ○ | 1〜200文字。一覧カードと meta description |
| `publishedAt` | ○ | `YYYY-MM-DD` |
| `updatedAt` | | 内容を直したときだけ |
| `category` | ○ | `training` / `nutrition` / `basics` |
| `tags` | | 関連記事の判定に使う |
| `references` | | 参考文献。`title` / `url` / `note` |
| `draft` | | `true` の間は本番ビルドに含めない（開発サーバーでは見える） |

`draft: true` の記事は開発サーバーでのみ表示されるので、
書きかけを置いたまま他の記事を公開できる。

## 収益化の準備

現時点で広告タグ・アフィリエイトリンクは一切読み込んでいない。
枠の寸法だけを先に確保してある。

| クラス | 位置 | 高さ |
|---|---|---|
| `.ad-slot--inline` | トップ中段 / 記事末尾 / 一覧下部 / 診断結果下 | 250px |
| `.ad-slot--footer` | 全ページのフッター | 90px |
| `.ad-slot--sidebar` | 診断ページのサイドバー（960px以上のみ） | 600px |

`min-height` を先に決めてあるのは、広告読み込み時の CLS を防ぐため。
有効化するときは `.ad-slot` の中にタグを入れるだけで、周囲のレイアウトを触らずに済む。

アフィリエイトリンクの差し込み位置は
`src/layouts/ArticleLayout.astro` と
`src/components/react/StrengthResult.tsx` にコメントで明示している。
掲載する場合は本文と区別できる形にし、PR表記を添えること。

## 回遊導線

- トップ → 診断（ヒーローの主ボタン、ナビの強調リンク）
- 記事 → 診断（記事末尾のCTAカード）
- 診断結果 → 記事（カテゴリ別一覧・出典ページへのリンク）
- 記事 → 関連記事（同じタグを多く共有する記事を優先）

## フェーズ2以降のための余地

| 予定 | 用意してあるもの |
|---|---|
| 食事メニュー | 食品データ300件（`src/lib/foods.ts`）とPFC計算（`src/lib/nutrition.ts`）が移植済み |
| 種目解説 | 記事カテゴリを追加すれば `src/config/site.ts` の1か所で増える |
| プラン提示 | Smolovプログラム生成（`src/lib/smolov.ts`）が移植済み |
| 画像認識API | サーバーが要るため現構成では不可。別途エンドポイントを立てる判断になる |

種目の追加（オーバーヘッドプレスなど）は
`src/lib/strength/standards.ts` の `LiftId` に足し、
`build.py` の `LIFTS` に対応する集計を加える。
ただし OpenPowerlifting はSBD3種目しか収録していないため、
別の出典が要る点に注意。

## サイト名の変更手順

`src/config/site.ts` の `SITE_NAME` / `SITE_SHORT_NAME` を書き換える。
ヘッダー・フッター・OGP・RSS・構造化データすべてに反映される。
文言に直接サイト名を埋め込まないこと。

`localStorage` のキー接頭辞（`bodymakers:`）だけはコードに直接書いてある。
変更しても実害はない（前の設定が読めなくなるだけ）。

## 公開URL

`astro.config.mjs` の `site` は環境変数 `SITE_URL` で差し替えられる。
sitemap・RSS・canonical・OGP がすべて追従する。
サブディレクトリ配信が必要な場合は `BASE_PATH` を設定する。
