import cv2
import numpy as np


def _build_balloon_mask(gray_roi, local_rect):
    """
    OCR kutusunun yakinindaki beyaz konusma balonunu bagli bilesen olarak tahmin et.
    """
    blurred = cv2.GaussianBlur(gray_roi, (5, 5), 0)
    _, fixed_mask = cv2.threshold(blurred, 185, 255, cv2.THRESH_BINARY)
    adaptive_mask = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        -6,
    )
    combined = cv2.bitwise_and(fixed_mask, adaptive_mask)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=2)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel, iterations=1)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        (combined > 0).astype(np.uint8), connectivity=8
    )
    if num_labels <= 1:
        return None

    x, y, w, h = local_rect
    cx = x + (w // 2)
    cy = y + (h // 2)
    best_label = 0
    best_score = -1.0

    for label in range(1, num_labels):
        area = stats[label, cv2.CC_STAT_AREA]
        if area < max(120, w * h):
            continue

        comp = labels == label
        overlap = float(comp[y : y + h, x : x + w].sum())
        if overlap <= 0:
            continue

        center_hit = 0.0
        if 0 <= cy < comp.shape[0] and 0 <= cx < comp.shape[1] and comp[cy, cx]:
            center_hit = 2500.0

        whiteness = float(gray_roi[comp].mean()) if np.any(comp) else 0.0
        score = overlap + center_hit + area * 0.04 + whiteness * 2.0
        if score > best_score:
            best_score = score
            best_label = label

    if best_label == 0:
        return None

    return ((labels == best_label).astype(np.uint8) * 255)


def _build_text_mask(gray_roi, allow_mask=None):
    """
    Dikdortgeni komple silmek yerine ROI icindeki yazi piksellerini bul.
    Bu, baloncugu patlatmadan sadece metni temizlemeye daha yakin.
    """
    blurred = cv2.GaussianBlur(gray_roi, (3, 3), 0)

    _, otsu_mask = cv2.threshold(
        blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )
    adaptive_mask = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        21,
        8,
    )

    blackhat = cv2.morphologyEx(
        blurred,
        cv2.MORPH_BLACKHAT,
        cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
    )
    _, blackhat_mask = cv2.threshold(blackhat, 18, 255, cv2.THRESH_BINARY)

    combined = cv2.bitwise_or(otsu_mask, adaptive_mask)
    combined = cv2.bitwise_or(combined, blackhat_mask)

    if allow_mask is not None:
        safe_allow = allow_mask.copy()
        if cv2.countNonZero(safe_allow) > 0:
            distance = cv2.distanceTransform(
                (safe_allow > 0).astype(np.uint8), cv2.DIST_L2, 3
            )
            inner_margin = max(1.5, min(gray_roi.shape[:2]) * 0.015)
            safe_allow = np.where(distance >= inner_margin, 255, 0).astype(np.uint8)
            if cv2.countNonZero(safe_allow) == 0:
                safe_allow = allow_mask
            combined = cv2.bitwise_and(combined, safe_allow)

    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    open_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, close_kernel, iterations=1)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, open_kernel, iterations=1)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(combined, connectivity=8)
    filtered = np.zeros_like(combined)

    for label in range(1, num_labels):
        area = stats[label, cv2.CC_STAT_AREA]
        width = stats[label, cv2.CC_STAT_WIDTH]
        height = stats[label, cv2.CC_STAT_HEIGHT]

        if area < 6:
            continue
        if width < 2 or height < 2:
            continue
        if allow_mask is not None and (
            stats[label, cv2.CC_STAT_LEFT] == 0
            or stats[label, cv2.CC_STAT_TOP] == 0
            or stats[label, cv2.CC_STAT_LEFT] + width >= gray_roi.shape[1]
            or stats[label, cv2.CC_STAT_TOP] + height >= gray_roi.shape[0]
        ):
            continue

        filtered[labels == label] = 255

    return filtered


