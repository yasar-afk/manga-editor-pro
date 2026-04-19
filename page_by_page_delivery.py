import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from batch_manga_test import make_html_report, process_page, get_api_key, load_env


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "çeviri rapor farklı" / "orjinal" / "Ch.0001 (en)"
TRANSLATED_DIR = ROOT / "çeviri rapor farklı" / "cevrilmis" / "Ch.0001 (en)"
CLEANED_DIR = ROOT / "çeviri rapor farklı" / "temizlenmis" / "Ch.0001 (en)"
USER_REPORTS_DIR = ROOT / "çeviri rapor farklı" / "raporlar"
RUN_ID = datetime.now(timezone.utc).strftime("delivery_seq_%Y%m%d_%H%M%S")
REPORT_DIR = ROOT / "reports" / "runs" / RUN_ID
PROGRESS_PATH = REPORT_DIR / "progress.json"
SUMMARY_PATH = REPORT_DIR / "delivery_summary.json"
EVENTS_PATH = REPORT_DIR / "events.log"
MODEL = "google/gemini-2.5-flash"
LANGUAGE = "en"
BACKGROUND_MODE = "transparent"
RENDER_MODE = "web_sim"
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 6


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def list_source_images():
    images = [path for path in SOURCE_DIR.iterdir() if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}]
    images.sort(key=lambda path: path.name)
    return images


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_event(payload):
    EVENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with EVENTS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def extract_page_id(image_path):
    return image_path.stem


def copy_outputs(page_id):
    page_dir = REPORT_DIR / page_id
    translated_src = page_dir / f"{page_id}_web_sim.png"
    cleaned_src = page_dir / f"{page_id}_clean.png"
    translated_dst = TRANSLATED_DIR / f"{page_id}.png"
    cleaned_dst = CLEANED_DIR / f"{page_id}.png"

    if not translated_src.exists() or not cleaned_src.exists():
        raise FileNotFoundError(f"Missing expected output for page {page_id}")

    TRANSLATED_DIR.mkdir(parents=True, exist_ok=True)
    CLEANED_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(translated_src, translated_dst)
    shutil.copy2(cleaned_src, cleaned_dst)


def load_page_report(page_id):
    report_path = REPORT_DIR / page_id / f"{page_id}_report.json"
    return json.loads(report_path.read_text(encoding="utf-8"))


def update_progress(state):
    write_json(PROGRESS_PATH, state)


