"""文部科学省「日本食品標準成分表（八訂）増補2023年」本表を抽出する。

栄養素の列番号を固定せず、表上部の成分識別子（ENERC_KCAL / PROT- など）から
対象列を特定する。openpyxl に依存せず、xlsx 標準のXMLを読む。
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

RAW_DIR = Path(__file__).with_name('raw')
XLSX_PATH = RAW_DIR / 'seibunhyo2023.xlsx'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

NUTRIENT_IDENTIFIERS = {
    'kcal': 'ENERC_KCAL', 'protein': 'PROT-', 'fat': 'FAT-', 'carbs': 'CHOCDF-',
    'fiber': 'FIB-', 'salt': 'NACL_EQ',
    'sodium': 'NA', 'potassium': 'K', 'calcium': 'CA', 'magnesium': 'MG',
    'phosphorus': 'P', 'iron': 'FE', 'zinc': 'ZN', 'copper': 'CU', 'manganese': 'MN',
    'vitaminA': 'VITA_RAE', 'vitaminD': 'VITD', 'vitaminE': 'TOCPHA', 'vitaminK': 'VITK',
    'vitaminB1': 'THIA', 'vitaminB2': 'RIBF', 'vitaminB6': 'VITB6A',
    'vitaminB12': 'VITB12', 'folate': 'FOL', 'pantothenic': 'PANTAC',
    'biotin': 'BIOT', 'vitaminC': 'VITC',
}
NUTRIENT_KEYS = tuple(NUTRIENT_IDENTIFIERS)
GROUP_NAMES = {
    '01': '穀類', '02': 'いも及びでん粉類', '03': '砂糖及び甘味類', '04': '豆類',
    '05': '種実類', '06': '野菜類', '07': '果実類', '08': 'きのこ類', '09': '藻類',
    '10': '魚介類', '11': '肉類', '12': '卵類', '13': '乳類', '14': '油脂類',
    '15': '菓子類', '16': 'し好飲料類', '17': '調味料及び香辛料類', '18': '調理済み流通食品類',
}


def col_number(ref: str) -> int:
    value = 0
    for char in ref:
        if char.isalpha():
            value = value * 26 + ord(char.upper()) - 64
    return value


def parse_value(raw):
    """'−'は未測定、Trは0、括弧付き値は数値と推定フラグを返す。"""
    if raw is None:
        return None, False
    text = str(raw).strip()
    if text in ('', '-', '*'):
        return None, False
    estimated = text.startswith('(') and text.endswith(')')
    if estimated:
        text = text[1:-1].strip()
    if text.lower() == 'tr':
        return 0.0, estimated
    try:
        return float(text.replace(',', '')), estimated
    except ValueError:
        return None, False


def clean_name(raw):
    text = unicodedata.normalize('NFKC', str(raw))
    text = re.sub(r'[＜<][^＞>]*[＞>]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def shared_strings(archive: ZipFile) -> list[str]:
    root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
    return [''.join(node.text or '' for node in item.iter(NS + 't')) for item in root.findall(NS + 'si')]


def sheet_rows(archive: ZipFile, sheet_path: str):
    strings = shared_strings(archive)
    root = ET.fromstring(archive.read(sheet_path))
    for row in root.findall('.//' + NS + 'row'):
        values: dict[int, str] = {}
        for cell in row.findall(NS + 'c'):
            ref = cell.attrib.get('r', '')
            value_node = cell.find(NS + 'v')
            value = '' if value_node is None else (value_node.text or '')
            if cell.attrib.get('t') == 's' and value:
                value = strings[int(value)]
            elif cell.attrib.get('t') == 'inlineStr':
                value = ''.join(node.text or '' for node in cell.iter(NS + 't'))
            values[col_number(ref)] = value
        yield int(row.attrib['r']), values


def main() -> None:
    if not XLSX_PATH.exists():
        raise SystemExit(f'元Excelがありません: {XLSX_PATH}')

    with ZipFile(XLSX_PATH) as archive:
        rows = list(sheet_rows(archive, 'xl/worksheets/sheet1.xml'))

    columns: dict[str, int] = {}
    identifiers = {identifier: key for key, identifier in NUTRIENT_IDENTIFIERS.items()}
    for _, row in rows[:20]:
        for column, value in row.items():
            key = identifiers.get(str(value).strip())
            if key is not None:
                columns[key] = column
    missing = [key for key in NUTRIENT_KEYS if key not in columns]
    if missing:
        raise SystemExit('成分識別子が見つかりません: ' + ', '.join(missing))

    foods = []
    for row_number, row in rows:
        if row_number < 13:
            continue
        group = row.get(1)
        food_no = row.get(2)
        if not group or not food_no:
            continue
        group = str(group).strip().zfill(2)
        food_no = str(food_no).strip().zfill(5)
        record = {
            'foodNo': food_no,
            'group': group,
            'groupName': GROUP_NAMES.get(group, group),
            'name': clean_name(row.get(4, '')),
        }
        estimated = []
        for key in NUTRIENT_KEYS:
            value, is_estimated = parse_value(row.get(columns[key]))
            record[key] = value
            if is_estimated:
                estimated.append(key)
        record['estimated'] = estimated
        foods.append(record)

    if len(foods) != 2538:
        raise SystemExit(f'食品数が想定と異なります: {len(foods)}')
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / 'all_foods.json').write_text(json.dumps(foods, ensure_ascii=False, indent=1), encoding='utf-8')
    print('total foods:', len(foods))
    print('detected identifiers:', ', '.join(f'{key}={NUTRIENT_IDENTIFIERS[key]}' for key in NUTRIENT_KEYS))


if __name__ == '__main__':
    main()
