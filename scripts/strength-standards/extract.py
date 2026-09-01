#!/usr/bin/env python3
"""OpenPowerlifting の meet-data から、筋力標準値の算出に使う行だけを抜き出す。

入力: opl-data リポジトリの meet-data/<連盟>/<大会>/{entries.csv, meet.csv}
      （https://gitlab.com/openpowerlifting/opl-data / データはパブリックドメイン）
出力: raw/sbd-entries.csv（中間ファイル。巨大なのでリポジトリには含めない）

抽出条件（build.py 側ではなくここで確定させる。理由は docs/strength-standards.md 参照）:
  - Equipment == 'Raw'        … ベルトのみ。ニーラップ/スーツ着用の記録は一般のジムでの
                                挙上と比較できないため除外する。
  - Event == 'SBD'            … 3種目すべてを実施したフルパワー大会のみ。ベンチ専門大会を
                                混ぜるとベンチの分布だけが上振れし、種目間比較ができなくなる。
  - 3種目すべてが正の値       … 全種目失敗（ファウル）や未実施を除外する。
  - BodyweightKg が計測済み   … 体重帯の按分に実測体重が要る。
  - Sex が M / F              … OpenPowerlifting は Mx（その他）も収録するが、件数が
                                統計処理に足りないため本データセットからは除外する。

使い方:
    python3 extract.py --opl-data /path/to/opl-data --out raw/sbd-entries.csv
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from typing import Iterator

# 実測体重として妥当な範囲（kg）。これを外れる行は入力ミスとみなして捨てる。
MIN_BODYWEIGHT_KG = 30.0
MAX_BODYWEIGHT_KG = 250.0

# 1種目あたりの上限（kg）。世界記録を大きく超える値は入力ミスとみなして捨てる。
MAX_LIFT_KG = 600.0

OUTPUT_COLUMNS = [
    "name",
    "sex",
    "bodyweight_kg",
    "squat_kg",
    "bench_kg",
    "deadlift_kg",
    "total_kg",
    "year",
    "federation",
]


def parse_positive_float(value: str | None, upper: float) -> float | None:
    """正の実数として読めれば返す。読めない・範囲外なら None。"""
    if not value:
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    if parsed <= 0 or parsed > upper:
        return None
    return parsed


def read_meet_metadata(meet_dir: str) -> tuple[int | None, str]:
    """meet.csv から開催年と連盟名を読む。読めなければ (None, '')。"""
    meet_path = os.path.join(meet_dir, "meet.csv")
    if not os.path.isfile(meet_path):
        return None, ""
    try:
        with open(meet_path, newline="", encoding="utf-8") as handle:
            row = next(csv.DictReader(handle), None)
    except (OSError, UnicodeDecodeError):
        return None, ""
    if row is None:
        return None, ""
    date = (row.get("Date") or "").strip()
    year: int | None = None
    if len(date) >= 4 and date[:4].isdigit():
        year = int(date[:4])
    return year, (row.get("Federation") or "").strip()


def iter_entries(meet_data_root: str) -> Iterator[dict[str, object]]:
    """条件を満たす行を1件ずつ返す。"""
    for dirpath, _dirnames, filenames in os.walk(meet_data_root):
        if "entries.csv" not in filenames:
            continue
        year, federation = read_meet_metadata(dirpath)
        entries_path = os.path.join(dirpath, "entries.csv")
        try:
            with open(entries_path, newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                columns = reader.fieldnames or []
                # 実測体重を持たない大会はまるごと読み飛ばす（1ファイル1回の判定で済む）
                if "BodyweightKg" not in columns:
                    continue
                for row in reader:
                    entry = build_entry(row, year, federation)
                    if entry is not None:
                        yield entry
        except (OSError, UnicodeDecodeError) as error:
            print(f"警告: {entries_path} を読めません: {error}", file=sys.stderr)


def build_entry(
    row: dict[str, str], year: int | None, federation: str
) -> dict[str, object] | None:
    """1行を検査し、条件を満たせば出力用の dict にする。満たさなければ None。"""
    if row.get("Equipment") != "Raw":
        return None
    if row.get("Event") != "SBD":
        return None
    sex = row.get("Sex")
    if sex not in ("M", "F"):
        return None

    bodyweight = parse_positive_float(row.get("BodyweightKg"), MAX_BODYWEIGHT_KG)
    if bodyweight is None or bodyweight < MIN_BODYWEIGHT_KG:
        return None

    squat = parse_positive_float(row.get("Best3SquatKg"), MAX_LIFT_KG)
    bench = parse_positive_float(row.get("Best3BenchKg"), MAX_LIFT_KG)
    deadlift = parse_positive_float(row.get("Best3DeadliftKg"), MAX_LIFT_KG)
    if squat is None or bench is None or deadlift is None:
        return None

    name = (row.get("Name") or "").strip()
    if not name:
        return None

    return {
        "name": name,
        "sex": sex,
        "bodyweight_kg": bodyweight,
        "squat_kg": squat,
        "bench_kg": bench,
        "deadlift_kg": deadlift,
        "total_kg": squat + bench + deadlift,
        "year": year if year is not None else "",
        "federation": federation,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--opl-data",
        required=True,
        help="opl-data リポジトリのルート（meet-data/ を含むディレクトリ）",
    )
    parser.add_argument(
        "--out",
        default="raw/sbd-entries.csv",
        help="出力先CSV（既定: raw/sbd-entries.csv）",
    )
    args = parser.parse_args()

    meet_data_root = os.path.join(args.opl_data, "meet-data")
    if not os.path.isdir(meet_data_root):
        print(f"エラー: {meet_data_root} が見つかりません", file=sys.stderr)
        return 1

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)

    written = 0
    with open(args.out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for entry in iter_entries(meet_data_root):
            writer.writerow(entry)
            written += 1

    print(f"抽出完了: {written:,} 行 → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