def main():
    load_env()
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("GEMINI_API_KEY") or get_api_key("")
    if not api_key:
        raise SystemExit("API key bulunamadi. .env.local gerekli.")

    if USER_REPORTS_DIR.exists():
        if any(USER_REPORTS_DIR.iterdir()):
            append_event({"type": "warning", "message": "User reports directory is not empty", "at": utc_now()})

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    TRANSLATED_DIR.mkdir(parents=True, exist_ok=True)
    CLEANED_DIR.mkdir(parents=True, exist_ok=True)

    images = list_source_images()
    total = len(images)
    completed = 0
    delivered = 0
    deferred = []
    pages_for_html = []
    page_results = []

    progress = {
        "run_id": RUN_ID,
        "started_at": utc_now(),
        "source_dir": str(SOURCE_DIR),
        "translated_dir": str(TRANSLATED_DIR),
        "cleaned_dir": str(CLEANED_DIR),
        "user_reports_dir": str(USER_REPORTS_DIR),
        "provider": "openrouter" if api_key.startswith("sk-or-") else "gemini",
        "total_pages": total,
        "completed_pages": 0,
        "delivered_pages": 0,
        "remaining_pages": total,
        "current_page": None,
        "last_event": None,
        "deferred_pages": [],
        "pages": [],
    }
    update_progress(progress)

    for index, image_path in enumerate(images, start=1):
        page_id = extract_page_id(image_path)
        progress["current_page"] = page_id
        progress["last_event"] = {"type": "page_started", "page": page_id, "index": index, "at": utc_now()}
        update_progress(progress)
        append_event(progress["last_event"])

        attempt = 0
        final_page = None
        final_error = None
        final_report = None

        while attempt < MAX_RETRIES:
            attempt += 1
            page_dir = REPORT_DIR / page_id
            if page_dir.exists():
                shutil.rmtree(page_dir)

            try:
                page_result = process_page(
                    image_path=image_path,
                    out_dir=REPORT_DIR,
                    api_key=api_key,
                    language=LANGUAGE,
                    model=MODEL,
                    background_mode=BACKGROUND_MODE,
                    render_mode=RENDER_MODE,
                )
                page_report = load_page_report(page_id)
                final_page = page_result
                final_report = page_report
                final_error = page_report.get("error_code")
                if not final_error:
                    break
            except Exception as exc:
                final_error = f"EXCEPTION: {exc}"
                final_report = None

            if attempt < MAX_RETRIES:
                append_event(
                    {
                        "type": "page_retry",
                        "page": page_id,
                        "attempt": attempt,
                        "error": final_error,
                        "at": utc_now(),
                    }
                )
                time.sleep(RETRY_DELAY_SECONDS)

        completed += 1
        remaining = total - completed

        page_state = {
            "page": page_id,
            "attempts": attempt,
            "error_code": final_error,
            "status": "deferred" if final_error else "done",
            "finding_count": len(final_page["findings"]) if final_page else None,
        }

        if final_page:
            pages_for_html.append(final_page)

        if final_error:
            deferred.append(page_id)
            page_results.append(page_state)
            progress["deferred_pages"] = deferred
            progress["pages"] = page_results
            progress["completed_pages"] = completed
            progress["remaining_pages"] = remaining
            progress["last_event"] = {
                "type": "page_deferred",
                "page": page_id,
                "completed": completed,
                "remaining": remaining,
                "attempts": attempt,
                "error": final_error,
                "at": utc_now(),
            }
            update_progress(progress)
            append_event(progress["last_event"])
            continue

        copy_outputs(page_id)
        delivered += 1
        page_results.append(page_state)
        progress["pages"] = page_results
        progress["completed_pages"] = completed
        progress["delivered_pages"] = delivered
        progress["remaining_pages"] = remaining
        progress["last_event"] = {
            "type": "page_done",
            "page": page_id,
            "completed": completed,
            "remaining": remaining,
            "attempts": attempt,
            "at": utc_now(),
        }
        update_progress(progress)
        append_event(progress["last_event"])

    report_path = REPORT_DIR / "report.html"
    make_html_report(report_path, pages_for_html)

    summary = {
        "run_id": RUN_ID,
        "finished_at": utc_now(),
        "source_dir": str(SOURCE_DIR),
        "translated_dir": str(TRANSLATED_DIR),
        "cleaned_dir": str(CLEANED_DIR),
        "user_reports_dir": str(USER_REPORTS_DIR),
        "provider": "openrouter" if api_key.startswith("sk-or-") else "gemini",
        "total_pages": total,
        "completed_pages": completed,
        "delivered_pages": delivered,
        "deferred_pages": deferred,
        "pages": page_results,
        "report_html": str(report_path),
        "progress_json": str(PROGRESS_PATH),
        "events_log": str(EVENTS_PATH),
    }
    write_json(SUMMARY_PATH, summary)

    progress["current_page"] = None
    progress["last_event"] = {
        "type": "run_finished",
        "completed": completed,
        "delivered": delivered,
        "deferred_pages": deferred,
        "at": utc_now(),
    }
    update_progress(progress)
    append_event(progress["last_event"])


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        payload = {
            "type": "fatal_error",
            "error": str(exc),
            "at": utc_now(),
        }
        append_event(payload)
        write_json(PROGRESS_PATH, {"last_event": payload, "fatal": True})
        raise
