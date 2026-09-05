#!/usr/bin/env python3
"""OpenPowerlifting 公式Bulk CSVを取得する（Phase 0 データ調査専用）。

【なぜ openpowerlifting.gitlab.io ではなく GitLab API 経由なのか】
公式Data Serviceの案内ページは https://openpowerlifting.gitlab.io/opl-csv/ だが、
これは GitLab Pages（*.gitlab.io）でホストされている。実行環境によっては
Pages サブドメインへの疎通がネットワークポリシーでブロックされる場合があり、
その場合は同じ内容を publish しているCIジョブの成果物を GitLab API 経由で
取得する。取得元は同じ公式リポジトリ（openpowerlifting/opl-csv）の
CIが生成した成果物であり、非公式ミラーやスクレイピングではない。

出力:
  scripts/opl-phase0/.cache/openpowerlifting-latest.zip  （.gitignore対象）
  scripts/opl-phase0/.cache/openpowerlifting.csv         （.gitignore対象）
  scripts/opl-phase0/.cache/fetch_metadata.json          （.gitignore対象。分析スクリプトが参照する）

使い方:
    python3 scripts/opl-phase0/fetch_data.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

CACHE_DIR = Path(__file__).parent / ".cache"
ZIP_PATH = CACHE_DIR / "openpowerlifting-latest.zip"
CSV_PATH = CACHE_DIR / "openpowerlifting.csv"
METADATA_PATH = CACHE_DIR / "fetch_metadata.json"

GITLAB_API = "https://gitlab.com/api/v4"
PROJECT = "openpowerlifting%2Fopl-csv"

# GitLab Pages (openpowerlifting.gitlab.io) がブロックされた環境向けの代替経路。
# 同じ公式リポジトリの最新成功パイプラインから、data ジョブの成果物 zip を直接取る。
ARTIFACT_PATH = "files/openpowerlifting-latest.zip"


def curl_json(url: str) -> object:
    result = subprocess.run(
        ["curl", "-sS", "--max-time", "30", url],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def find_latest_data_job() -> tuple[int, str]:
    """最新の成功パイプラインから、bulk CSV zip を持つ data ジョブのIDを探す。"""
    pipelines = curl_json(
        f"{GITLAB_API}/projects/{PROJECT}/pipelines?status=success&per_page=5"
    )
    if not pipelines:
        raise RuntimeError("成功パイプラインが見つかりません")
    pipeline = pipelines[0]
    jobs = curl_json(f"{GITLAB_API}/projects/{PROJECT}/pipelines/{pipeline['id']}/jobs")
    data_job = next((j for j in jobs if j["name"] == "data" and j["status"] == "success"), None)
    if data_job is None:
        raise RuntimeError(f"pipeline {pipeline['id']} に data ジョブが見つかりません")
    return data_job["id"], pipeline["created_at"]


def download(job_id: int) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    url = f"{GITLAB_API}/projects/{PROJECT}/jobs/{job_id}/artifacts/{ARTIFACT_PATH}"
    print(f"Downloading {url} ...", file=sys.stderr)
    subprocess.run(
        ["curl", "-sS", "--max-time", "300", "-o", str(ZIP_PATH), url],
        check=True,
    )


def extract() -> tuple[str, int]:
    """zip内の openpowerlifting-YYYY-MM-DD-<hash>.csv を展開する。revisionを返す。"""
    with zipfile.ZipFile(ZIP_PATH) as zf:
        csv_names = [n for n in zf.namelist() if re.search(r"openpowerlifting-.*\.csv$", n)]
        if len(csv_names) != 1:
            raise RuntimeError(f"CSVが一意に特定できません: {csv_names}")
        csv_name = csv_names[0]
        uncompressed_size = zf.getinfo(csv_name).file_size
        with zf.open(csv_name) as src, open(CSV_PATH, "wb") as dst:
            while chunk := src.read(1024 * 1024):
                dst.write(chunk)
    # ファイル名 openpowerlifting-2026-09-05-b8b9bf6e.csv から revision を取る
    match = re.search(r"openpowerlifting-(\d{4}-\d{2}-\d{2})-([0-9a-f]+)\.csv$", csv_name)
    revision = f"{match.group(1)}-{match.group(2)}" if match else csv_name
    return revision, uncompressed_size


def count_lines(path: Path) -> int:
    result = subprocess.run(["wc", "-l", str(path)], capture_output=True, text=True, check=True)
    return int(result.stdout.split()[0])


def main() -> None:
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    job_id, pipeline_created_at = find_latest_data_job()
    download(job_id)
    zip_size = ZIP_PATH.stat().st_size
    revision, csv_uncompressed_size = extract()
    total_lines = count_lines(CSV_PATH)

    metadata = {
        "fetched_at_utc": fetched_at,
        "source": "https://gitlab.com/openpowerlifting/opl-csv (official Data Service, GitLab CI artifact)",
        "gitlab_pipeline_created_at": pipeline_created_at,
        "gitlab_data_job_id": job_id,
        "data_revision": revision,
        "zip_size_bytes": zip_size,
        "csv_uncompressed_size_bytes": csv_uncompressed_size,
        "csv_total_lines_including_header": total_lines,
        "csv_data_rows": total_lines - 1,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2, ensure_ascii=False))
    print(json.dumps(metadata, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
