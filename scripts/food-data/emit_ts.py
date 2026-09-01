#!/usr/bin/env python3
"""食品データと元Excel照合用JSONを、全栄養素付きで生成する。"""
from __future__ import annotations

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, 'raw')
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
NUTRIENTS = (
    'kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt',
    'sodium', 'potassium', 'calcium', 'magnesium', 'phosphorus', 'iron', 'zinc', 'copper', 'manganese',
    'vitaminA', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB1', 'vitaminB2', 'vitaminB6', 'vitaminB12',
    'folate', 'pantothenic', 'biotin', 'vitaminC',
)


def num(value):
    return 'null' if value is None else ('%g' % value)


def js_string(text):
    return "'" + text.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main() -> int:
    with open(os.path.join(RAW_DIR, 'selected_foods.json'), encoding='utf-8') as handle:
        items = json.load(handle)
    with open(os.path.join(RAW_DIR, 'all_foods.json'), encoding='utf-8') as handle:
        raw = {item['foodNo']: item for item in json.load(handle)}
    if len(items) != 2538 or len(raw) != 2538:
        raise SystemExit('食品数が想定と異なります: %d / %d' % (len(items), len(raw)))

    categories = []
    for item in items:
        if item['category'] not in categories:
            categories.append(item['category'])
    estimated_sets = []
    def estimated_index(keys):
        if not keys:
            return -1
        if keys not in estimated_sets:
            estimated_sets.append(keys)
        return estimated_sets.index(keys)

    rows = []
    for item in items:
        parts = [js_string(item['id']), js_string(item['name']), 'null' if item['emoji'] is None else js_string(item['emoji']), str(categories.index(item['category']))]
        parts.extend(num(item[key]) for key in NUTRIENTS)
        parts.extend(['0' if item['officialName'] == item['name'] else js_string(item['officialName']), str(estimated_index(item['estimated'])), '1' if item['common'] else '0'])
        rows.append('[' + ','.join(parts) + '],')

    nutrient_types = ',\n  '.join('number | null' for _ in NUTRIENTS)
    lines = [
        '// 自動生成ファイル — 手で編集しないこと。',
        '// 生成: scripts/food-data/extract.py → build_all.py → emit_ts.py',
        '// 出典: 文部科学省「日本食品標準成分表（八訂）増補2023年」第2章（データ）本表',
        '// 数値は可食部100gあたりの収載値をそのまま転記している。欠損の補完はしていない。',
        '',
        "import type { Food, NutrientKey } from './foods';",
        '',
        'const CATEGORIES = [' + ', '.join(js_string(category) for category in categories) + '] as const;',
        'const ESTIMATED: NutrientKey[][] = [',
        *['  [' + ', '.join(js_string(key) for key in keys) + '],' for keys in estimated_sets],
        '];',
        '',
        'type Row = [',
        '  string, string, string | null, number,',
        '  ' + nutrient_types + ',',
        '  string | 0, number, 0 | 1,',
        '];',
        '',
        'const ROWS: Row[] = [',
        *['  ' + row for row in rows],
        '];',
        '',
        'function toFood(row: Row): Food {',
        '  const [id, name, emoji, category] = row;',
        '  const food: Food = {',
        '    id, name, emoji, category: CATEGORIES[category],',
        *[f'    {key}: row[{4 + index}],' for index, key in enumerate(NUTRIENTS)],
        '    officialName: row[31] === 0 ? name : row[31] as string,',
        '    common: row[33] === 1,',
        '  };',
        '  const estimated = row[32] as number;',
        '  if (estimated >= 0) food.estimated = ESTIMATED[estimated];',
        '  return food;',
        '}',
        '',
        'export const FOODS: readonly Food[] = ROWS.map(toFood);',
        '',
    ]
    ts_path = os.path.join(REPO_ROOT, 'src', 'lib', 'foodData.ts')
    with open(ts_path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines))

    source = {item['id']: {'officialName': raw[item['id']]['name'], **{key: raw[item['id']][key] for key in NUTRIENTS}} for item in items}
    json_path = os.path.join(REPO_ROOT, 'src', 'test', 'foods-source.json')
    with open(json_path, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(source, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write('\n')
    print('foodData.ts: %.1f KB' % (os.path.getsize(ts_path) / 1024))
    print('foods-source.json: %.1f KB' % (os.path.getsize(json_path) / 1024))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
