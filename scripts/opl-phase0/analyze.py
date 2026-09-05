#!/usr/bin/env python3
"""OpenPowerlifting Phase 0 実データ調査（Bodymakers Strength Standards検討用）。

目的はただ1つ:
「OpenPowerliftingの日本人データが、Bodymakersの筋力レベル判定に実用できる
量・品質なのか」を実測すること。本番JSONやUIは一切生成しない。

前提:
  scripts/opl-phase0/fetch_data.py を先に実行し、
  scripts/opl-phase0/.cache/openpowerlifting.csv が存在すること。

用語:
  Country      = 選手本人の国（登録国）
  MeetCountry  = 大会の開催国
  この2つは意味が違う。日本人選手の抽出は必ず Country=="Japan" を使う。
  MeetCountry=="Japan" は「日本開催の大会」であって「日本人選手」ではない。

主母集団候補（"base cohort"）の定義（8条件、すべてAND）:
  Country == "Japan"
  Equipment == "Raw"
  Event == "SBD"
  Tested == "Yes"
  Sanctioned != "No"
  Place not in ("DQ", "DD", "NS")
  Sex in ("M", "F")
  BodyweightKg is not null かつ 30 <= BodyweightKg <= 250

種目別の追加条件（Best3XKg > 0）は主母集団候補には含めない。
調査9のBench/Squat/Deadlift percentileや、種目別PBの計算でのみ
「主母集団候補 かつ Best3XKg > 0」として追加適用する。
（理由: 調査9の設問文が「Bench percentileの母集団は主母集団候補かつ
Best3BenchKg>0」と明示しており、主母集団候補そのものには含まれない
という読み方と整合させるため。）

1 lifter = 1 observation:
  「ユニーク選手」は OpenPowerlifting の Name をそのまま使う（独自の名寄せをしない）。
  種目別PB（Personal Best）は (Name, Sex) ごとに、対象条件内の Best3XKg 最大値。
  年齢・体重クラスの集計で「1行」が必要な場面（調査6/7）は、(Name, Sex) ごとに
  TotalKg が最大だった1行を「代表行」として使う。これは3種目のPBを別々の大会から
  混ぜて合成しないための選択で、既存の scripts/strength-standards/build.py と
  同じ考え方（トータル最大の1試合を残す）を踏襲している。この選び方はPhase 0の
  探索用の意思決定であり、本番ロジックではない。

使い方:
    python3 scripts/opl-phase0/analyze.py
出力:
    scripts/opl-phase0/.cache/phase0_results.json
    標準出力に主要な数値のサマリー
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

CACHE_DIR = Path(__file__).parent / ".cache"
CSV_PATH = CACHE_DIR / "openpowerlifting.csv"
METADATA_PATH = CACHE_DIR / "fetch_metadata.json"
RESULTS_PATH = CACHE_DIR / "phase0_results.json"

USE_COLS = [
    "Name", "Sex", "Event", "Equipment", "Age", "AgeClass", "BirthYearClass",
    "BodyweightKg", "Best3SquatKg", "Best3BenchKg", "Best3DeadliftKg", "TotalKg",
    "Place", "Dots", "Goodlift", "Tested", "Country", "Federation",
    "ParentFederation", "Date", "MeetCountry", "Sanctioned",
]
NUMERIC_COLS = [
    "Age", "BodyweightKg", "Best3SquatKg", "Best3BenchKg", "Best3DeadliftKg",
    "TotalKg", "Dots", "Goodlift",
]

MALE_WEIGHT_BINS = [
    (-np.inf, 59, "<=59"), (59, 66, "59超-66"), (66, 74, "66超-74"),
    (74, 83, "74超-83"), (83, 93, "83超-93"), (93, 105, "93超-105"),
    (105, 120, "105超-120"), (120, np.inf, "120超"),
]
FEMALE_WEIGHT_BINS = [
    (-np.inf, 47, "<=47"), (47, 52, "47超-52"), (52, 57, "52超-57"),
    (57, 63, "57超-63"), (63, 69, "63超-69"), (69, 76, "69超-76"),
    (76, 84, "76超-84"), (84, np.inf, "84超"),
]
AGE_BRACKETS = [
    (-np.inf, 23, "U23"), (23, 40, "24-39"), (40, 50, "40-49"),
    (50, 60, "50-59"), (60, np.inf, "60+"),
]


def bin_series(values: pd.Series, bins: list[tuple[float, float, str]]) -> pd.Series:
    out = pd.Series(pd.NA, index=values.index, dtype="object")
    for lo, hi, label in bins:
        mask = (values > lo) & (values <= hi) if lo != -np.inf else (values <= hi)
        out[mask] = label
    return out


def load() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH, usecols=USE_COLS, dtype=str, low_memory=False)
    for col in NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def mid_rank_percentile(values: pd.Series, point: float) -> float:
    n = len(values)
    below = (values < point).sum()
    equal = (values == point).sum()
    return (below + 0.5 * equal) / n if n > 0 else float("nan")


def main() -> None:
    metadata = json.loads(METADATA_PATH.read_text())
    df = load()
    results: dict = {"fetch_metadata": metadata, "csv_total_rows_loaded": len(df)}

    # ==========================================================
    # 調査1: Country / MeetCountry
    # ==========================================================
    total_rows = len(df)
    country_japan = df["Country"] == "Japan"
    meetcountry_japan = df["MeetCountry"] == "Japan"
    mc_japan_country_na = meetcountry_japan & df["Country"].isna()
    mc_japan_country_not_japan = meetcountry_japan & df["Country"].notna() & (df["Country"] != "Japan")
    top5_other_countries = (
        df.loc[mc_japan_country_not_japan, "Country"].value_counts().head(5).to_dict()
    )
    country_japan_mc_not_japan = country_japan & (df["MeetCountry"] != "Japan")

    inv1 = {
        "total_rows": int(total_rows),
        "country_japan_rows": int(country_japan.sum()),
        "meetcountry_japan_rows": int(meetcountry_japan.sum()),
        "meetcountry_japan_and_country_na": int(mc_japan_country_na.sum()),
        "meetcountry_japan_and_country_not_japan": int(mc_japan_country_not_japan.sum()),
        "meetcountry_japan_country_not_japan_top5": {
            str(k): int(v) for k, v in top5_other_countries.items()
        },
        "meetcountry_japan_country_na_rate": (
            float(mc_japan_country_na.sum() / meetcountry_japan.sum())
            if meetcountry_japan.sum() > 0 else None
        ),
        "country_japan_and_meetcountry_not_japan_rows": int(country_japan_mc_not_japan.sum()),
    }
    results["investigation_1_country_vs_meetcountry"] = inv1

    # ==========================================================
    # 主母集団候補（base cohort）の定義
    # ==========================================================
    jp = df[country_japan].copy()
    f_equipment = jp["Equipment"] == "Raw"
    f_event = jp["Event"] == "SBD"
    f_tested = jp["Tested"] == "Yes"
    f_sanctioned = jp["Sanctioned"] != "No"  # 欠損はNoではないので通す
    f_place = ~jp["Place"].isin(["DQ", "DD", "NS"])
    f_sex = jp["Sex"].isin(["M", "F"])
    f_bw_notna = jp["BodyweightKg"].notna()
    f_bw_range = jp["BodyweightKg"].between(30, 250)

    filters = {
        "Equipment==Raw": f_equipment,
        "Event==SBD": f_event,
        "Tested==Yes": f_tested,
        "Sanctioned!=No": f_sanctioned,
        "Place not in DQ/DD/NS": f_place,
        "Sex in (M,F)": f_sex,
        "BodyweightKg notna": f_bw_notna,
        "BodyweightKg 30-250": f_bw_range,
    }
    base_mask = np.logical_and.reduce(list(filters.values()))
    base = jp[base_mask].copy()

    # ==========================================================
    # 調査2: 日本人Raw SBDデータ量
    # ==========================================================
    unique_names = base["Name"].nunique()
    unique_name_sex = base[["Name", "Sex"]].drop_duplicates().shape[0]
    male_names = base.loc[base["Sex"] == "M", "Name"].nunique()
    female_names = base.loc[base["Sex"] == "F", "Name"].nunique()
    avg_records_per_lifter = len(base) / unique_names if unique_names > 0 else float("nan")

    sensitivity = {}
    for name in filters:
        others = np.logical_and.reduce([m for n, m in filters.items() if n != name])
        sensitivity[name] = {
            "unique_names_without_this_filter": int(jp[others]["Name"].nunique()),
        }
    # 参考値: Country=Japan のみ（フィルタなし）でのユニーク人数
    sensitivity_reference_country_only = int(jp["Name"].nunique())

    inv2 = {
        "base_cohort_total_rows": int(len(base)),
        "base_cohort_unique_names": int(unique_names),
        "base_cohort_unique_name_sex_pairs": int(unique_name_sex),
        "base_cohort_male_unique_names": int(male_names),
        "base_cohort_female_unique_names": int(female_names),
        "avg_records_per_lifter": float(avg_records_per_lifter),
        "filter_impact_drop_one_at_a_time": sensitivity,
        "reference_country_japan_only_unique_names": sensitivity_reference_country_only,
    }
    results["investigation_2_japan_raw_sbd_volume"] = inv2

    # ==========================================================
    # 調査3: 年ごとのデータ量（Country=Japan, Raw, SBD のみ。Date>=2000）
    # ==========================================================
    jp_raw_sbd = jp[f_equipment & f_event].copy()
    jp_raw_sbd["Year"] = pd.to_datetime(jp_raw_sbd["Date"], errors="coerce").dt.year
    jp_raw_sbd_2000 = jp_raw_sbd[jp_raw_sbd["Year"] >= 2000]
    year_group = jp_raw_sbd_2000.groupby("Year").agg(
        unique_lifters=("Name", "nunique"), rows=("Name", "size"),
    )
    inv3_by_year = {
        int(year): {"unique_lifters": int(row.unique_lifters), "rows": int(row.rows)}
        for year, row in year_group.iterrows()
    }

    # 参考: 主母集団候補（8条件フル適用）での年次分布
    base_year = pd.to_datetime(base["Date"], errors="coerce").dt.year
    base_with_year = base.assign(Year=base_year)
    base_year_group = base_with_year[base_with_year["Year"] >= 2000].groupby("Year").agg(
        unique_lifters=("Name", "nunique"), rows=("Name", "size"),
    )
    inv3_by_year_full_cohort = {
        int(year): {"unique_lifters": int(row.unique_lifters), "rows": int(row.rows)}
        for year, row in base_year_group.iterrows()
    }

    results["investigation_3_year_distribution"] = {
        "note": "Country=Japan, Equipment=Raw, Event=SBD のみ（Tested/Sanctioned/Place/BW条件なし）。2000年以降。",
        "by_year": inv3_by_year,
        "by_year_full_base_cohort_reference": inv3_by_year_full_cohort,
    }

    # ==========================================================
    # 調査4: Tested（Country=Japan, Raw, SBD）
    # ==========================================================
    tested_col = jp_raw_sbd["Tested"]
    tested_yes = tested_col == "Yes"
    tested_blank = tested_col.isna()
    tested_other = ~tested_yes & ~tested_blank

    def tested_stats(mask: pd.Series) -> dict:
        subset = jp_raw_sbd[mask]
        return {
            "rows": int(mask.sum()),
            "unique_names": int(subset["Name"].nunique()),
        }

    total_jp_raw_sbd_rows = len(jp_raw_sbd)
    inv4 = {
        "total_rows": int(total_jp_raw_sbd_rows),
        "tested_yes": {**tested_stats(tested_yes), "row_share": float(tested_yes.sum() / total_jp_raw_sbd_rows)},
        "tested_blank": {**tested_stats(tested_blank), "row_share": float(tested_blank.sum() / total_jp_raw_sbd_rows)},
        "tested_other": {**tested_stats(tested_other), "row_share": float(tested_other.sum() / total_jp_raw_sbd_rows)},
        "tested_other_values": {
            str(k): int(v) for k, v in jp_raw_sbd.loc[tested_other, "Tested"].value_counts().items()
        },
        "caveat": "Tested==Yes は本人が実際にドーピング検査を受けたことを意味しない。ドーピング検査対象カテゴリーで出場したことを示すのみ。",
    }
    results["investigation_4_tested"] = inv4

    # ==========================================================
    # 調査5: Event別（Country=Japan, Raw）
    # ==========================================================
    jp_raw = jp[f_equipment].copy()
    event_group = jp_raw.groupby("Event").agg(rows=("Name", "size"), unique_names=("Name", "nunique"))
    inv5 = {
        str(event): {"rows": int(row.rows), "unique_names": int(row.unique_names)}
        for event, row in event_group.iterrows()
    }
    sbd_unique = jp_raw.loc[jp_raw["Event"] == "SBD", "Name"].nunique()
    bench_only_unique = jp_raw.loc[jp_raw["Event"] == "B", "Name"].nunique()
    results["investigation_5_event_breakdown"] = {
        "by_event": inv5,
        "sbd_unique_names": int(sbd_unique),
        "bench_only_unique_names": int(bench_only_unique),
        "sbd_minus_bench_only_diff": int(sbd_unique - bench_only_unique),
    }

    # ==========================================================
    # 代表行（(Name, Sex)ごとにTotalKg最大の1行）— 調査6/7で使用
    # ==========================================================
    base_valid_total = base.dropna(subset=["TotalKg"])
    idx = base_valid_total.groupby(["Name", "Sex"])["TotalKg"].idxmax()
    representative = base.loc[idx].copy()
    # TotalKgが欠損でTotalKgでの代表行が選べなかった選手も、行に残す必要がある場合はここで補完
    no_total_names = set(zip(base["Name"], base["Sex"])) - set(zip(representative["Name"], representative["Sex"]))
    if no_total_names:
        # TotalKgが全欠損の選手は、対象条件内の最初の行を代表行として使う（少数のはず）
        extra_rows = []
        for name, sex in no_total_names:
            sub = base[(base["Name"] == name) & (base["Sex"] == sex)]
            extra_rows.append(sub.iloc[0])
        representative = pd.concat([representative, pd.DataFrame(extra_rows)], ignore_index=True)

    # ==========================================================
    # 調査6: 年齢情報
    # ==========================================================
    age = representative["Age"]
    age_class = representative["AgeClass"]
    birth_year_class = representative["BirthYearClass"]
    n_rep = len(representative)

    age_integer = age.notna() & (age % 1 == 0)
    age_half = age.notna() & (age % 1 != 0)
    any_age_info = age.notna() | age_class.notna() | birth_year_class.notna()

    inv6 = {
        "representative_rows": int(n_rep),
        "age_notna": int(age.notna().sum()),
        "age_notna_rate": float(age.notna().sum() / n_rep),
        "age_integer": int(age_integer.sum()),
        "age_half_approx": int(age_half.sum()),
        "age_class_notna": int(age_class.notna().sum()),
        "age_class_notna_rate": float(age_class.notna().sum() / n_rep),
        "birth_year_class_notna": int(birth_year_class.notna().sum()),
        "birth_year_class_notna_rate": float(birth_year_class.notna().sum() / n_rep),
        "any_age_source_notna": int(any_age_info.sum()),
        "any_age_source_rate": float(any_age_info.sum() / n_rep),
    }

    # JPA / IPF系でどのカラムが使われているか
    fed = representative["Federation"]
    parent_fed = representative["ParentFederation"]
    for label, mask in [
        ("Federation==JPA", fed == "JPA"),
        ("ParentFederation==IPF", parent_fed == "IPF"),
    ]:
        n = int(mask.sum())
        if n == 0:
            inv6.setdefault("federation_column_usage", {})[label] = {"n": 0}
            continue
        sub = representative[mask]
        inv6.setdefault("federation_column_usage", {})[label] = {
            "n": n,
            "age_notna_rate": float(sub["Age"].notna().sum() / n),
            "age_class_notna_rate": float(sub["AgeClass"].notna().sum() / n),
            "birth_year_class_notna_rate": float(sub["BirthYearClass"].notna().sum() / n),
        }
    results["investigation_6_age_info"] = inv6

    # ==========================================================
    # 調査7: 体重別セルサイズ（+ 年齢帯クロス）
    # ==========================================================
    male_rep = representative[representative["Sex"] == "M"].copy()
    female_rep = representative[representative["Sex"] == "F"].copy()
    male_rep["WeightBin"] = bin_series(male_rep["BodyweightKg"], MALE_WEIGHT_BINS)
    female_rep["WeightBin"] = bin_series(female_rep["BodyweightKg"], FEMALE_WEIGHT_BINS)
    male_rep["AgeBin"] = bin_series(male_rep["Age"], AGE_BRACKETS)
    female_rep["AgeBin"] = bin_series(female_rep["Age"], AGE_BRACKETS)

    def weight_cell_counts(sub: pd.DataFrame, bins) -> dict:
        order = [label for _, _, label in bins]
        counts = sub["WeightBin"].value_counts()
        return {label: int(counts.get(label, 0)) for label in order}

    def cross_table(sub: pd.DataFrame, bins) -> dict:
        weight_order = [label for _, _, label in bins]
        age_order = [label for _, _, label in AGE_BRACKETS]
        table = {}
        for w in weight_order:
            table[w] = {}
            for a in age_order:
                n = int(((sub["WeightBin"] == w) & (sub["AgeBin"] == a)).sum())
                table[w][a] = n
            table[w]["age_unknown"] = int(((sub["WeightBin"] == w) & sub["AgeBin"].isna()).sum())
        return table

    results["investigation_7_weight_cell_sizes"] = {
        "male_weight_bins": weight_cell_counts(male_rep, MALE_WEIGHT_BINS),
        "female_weight_bins": weight_cell_counts(female_rep, FEMALE_WEIGHT_BINS),
        "male_weight_x_age_cross": cross_table(male_rep, MALE_WEIGHT_BINS),
        "female_weight_x_age_cross": cross_table(female_rep, FEMALE_WEIGHT_BINS),
    }

    # ==========================================================
    # 調査8: データ品質
    # ==========================================================
    neg_bench = int((base["Best3BenchKg"] < 0).sum())
    neg_squat = int((base["Best3SquatKg"] < 0).sum())
    neg_deadlift = int((base["Best3DeadliftKg"] < 0).sum())
    dots_rate = float(base["Dots"].notna().sum() / len(base))
    goodlift_rate = float(base["Goodlift"].notna().sum() / len(base))
    fed_counts = base["Federation"].value_counts().to_dict()
    hash_in_name = int(base["Name"].str.contains("#", na=False).sum())

    results["investigation_8_data_quality"] = {
        "best3bench_negative_rows": neg_bench,
        "best3squat_negative_rows": neg_squat,
        "best3deadlift_negative_rows": neg_deadlift,
        "dots_notna_rate": dots_rate,
        "goodlift_notna_rate": goodlift_rate,
        "federation_counts": {str(k): int(v) for k, v in fed_counts.items()},
        "name_contains_hash_rows": hash_in_name,
        "equipment_raw_caveat": (
            "公式README: EquipmentはGPC系連盟のように『Wraps等の使用が許可された"
            "カテゴリで出場した』ことを示すのみで、Raw区分だからといって実際に"
            "無補助具だったことを保証しない。"
        ),
    }

    # ==========================================================
    # 調査9: 代表重量のPercentile（男性、種目別PB = 主母集団候補 かつ Best3XKg>0）
    # ==========================================================
    def lift_pb(lift_col: str) -> pd.Series:
        cond = base[lift_col] > 0
        sub = base[cond]
        pb = sub.groupby(["Name", "Sex"])[lift_col].max()
        return pb

    def percentiles_for(lift_col: str, points: list[float]) -> dict:
        pb = lift_pb(lift_col)
        pb_male = pb[pb.index.get_level_values("Sex") == "M"]
        n = len(pb_male)
        out = {"n": int(n)}
        for p in points:
            out[str(p)] = float(mid_rank_percentile(pb_male, p))
        # 分布参考値
        if n > 0:
            out["distribution_ref"] = {
                "p10": float(np.percentile(pb_male, 10)),
                "p50": float(np.percentile(pb_male, 50)),
                "p90": float(np.percentile(pb_male, 90)),
            }
        return out

    bench_points = [100, 120, 140, 160, 180]
    # Squat/Deadliftは分布のp10-p90を見てから丸めた5点を選ぶ（下でログ出力し決め打ちする）
    squat_pb_probe = lift_pb("Best3SquatKg")
    squat_pb_probe_m = squat_pb_probe[squat_pb_probe.index.get_level_values("Sex") == "M"]
    deadlift_pb_probe = lift_pb("Best3DeadliftKg")
    deadlift_pb_probe_m = deadlift_pb_probe[deadlift_pb_probe.index.get_level_values("Sex") == "M"]

    def round_points(probe: pd.Series, step: int) -> list[int]:
        p10, p90 = np.percentile(probe, 10), np.percentile(probe, 90)
        lo = int(round(p10 / step) * step)
        hi = int(round(p90 / step) * step)
        span = hi - lo
        n_steps = max(1, round(span / step))
        actual_step = max(step, int(round(span / 4 / step) * step)) if n_steps >= 4 else step
        return [lo + actual_step * i for i in range(5)]

    squat_points = round_points(squat_pb_probe_m, 20)
    deadlift_points = round_points(deadlift_pb_probe_m, 20)

    results["investigation_9_percentiles_male"] = {
        "method": "mid-rank percentile = (count(PB<w) + count(PB==w)*0.5) / n。1人1PB（種目別、対象条件内Best3XKg最大）。",
        "bench": {"points_kg": bench_points, **percentiles_for("Best3BenchKg", bench_points)},
        "squat": {"points_kg": squat_points, **percentiles_for("Best3SquatKg", squat_points)},
        "deadlift": {"points_kg": deadlift_points, **percentiles_for("Best3DeadliftKg", deadlift_points)},
    }

    RESULTS_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(json.dumps(results, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
