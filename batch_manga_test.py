import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
REPORTS_RUNS_DIR = ROOT / "reports" / "runs"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from ocr_engine import detect_text  # noqa: E402
from image_processor import inpaint_image, estimate_safe_text_boxes  # noqa: E402
from translator import translate_texts  # noqa: E402


FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\arialbd.ttf"),
    Path(r"C:\Windows\Fonts\Arial.ttf"),
    Path(r"C:\Windows\Fonts\calibrib.ttf"),
    Path(r"C:\Windows\Fonts\calibri.ttf"),
]

DEFAULT_IMAGE_SETS = {
    "lostend_4": [
        Path(r"C:\Users\52tuz\Documents\Mangas\LOSTEND\Ch.0001 (en)\08.png"),
        Path(r"C:\Users\52tuz\Documents\Mangas\LOSTEND\Ch.0001 (en)\09.png"),
        Path(r"C:\Users\52tuz\Documents\Mangas\LOSTEND\Ch.0001 (en)\10.png"),
        Path(r"C:\Users\52tuz\Documents\Mangas\LOSTEND\Ch.0001 (en)\11.png"),
    ]
}


def load_env():
    for candidate in [
        ROOT / ".env.local",
        ROOT / "backend" / ".env.local",
    ]:
        if candidate.exists():
            load_dotenv(candidate)
            return


def get_api_key(explicit_key=""):
    if explicit_key:
        return explicit_key
    return os.getenv("OPENROUTER_API_KEY") or os.getenv("GEMINI_API_KEY") or ""


def font_path():
    for candidate in FONT_CANDIDATES:
        if candidate.exists():
            return str(candidate)
    return None


def normalize_box_percent(box, width, height):
    if "balloon_inner_percent" in box and box["balloon_inner_percent"]:
        return {
            **box["balloon_inner_percent"],
            "is_balloon_inner": True,
            "balloon_inner_percent": box["balloon_inner_percent"],
        }
    if "safe_box_percent" in box and box["safe_box_percent"]:
        return {
            **box["safe_box_percent"],
            "is_safe_box": True,
            "safe_box_percent": box["safe_box_percent"],
        }
    if "box_percent" in box and box["box_percent"]:
        return box["box_percent"]
    return {
        "x": round(box["x"] / width * 100, 2),
        "y": round(box["y"] / height * 100, 2),
        "w": round(box["w"] / width * 100, 2),
        "h": round(box["h"] / height * 100, 2),
    }


def clamp_percent_box(box, min_w=8.0, min_h=5.0):
    x = max(1.0, float(box.get("x", 10.0)))
    y = max(1.0, float(box.get("y", 10.0)))
    w = min(95.0 - x, max(min_w, float(box.get("w", 20.0))))
    h = min(95.0 - y, max(min_h, float(box.get("h", 10.0))))
    return {"x": x, "y": y, "w": w, "h": h}


def inset_percent_box(box, inset_x_ratio, inset_y_ratio, min_w=8.0, min_h=5.0):
    source = clamp_percent_box(box, min_w=min_w, min_h=min_h)
    inset_x = min(source["w"] * 0.24, max(0.8, source["w"] * inset_x_ratio))
    inset_y = min(source["h"] * 0.24, max(0.7, source["h"] * inset_y_ratio))
    return clamp_percent_box(
        {
            "x": source["x"] + inset_x,
            "y": source["y"] + inset_y,
            "w": source["w"] - (inset_x * 2.0),
            "h": source["h"] - (inset_y * 2.0),
        },
        min_w=min_w,
        min_h=min_h,
    )


def get_display_box(box, text):
    safe_text = str(text or "").strip()

    if box.get("balloon_inner_percent") or box.get("is_balloon_inner"):
        return inset_percent_box(box.get("balloon_inner_percent", box), 0.035, 0.05)

    if box.get("is_safe_box") or box.get("safe_box_percent"):
        return inset_percent_box(box.get("safe_box_percent", box), 0.09, 0.12)

    if box.get("balloon_percent"):
        return inset_percent_box(box["balloon_percent"], 0.12, 0.15)

    display = clamp_percent_box(box)
    aspect = display["w"] / max(display["h"], 1.0)
    has_words = " " in safe_text
    if has_words and (display["w"] < 12.0 or aspect < 0.9):
        grown_w = min(28.0, max(display["w"] + 3.0, display["w"] * 1.15))
        delta_w = grown_w - display["w"]
        display = clamp_percent_box(
            {
                "x": display["x"] - (delta_w / 2.0),
                "y": display["y"],
                "w": grown_w,
                "h": display["h"],
            }
        )

    return inset_percent_box(display, 0.05, 0.07)


