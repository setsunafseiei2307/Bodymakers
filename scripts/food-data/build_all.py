#!/usr/bin/env python3
"""成分表の全2,538食品を、アプリが読む形に整える。

入力: raw/all_foods.json（extract.py の出力）
出力: raw/selected_foods.json（全2,538件）

【300件版との違い】
以前は selection.py で選んだ300件だけを収録し、表示名も1件ずつ手で付けていた。
全件を収録するにあたり、次の方針にした。

- カテゴリ: 成分表の食品群（18群）をそのまま使う。
  以前の16カテゴリは300件向けの独自分類で、全件には対応できないため。
  ラベルは正式名を読みやすく言い換えるだけで、対応関係は1対1（下の GROUP_LABEL）。

- 表示名: 使用頻度の高い300件は names.py の DISPLAY_NAME をそのまま使う
  （「こめ [水稲めし] 精白米 うるち米」より「ごはん（精白米）」の方が探しやすい）。
  残りは成分表の収載名をそのまま表示名にする。**言い換えや要約はしない。**

- 絵文字: names.py のキーワード規則をそのまま適用し、当たらなければ null。

栄養価そのものには一切手を触れない。extract.py が転記した収載値をそのまま流す。
"""

from __future__ import annotations

import json
import os

from names import DISPLAY_NAME, pick_emoji

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, 'raw')

# 成分表の食品群コード → 画面に出すラベル。
# 正式名が長いものだけを短くしている。分類そのものは変えていない。
GROUP_LABEL = {
    '01': '穀類',
    '02': 'いも・でん粉',
    '03': '砂糖・甘味',
    '04': '豆類',
    '05': '種実類',
    '06': '野菜類',
    '07': '果実類',
    '08': 'きのこ類',
    '09': '藻類',
    '10': '魚介類',
    '11': '肉類',
    '12': '卵類',
    '13': '乳類',
    '14': '油脂類',
    '15': '菓子類',
    '16': 'し好飲料',
    '17': '調味料・香辛料',
    '18': '調理済み食品',
}


def build() -> list[dict]:
    with open(os.path.join(RAW_DIR, 'all_foods.json'), encoding='utf-8') as handle:
        foods = json.load(handle)

    out: list[dict] = []
    for src in foods:
        code = src['foodNo']
        category = GROUP_LABEL.get(src['group'])
        if category is None:
            raise SystemExit('未知の食品群: %s（%s）' % (src['group'], src['name']))

        # 使用頻度の高い食品だけ手書きの表示名を使い、残りは収載名をそのまま出す
        name = DISPLAY_NAME.get(code, src['name'])

        out.append({
            'id': code,
            'name': name,
            'emoji': pick_emoji(code, name),
            'category': category,
            'kcal': src['kcal'],
            'protein': src['protein'],
            'fat': src['fat'],
            'carbs': src['carbs'],
            'fiber': src['fiber'],
            'salt': src['salt'],
            'officialName': src['name'],
            'estimated': src['estimated'],
            # 手書きの表示名を当てた食品＝日常的によく食べられるもの、として扱う。
            # 一覧の初期表示と検索の並び順で優先する（画面側の judgement はこれ1つ）。
            'common': code in DISPLAY_NAME,
        })
    return out


def main() -> int:
    items = build()
    path = os.path.join(RAW_DIR, 'selected_foods.json')
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(items, handle, ensure_ascii=False, indent=1)

    counts: dict[str, int] = {}
    for item in items:
        counts[item['category']] = counts.get(item['category'], 0) + 1

    print('収録: %d 件' % len(items))
    for label, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        print('  %5d  %s' % (count, label))
    print('手書きの表示名を使った食品: %d 件' % sum(1 for i in items if i['id'] in DISPLAY_NAME))
    print('絵文字あり: %d 件' % sum(1 for i in items if i['emoji']))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