def inpaint_image(img, text_boxes):
    """
    OCR kutularindan hareketle yazi maskesi uretir ve sadece ilgili alanlari temizler.
    """
    if img is None:
        return b""

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = np.zeros((h, w), dtype=np.uint8)

    total_mask_pixels = 0

    for box in text_boxes:
        bx, by, bw, bh = box["x"], box["y"], box["w"], box["h"]

        pad = max(2, int(min(bw, bh) * 0.1))
        x1 = max(0, bx - pad)
        y1 = max(0, by - pad)
        x2 = min(w, bx + bw + pad)
        y2 = min(h, by + bh + pad)

        roi_gray = gray[y1:y2, x1:x2]
        if roi_gray.size == 0:
            continue

        local_rect = (
            max(0, bx - x1),
            max(0, by - y1),
            max(1, min(bw, x2 - x1)),
            max(1, min(bh, y2 - y1)),
        )

        balloon_mask = _build_balloon_mask(roi_gray, local_rect)
        roi_mask = _build_text_mask(roi_gray, balloon_mask)
        if cv2.countNonZero(roi_mask) == 0:
            roi_mask = _build_text_mask(roi_gray)
            if balloon_mask is not None:
                roi_mask = cv2.bitwise_and(roi_mask, balloon_mask)

        filled_ratio = cv2.countNonZero(roi_mask) / float(max(1, roi_mask.size))
        if filled_ratio < 0.004:
            continue

        dilation_size = 2 if min(bw, bh) < 40 else 3
        dilate_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (dilation_size, dilation_size)
        )
        roi_mask = cv2.dilate(roi_mask, dilate_kernel, iterations=1)
        mask[y1:y2, x1:x2] = cv2.bitwise_or(mask[y1:y2, x1:x2], roi_mask)
        total_mask_pixels += int(cv2.countNonZero(roi_mask))

    final_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    mask = cv2.dilate(mask, final_kernel, iterations=1)
    mask = cv2.GaussianBlur(mask, (3, 3), 0)

    mask_ratio = total_mask_pixels / float(max(1, h * w))
    if mask_ratio < 0.01:
        inpaint_radius = 2
        inpaint_flag = cv2.INPAINT_TELEA
    elif mask_ratio < 0.03:
        inpaint_radius = 3
        inpaint_flag = cv2.INPAINT_TELEA
    else:
        inpaint_radius = 4
        inpaint_flag = cv2.INPAINT_NS

    inpainted_img = cv2.inpaint(
        img, mask, inpaintRadius=inpaint_radius, flags=inpaint_flag
    )

    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 92]
    success, encoded_image = cv2.imencode(".jpg", inpainted_img, encode_params)
    if success:
        return encoded_image.tobytes()

    return b""


def _connected_interval(mask_row, center_x):
    if center_x < 0 or center_x >= len(mask_row) or mask_row[center_x] == 0:
        return None
    left = center_x
    right = center_x
    while left - 1 >= 0 and mask_row[left - 1] > 0:
        left -= 1
    while right + 1 < len(mask_row) and mask_row[right + 1] > 0:
        right += 1
    return left, right


def _largest_centered_rect(component_mask, center_x, center_y):
    height, width = component_mask.shape[:2]
    if center_x < 0 or center_x >= width or center_y < 0 or center_y >= height:
        return None
    if component_mask[center_y, center_x] == 0:
        return None

    top = center_y
    while top - 1 >= 0 and component_mask[top - 1, center_x] > 0:
        top -= 1
    bottom = center_y
    while bottom + 1 < height and component_mask[bottom + 1, center_x] > 0:
        bottom += 1

    best = None
    rows = []
    for y in range(center_y, top - 1, -1):
        interval = _connected_interval(component_mask[y], center_x)
        if interval is None:
            break
        rows.insert(0, (y, interval[0], interval[1]))
    upper_rows = rows[:]
    rows = []
    for y in range(center_y + 1, bottom + 1):
        interval = _connected_interval(component_mask[y], center_x)
        if interval is None:
            break
        rows.append((y, interval[0], interval[1]))
    all_rows = upper_rows + rows

    center_index = next((i for i, item in enumerate(all_rows) if item[0] == center_y), None)
    if center_index is None:
        return None

    for start in range(center_index, -1, -1):
        left = all_rows[start][1]
        right = all_rows[start][2]
        for end in range(center_index, len(all_rows)):
            left = max(left, all_rows[end][1])
            right = min(right, all_rows[end][2])
            if right <= left:
                break
            rect_w = right - left + 1
            rect_h = all_rows[end][0] - all_rows[start][0] + 1
            area = rect_w * rect_h
            if best is None or area > best["area"]:
                best = {
                    "x": left,
                    "y": all_rows[start][0],
                    "w": rect_w,
                    "h": rect_h,
                    "area": area,
                }

    return best


def _rect_from_stats(stats_row):
    return {
        "x": int(stats_row[cv2.CC_STAT_LEFT]),
        "y": int(stats_row[cv2.CC_STAT_TOP]),
        "w": int(stats_row[cv2.CC_STAT_WIDTH]),
        "h": int(stats_row[cv2.CC_STAT_HEIGHT]),
    }


def _clamp_rect(rect, img_w, img_h, min_w=12, min_h=10):
    x = int(max(0, rect["x"]))
    y = int(max(0, rect["y"]))
    max_w = max(1, img_w - x)
    max_h = max(1, img_h - y)
    w = int(max(min_w, min(rect["w"], max_w)))
    h = int(max(min_h, min(rect["h"], max_h)))
    return {"x": x, "y": y, "w": w, "h": h}


