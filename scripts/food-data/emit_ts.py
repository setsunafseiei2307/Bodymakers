# -*- coding: utf-8 -*-
"""selected_foods.json から
   - src/lib/foodData.ts      アプリが使う食品データ
   - src/test/foods-source.json  元Excelから抽出した検証用の値
   を書き出す。"""
import json
import os

# このスクリプトから見たリポジトリのルート（scripts/food-data/ の2つ上）
DEST = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

items = json.load(open('selected_foods.json', encoding='utf-8'))
raw = {f['foodNo']: f for f in json.load(open('all_foods.json', encoding='utf-8'))}


def num(v):
    if v is None:
        return 'null'
    return ('%g' % v)


def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'")


# ---------------------------------------------------------------- foodData.ts

lines = [
    "// 自動生成ファイル — 手で編集しないこと。",
    "// 出典: 文部科学省「日本食品標準成分表（八訂）増補2023年」第2章（データ）本表",
    "//       https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html",
    "// 数値は可食部100gあたりの収載値をそのまま転記している（推測値・補完値は一切含まない）。",
    "// id は成分表の食品番号。officialName は成分表の収載名で、出典の追跡用に保持している。",
    "// estimated は成分表で括弧付き（推定値）だった項目名。",
    "//",
    "// 再生成の手順は docs/food-data.md を参照。",
    "",
    "import type { Food } from './foods';",
    "",
    "export const FOODS: readonly Food[] = [",
]

for i in items:
    est = i['estimated']
    est_ts = '' if not est else (", estimated: [%s]" % ', '.join("'%s'" % e for e in est))
    emoji = 'null' if i['emoji'] is None else "'%s'" % i['emoji']
    lines.append(
        "  { id: '%s', name: '%s', emoji: %s, category: '%s', "
        "kcal: %s, protein: %s, fat: %s, carbs: %s, fiber: %s, salt: %s, "
        "officialName: '%s'%s }," % (
            i['id'], esc(i['name']), emoji, esc(i['category']),
            num(i['kcal']), num(i['protein']), num(i['fat']), num(i['carbs']),
            num(i['fiber']), num(i['salt']), esc(i['officialName']), est_ts))

lines.append('];')
lines.append('')

path = os.path.join(DEST, 'src', 'lib', 'foodData.ts')
open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('foodData.ts:', os.path.getsize(path), 'bytes')

# ---------------------------------------------------------------- 検証用データ

# アプリのデータとは別経路で、元Excelの抽出結果をそのまま持つ。
# foods.ts 側を手で書き換えてしまった場合に、テストが検知できるようにするため。
source = {}
for i in items:
    r = raw[i['id']]
    source[i['id']] = {
        'officialName': r['name'],
        'kcal': r['kcal'], 'protein': r['protein'], 'fat': r['fat'],
        'carbs': r['carbs'], 'fiber': r['fiber'], 'salt': r['salt'],
    }

path = os.path.join(DEST, 'src', 'test', 'foods-source.json')
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(source, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write('\n')
print('foods-source.json:', os.path.getsize(path), 'bytes')