def get_display_box_candidates(box, percent_box, text):
    text_value = str(text or "").strip()
    text_len = len(text_value)
    has_words = " " in text_value
    candidates = []
    seen = set()

    def add(candidate):
        normalized = clamp_percent_box(candidate)
        key = tuple(round(normalized[k], 2) for k in ("x", "y", "w", "h"))
        if key in seen:
            return
        seen.add(key)
        candidates.append(normalized)

    add(get_display_box(percent_box, text_value))

    balloon_inner = box.get("balloon_inner_percent")
    balloon = box.get("balloon_percent")
    safe_box = box.get("safe_box_percent")

    if balloon_inner:
        add(inset_percent_box(balloon_inner, 0.03, 0.045))
        add(inset_percent_box(balloon_inner, 0.02, 0.03))
    if safe_box:
        add(inset_percent_box(safe_box, 0.07, 0.1))
        add(inset_percent_box(safe_box, 0.055, 0.08))
    if balloon:
        add(inset_percent_box(balloon, 0.11, 0.14))
        add(inset_percent_box(balloon, 0.085, 0.11))
        if text_len >= 18 or has_words:
            add(inset_percent_box(balloon, 0.065, 0.09))

    base = candidates[0]
    if has_words and text_len >= 18:
        growth_w = 2.6 if text_len < 32 else 4.0
        growth_h = 0.8 if text_len < 32 else 1.4
        add(
            {
                "x": base["x"] - (growth_w / 2.0),
                "y": base["y"] - (growth_h / 2.0),
                "w": base["w"] + growth_w,
                "h": base["h"] + growth_h,
            }
        )
    if has_words and base["w"] < 14.0:
        add(
            {
                "x": base["x"] - 1.5,
                "y": base["y"],
                "w": base["w"] + 3.0,
                "h": base["h"] + 0.8,
            }
        )

    return candidates


def wrap_text(draw, text, font, max_width):
    lines = []
    paragraphs = str(text or "").split("\n")
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            lines.append("")
            continue
        words = paragraph.split()
        current = ""
        for word in words:
            test = f"{current} {word}".strip()
            if draw.textlength(test, font=font) <= max_width:
                current = test
                continue
            if current:
                lines.append(current)
            current = word
            while draw.textlength(current, font=font) > max_width and len(current) > 1:
                idx = len(current) - 1
                while idx > 1 and draw.textlength(current[:idx], font=font) > max_width:
                    idx -= 1
                lines.append(current[:idx])
                current = current[idx:]
        if current:
            lines.append(current)
    return lines or [""]


def score_layout_candidate(lines, widths, line_count, usable_width, usable_height, line_height, font_size):
    widest = max(widths or [0.0])
    total_height = line_count * line_height
    fill_ratio_w = widest / max(usable_width, 1.0)
    fill_ratio_h = total_height / max(usable_height, 1.0)

    horizontal_penalty = abs(fill_ratio_w - 0.72) * 2.6
    vertical_penalty = abs(fill_ratio_h - 0.58) * 2.4
    preferred_bonus = 0.0
    if 0.62 <= fill_ratio_w <= 0.82:
        preferred_bonus += 0.35
    if 0.45 <= fill_ratio_h <= 0.72:
        preferred_bonus += 0.35

    line_count_penalty = 0.0
    if line_count < 2:
        line_count_penalty += 0.8
    if line_count > 4:
        line_count_penalty += (line_count - 4) * 0.45

    word_counts = [len([w for w in str(line or "").strip().split() if w]) for line in lines]
    widow_penalty = 0.0
    if line_count > 1 and word_counts and word_counts[0] <= 1:
        widow_penalty += 0.55
    if line_count > 1 and word_counts and word_counts[-1] <= 1:
        widow_penalty += 0.7

    margins = [(usable_width - width) / 2.0 for width in widths]
    avg_margin = sum(margins) / max(len(margins), 1)
    margin_penalty = sum(abs(m - avg_margin) for m in margins) / max(len(margins), 1)
    margin_penalty = (margin_penalty / max(usable_width, 1.0)) * 2.2

    balloon_shape_penalty = 0.0
    if line_count >= 3:
        middle_width = max(widths[1:-1] or [widths[0]])
        top_ratio = widths[0] / max(middle_width, 1.0)
        bottom_ratio = widths[-1] / max(middle_width, 1.0)
        balloon_shape_penalty += abs(top_ratio - 0.78) * 0.75
        balloon_shape_penalty += abs(bottom_ratio - 0.78) * 0.85
        if top_ratio > 1.05:
            balloon_shape_penalty += 0.35
        if bottom_ratio > 1.05:
            balloon_shape_penalty += 0.35

    return {
        "score": 10.0 - horizontal_penalty - vertical_penalty - line_count_penalty - widow_penalty - margin_penalty - balloon_shape_penalty + preferred_bonus,
        "fill_ratio_w": fill_ratio_w,
        "fill_ratio_h": fill_ratio_h,
        "margin_penalty": margin_penalty,
        "balloon_shape_penalty": balloon_shape_penalty,
        "widow_penalty": widow_penalty,
    }


