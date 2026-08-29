# 筋力標準値の作り方

このドキュメントは、`src/lib/strength/standardsData.ts` に入っている数値が
どこから来て、どう加工されたものかを説明する。数値の再現手順もここに書く。

## 1. 出典とライセンス

| 項目 | 内容 |
|---|---|
| プロジェクト | OpenPowerlifting |
| サイト | https://www.openpowerlifting.org |
| データ配布元 | https://gitlab.com/openpowerlifting/opl-data |
| データのライセンス | パブリックドメイン |
| コードのライセンス | AGPL-3.0（本プロジェクトでは使用していない） |

同リポジトリの `LICENSE-DATA` に次の記載がある。

> OpenPowerlifting data is contributed to the public domain.
> To the extent possible under law, all CSV data is waived of all copyright
> and related or neighboring rights.

帰属表示は必須ではないが推奨されている。推奨文をそのまま
`src/lib/strength/standards.ts` の `STANDARDS_SOURCE.attribution` に持たせ、
診断結果画面と `/sources` に表示している。

**注意: OpenPowerlifting の「コード」は AGPL-3.0 である。**
本プロジェクトが使っているのは `meet-data/` 配下のCSV（パブリックドメイン）だけで、
同リポジトリのRustコードは一切取り込んでいない。

### 検討したが採用しなかった出典

| 候補 | 判断 | 理由 |
|---|---|---|
| ExRx.net の筋力基準表 | **採用不可** | 利用規約が転載を明確に禁止している。「automated scraping or manual copying of their content is prohibited for either personal or commercial use, including training AI models, including compiling, storing, or reproducing large portions」との記載があり、数値表の複製は許諾されていない |
| Strength Level | 採用せず | 自社サービスのユーザー投稿データ（自己申告・検証不能）。再配布ライセンスの提示がない |
| Symmetric Strength | 採用せず | 同上 |

## 2. 抽出条件

`scripts/strength-standards/extract.py` が適用する条件。

| 条件 | 値 | 理由 |
|---|---|---|
| Equipment | `Raw` のみ | ベルトのみ。ニーラップ・スーツ着用の記録は一般のジムでの挙上と比較できない |
| Event | `SBD` のみ | 3種目実施のフルパワー大会。ベンチ専門大会を混ぜるとベンチの分布だけが上振れし、種目間比較が成立しない |
| 3種目の記録 | すべて正の値 | 全試技失敗・未実施を除外 |
| BodyweightKg | 30〜250kg | 実測体重が要る。階級だけの記録は使わない |
| 1種目あたりの上限 | 600kg | 世界記録を大きく超える値は入力ミスとみなす |
| Sex | `M` / `F` | OpenPowerlifting は `Mx` も収録するが、統計処理に足りる件数がない |

抽出結果（2026-08-29 時点）:

| 段階 | 件数 |
|---|---|
| 全エントリ | 4,009,735 |
| 上記条件を満たす行 | 1,066,773 |

## 3. 集計方法

`scripts/strength-standards/build.py` が行う処理。

### 3.1 選手の重複排除

同一選手が複数大会に出ていると、よく出る選手ほど分布に重く効く。
**氏名と性別をキーに、トータルが最大だった1試合だけ**を残す。

OpenPowerlifting は同姓同名を `Name #2` のように区別して収録しているため、
氏名は選手の識別子として使える。

### 3.2 開催年での絞り込み

既定は **2010年以降**。ノーギア競技が一般化したのがこの時期で、
それ以前は母集団の性格が異なる。

重複排除・年絞り込み後: **387,265人**（男性 262,191 / 女性 125,074）

### 3.3 体重アンカーと移動窓

体重階級で区切ると境目で基準値が不連続に跳ねる。代わりに:

1. 代表的な体重（アンカー）を決める
   - 男性: 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 140 kg
   - 女性: 45, 50, 55, 60, 65, 70, 75, 80, 90, 100 kg
2. 各アンカーについて、体重が `アンカー ± max(8%, 4kg)` に入る選手を集める
3. その集合で分位数を出す
4. アプリ側（`interpolateCurve`）でアンカー間を線形補間する

