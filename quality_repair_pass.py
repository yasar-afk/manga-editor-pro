import argparse
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from batch_manga_test import get_api_key, load_env, make_html_report, process_page


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "çeviri rapor farklı" / "orjinal" / "Ch.0001 (en)"
TRANSLATED_DIR = ROOT / "çeviri rapor farklı" / "cevrilmis" / "Ch.0001 (en)"
CLEANED_DIR = ROOT / "çeviri rapor farklı" / "temizlenmis" / "Ch.0001 (en)"
REPORTS_DIR = ROOT / "reports" / "runs"
DEFAULT_PAGES = [
    "05", "06", "12", "13", "15", "16", "20", "22", "23", "25",
    "29", "32", "37", "45", "51", "64", "70", "73", "74", "78",
]


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_page_report(report_dir, page_id):
    report_path = report_dir / page_id / f"{page_id}_report.json"
    return json.loads(report_path.read_text(encoding="utf-8"))


def copy_outputs(report_dir, page_id):
    page_dir = report_dir / page_id
    translated_src = page_dir / f"{page_id}_web_sim.png"
    cleaned_src = page_dir / f"{page_id}_clean.png"
    translated_dst = TRANSLATED_DIR / f"{page_id}.png"
    cleaned_dst = CLEANED_DIR / f"{page_id}.png"

    TRANSLATED_DIR.mkdir(parents=True, exist_ok=True)
    CLEANED_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(translated_src, translated_dst)
    shutil.copy2(cleaned_src, cleaned_dst)


def main():
    parser = argparse.ArgumentParser(description="Repair risky manga pages with updated quality rules.")
    parser.add_argument("--pages", nargs="*", default=DEFAULT_PAGES, help="Page ids to repair, e.g. 05 22 37")
    parser.add_argument("--model", default="google/gemini-2.5-flash", help="Translation model")
    parser.add_argument("--api-key", default="", help="Override API key")
    args = parser.parse_args()

    load_env()
    api_key = get_api_key(args.api_key)
    if not api_key:
        raise SystemExit("API key bulunamadi.")

    run_id = datetime.now(timezone.utc).strftime("quality_repair_%Y%m%d_%H%M%S")
    report_dir = REPORTS_DIR / run_id
    report_dir.mkdir(parents=True, exist_ok=True)

    repaired_pages = []
    for page_id in args.pages:
        image_path = SOURCE_DIR / f"{page_id}.png"
        if not image_path.exists():
            print(f"Sayfa bulunamadi, atlaniyor: {page_id}")
            continue

        page_result = process_page(
            image_path=image_path,
            out_dir=report_dir,
            api_key=api_key,
            language="en",
            model=args.model,
            background_mode="transparent",
            render_mode="web_sim",
        )
        copy_outputs(report_dir, page_id)
        repaired_pages.append(page_result)
        print(f"{page_id} repaired, findings={len(page_result['findings'])}")

    report_path = report_dir / "report.html"
    make_html_report(report_path, repaired_pages)
    summary = {
        "run_id": run_id,
        "finished_at": utc_now(),
        "pages": [
            {
                "page": item["page_id"],
                "finding_count": len(item["findings"]),
                "findings": item["findings"],
                "error_code": item["error_code"],
            }
            for item in repaired_pages
        ],
        "report_html": str(report_path),
    }
    (report_dir / "repair_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