def get_text_layout_config_web(box, container_width, container_height):
    box_px_w = max(48.0, (float(box.get("w", 20)) / 100.0) * container_width)
    box_px_h = max(28.0, (float(box.get("h", 10)) / 100.0) * container_height)
    aspect = box_px_w / max(1.0, box_px_h)
    is_tall = aspect < 0.82
    is_wide = aspect > 1.85
    pad_x = round(max(7.0, min(box_px_w * (0.11 if is_tall else 0.09), 24.0)))
    pad_y = round(max(6.0, min(box_px_h * (0.11 if is_tall else 0.09), 18.0)))
    line_height = 1.04 if is_tall else (1.1 if is_wide else 1.07)
    min_font = max(10.0, min(box_px_h * 0.14, 17.0))
    max_font = min(56.0, max(min_font, min(box_px_h * (0.3 if is_tall else 0.27), box_px_w * (0.14 if is_tall else 0.11))))
    return {
        "box_px_w": box_px_w,
        "box_px_h": box_px_h,
        "pad_x": pad_x,
        "pad_y": pad_y,
        "line_height": line_height,
        "min_font": min_font,
        "max_font": max_font,
    }


def fit_text_layout_web(draw, text, box, container_width, container_height, font_file):
    layout = get_text_layout_config_web(box, container_width, container_height)
    usable_width = max(24.0, layout["box_px_w"] - (layout["pad_x"] * 2.0))
    usable_height = max(20.0, layout["box_px_h"] - (layout["pad_y"] * 2.0))
    low = max(9.0, min(layout["min_font"], 12.0))
    high = max(low, layout["max_font"])
    best = None

    for font_size in range(int(high), int(low) - 1, -1):
        font = ImageFont.truetype(font_file, max(1, int(font_size))) if font_file else ImageFont.load_default()
        lines = wrap_text(draw, text, font, usable_width)
        widths = [draw.textlength(line or " ", font=font) for line in lines]
        line_height_px = font_size * layout["line_height"]
        total_height = len(lines) * line_height_px
        widest_line = max(widths or [0.0])

        if widest_line > usable_width or total_height > usable_height:
            continue

        metrics = score_layout_candidate(lines, widths, len(lines), usable_width, usable_height, line_height_px, font_size)
        candidate = {
            "font_size": int(font_size),
            "lines": lines,
            "line_height_px": line_height_px,
            "pad_x": layout["pad_x"],
            "pad_y": layout["pad_y"],
            "layout_score": metrics["score"],
            "line_count": len(lines),
            "fill_ratio_w": metrics["fill_ratio_w"],
            "fill_ratio_h": metrics["fill_ratio_h"],
            "margin_penalty": metrics["margin_penalty"],
            "balloon_shape_penalty": metrics["balloon_shape_penalty"],
            "widow_penalty": metrics["widow_penalty"],
        }

        if best is None or candidate["layout_score"] > best["layout_score"] + 0.08 or (
            abs(candidate["layout_score"] - best["layout_score"]) <= 0.08 and candidate["font_size"] > best["font_size"]
        ):
            best = candidate

    if best is None:
        fallback_font = ImageFont.truetype(font_file, max(1, int(low))) if font_file else ImageFont.load_default()
        fallback_lines = wrap_text(draw, text, fallback_font, usable_width)
        fallback_widths = [draw.textlength(line or " ", font=fallback_font) for line in fallback_lines]
        fallback_line_height = low * layout["line_height"]
        metrics = score_layout_candidate(
            fallback_lines,
            fallback_widths,
            len(fallback_lines),
            usable_width,
            usable_height,
            fallback_line_height,
            low,
        )
        best = {
            "font_size": int(low),
            "lines": fallback_lines,
            "line_height_px": fallback_line_height,
            "pad_x": layout["pad_x"],
            "pad_y": layout["pad_y"],
            "layout_score": metrics["score"],
            "line_count": len(fallback_lines),
            "fill_ratio_w": metrics["fill_ratio_w"],
            "fill_ratio_h": metrics["fill_ratio_h"],
            "margin_penalty": metrics["margin_penalty"],
            "balloon_shape_penalty": metrics["balloon_shape_penalty"],
            "widow_penalty": metrics["widow_penalty"],
        }

    return best


