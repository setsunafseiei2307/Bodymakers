"""日本食品標準成分表（八訂）増補2023年 第2章（データ）本表 から
   食品名 / kcal / たんぱく質 / 脂質 / 炭水化物 / 食物繊維 / 食塩相当量 を抽出する。"""
import json
import re
import unicodedata

import openpyxl

COL = {
    'group': 1,
    'foodNo': 2,
    'index': 3,
    'name': 4,
    'refuse': 5,
    'kcal': 7,
    'protein': 10,   # PROT-
    'fat': 13,       # FAT-
    'carbs': 21,     # CHOCDF-
    'fiber': 19,     # FIB-
    'salt': 61,      # NACL_EQ
}

GROUP_NAMES = {
    '01': '穀類', '02': 'いも及びでん粉類', '03': '砂糖及び甘味類', '04': '豆類',
    '05': '種実類', '06': '野菜類', '07': '果実類', '08': 'きのこ類', '09': '藻類',
    '10': '魚介類', '11': '肉類', '12': '卵類', '13': '乳類', '14': '油脂類',
    '15': '菓子類', '16': 'し好飲料類', '17': '調味料及び香辛料類', '18': '調理済み流通食品類',
}


def parse_value(raw):
    """成分表の記号を数値へ。
       '-'   未測定           -> None
       'Tr'  微量(最小記載量未満) -> 0.0
       '(x)' 推定値/borrowed    -> x（推定フラグを立てる）
       ''    空欄              -> None
    """
    if raw is None:
        return None, False
    s = str(raw).strip()
    if s in ('', '-', '*'):
        return None, False
    estimated = s.startswith('(') and s.endswith(')')
    if estimated:
        s = s[1:-1].strip()
    if s in ('Tr', 'tr'):
        return 0.0, estimated
    s = s.replace(',', '')
    try:
        return float(s), estimated
    except ValueError:
        return None, False


def clean_name(raw):
    """全角スペース区切りの階層名を整える。'＜＞' の分類記号は落とす。"""
    s = unicodedata.normalize('NFKC', str(raw))
    s = re.sub(r'[＜<][^＞>]*[＞>]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def main():
    wb = openpyxl.load_workbook('seibunhyo2023.xlsx', read_only=True, data_only=True)
    ws = wb['表全体']

    foods = []
    for row in ws.iter_rows(min_row=13, max_col=61, values_only=True):
        group = row[COL['group'] - 1]
        food_no = row[COL['foodNo'] - 1]
        if group is None or food_no is None:
            continue
        group = str(group).strip().zfill(2)
        food_no = str(food_no).strip().zfill(5)

        rec = {
            'foodNo': food_no,
            'group': group,
            'groupName': GROUP_NAMES.get(group, group),
            'name': clean_name(row[COL['name'] - 1]),
        }
        estimated_fields = []
        for key in ('kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt'):
            value, est = parse_value(row[COL[key] - 1])
            rec[key] = value
            if est:
                estimated_fields.append(key)
        rec['estimated'] = estimated_fields
        foods.append(rec)

    with open('all_foods.json', 'w', encoding='utf-8') as f:
        json.dump(foods, f, ensure_ascii=False, indent=1)

    print('total foods:', len(foods))
    counts = {}
    for f in foods:
        counts[f['groupName']] = counts.get(f['groupName'], 0) + 1
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        print('%5d  %s' % (v, k))

    missing = [f for f in foods if f['kcal'] is None or f['protein'] is None
               or f['fat'] is None or f['carbs'] is None]
    print('PFC/kcal のいずれかが欠損:', len(missing))


if __name__ == '__main__':
    main()
