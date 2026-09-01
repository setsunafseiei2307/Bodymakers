#!/usr/bin/env python3
"""成分表の全2,538食品へ表示名・絵文字・カテゴリを付与する。"""
from __future__ import annotations

import json
import os

from names import DISPLAY_NAME, pick_emoji

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, 'raw')
NUTRIENT_KEYS = (
    'kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt',
    'sodium', 'potassium', 'calcium', 'magnesium', 'phosphorus', 'iron', 'zinc', 'copper', 'manganese',
    'vitaminA', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB1', 'vitaminB2', 'vitaminB6', 'vitaminB12',
    'folate', 'pantothenic', 'biotin', 'vitaminC',
)
GROUP_LABEL = {
    '01': '穀類', '02': 'いも・でん粉', '03': '砂糖・甘味', '04': '豆類', '05': '種実類',
    '06': '野菜類', '07': '果実類', '08': 'きのこ類', '09': '藻類', '10': '魚介類',
    '11': '肉類', '12': '卵類', '13': '乳類', '14': '油脂類', '15': '菓子類',
    '16': 'し好飲料', '17': '調味料・香辛料', '18': '調理済み食品',
}


def build() -> list[dict]:
    with open(os.path.join(RAW_DIR, 'all_foods.json'), encoding='utf-8') as handle:
        foods = json.load(handle)
    out = []
    for src in foods:
        category = GROUP_LABEL.get(src['group'])
        if category is None:
            raise SystemExit('未知の食品群: %s（%s）' % (src['group'], src['name']))
        name = DISPLAY_NAME.get(src['foodNo'], src['name'])
        out.append({
            'id': src['foodNo'], 'name': name, 'emoji': pick_emoji(src['foodNo'], name),
            'category': category,
            **{key: src[key] for key in NUTRIENT_KEYS},
            'officialName': src['name'], 'estimated': src['estimated'],
            'common': src['foodNo'] in DISPLAY_NAME,
        })
    return out


def main() -> int:
    items = build()
    if len(items) != 2538:
        raise SystemExit('食品数が想定と異なります: %d' % len(items))
    with open(os.path.join(RAW_DIR, 'selected_foods.json'), 'w', encoding='utf-8') as handle:
        json.dump(items, handle, ensure_ascii=False, indent=1)
    print('収録: %d 件' % len(items))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