def choose_display_box_and_layout(draw, box, percent_box, translated, container_width, container_height, font_file):
    best_candidate = None
    for display_box in get_display_box_candidates(box, percent_box, translated):
        fitted = fit_text_layout_web(draw, translated, display_box, container_width, container_height, font_file)
        selection_score = float(fitted.get("layout_score", 0.0))
        selection_score -= max(0.0, float(fitted.get("fill_ratio_w", 0.0)) - 0.84) * 5.5
        selection_score -= max(0.0, float(fitted.get("fill_ratio_h", 0.0)) - 0.73) * 6.0
        selection_score -= max(0.0, 0.46 - float(fitted.get("fill_ratio_w", 0.0))) * 1.4
        selection_score -= float(fitted.get("widow_penalty", 0.0)) * 0.35
        selection_score -= max(0, int(fitted.get("line_count", 1)) - 3) * 0.18
        selection_score += min(float(display_box.get("w", 0.0)), 26.0) * 0.008

        candidate = {
            "display_box": display_box,
            "layout": fitted,
            "selection_score": selection_score,
        }
        if best_candidate is None or candidate["selection_score"] > best_candidate["selection_score"] + 0.05:
            best_candidate = candidate
            continue
        if abs(candidate["selection_score"] - best_candidate["selection_score"]) <= 0.05:
            if float(display_box.get("w", 0.0)) > float(best_candidate["display_box"].get("w", 0.0)) and int(fitted.get("font_size", 0)) >= int(best_candidate["layout"].get("font_size", 0)) - 1:
                best_candidate = candidate

    return best_candidate["display_box"], best_candidate["layout"]


def draw_rounded_box(draw, rect, fill):
    x1, y1, x2, y2 = rect
    radius = max(10, int(min(x2 - x1, y2 - y1) * 0.12))
    draw.rounded_rectangle(rect, radius=radius, fill=fill)


def render_translations(clean_bgr, boxes, background_mode="transparent"):
    image = Image.fromarray(cv2.cvtColor(clean_bgr, cv2.COLOR_BGR2RGB)).convert("RGBA")
    draw = ImageDraw.Draw(image)
    font_file = font_path()
    width, height = image.size

    rendered_boxes = []
    for box in boxes:
        translated = box.get("translated_text") or box.get("translated") or ""
        percent_box = normalize_box_percent(box, width, height)
        display_box, layout = choose_display_box_and_layout(draw, box, percent_box, translated, width, height, font_file)

        x = int(display_box["x"] / 100 * width)
        y = int(display_box["y"] / 100 * height)
        w = int(display_box["w"] / 100 * width)
        h = int(display_box["h"] / 100 * height)
        font = ImageFont.truetype(font_file, max(1, int(layout["font_size"]))) if font_file else ImageFont.load_default()

        bg_color = None
        if background_mode == "white":
            bg_color = (255, 255, 255, 245)
        elif background_mode == "auto":
            bg_color = (255, 255, 255, 235)

        if bg_color is not None:
            pad_x = 10
            pad_y = 8
            draw_rounded_box(draw, (x - pad_x, y - pad_y, x + w + pad_x, y + h + pad_y), bg_color)

        total_h = len(layout["lines"]) * layout["line_height_px"]
        current_y = y + (h - total_h) / 2 + (layout["line_height_px"] / 2)
        center_x = x + (w / 2)

        for line in layout["lines"]:
            stroke_fill = (255, 255, 255, 255) if bg_color is None else bg_color
            draw.text(
                (center_x, current_y),
                line,
                font=font,
                fill=(0, 0, 0, 255),
                anchor="mm",
                stroke_width=max(2, int(layout["font_size"]) // 12),
                stroke_fill=stroke_fill,
            )
            current_y += layout["line_height_px"]

        rendered_boxes.append(
            {
                "original_text": box.get("original_text", ""),
                "translated_text": translated,
                "box_percent": percent_box,
                "display_box_percent": display_box,
                "balloon_percent": box.get("balloon_percent"),
                "balloon_inner_percent": box.get("balloon_inner_percent"),
                "font_size": int(layout["font_size"]),
                "line_count": len(layout["lines"]),
                "layout_score": round(float(layout.get("layout_score", 0.0)), 4),
                "fill_ratio_w": round(float(layout.get("fill_ratio_w", 0.0)), 4),
                "fill_ratio_h": round(float(layout.get("fill_ratio_h", 0.0)), 4),
                "margin_penalty": round(float(layout.get("margin_penalty", 0.0)), 4),
                "balloon_shape_penalty": round(float(layout.get("balloon_shape_penalty", 0.0)), 4),
                "widow_penalty": round(float(layout.get("widow_penalty", 0.0)), 4),
                "background_mode": background_mode,
            }
        )

    return cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR), rendered_boxes


