#!/usr/bin/env python3
"""selected_foods.json から
   - src/lib/foodData.ts          アプリが読む食品データ
   - src/test/foods-source.json   元Excelから抽出した検証用の値（別経路で書き出す）
   を書き出す。

【出力形式について】
2,538件をオブジェクトリテラルで書くと 579KB になり、そのぶんJSのパースが要る。
キー名を持たないタプル形式なら 306KB で済むので、そちらで書き出して
モジュール読み込み時にオブジェクトへ展開する（展開は数ミリ秒）。

検証用JSONは foodData.ts とは別経路（生の all_foods.json）から書き出す。
同じ経路で作ると、変換にバグがあっても両方が同じように壊れて検証にならない。
"""

from __future__ import annotations

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, 'raw')
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))

# タプルの並び。foodData.ts の展開処理と対で管理する。
NUTRIENTS = ('kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt')


def num(value: float | None) -> str:
    return 'null' if value is None else ('%g' % value)


def js_string(text: str) -> str:
    return "'" + text.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main() -> int:
    with open(os.path.join(RAW_DIR, 'selected_foods.json'), encoding='utf-8') as handle:
        items = json.load(handle)
    with open(os.path.join(RAW_DIR, 'all_foods.json'), encoding='utf-8') as handle:
        raw = {f['foodNo']: f for f in json.load(handle)}

    # カテゴリは種類が少ないので、文字列を繰り返さず添字で持つ
    categories: list[str] = []
    for item in items:
        if item['category'] not in categories:
            categories.append(item['category'])

    # 推定値の項目名も同様に添字化する
    estimated_sets: list[list[str]] = []
    def estimated_index(keys: list[str]) -> int:
        if not keys:
            return -1
        if keys not in estimated_sets:
            estimated_sets.append(keys)
        return estimated_sets.index(keys)

    rows: list[str] = []
    for item in items:
        parts = [
            js_string(item['id']),
            js_string(item['name']),
            'null' if item['emoji'] is None else js_string(item['emoji']),
            str(categories.index(item['category'])),
            *[num(item[key]) for key in NUTRIENTS],
            # 表示名と収載名が同じなら重複して持たない（0 で「name と同じ」を表す）
            '0' if item['officialName'] == item['name'] else js_string(item['officialName']),
            str(estimated_index(item['estimated'])),
            '1' if item['common'] else '0',
        ]
        rows.append('[' + ','.join(parts) + '],')

    lines = [
        '// 自動生成ファイル — 手で編集しないこと。',
        '// 生成: scripts/food-data/extract.py → build_all.py → emit_ts.py',
        '//',
        '// 出典: 文部科学省「日本食品標準成分表（八訂）増補2023年」第2章（データ）本表',
        '//       https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html',
        '// 数値は可食部100gあたりの収載値をそのまま転記している（推測値・補完値は一切含まない）。',
        '// id は成分表の食品番号。officialName は成分表の収載名で、出典の追跡用に保持している。',
        '// estimated は成分表で括弧付き（推定値）だった項目名。',
        '//',
        '// 収録: 成分表の全 %d 食品。うち %d 件を「よく食べる食品」として印を付けている'
        % (len(items), sum(1 for i in items if i['common'])),
        '// （一覧の初期表示と検索の並び順にだけ使う。栄養価の扱いは全食品まったく同じ）。',
        '// 再生成の手順は docs/food-data.md を参照。',
        '',
        "import type { Food, NutrientKey } from './foods';",
        '',
        '/** カテゴリ（成分表の食品群18群を読みやすく言い換えたもの）。 */',
        'const CATEGORIES = [' + ', '.join(js_string(c) for c in categories) + '] as const;',
        '',
        '/** 成分表で括弧付き（推定値）だった項目の組み合わせ。 */',
        'const ESTIMATED: NutrientKey[][] = [',
    ]
    for keys in estimated_sets:
        lines.append('  [' + ', '.join(js_string(k) for k in keys) + '],')
    lines += [
        '];',
        '',
        '/**',
        ' * 1食品 = 1タプル。並びは',
        ' * [id, name, emoji, カテゴリ添字, kcal, protein, fat, carbs, fiber, salt,',
        ' *  収載名（name と同じなら 0）, 推定値の組の添字（無ければ -1）,',
        ' *  よく食べる食品なら 1]',
        ' */',
        'type Row = [',
        '  string, string, string | null, number,',
        '  number | null, number | null, number | null,',
        '  number | null, number | null, number | null,',
        '  string | 0, number, 0 | 1,',
        '];',
        '',
        'const ROWS: Row[] = [',
    ]
    lines += ['  ' + row for row in rows]
    lines += [
        '];',
        '',
        '/** タプルを Food に展開する。読み込み時に1回だけ走る。 */',
        'function toFood(row: Row): Food {',
        '  const [id, name, emoji, category, kcal, protein, fat, carbs, fiber, salt, official, est,',
        '    common] = row;',
        '  const food: Food = {',
        '    id,',
        '    name,',
        '    emoji,',
        '    category: CATEGORIES[category],',
        '    kcal,',
        '    protein,',
        '    fat,',
        '    carbs,',
        '    fiber,',
        '    salt,',
        '    officialName: official === 0 ? name : official,',
        '    common: common === 1,',
        '  };',
        '  if (est >= 0) food.estimated = ESTIMATED[est];',
        '  return food;',
        '}',
        '',
        'export const FOODS: readonly Food[] = ROWS.map(toFood);',
        '',
    ]

    ts_path = os.path.join(REPO_ROOT, 'src', 'lib', 'foodData.ts')
    with open(ts_path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines))
    print('foodData.ts: %.1f KB' % (os.path.getsize(ts_path) / 1024))

    # --- 検証用JSON。foodData.ts とは別経路（生の抽出結果）から作る ---
    source = {}
    for item in items:
        src = raw[item['id']]
        source[item['id']] = {
            'officialName': src['name'],
            **{key: src[key] for key in NUTRIENTS},
        }
    json_path = os.path.join(REPO_ROOT, 'src', 'test', 'foods-source.json')
    with open(json_path, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(source, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write('\n')
    print('foods-source.json: %.1f KB' % (os.path.getsize(json_path) / 1024))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
