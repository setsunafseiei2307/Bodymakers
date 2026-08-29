#!/usr/bin/env python3
"""抽出済みCSVから、体重帯ごとのパーセンタイル表を作る。

入力: raw/sbd-entries.csv（extract.py の出力）
出力:
  - ../../src/lib/strength/standardsData.ts   アプリが読む本体
  - ../../src/test/strength-standards-source.json  テスト用の検証データ（別経路で書き出す）

統計処理の方針（docs/strength-standards.md に同じ説明がある）:

1. 選手の重複排除
   同一選手が複数大会に出ていると、よく出る選手ほど分布に重く効いてしまう。
   氏名と性別をキーに、トータルが最大だった1試合だけを残す。
   （OpenPowerlifting は同姓同名を "Name #2" のように区別して収録しているため、
     氏名は選手の識別子として使える。）

2. 開催年での絞り込み
   ノーギア（Raw）競技が一般化したのは2010年前後で、それ以前の記録は母集団の
   性格が異なる。既定では2010年以降の大会に限定する。

3. 体重アンカーと移動窓
   体重階級で区切るとその境目で基準値が不連続に跳ねる。代わりに、代表的な体重
   （アンカー）ごとに「その体重の前後」の選手だけを集めて分位数を出し、
   アプリ側では隣り合うアンカーの間を線形補間する。
   窓幅は体重の ±WINDOW_RATIO と ±WINDOW_MIN_KG の広いほうを採る。

4. 標本数の下限
   1アンカーあたり MIN_SAMPLE 件に満たない場合は数値を出さず null を書く。
   アプリ側は「データなし」と表示する（推測値で埋めない）。

使い方:
    python3 build.py
    python3 build.py --since 2015 --min-sample 500
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import datetime, timezone
from typing import Iterable

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DEFAULT_INPUT = os.path.join(SCRIPT_DIR, "raw", "sbd-entries.csv")
TS_OUTPUT = os.path.join(REPO_ROOT, "src", "lib", "strength", "standardsData.ts")
JSON_OUTPUT = os.path.join(REPO_ROOT, "src", "test", "strength-standards-source.json")

# 既定の絞り込み条件
DEFAULT_SINCE_YEAR = 2010
DEFAULT_MIN_SAMPLE = 300

# 移動窓の幅。体重の ±8% と ±4kg の広いほうを使う。
WINDOW_RATIO = 0.08
WINDOW_MIN_KG = 4.0

# 出力する分位点（%）。1〜99 まで。両端は標本数の都合でこれ以上細かくしない。
PERCENTILES: tuple[int, ...] = (1, 5, 10, 20, 30, 40, 50, 60, 65, 70, 80, 90, 95, 99)

# 体重アンカー（kg）。日本人の体格分布を踏まえ、軽量級を細かめに取っている。
ANCHORS: dict[str, tuple[float, ...]] = {
    "M": (55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 140),
    "F": (45, 50, 55, 60, 65, 70, 75, 80, 90, 100),
}

LIFTS: tuple[str, ...] = ("squat", "bench", "deadlift", "total")


def quantile(sorted_values: list[float], percentile: float) -> float:
    """線形補間による分位数。sorted_values は昇順であること。

    numpy の既定（method='linear'）と同じ定義を使う。外部依存を増やさないため自前で持つ。
    """
    if not sorted_values:
        raise ValueError("空のリストから分位数は計算できない")
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (percentile / 100.0) * (len(sorted_values) - 1)
    lower_index = int(position)
    upper_index = min(lower_index + 1, len(sorted_values) - 1)
    fraction = position - lower_index
    lower = sorted_values[lower_index]
    upper = sorted_values[upper_index]
    return lower + (upper - lower) * fraction


def median(values: Iterable[float]) -> float | None:
    ordered = sorted(values)
    if not ordered:
        return None
    return quantile(ordered, 50)


def round_kg(value: float) -> float:
    """表示・保存用に0.1kg単位へ丸める。"""
    return round(value + 1e-9, 1)


def load_lifters(path: str, since_year: int) -> list[dict[str, float | str]]:
    """CSVを読み、選手ごとに最高トータルの1試合だけを残す。"""
    best: dict[tuple[str, str], dict[str, float | str]] = {}
    total_rows = 0
    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            total_rows += 1
            year_text = row.get("year") or ""
            if not year_text.isdigit() or int(year_text) < since_year:
                continue
            key = (row["name"], row["sex"])
            total = float(row["total_kg"])
            current = best.get(key)
            if current is not None and float(current["total_kg"]) >= total:
                continue
            best[key] = {
                "sex": row["sex"],
                "bodyweight_kg": float(row["bodyweight_kg"]),
                "squat": float(row["squat_kg"]),
                "bench": float(row["bench_kg"]),
                "deadlift": float(row["deadlift_kg"]),
                "total": total,
                "total_kg": total,
            }
    print(f"読み込み {total_rows:,} 行 → 重複排除後 {len(best):,} 人（{since_year}年以降）")
    return list(best.values())


def build_anchor(
    lifters: list[dict[str, float | str]], anchor_kg: float, min_sample: int
) -> dict[str, object]:
    """1つの体重アンカーについて、各種目の分位数と種目間比率の中央値を出す。"""
    half_window = max(anchor_kg * WINDOW_RATIO, WINDOW_MIN_KG)
    low = anchor_kg - half_window
    high = anchor_kg + half_window
    window = [x for x in lifters if low <= float(x["bodyweight_kg"]) <= high]
    sample = len(window)

    percentiles: dict[str, list[float] | None] = {}
    for lift in LIFTS:
        if sample < min_sample:
            percentiles[lift] = None
            continue
        values = sorted(float(x[lift]) for x in window)
        percentiles[lift] = [round_kg(quantile(values, p)) for p in PERCENTILES]

    # 種目間バランスの基準値。各選手の比率を出してからその中央値を採る
    # （中央値どうしの比とは一致しないため、必ず選手単位で計算する）。
    ratios: dict[str, float | None] = {}
    if sample >= min_sample:
        bench_ratio = median(float(x["bench"]) / float(x["squat"]) for x in window)
        deadlift_ratio = median(float(x["deadlift"]) / float(x["squat"]) for x in window)
        ratios = {
            "benchPerSquat": round(bench_ratio, 4) if bench_ratio is not None else None,
            "deadliftPerSquat": round(deadlift_ratio, 4) if deadlift_ratio is not None else None,
        }
    else:
        ratios = {"benchPerSquat": None, "deadliftPerSquat": None}

    return {
        "bodyweightKg": anchor_kg,
        "sample": sample,
        "windowKg": [round_kg(low), round_kg(high)],
        "percentiles": percentiles,
        "ratios": ratios,
    }


def build_dataset(
    lifters: list[dict[str, float | str]], since_year: int, min_sample: int
) -> dict[str, object]:
    by_sex: dict[str, list[dict[str, float | str]]] = {"M": [], "F": []}
    for lifter in lifters:
        by_sex[str(lifter["sex"])].append(lifter)

    anchors_out: dict[str, list[dict[str, object]]] = {}
    for sex, anchor_list in ANCHORS.items():
        anchors_out[sex] = [
            build_anchor(by_sex[sex], anchor, min_sample) for anchor in anchor_list
        ]

    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "sinceYear": since_year,
        "minSample": min_sample,
        "windowRatio": WINDOW_RATIO,
        "windowMinKg": WINDOW_MIN_KG,
        "percentileGrid": list(PERCENTILES),
        "totalLifters": {"M": len(by_sex["M"]), "F": len(by_sex["F"])},
        "anchors": anchors_out,
    }


def format_number_list(values: list[float] | None) -> str:
    if values is None:
        return "null"
    return "[" + ", ".join(f"{v:g}" for v in values) + "]"


def emit_typescript(dataset: dict[str, object], path: str) -> None:
    anchors = dataset["anchors"]
    assert isinstance(anchors, dict)
    totals = dataset["totalLifters"]
    assert isinstance(totals, dict)

    lines: list[str] = []
    lines.append("// 自動生成ファイル — 手で編集しないこと。")
    lines.append("// 生成: scripts/strength-standards/build.py")
    lines.append("//")
    lines.append("// 出典: OpenPowerlifting プロジェクト（https://www.openpowerlifting.org）")
    lines.append("//       データ配布元 https://gitlab.com/openpowerlifting/opl-data")
    lines.append("//       同プロジェクトの競技記録データはパブリックドメインとして提供されている。")
    lines.append("//")
    lines.append(f"// 抽出条件: ノーギア（Raw）／フルパワー（SBD）／{dataset['sinceYear']}年以降の大会／")
    lines.append("//           3種目すべて成功／実測体重あり。選手ごとに最高トータルの1試合のみ。")
    lines.append(
        f"// 母集団: 男性 {totals['M']:,} 人 / 女性 {totals['F']:,} 人"
    )
    lines.append(f"// 生成日: {dataset['generatedAt']}")
    lines.append("//")
    lines.append("// 数値はすべて実データの分位数であり、推測・補完による値は含まない。")
    lines.append("// 標本数が下限に満たないアンカーは null（アプリ側で「データなし」と表示する）。")
    lines.append("")
    lines.append("import type { StrengthStandardsDataset } from './standards';")
    lines.append("")
    lines.append("export const STRENGTH_STANDARDS: StrengthStandardsDataset = {")
    lines.append(f"  generatedAt: '{dataset['generatedAt']}',")
    lines.append(f"  sinceYear: {dataset['sinceYear']},")
    lines.append(f"  minSample: {dataset['minSample']},")
    lines.append(f"  percentileGrid: {format_number_list(list(dataset['percentileGrid']))},")
    lines.append("  totalLifters: {")
    lines.append(f"    M: {totals['M']},")
    lines.append(f"    F: {totals['F']},")
    lines.append("  },")
    lines.append("  anchors: {")
    for sex in ("M", "F"):
        lines.append(f"    {sex}: [")
        for anchor in anchors[sex]:
            percentiles = anchor["percentiles"]
            ratios = anchor["ratios"]
            assert isinstance(percentiles, dict)
            assert isinstance(ratios, dict)
            lines.append("      {")
            lines.append(f"        bodyweightKg: {anchor['bodyweightKg']:g},")
            lines.append(f"        sample: {anchor['sample']},")
            lines.append("        percentiles: {")
            for lift in LIFTS:
                lines.append(f"          {lift}: {format_number_list(percentiles[lift])},")
            lines.append("        },")
            bench_ratio = ratios["benchPerSquat"]
            deadlift_ratio = ratios["deadliftPerSquat"]
            lines.append("        ratios: {")
            lines.append(
                f"          benchPerSquat: {bench_ratio if bench_ratio is not None else 'null'},"
            )
            lines.append(
                f"          deadliftPerSquat: {deadlift_ratio if deadlift_ratio is not None else 'null'},"
            )
            lines.append("        },")
            lines.append("      },")
        lines.append("    ],")
    lines.append("  },")
    lines.append("};")
    lines.append("")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))
    print(f"書き出し: {path}")


def emit_json(dataset: dict[str, object], path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(dataset, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"書き出し: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=DEFAULT_INPUT, help="extract.py が出力したCSV")
    parser.add_argument(
        "--since", type=int, default=DEFAULT_SINCE_YEAR, help="この年以降の大会に絞る"
    )
    parser.add_argument(
        "--min-sample", type=int, default=DEFAULT_MIN_SAMPLE, help="1アンカーあたりの標本数下限"
    )
    args = parser.parse_args()

    lifters = load_lifters(args.input, args.since)
    dataset = build_dataset(lifters, args.since, args.min_sample)

    for sex in ("M", "F"):
        anchor_list = dataset["anchors"][sex]  # type: ignore[index]
        summary = ", ".join(
            f"{a['bodyweightKg']:g}kg:{a['sample']}" for a in anchor_list  # type: ignore[index]
        )
        print(f"{sex} 標本数 → {summary}")

    emit_typescript(dataset, TS_OUTPUT)
    emit_json(dataset, JSON_OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