def render_translations_web_sim(clean_bgr, boxes, background_mode="transparent"):
    image = Image.fromarray(cv2.cvtColor(clean_bgr, cv2.COLOR_BGR2RGB)).convert("RGBA")
    draw = ImageDraw.Draw(image)
    font_file = font_path()
    width, height = image.size
    rendered_boxes = []

    for box in boxes:
        translated = box.get("translated_text") or box.get("translated") or ""
        percent_box = normalize_box_percent(box, width, height)
        display_box, fitted = choose_display_box_and_layout(draw, box, percent_box, translated, width, height, font_file)
        x = (display_box["x"] / 100.0) * width
        y = (display_box["y"] / 100.0) * height
        w = (display_box["w"] / 100.0) * width
        h = (display_box["h"] / 100.0) * height

        bg_color = None
        if background_mode == "white":
            bg_color = (255, 255, 255, 245)
        elif background_mode == "auto":
            bg_color = (255, 255, 255, 235)

        if bg_color is not None:
            pad_x = max(8, int(fitted["pad_x"] + 4))
            pad_y = max(6, int(fitted["pad_y"] + 3))
            draw_rounded_box(
                draw,
                (int(x - pad_x), int(y - pad_y), int(x + w + pad_x), int(y + h + pad_y)),
                bg_color,
            )

        font = ImageFont.truetype(font_file, max(12, int(fitted["font_size"]))) if font_file else ImageFont.load_default()
        line_height = fitted["line_height_px"] or (fitted["font_size"] * 1.12)
        total_text_height = len(fitted["lines"]) * line_height
        start_y = y + (h / 2.0) - (total_text_height / 2.0) + (line_height / 2.0)
        center_x = x + (w / 2.0)

        for line in fitted["lines"]:
            stroke_fill = (255, 255, 255, 255) if bg_color is None else bg_color
            draw.text(
                (center_x, start_y),
                line,
                font=font,
                fill=(0, 0, 0, 255),
                anchor="mm",
                stroke_width=max(4, int(fitted["font_size"] / 3.8)),
                stroke_fill=stroke_fill,
            )
            start_y += line_height

        rendered_boxes.append(
            {
                "original_text": box.get("original_text", ""),
                "translated_text": translated,
                "box_percent": percent_box,
                "display_box_percent": display_box,
                "balloon_percent": box.get("balloon_percent"),
                "balloon_inner_percent": box.get("balloon_inner_percent"),
                "font_size": int(fitted["font_size"]),
                "line_count": len(fitted["lines"]),
                "layout_score": round(float(fitted.get("layout_score", 0.0)), 4),
                "fill_ratio_w": round(float(fitted.get("fill_ratio_w", 0.0)), 4),
                "fill_ratio_h": round(float(fitted.get("fill_ratio_h", 0.0)), 4),
                "margin_penalty": round(float(fitted.get("margin_penalty", 0.0)), 4),
                "balloon_shape_penalty": round(float(fitted.get("balloon_shape_penalty", 0.0)), 4),
                "widow_penalty": round(float(fitted.get("widow_penalty", 0.0)), 4),
                "background_mode": background_mode,
                "render_mode": "web_sim",
            }
        )

    return cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR), rendered_boxes


def compute_cleaning_metrics(original_bgr, clean_bgr, box):
    height, width = original_bgr.shape[:2]
    bp = normalize_box_percent(box, width, height)
    x1 = max(0, int(bp["x"] / 100 * width))
    y1 = max(0, int(bp["y"] / 100 * height))
    x2 = min(width, int((bp["x"] + bp["w"]) / 100 * width))
    y2 = min(height, int((bp["y"] + bp["h"]) / 100 * height))
    if x2 <= x1 or y2 <= y1:
        return {"changed_ratio": 0.0}
    diff = cv2.absdiff(original_bgr[y1:y2, x1:x2], clean_bgr[y1:y2, x1:x2])
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    changed = float(np.count_nonzero(gray > 18))
    return {"changed_ratio": round(changed / gray.size, 4)}


def looks_english(text):
    value = " ".join(str(text or "").strip().lower().split())
    if not value:
        return False
    english_hits = {
        "the", "and", "you", "are", "what", "with", "this", "that", "don't",
        "your", "okay", "love", "wife", "look", "going", "poor", "sorry",
    }
    words = {w.strip(".,!?':;") for w in value.split()}
    return len(words & english_hits) > 0


def normalize_reaction_key(value):
    lowered = " ".join(str(value or "").strip().lower().split())
    lowered = lowered.replace("ı", "i")
    lowered = lowered.replace("vv", "w").replace("ww", "w")
    return "".join(ch for ch in lowered if ch.isalpha() or ch in "!?." )