アンカーの外側（最軽量より軽い・最重量より重い）は端の値をそのまま使い、
**外挿はしない**。

### 3.4 分位点

`[1, 5, 10, 20, 30, 40, 50, 60, 65, 70, 80, 90, 95, 99]` パーセンタイル。
線形補間による分位数（numpy の `method='linear'` と同じ定義）を自前で実装している。
外部依存を増やさないため。

### 3.5 標本数の下限

1アンカーあたり **300件** に満たない場合は数値を出さず `null` を書く。
アプリ側は「データなし」と表示する。推測値では埋めない。

実際の標本数（2026-08-29 時点）は最少でも 5,145件（女性45kg）で、
全アンカーが下限を大きく上回っている。

### 3.6 種目間比率

弱点指摘に使う。スクワットを1としたときのベンチ・デッドリフトの比率を
**選手ごとに計算してから中央値を採る**。
中央値どうしの比とは一致しないため、必ず選手単位で計算すること。

## 4. 5段階レベルの区切り

`src/lib/strength/standards.ts` の `LEVELS` で定義。

| レベル | パーセンタイル | 定義（画面にそのまま出す） |
|---|---|---|
| 初心者 | 0〜10 | 競技会出場者の中では下位10%未満 |
| 初級 | 10〜30 | 競技会出場者の中で下位10〜30% |
| 中級 | 30〜65 | 競技会出場者の中で下位30〜65% |
| 上級 | 65〜90 | 競技会出場者の中で上位10〜35% |
| エリート | 90〜100 | 競技会出場者の中で上位10%以内 |

区切りは **分位点グリッド上の値（10 / 30 / 65 / 90）に合わせてある**。
補間せずに実データの分位数をそのまま境界値として使えるようにするため。
グリッドを変更する場合は、レベルの区切りも同じグリッド上に乗るよう合わせること
（`src/test/strength-standards.test.ts` がこれを検証している）。

## 5. 母集団の限界（画面に必ず書くこと）

- 母集団は**公式競技会の出場者**であり、一般のジム利用者の無作為標本ではない。
  全体に高い水準に寄っている。
- 競技会のスクワットは規定の深さ、ベンチプレスは静止が求められる。
  ジムでの挙上より判定が厳しい。
- 年齢で層別していない。ジュニアからマスターズまで含む。
  診断の入力で年齢を取っていないため、母集団側も分けていない。
- 国・地域で層別していない。日本人だけの分布ではない。

これらは `/sources` と診断結果画面に明記している。省略しないこと。

## 6. 再生成の手順

データを更新したくなったときの手順。

```
# 1. OpenPowerlifting のデータを取得（約1.9GB）
git clone --depth 1 https://gitlab.com/openpowerlifting/opl-data.git /tmp/opl-data

# 2. 条件を満たす行を抽出（約15秒）
python3 scripts/strength-standards/extract.py \
  --opl-data /tmp/opl-data \
  --out scripts/strength-standards/raw/sbd-entries.csv

# 3. 集計してTSとテスト用JSONを書き出す（約10秒）
python3 scripts/strength-standards/build.py

# 4. テストで検証
npm test
```

`build.py` は2つのファイルを書き出す。

| 出力 | 用途 |
|---|---|
| `src/lib/strength/standardsData.ts` | アプリが読む本体 |
| `src/test/strength-standards-source.json` | テスト用の検証データ |

`src/test/strength-standards.test.ts` が両者を全数突き合わせるので、
`standardsData.ts` を手で書き換えるとテストが落ちる。

集計条件を変えたい場合:

```
python3 scripts/strength-standards/build.py --since 2015 --min-sample 500
```

Python の外部依存はない（標準ライブラリのみ）。

## 7. 中間ファイルをコミットしない理由

`scripts/strength-standards/raw/` は `.gitignore` で除外している。
`sbd-entries.csv` は約60MBあり、リポジトリに入れる価値がない。
再生成の手順が上に書いてあれば足りる。
