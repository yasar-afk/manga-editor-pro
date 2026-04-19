import base64
import json
import os
from pathlib import Path

import requests as req_lib
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from image_processor import estimate_safe_text_boxes, inpaint_image
from ocr_engine import detect_text
from translator import translate_texts


BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
REPORTS_DIR = ROOT_DIR / "reports"
REPORT_RUNS_DIR = REPORTS_DIR / "runs"
LEGACY_REPORT_RUNS_DIR = ROOT_DIR / "test_runs"


def load_local_env():
    loaded = False
    for candidate in [
        BACKEND_DIR.parent / ".env.local",
        Path.cwd() / ".env.local",
        Path.cwd().parent / ".env.local",
    ]:
        candidate = candidate.resolve()
        if candidate.exists():
            load_dotenv(candidate)
            print(f"[OK] .env.local yuklendi: {candidate}")
            loaded = True
            break
    if not loaded:
        print("[UYARI] .env.local bulunamadi! API anahtari sunucu tarafindan okunamayacak.")


load_local_env()

app = FastAPI(title="Antigravity Manga OCR ve Ceviri API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_report_runs_dir():
    if REPORT_RUNS_DIR.is_dir():
        return REPORT_RUNS_DIR
    return LEGACY_REPORT_RUNS_DIR


def rel_url(path: Path):
    try:
        return "/" + path.resolve().relative_to(ROOT_DIR.resolve()).as_posix()
    except ValueError:
        return None


def to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def iso_mtime(path: Path):
    return path.stat().st_mtime


def build_page_summary(meta_path: Path):
    data = json.loads(meta_path.read_text(encoding="utf-8"))
    boxes = data.get("boxes") or []
    findings = data.get("findings") or []
    page_name = meta_path.name.replace("_report.json", "")
    page_dir = meta_path.parent

    line_counts = [to_int(box.get("line_count")) for box in boxes]
    font_sizes = [to_int(box.get("font_size")) for box in boxes if box.get("font_size") is not None]
    layout_scores = [to_float(box.get("layout_score")) for box in boxes if box.get("layout_score") is not None]
    layout_scores = [score for score in layout_scores if score is not None]

    return {
        "page": page_name,
        "source": data.get("source"),
        "error_code": data.get("error_code"),
        "finding_count": len(findings),
        "findings": findings,
        "box_count": len(boxes),
        "multi_line_box_count": sum(1 for count in line_counts if count > 2),
        "max_line_count": max(line_counts or [0]),
        "min_font_size": min(font_sizes) if font_sizes else None,
        "avg_layout_score": round(sum(layout_scores) / len(layout_scores), 3) if layout_scores else None,
        "images": {
            "original": rel_url(page_dir / f"{page_name}_original.png"),
            "clean": rel_url(page_dir / f"{page_name}_clean.png"),
            "rendered": rel_url(page_dir / f"{page_name}_rendered.png"),
            "web_sim": rel_url(page_dir / f"{page_name}_web_sim.png"),
        },
    }


def build_run_summary_from_disk(run_dir: Path):
    page_reports = sorted(run_dir.glob("*/*_report.json"))
    pages = [build_page_summary(meta_path) for meta_path in page_reports]
    totals = {
        "page_count": len(pages),
        "finding_count": sum(page["finding_count"] for page in pages),
        "error_count": sum(1 for page in pages if page["error_code"]),
        "multi_line_box_count": sum(page["multi_line_box_count"] for page in pages),
        "worst_line_count": max((page["max_line_count"] for page in pages), default=0),
    }
    return {
        "name": run_dir.name,
        "generated_at": None,
        "updated_at": iso_mtime(run_dir),
        "render_mode": None,
        "background_mode": None,
        "model": None,
        "report_url": rel_url(run_dir / "report.html"),
        "summary_url": rel_url(run_dir / "summary.json") if (run_dir / "summary.json").exists() else None,
        "totals": totals,
        "pages": pages,
    }


def build_run_summary(run_dir: Path, include_pages=False):
    summary_path = run_dir / "summary.json"
    if summary_path.exists():
        data = json.loads(summary_path.read_text(encoding="utf-8"))
        data["name"] = run_dir.name
        data["updated_at"] = data.get("updated_at") or iso_mtime(run_dir)
        data["report_url"] = rel_url(run_dir / "report.html")
        data["summary_url"] = rel_url(summary_path)
        if include_pages:
            return data
        data.pop("pages", None)
        return data

    summary = build_run_summary_from_disk(run_dir)
    if not include_pages:
        summary.pop("pages", None)
    return summary


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Python Backend Aktif", "version": "2.0"}


@app.get("/")
def read_root():
    frontend_path = ROOT_DIR / "index.html"
    if frontend_path.exists():
        return FileResponse(frontend_path)
    return {"status": "ok", "message": "Python Backend Aktif ama frontend dosyasi bulunamadi"}


@app.get("/api/reports")
def list_reports():
    runs_dir = get_report_runs_dir()
    if not runs_dir.exists():
        return {"root": rel_url(runs_dir), "runs": []}

    run_dirs = [path for path in runs_dir.iterdir() if path.is_dir()]
    run_dirs.sort(key=iso_mtime, reverse=True)

    return {
        "root": rel_url(runs_dir),
        "runs": [build_run_summary(run_dir, include_pages=False) for run_dir in run_dirs],
    }


@app.get("/api/reports/{run_name}")
def get_report_run(run_name: str):
    run_dir = get_report_runs_dir() / run_name
    if not run_dir.is_dir():
        raise HTTPException(status_code=404, detail="Report run not found")
    return build_run_summary(run_dir, include_pages=True)


@app.post("/api/process")
async def process_image(
    file: UploadFile = File(...),
    api_key: str = Form(""),
    model: str = Form("google/gemini-2.5-flash"),
    language: str = Form("auto"),
):
    image_bytes = await file.read()
    boxes, img = detect_text(image_bytes, language=language)

    image_response = None
    if img is not None and boxes:
        h, w = img.shape[:2]
        boxes = estimate_safe_text_boxes(img, boxes)

        clean_img_bytes = inpaint_image(img, boxes)
        clean_img_base64 = base64.b64encode(clean_img_bytes).decode("utf-8")
        image_response = f"data:image/jpeg;base64,{clean_img_base64}"

        for box in boxes:
            box["box_percent"] = {
                "x": round(box["x"] / w * 100, 2),
                "y": round(box["y"] / h * 100, 2),
                "w": round(box["w"] / w * 100, 2),
                "h": round(box["h"] / h * 100, 2),
            }
            if box.get("safe_box"):
                safe_box = box["safe_box"]
                box["safe_box_percent"] = {
                    "x": round(safe_box["x"] / w * 100, 2),
                    "y": round(safe_box["y"] / h * 100, 2),
                    "w": round(safe_box["w"] / w * 100, 2),
                    "h": round(safe_box["h"] / h * 100, 2),
                }
            if box.get("balloon_box"):
                balloon_box = box["balloon_box"]
                box["balloon_percent"] = {
                    "x": round(balloon_box["x"] / w * 100, 2),
                    "y": round(balloon_box["y"] / h * 100, 2),
                    "w": round(balloon_box["w"] / w * 100, 2),
                    "h": round(balloon_box["h"] / h * 100, 2),
                }
            if box.get("balloon_inner_box"):
                balloon_inner_box = box["balloon_inner_box"]
                box["balloon_inner_percent"] = {
                    "x": round(balloon_inner_box["x"] / w * 100, 2),
                    "y": round(balloon_inner_box["y"] / h * 100, 2),
                    "w": round(balloon_inner_box["w"] / w * 100, 2),
                    "h": round(balloon_inner_box["h"] / h * 100, 2),
                }
    else:
        original_base64 = base64.b64encode(image_bytes).decode("utf-8")
        image_response = f"data:image/jpeg;base64,{original_base64}"

    final_api_key = api_key if api_key else os.getenv("GEMINI_API_KEY", os.getenv("OPENROUTER_API_KEY", ""))

    error_code = None
    if final_api_key and boxes:
        boxes, error_code = translate_texts(boxes, final_api_key, model)
    else:
        for box in boxes:
            box["translated_text"] = box.get("original_text", "")

    response_payload = {
        "status": "success",
        "image": image_response,
        "boxes": boxes,
        "total_boxes": len(boxes),
    }
    if error_code:
        response_payload["error_code"] = error_code
    return response_payload


@app.post("/api/gemini")
async def proxy_gemini(request: Request):
    body = await request.json()
    request_body = body.get("requestBody", body)

    api_key = body.get("apiKey") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return JSONResponse(status_code=401, content={"error": {"message": "GEMINI_API_KEY .env.local dosyasinda tanimli degil."}})

    gemini_model = "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={api_key}"

    try:
        resp = req_lib.post(url, json=request_body, headers={"Content-Type": "application/json"}, timeout=60)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)
    except req_lib.exceptions.Timeout:
        return JSONResponse(status_code=504, content={"error": {"message": "Gemini API zaman asimi."}})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": {"message": str(exc)}})


@app.post("/api/openrouter")
async def proxy_openrouter(request: Request):
    body = await request.json()
    request_body = body.get("requestBody", body)

    api_key = body.get("apiKey") or os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        return JSONResponse(status_code=401, content={"error": "OPENROUTER_API_KEY .env.local dosyasinda tanimli degil."})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        resp = req_lib.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=request_body, timeout=60)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)
    except req_lib.exceptions.Timeout:
        return JSONResponse(status_code=504, content={"error": "OpenRouter API zaman asimi."})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


frontend_dir = str(ROOT_DIR)
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