def reaction_quality_issue(original, translated):
    key = normalize_reaction_key(original)
    translated_value = " ".join(str(translated or "").strip().lower().split())
    if not key:
        return ""

    if key.startswith("tsk") and not any(word in translated_value for word in ["cik", "tuh", "cık"]):
        return "kisa tepki hatali olabilir"
    if key.startswith("ow") and not any(word in translated_value for word in ["ah", "of", "aah"]):
        return "aci tepkisi dogal degil"
    if key.startswith("haha") and "haha" not in translated_value:
        return "gulme tepkisi kaymis olabilir"
    return ""


def visual_density_score(box):
    w = float(box["display_box_percent"]["w"])
    h = float(box["display_box_percent"]["h"])
    font_size = float(box["font_size"])
    lines = max(1.0, float(box["line_count"]))
    area = max(1.0, w * h)
    return (font_size * lines) / area


def analyze_page(original_bgr, clean_bgr, rendered_boxes):
    findings = []
    for idx, box in enumerate(rendered_boxes, start=1):
        translated = box["translated_text"]
        original = box["original_text"]
        display = box["display_box_percent"]
        metrics = compute_cleaning_metrics(
            original_bgr,
            clean_bgr,
            {
                "box_percent": box["box_percent"],
            },
        )

        if not translated.strip():
            findings.append(f"Kutu {idx}: bos ceviri.")
        if translated.strip() == original.strip():
            findings.append(f"Kutu {idx}: ceviri degismemis gorunuyor.")
        if looks_english(translated):
            findings.append(f"Kutu {idx}: Ingilizce kalinti olabilir -> {translated}")
        if box["line_count"] >= 5:
            findings.append(f"Kutu {idx}: cok satirli metin ({box['line_count']})")
        if box["line_count"] >= 4 and box["font_size"] >= 34:
            findings.append(f"Kutu {idx}: estetik risk, font buyuk ve satir sayisi yuksek")
        if display["w"] < 14 and len(translated) > 18:
            findings.append(f"Kutu {idx}: kutu dar, dikey kirilma riski")
        if visual_density_score(box) > 1.65:
            findings.append(f"Kutu {idx}: gorsel yogunluk fazla olabilir")
        if float(box.get("fill_ratio_w", 0.0)) > 0.86 or float(box.get("fill_ratio_h", 0.0)) > 0.76:
            findings.append(f"Kutu {idx}: margin_too_tight")
        if float(box.get("fill_ratio_w", 0.0)) < 0.48 and len(translated) > 14:
            findings.append(f"Kutu {idx}: off_center_layout veya kutu fazla buyuk")
        if float(box.get("layout_score", 0.0)) < 7.35 and (box["line_count"] > 1 or len(translated.strip()) > 8):
            findings.append(f"Kutu {idx}: layout_score dusuk ({box.get('layout_score')})")
        if float(box.get("balloon_shape_penalty", 0.0)) > 0.9:
            findings.append(f"Kutu {idx}: poor_balloon_shape_balance")
        if float(box.get("widow_penalty", 0.0)) > 0.9:
            findings.append(f"Kutu {idx}: widow_or_orphan")
        if box["font_size"] >= 36 and float(box.get("fill_ratio_h", 0.0)) > 0.68:
            findings.append(f"Kutu {idx}: font_too_large_for_balloon")
        reaction_issue = reaction_quality_issue(original, translated)
        if reaction_issue:
            findings.append(f"Kutu {idx}: {reaction_issue}")
        if metrics["changed_ratio"] > 0.45:
            findings.append(f"Kutu {idx}: temizleme agresif olabilir (oran={metrics['changed_ratio']})")
        if metrics["changed_ratio"] < 0.01:
            findings.append(f"Kutu {idx}: temizlik zayif olabilir (oran={metrics['changed_ratio']})")
    return findings


def save_image(path, bgr):
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix or ".png"
    ok, encoded = cv2.imencode(suffix, bgr)
    if not ok:
        raise RuntimeError(f"Gorsel kaydedilemedi: {path}")
    path.write_bytes(encoded.tobytes())


