import easyocr
import numpy as np
import cv2
import sys
import io
import re

# Windows konsol encoding sorununu coz (cp1254 emoji desteklemiyor)
if sys.platform == 'win32':
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except Exception:
        pass

# Global easyocr okuyuculari baslat.
# Japonca+Ingilizce ve sadece Ingilizce icin ayri okuyucular tutuyoruz.
# Not: EasyOCR 'ko' (Korece) ile 'ja' (Japonca) dilini ayni anda kullanamıyor.
print("[OCR] EasyOCR modelleri yukleniyor... Bu islem ilk seferde biraz zaman alabilir.")

reader_ja = None
reader_en = None

try:
    reader_ja = easyocr.Reader(['ja', 'en'], gpu=False, verbose=False)
    print("[OK] Japonca+Ingilizce OCR modeli yuklendi.")
except Exception as e:
    print("[HATA] Japonca OCR baslatma hatasi:", str(e))

try:
    reader_en = easyocr.Reader(['en'], gpu=False, verbose=False)
    print("[OK] Ingilizce OCR modeli yuklendi.")
except Exception as e:
    print("[HATA] Ingilizce OCR baslatma hatasi:", str(e))


def preprocess_image(img):
    """
    Manga görseli için OCR öncesi ön işleme:
    - Gri tonlamaya çevir
    - CLAHE kontrast iyileştirme (silik yazılar daha okunur olur)
    - Adaptive threshold (opsiyonel, ama balonlardaki yazıyı öne çıkarır)
    Sonuç: Orijinal renkli görselin yanında, OCR'a optimize edilmiş bir kopya
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    # Gri tonlamalı resmi 3 kanala dönüştür (EasyOCR'ın beklediği format)
    enhanced_3ch = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    
    return enhanced_3ch


def _normalize_ocr_text(text):
    value = " ".join((text or "").strip().split())
    value = value.replace(" _", "").replace("_ ", " ").replace("_", "")
    value = re.sub(r"^[^\wA-Za-z]+", "", value)
    value = re.sub(r"[^\wA-Za-z!?.,:'\"-]+$", "", value)
    return value.strip()


def _is_dialogue_candidate(text, width, height, language):
    value = _normalize_ocr_text(text)
    if not value:
        return False

    letters = sum(ch.isalpha() for ch in value)
    digits = sum(ch.isdigit() for ch in value)
    alnum = letters + digits
    spaces = value.count(" ")

    if alnum == 0:
        return False

    lower_value = value.lower()
    if lower_value in {"oo", "o0", "0o", "ow", "ah", "oh"} and width < 80 and height < 40:
        return False

    if len(value) <= 3 and spaces == 0 and letters <= 2 and not any(ch in "!?" for ch in value) and not value.isupper():
        return False

    if spaces == 0 and len(value) <= 4 and re.fullmatch(r"[a-z]{1,4}", lower_value) and not re.search(r"[aeiou]", lower_value):
        return False

    if re.fullmatch(r"[a-z ]+", lower_value) and lower_value == value and len(value) <= 8 and spaces <= 1 and not any(ch in ".!?,'\"" for ch in value):
        return False

    non_word_ratio = sum(not (ch.isalnum() or ch.isspace()) for ch in value) / max(1, len(value))
    if non_word_ratio > 0.45:
        return False

    # İngilizce sayfalarda balon dışı Japonca/SFX gürültüsünü daha sert ele.
    if language == "en":
        ascii_letters = sum(("a" <= ch.lower() <= "z") for ch in value)
        if ascii_letters == 0 and len(value) < 8:
            return False

    return True


def _should_merge(group, candidate, merge_distance_x, merge_distance_y):
    g_x1 = min(b["x"] for b in group)
    g_y1 = min(b["y"] for b in group)
    g_x2 = max(b["x"] + b["w"] for b in group)
    g_y2 = max(b["y"] + b["h"] for b in group)

    c_x1 = candidate["x"]
    c_y1 = candidate["y"]
    c_x2 = c_x1 + candidate["w"]
    c_y2 = c_y1 + candidate["h"]

    avg_w = max(1, (g_x2 - g_x1 + candidate["w"]) / 2)
    avg_h = max(1, (g_y2 - g_y1 + candidate["h"]) / 2)
    pad_x = max(merge_distance_x, int(avg_w * 0.16))
    pad_y = max(merge_distance_y, int(avg_h * 0.45))

    h_gap = max(0, c_x1 - g_x2, g_x1 - c_x2)
    v_gap = max(0, c_y1 - g_y2, g_y1 - c_y2)
    overlap_x = min(g_x2, c_x2) - max(g_x1, c_x1)
    overlap_y = min(g_y2, c_y2) - max(g_y1, c_y1)

    vertically_aligned = overlap_x >= -min(pad_x, avg_w * 0.12)
    horizontally_aligned = overlap_y >= -min(pad_y, avg_h * 0.12)

    return (vertically_aligned and v_gap <= pad_y) or (horizontally_aligned and h_gap <= pad_x)


def merge_nearby_boxes(text_boxes, img_width, img_height, merge_distance_x=18, merge_distance_y=16):
    """
    Aynı balon içinde birden fazla satır olarak algılanan metin kutularını birleştirir.
    Yatayda ve dikeyde birbirine yakın kutular tek kutu altında toplanır.
    """
    if len(text_boxes) <= 1:
        return text_boxes
    
    merged = []
    used = [False] * len(text_boxes)
    
    for i in range(len(text_boxes)):
        if used[i]:
            continue
        
        group = [text_boxes[i]]
        used[i] = True
        
        for j in range(i + 1, len(text_boxes)):
            if used[j]:
                continue
            
            if _should_merge(group, text_boxes[j], merge_distance_x, merge_distance_y):
                group.append(text_boxes[j])
                used[j] = True
        
        # Grubu tek kutuya dönüştür
        x = min(b["x"] for b in group)
        y = min(b["y"] for b in group)
        x2 = max(b["x"] + b["w"] for b in group)
        y2 = max(b["y"] + b["h"] for b in group)
        
        # Metinleri dikey sıraya göre birleştir
        group.sort(key=lambda b: (b["y"], b["x"]))
        combined_text = " ".join(b["original_text"] for b in group)
        
        merged.append({
            "x": x,
            "y": y,
            "w": x2 - x,
            "h": y2 - y,
            "original_text": combined_text
        })
    
    return merged


def detect_text(image_bytes, language="auto"):
    """
    Gelen resmi okur, text box'larını çıkarır ve koordinatlarıyla döner.
    
    Parametreler:
    - image_bytes: Görselin byte hali
    - language: "ja" (Japonca+İngilizce), "en" (sadece İngilizce), "auto" (otomatik algıla)
    
    Döndürür: (text_boxes, img) tuple'ı
    """
    # Byte array formatından CV2 formatına çevir
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        return [], None
    
    # Dil seçimine göre okuyucu belirle
    if language == "en":
        reader = reader_en
    elif language == "ja":
        reader = reader_ja
    else:
        # "auto" mod: Varsayılan olarak Japonca+İngilizce kullan (en kapsamlı)
        reader = reader_ja or reader_en
    
    if reader is None:
        print("❌ OCR okuyucusu başlatılamadı!")
        return [], img
    
    # OCR öncesi ön işleme (kontrast artırma)
    processed_img = preprocess_image(img)
    
    # Yazıları oku (hem orijinal hem işlenmiş görsel üzerinden)
    results = reader.readtext(processed_img)
    
    # Eğer işlenmiş görselde çok az sonuç varsa, orijinal görselle de dene
    if len(results) < 2:
        original_results = reader.readtext(img)
        if len(original_results) > len(results):
            results = original_results
    
    text_boxes = []
    for (bbox, text, prob) in results:
        if prob > 0.12:  # Manga olduğu için düşük güven eşiği
            # Çok kısa veya anlamsız sonuçları atlat
            normalized_text = _normalize_ocr_text(text)
            if len(normalized_text) < 1:
                continue
                
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            
            x, y = min(xs), min(ys)
            w, h = max(xs) - min(xs), max(ys) - min(ys)
            
            # Çok küçük kutuları atla (muhtemelen gürültü)
            if w < 5 or h < 5:
                continue

            if not _is_dialogue_candidate(normalized_text, w, h, language):
                continue
            
            text_boxes.append({
                "x": int(x),
                "y": int(y),
                "w": int(w),
                "h": int(h),
                "original_text": normalized_text
            })
    
    # Yakın kutuları birleştir (aynı balondaki satırlar)
    h_img, w_img = img.shape[:2]
    text_boxes = merge_nearby_boxes(text_boxes, w_img, h_img)
    
    return text_boxes, img