def estimate_safe_text_boxes(img, text_boxes):
    """
    Beyaz balon icindeki yazi icin daha guvenli bir dikdortgen alan tahmin eder.
    Her kutuya `safe_box` ekler.
    """
    if img is None or not text_boxes:
        return text_boxes

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, white_mask = cv2.threshold(blur, 185, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    white_mask = cv2.morphologyEx(white_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    white_mask = cv2.morphologyEx(white_mask, cv2.MORPH_OPEN, kernel, iterations=1)

    img_h, img_w = gray.shape[:2]

    for box in text_boxes:
        bx, by, bw, bh = box["x"], box["y"], box["w"], box["h"]
        cx = bx + (bw // 2)
        cy = by + (bh // 2)
        pad_x = max(18, int(bw * 1.2))
        pad_y = max(18, int(bh * 1.2))
        x1 = max(0, bx - pad_x)
        y1 = max(0, by - pad_y)
        x2 = min(img_w, bx + bw + pad_x)
        y2 = min(img_h, by + bh + pad_y)

        roi_mask = white_mask[y1:y2, x1:x2]
        if roi_mask.size == 0:
            continue

        local_box_x1 = max(0, bx - x1)
        local_box_y1 = max(0, by - y1)
        local_box_x2 = min(roi_mask.shape[1], local_box_x1 + bw)
        local_box_y2 = min(roi_mask.shape[0], local_box_y1 + bh)

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats((roi_mask > 0).astype(np.uint8), connectivity=8)
        if num_labels <= 1:
            continue

        best_label = 0
        best_score = -1
        for label in range(1, num_labels):
            area = stats[label, cv2.CC_STAT_AREA]
            if area < max(150, bw * bh * 0.8):
                continue
            comp = (labels == label).astype(np.uint8)
            overlap = int(comp[local_box_y1:local_box_y2, local_box_x1:local_box_x2].sum())
            center_hit = comp[min(max(cy - y1, 0), comp.shape[0] - 1), min(max(cx - x1, 0), comp.shape[1] - 1)]
            score = overlap + (5000 if center_hit else 0) + area * 0.05
            if score > best_score:
                best_score = score
                best_label = label

        if best_label == 0:
            continue

        comp_mask = (labels == best_label).astype(np.uint8)
        seed_x = min(max(cx - x1, 0), comp_mask.shape[1] - 1)
        seed_y = min(max(cy - y1, 0), comp_mask.shape[0] - 1)
        if comp_mask[seed_y, seed_x] == 0:
            ys, xs = np.where(comp_mask > 0)
            if len(xs) == 0:
                continue
            distances = (xs - seed_x) ** 2 + (ys - seed_y) ** 2
            nearest_idx = int(np.argmin(distances))
            seed_x = int(xs[nearest_idx])
            seed_y = int(ys[nearest_idx])

        safe_rect = _largest_centered_rect(comp_mask, seed_x, seed_y)
        balloon_rect = _rect_from_stats(stats[best_label])
        stat_x = balloon_rect["x"]
        stat_y = balloon_rect["y"]
        stat_w = balloon_rect["w"]
        stat_h = balloon_rect["h"]
        inset_rect = {
            "x": stat_x + max(2, int(stat_w * 0.08)),
            "y": stat_y + max(2, int(stat_h * 0.1)),
            "w": max(12, stat_w - (max(2, int(stat_w * 0.08)) * 2)),
            "h": max(10, stat_h - (max(2, int(stat_h * 0.1)) * 2)),
        }

        if not safe_rect:
            safe_rect = {**inset_rect, "area": inset_rect["w"] * inset_rect["h"]}
        else:
            centered_aspect = safe_rect["w"] / max(1, safe_rect["h"])
            original_aspect = bw / max(1, bh)
            if (
                safe_rect["w"] < max(12, int(bw * 0.85))
                or safe_rect["h"] < max(10, int(bh * 0.85))
                or centered_aspect < max(0.7, original_aspect * 0.45)
            ):
                inset_area = inset_rect["w"] * inset_rect["h"]
                if inset_area > safe_rect["area"] * 0.75:
                    safe_rect = {**inset_rect, "area": inset_area}

        inset_x = max(2, int(safe_rect["w"] * 0.06))
        inset_y = max(2, int(safe_rect["h"] * 0.08))
        sx = x1 + safe_rect["x"] + inset_x
        sy = y1 + safe_rect["y"] + inset_y
        sw = max(12, safe_rect["w"] - (inset_x * 2))
        sh = max(10, safe_rect["h"] - (inset_y * 2))

        box["balloon_box"] = _clamp_rect(
            {
                "x": x1 + stat_x,
                "y": y1 + stat_y,
                "w": stat_w,
                "h": stat_h,
            },
            img_w,
            img_h,
            min_w=max(12, bw),
            min_h=max(10, bh),
        )
        balloon_inner = _clamp_rect(
            {
                "x": int(max(0, sx)),
                "y": int(max(0, sy)),
                "w": int(sw),
                "h": int(sh),
            },
            img_w,
            img_h,
        )
        box["balloon_inner_box"] = balloon_inner
        box["safe_box"] = dict(balloon_inner)
        box["balloon_center"] = {
            "x": int(x1 + seed_x),
            "y": int(y1 + seed_y),
        }

    return text_boxes