def make_html_report(report_path, pages):
    parts = [
        "<html><head><meta charset='utf-8'><title>Manga Test Report</title>",
        "<style>body{font-family:Arial,sans-serif;padding:24px} img{max-width:320px;border:1px solid #ccc} .row{display:flex;gap:16px;align-items:flex-start;margin-bottom:32px} .col{flex:1} code{background:#f3f3f3;padding:2px 4px}</style>",
        "</head><body>",
        "<h1>Manga Pipeline Test Report</h1>",
        "<p><a href='/reports/'>Dashboard'a don</a></p>",
    ]
    for page in pages:
        parts.append(f"<h2>{page['name']}</h2>")
        parts.append("<div class='row'>")
        parts.append(f"<div class='col'><h3>Original</h3><img src='{page['original_rel']}'></div>")
        parts.append(f"<div class='col'><h3>Clean</h3><img src='{page['clean_rel']}'></div>")
        parts.append(f"<div class='col'><h3>Rendered</h3><img src='{page['render_rel']}'></div>")
        if page.get("web_render_rel"):
            parts.append(f"<div class='col'><h3>Web Sim</h3><img src='{page['web_render_rel']}'></div>")
        parts.append("</div>")
        parts.append("<h3>Findings</h3><ul>")
        if page["findings"]:
            for finding in page["findings"]:
                parts.append(f"<li>{finding}</li>")
        else:
            parts.append("<li>No obvious issues flagged.</li>")
        parts.append("</ul>")
        parts.append("<h3>Boxes</h3><pre>")
        parts.append(json.dumps(page["boxes"], ensure_ascii=False, indent=2))
        parts.append("</pre>")
    parts.append("</body></html>")
    report_path.write_text("".join(parts), encoding="utf-8")


def build_run_summary(out_dir, pages, model, background_mode, render_mode):
    page_summaries = []
    for page in pages:
        boxes = page["boxes"]
        layout_scores = [float(box["layout_score"]) for box in boxes if box.get("layout_score") is not None]
        line_counts = [int(box.get("line_count", 0)) for box in boxes]
        font_sizes = [int(box["font_size"]) for box in boxes if box.get("font_size") is not None]
        page_summaries.append(
            {
                "page": page["page_id"],
                "source": page["source"],
                "error_code": page["error_code"],
                "finding_count": len(page["findings"]),
                "findings": page["findings"],
                "box_count": len(boxes),
                "multi_line_box_count": sum(1 for count in line_counts if count > 2),
                "max_line_count": max(line_counts or [0]),
                "min_font_size": min(font_sizes) if font_sizes else None,
                "avg_layout_score": round(sum(layout_scores) / len(layout_scores), 3) if layout_scores else None,
                "images": {
                    "original": f"/reports/runs/{out_dir.name}/{page['original_rel']}",
                    "clean": f"/reports/runs/{out_dir.name}/{page['clean_rel']}",
                    "rendered": f"/reports/runs/{out_dir.name}/{page['render_rel']}",
                    "web_sim": f"/reports/runs/{out_dir.name}/{page['web_render_rel']}",
                },
            }
        )

    summary = {
        "name": out_dir.name,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "model": model,
        "background_mode": background_mode,
        "render_mode": render_mode,
        "report_url": f"/reports/runs/{out_dir.name}/report.html",
        "totals": {
            "page_count": len(page_summaries),
            "finding_count": sum(page["finding_count"] for page in page_summaries),
            "error_count": sum(1 for page in page_summaries if page["error_code"]),
            "multi_line_box_count": sum(page["multi_line_box_count"] for page in page_summaries),
            "worst_line_count": max((page["max_line_count"] for page in page_summaries), default=0),
        },
        "pages": page_summaries,
    }
    return summary


def write_run_summary(out_dir, pages, model, background_mode, render_mode):
    summary = build_run_summary(out_dir, pages, model, background_mode, render_mode)
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def process_page(image_path, out_dir, api_key, language, model, background_mode, render_mode):
    image_path = Path(image_path)
    image_bytes = image_path.read_bytes()
    boxes, original_bgr = detect_text(image_bytes, language=language)

    if original_bgr is None:
        raise RuntimeError(f"Gorsel okunamadi: {image_path}")

    for box in boxes:
        box["box_percent"] = normalize_box_percent(box, original_bgr.shape[1], original_bgr.shape[0])
    boxes = estimate_safe_text_boxes(original_bgr, boxes)
    for box in boxes:
        if box.get("safe_box"):
            safe_box = box["safe_box"]
            box["safe_box_percent"] = {
                "x": round(safe_box["x"] / original_bgr.shape[1] * 100, 2),
                "y": round(safe_box["y"] / original_bgr.shape[0] * 100, 2),
                "w": round(safe_box["w"] / original_bgr.shape[1] * 100, 2),
                "h": round(safe_box["h"] / original_bgr.shape[0] * 100, 2),
            }
        if box.get("balloon_box"):
            balloon_box = box["balloon_box"]
            box["balloon_percent"] = {
                "x": round(balloon_box["x"] / original_bgr.shape[1] * 100, 2),
                "y": round(balloon_box["y"] / original_bgr.shape[0] * 100, 2),
                "w": round(balloon_box["w"] / original_bgr.shape[1] * 100, 2),
                "h": round(balloon_box["h"] / original_bgr.shape[0] * 100, 2),
            }
        if box.get("balloon_inner_box"):
            balloon_inner_box = box["balloon_inner_box"]
            box["balloon_inner_percent"] = {
                "x": round(balloon_inner_box["x"] / original_bgr.shape[1] * 100, 2),
                "y": round(balloon_inner_box["y"] / original_bgr.shape[0] * 100, 2),
                "w": round(balloon_inner_box["w"] / original_bgr.shape[1] * 100, 2),
                "h": round(balloon_inner_box["h"] / original_bgr.shape[0] * 100, 2),
            }

    boxes, error_code = translate_texts(boxes, api_key, model=model)
    clean_bytes = inpaint_image(original_bgr, boxes)
    clean_bgr = cv2.imdecode(np.frombuffer(clean_bytes, np.uint8), cv2.IMREAD_COLOR)
    if clean_bgr is None:
        clean_bgr = original_bgr.copy()

    rendered_bgr, rendered_boxes = render_translations(clean_bgr.copy(), boxes, background_mode=background_mode)
    web_rendered_bgr, web_rendered_boxes = render_translations_web_sim(clean_bgr.copy(), boxes, background_mode=background_mode)
    analyzed_boxes = web_rendered_boxes if render_mode == "web_sim" else rendered_boxes
    findings = analyze_page(original_bgr, clean_bgr, analyzed_boxes)
    if error_code:
        findings.insert(0, f"Translator error code: {error_code}")

    stem = image_path.stem
    page_dir = out_dir / stem
    original_out = page_dir / f"{stem}_original.png"
    clean_out = page_dir / f"{stem}_clean.png"
    render_out = page_dir / f"{stem}_rendered.png"
    web_render_out = page_dir / f"{stem}_web_sim.png"
    meta_out = page_dir / f"{stem}_report.json"

    save_image(original_out, original_bgr)
    save_image(clean_out, clean_bgr)
    save_image(render_out, rendered_bgr)
    save_image(web_render_out, web_rendered_bgr)

    meta = {
        "source": str(image_path),
        "error_code": error_code,
        "findings": findings,
        "boxes": analyzed_boxes,
        "render_mode": render_mode,
    }
    meta_out.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "page_id": stem,
        "source": str(image_path),
        "error_code": error_code,
        "name": image_path.name,
        "original_rel": os.path.relpath(original_out, out_dir).replace("\\", "/"),
        "clean_rel": os.path.relpath(clean_out, out_dir).replace("\\", "/"),
        "render_rel": os.path.relpath(render_out, out_dir).replace("\\", "/"),
        "web_render_rel": os.path.relpath(web_render_out, out_dir).replace("\\", "/"),
        "findings": findings,
        "boxes": analyzed_boxes,
    }


def main():
    parser = argparse.ArgumentParser(description="Batch test manga translation pipeline.")
    parser.add_argument("images", nargs="*", help="Input manga pages")
    parser.add_argument("--out-dir", default=str(REPORTS_RUNS_DIR / "latest"), help="Output directory")
    parser.add_argument("--language", default="en", help="OCR language hint")
    parser.add_argument("--model", default="google/gemini-2.5-flash", help="Translation model")
    parser.add_argument("--api-key", default="", help="Override API key")
    parser.add_argument(
        "--preset",
        choices=sorted(DEFAULT_IMAGE_SETS.keys()),
        default="lostend_4",
        help="Named image set to run when images are not passed",
    )
    parser.add_argument(
        "--background-mode",
        choices=["transparent", "white", "auto"],
        default="transparent",
        help="Rendered text background mode",
    )
    parser.add_argument(
        "--render-mode",
        choices=["ideal", "web_sim"],
        default="web_sim",
        help="Report icin hangi render davranisi analiz edilsin",
    )
    args = parser.parse_args()

    load_env()
    api_key = get_api_key(args.api_key)
    if not api_key:
        raise SystemExit("API key bulunamadi. .env.local veya --api-key kullan.")

    input_images = [Path(image) for image in args.images] if args.images else list(DEFAULT_IMAGE_SETS[args.preset])
    missing = [str(path) for path in input_images if not Path(path).exists()]
    if missing:
        raise SystemExit("Eksik girdi dosyalari:\n" + "\n".join(missing))

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pages = []
    for image in input_images:
        print(f"[RUN] {image}")
        pages.append(process_page(image, out_dir, api_key, args.language, args.model, args.background_mode, args.render_mode))

    report_path = out_dir / "report.html"
    make_html_report(report_path, pages)
    write_run_summary(out_dir, pages, args.model, args.background_mode, args.render_mode)
    print(f"[DONE] Report: {report_path}")


if __name__ == "__main__":
    main()
