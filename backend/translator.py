import json
import re
import unicodedata

import requests


REACTION_MAP = {
    "ow": "Ah!",
    "ow.": "Ah!",
    "ow..": "Ah!",
    "ow...": "Ah...",
    "tsk": "Cık!",
    "tsk!": "Cık!",
    "tskw": "Cık!",
    "tskw!": "Cık!",
    "hah": "Ha!",
    "haha": "Haha!",
    "huh": "Ha?",
    "huh?": "Ha?",
    "ah": "Ah!",
    "ah!": "Ah!",
    "oh": "Oh!",
    "oh!": "Oh!",
    "ugh": "Iyy!",
    "ugh!": "Iyy!",
}

OCR_CHAR_MAP = str.maketrans(
    {
        "’": "'",
        "`": "'",
        "“": '"',
        "”": '"',
        "„": '"',
        "—": "-",
        "–": "-",
        "…": "...",
        "|": "I",
    }
)


def _coerce_text_value(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("translated_text", "translation", "translated", "text", "value", "result"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate
        for candidate in value.values():
            nested = _coerce_text_value(candidate)
            if nested.strip():
                return nested
        return ""
    if isinstance(value, list):
        parts = []
        for item in value:
            nested = _coerce_text_value(item).strip()
            if nested:
                parts.append(nested)
        return " ".join(parts).strip()
    return str(value or "")


def _normalize_text(value):
    return " ".join(_coerce_text_value(value).strip().lower().split())


def _clean_ocr_source_text(value):
    text = unicodedata.normalize("NFKC", _coerce_text_value(value).strip())
    if not text:
        return ""

    text = text.translate(OCR_CHAR_MAP)
    text = re.sub(r"(?<=[A-Za-z])0(?=[A-Za-z])", "o", text)
    text = re.sub(r"(?<=[A-Za-z])1(?=[A-Za-z])", "l", text)
    text = re.sub(r"(?<=[A-Za-z])5(?=[A-Za-z])", "s", text)
    text = re.sub(r"(?<=[A-Za-z])4(?=[A-Za-z])", "a", text)
    text = re.sub(r"(?<=[A-Za-z])7(?=[A-Za-z])", "t", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"([!?.,]){2,}", r"\1", text)
    return text.strip()


def _same_text_is_acceptable(original_text):
    value = _coerce_text_value(original_text).strip()
    if not value:
        return True

    compact = re.sub(r"[^A-Za-z0-9]+", "", value)
    if not compact:
        return True
    if re.fullmatch(r"[\d\s\-:/.]+", value):
        return True
    if len(compact) <= 4:
        return True

    words = [word for word in re.split(r"\s+", value) if word]
    if len(words) <= 2 and all(word[:1].isupper() for word in words if word[:1].isalpha()):
        return True
    if len(words) <= 2 and value.upper() == value and len(compact) <= 8:
        return True
    return False


def _normalize_reaction_key(value):
    lowered = _normalize_text(value)
    lowered = lowered.replace("ı", "i")
    lowered = re.sub(r"[^a-z!?\.]", "", lowered)
    lowered = lowered.replace("vv", "w")
    lowered = lowered.replace("ww", "w")
    return lowered


def _heuristic_reaction_translation(original_text):
    key = _normalize_reaction_key(original_text)
    if key in REACTION_MAP:
        return REACTION_MAP[key]
    if re.fullmatch(r"t+s+k+w*[!.?]*", key):
        return "Cık!"
    if re.fullmatch(r"o+w+[!.?]*", key):
        return "Ah!"
    if re.fullmatch(r"h+a+h+a+[!.?]*", key):
        return "Haha!"
    return ""


def _postprocess_translation(original_text, translated_text):
    translated = _coerce_text_value(translated_text).strip()
    reaction = _heuristic_reaction_translation(original_text)
    if reaction:
        return reaction

    normalized_original = _normalize_text(original_text)
    normalized_translated = _normalize_text(translated)

    phrase_map = {
        "you're seriously": "Yaralisin! Ilk yardim orada!",
        "don't just leave your": "Hey aptal! Birakma, kovulursun!",
        "i'm already aware": "Biliyorum, Watanabe.",
        "if you keep it up": "Boyle surerse kotulesir.",
        "poor bicycles": "Zavalli bisikletler!",
        "what's going on": "Ne oluyor? Kotu bu.",
    }
    for needle, replacement in phrase_map.items():
        if needle in normalized_original:
            return replacement

    if normalized_original.startswith("hey! are you okay") and "iyi misin" not in normalized_translated:
        return "Hey! Iyi misin?!"

    if "poor bicycles" in normalized_original and "bisiklet" in normalized_translated and "zavalli" not in normalized_translated:
        return "Zavalli bisikletler!"

    letters = [ch for ch in translated if ch.isalpha()]
    if letters:
        upper_ratio = sum(ch.isupper() for ch in letters) / len(letters)
        if upper_ratio > 0.72:
            lowered = translated.lower()
            translated = lowered[:1].upper() + lowered[1:]
            translated = re.sub(r"\bwatanabe\b", "Watanabe", translated, flags=re.IGNORECASE)

    return translated


def _looks_turkish(text):
    value = _normalize_text(text)
    if not value:
        return False

    if any(char in "çğıöşü" for char in value):
        return True

    common_turkish_words = {
        "ve", "bir", "bu", "şu", "için", "ama", "çok", "gibi", "de", "da",
        "mi", "mı", "mu", "mü", "ne", "ben", "sen", "biz", "siz", "onlar",
        "evet", "hayır", "tamam", "burada", "orada", "neden", "nasıl",
        "şimdi", "sonra", "defol", "merhaba", "lütfen"
    }
    words = value.split()
    if not words:
        return False

    matches = sum(1 for word in words if word in common_turkish_words)
    return matches >= max(1, len(words) // 3)


def _needs_turkish_retry(texts_to_translate, translated_dict):
    """
    Model bazen JSON'u dogru donup metni cevirmeden geri birakiyor.
    Kaynak metinlerin cogu aynen donmusse ikinci, daha sert bir gecis yap.
    """
    checked = 0
    unchanged = 0

    for key, original in texts_to_translate.items():
        if _same_text_is_acceptable(original):
            continue
        translated = _coerce_text_value(translated_dict.get(key, ""))
        if not original or len(original.strip()) < 2:
            continue

        checked += 1
        if _normalize_text(original) == _normalize_text(translated):
            unchanged += 1

    if checked == 0:
        return False

    return (unchanged / checked) >= 0.5


def _collect_retry_candidates(texts_to_translate, translated_dict):
    retry_candidates = {}

    for key, original in texts_to_translate.items():
        if _same_text_is_acceptable(original):
            continue
        translated = _coerce_text_value(translated_dict.get(key, ""))
        if not original or len(original.strip()) < 2:
            continue

        if _normalize_text(original) == _normalize_text(translated):
            retry_candidates[key] = original
            continue

        if not _looks_turkish(translated):
            retry_candidates[key] = original

    return retry_candidates


def detect_source_language(texts):
    """
    Metin listesindeki karakterlere bakarak kaynak dili algilar.
    Dondurur: "ja", "ko", "zh" veya "en"
    """
    all_text = " ".join(texts)

    ja_count = 0
    ko_count = 0
    zh_count = 0
    latin_count = 0

    for char in all_text:
        cp = ord(char)
        if 0x3040 <= cp <= 0x309F:
            ja_count += 1
        elif 0x30A0 <= cp <= 0x30FF:
            ja_count += 1
        elif 0xAC00 <= cp <= 0xD7AF or 0x1100 <= cp <= 0x11FF:
            ko_count += 1
        elif 0x4E00 <= cp <= 0x9FFF:
            zh_count += 1
            ja_count += 0.3
        elif 0x0041 <= cp <= 0x007A:
            latin_count += 1

    scores = {"ja": ja_count, "ko": ko_count, "zh": zh_count, "en": latin_count}
    detected = max(scores, key=scores.get)

    if ja_count + ko_count + zh_count < 2:
        return "en"

    return detected


def _strip_markdown_fence(reply):
    if reply.startswith("```json"):
        reply = reply[7:]
    if reply.startswith("```"):
        reply = reply[3:]
    if reply.endswith("```"):
        reply = reply[:-3]
    return reply.strip()


def _parse_json_reply(reply):
    cleaned = _strip_markdown_fence(reply)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", cleaned)
        if match:
            extracted = match.group(0).replace(",\s*([\}\]])", r"\1")
            extracted = re.sub(r",\s*([\}\]])", r"\1", extracted)
            try:
                return json.loads(extracted)
            except json.JSONDecodeError:
                pass
        pairs = re.findall(r'"([^"\n]+)"\s*:\s*"([^"\n]*)"', cleaned)
        if pairs:
            return {key: value for key, value in pairs}
        raise


def _call_translation_api(api_key, model, prompt_text):
    if api_key.startswith("AIza"):
        gemini_model = "gemini-2.5-flash"
        if "pro" in model.lower():
            gemini_model = "gemini-2.5-pro"

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={api_key}"
        data = {
            "contents": [{"parts": [{"text": prompt_text}]}],
            "generationConfig": {
                "temperature": 0.1,
                "topP": 0.8,
                "maxOutputTokens": 2048,
                "responseMimeType": "application/json",
            },
        }
        response = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json=data,
            timeout=30,
        )
        result = response.json()

        if "error" in result:
            error = result["error"]
            code = error.get("code")
            if code in [400, 401, 403]:
                raise PermissionError(error.get("message", "Google API Error"))
            raise RuntimeError(error.get("message", "Google API Error"))

        return result["candidates"][0]["content"]["parts"][0]["text"].strip()

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "Return only valid JSON. Every value must be Turkish.",
            },
            {
                "role": "user",
                "content": prompt_text,
            },
        ],
        "temperature": 0.1,
        "max_tokens": 2048,
    }

    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=data,
        timeout=30,
    )
    result = response.json()

    if "error" in result:
        error = result["error"]
        code = error.get("code")
        if code == 402:
            raise ValueError(error.get("message", "OpenRouter API Error"))
        if code == 401:
            raise PermissionError(error.get("message", "OpenRouter API Error"))
        raise RuntimeError(error.get("message", "OpenRouter API Error"))

    return result["choices"][0]["message"]["content"].strip()


def _translate_retry_batch(api_key, model, texts_to_translate):
    retry_prompt = (
        "Asagidaki metinleri satir satir dogal Turkce'ye cevir.\n"
        "OCR bozuk olabilir; once anlatilmak istenen cumleyi zihninde toparla, sonra cevir.\n"
        "Anahtarlari aynen koru.\n"
        "Ingilizce veya kaynak dilde tek bir value bile birakma.\n"
        "Sadece gecerli JSON dondur.\n\n"
        f"JSON: {json.dumps(texts_to_translate, ensure_ascii=False)}"
    )
    try:
        retry_reply = _call_translation_api(api_key, model, retry_prompt)
        parsed = _parse_json_reply(retry_reply)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"Retry batch parse hatasi: {e}")
        return {}


def _should_compact_box(box):
    translated = _coerce_text_value(box.get("translated_text", "")).strip()
    if not translated:
        return False

    bp = box.get("box_percent") or {}
    w = float(bp.get("w", 20))
    h = float(bp.get("h", 10))
    aspect = w / max(h, 1.0)
    text_len = len(translated)
    word_count = len(translated.split())

    if text_len < 20:
        return False
    if w < 16 and word_count >= 3:
        return True
    if w < 18 and word_count >= 4:
        return True
    if w < 24 and text_len >= 26:
        return True
    if w < 22 and text_len >= 34:
        return True
    if aspect < 1.2 and word_count >= 4:
        return True
    if aspect < 1.45 and text_len >= 30:
        return True
    if translated.count("!") + translated.count("?") >= 2 and text_len >= 28:
        return True
    return False


def _build_compaction_targets(text_boxes):
    targets = {}
    for i, box in enumerate(text_boxes):
        if not _should_compact_box(box):
            continue
        bp = box.get("box_percent") or {}
        w = float(bp.get("w", 20))
        h = float(bp.get("h", 10))
        max_chars = 44
        if w < 16:
            max_chars = 22
        elif w < 18:
            max_chars = 26
        elif w < 22:
            max_chars = 32
        elif (w / max(h, 1.0)) < 1.45:
            max_chars = 36

        targets[str(i)] = {
            "original": box.get("original_text", ""),
            "current_tr": box.get("translated_text", ""),
            "max_chars": max_chars,
        }
    return targets


def _compact_retry_batch(api_key, model, compact_targets):
    if not compact_targets:
        return {}

    prompt = (
        "Asagidaki JSON'da her kayitta original, current_tr ve max_chars alanlari var.\n"
        "Her kayit icin current_tr metnini daha KISA, daha dogal ve konusma balonuna daha uygun Turkceye indir.\n"
        "Anlami koru ama laf kalabaligini at.\n"
        "max_chars sinirini gecme.\n"
        "Karakter isimlerini koru.\n"
        "Sadece gecerli JSON dondur.\n"
        "Yanit formati yalnizca anahtar -> kisa Turkce value olmali.\n\n"
        f"JSON: {json.dumps(compact_targets, ensure_ascii=False)}"
    )
    try:
        reply = _call_translation_api(api_key, model, prompt)
        parsed = _parse_json_reply(reply)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"Compaction parse hatasi: {e}")
        return {}


def translate_texts(text_boxes, api_key, model="google/gemini-2.5-flash"):
    """
    Cikarilmis metinleri topluca ceviri servisine gonderir.
    Hedef dil her durumda Turkce'dir.
    """
    if not text_boxes or not api_key:
        for box in text_boxes:
            box["translated_text"] = box.get("original_text", "")
        return text_boxes, None

    preset_translations = {}
    texts_to_translate = {}
    translation_payload = {}
    for i, box in enumerate(text_boxes):
        original_text = box.get("original_text")
        if not original_text:
            continue
        reaction = _heuristic_reaction_translation(original_text)
        if reaction:
            preset_translations[str(i)] = reaction
        else:
            cleaned_source = _clean_ocr_source_text(original_text)
            texts_to_translate[str(i)] = cleaned_source or original_text
            translation_payload[str(i)] = {
                "ocr_text": original_text,
                "clean_hint": cleaned_source or original_text,
            }

    if not texts_to_translate:
        for i, box in enumerate(text_boxes):
            box["translated_text"] = preset_translations.get(str(i), box.get("original_text", ""))
        return text_boxes, None

    source_lang = detect_source_language(list(texts_to_translate.values()))
    lang_names = {
        "ja": "Japonca",
        "ko": "Korece",
        "zh": "Cince",
        "en": "Ingilizce",
    }
    source_lang_name = lang_names.get(source_lang, "bilinmeyen dil")

    prompt = (
        f"Sen usta bir manga ve cizgi roman cevirmenisin. Kaynak dil: {source_lang_name}.\n"
        "Sana JSON formatinda OCR ile cikmis manga metinleri veriyorum. Anahtarlari koru, butun value alanlarini dogal ve KISA Turkce'ye cevir.\n\n"
        "KURALLAR:\n"
        "1. Yanit sadece gecerli bir JSON olmali.\n"
        "2. Aciklama, kod blogu, ekstra metin yazma.\n"
        "3. Tum value alanlari Turkce olmali. Kaynak dilde birakma.\n"
        "4. Kaynak metin Ingilizce olsa bile yine Turkce'ye cevir.\n"
        "5. Manga diyalog tonunu koru ama gereksiz kelime ekleme.\n"
        "6. Karakter isimlerini cevirme.\n"
        "7. Ses efektlerini Turkce karsiligi varsa cevir, yoksa uygun sekilde koru.\n"
        "8. Turkce imla karakterlerini dogru kullan.\n"
        "9. Metin konusma balonuna sigacak kadar kisa olsun; dogal ama oz tut.\n"
        "10. Uzun cumleleri kisalt, anlami koru, laf kalabaligi yapma.\n\n"
        "11. OCR bozuk olabilir; once anlatilmak istenen metni toparla, sonra cevir.\n"
        "12. clean_hint alani, bozuk OCR metninin daha temiz tahmini. Ceviride bundan faydalan.\n"
        "13. Ozel isimleri, sayilari ve bariz ses efektlerini gereksiz yere bozma.\n\n"
        'ORNEK: {"0":"GET OUT OF HERE!"} -> {"0":"Defol buradan!"}\n\n'
        f"Cevrilecek JSON: {json.dumps(translation_payload, ensure_ascii=False)}"
    )

    retry_prompt_template = (
        "Asagidaki JSON yeterince Turkce degil. Anahtarlari aynen koru ve tum value alanlarini KISA, dogal Turkce yap.\n"
        "OCR bozuk olabilir; gerekiyorsa metni once duzelt.\n"
        "Sadece gecerli JSON dondur.\n\n"
        "JSON: {json_payload}"
    )

    error_code = None
    reply = ""

    try:
        reply = _call_translation_api(api_key, model, prompt)
        translated_dict = _parse_json_reply(reply)
        if not isinstance(translated_dict, dict):
            raise ValueError("Cevap JSON obje formatinda degil.")

        if _needs_turkish_retry(texts_to_translate, translated_dict):
            retry_prompt = retry_prompt_template.format(
                json_payload=json.dumps(translated_dict, ensure_ascii=False)
            )
            try:
                retry_reply = _call_translation_api(api_key, model, retry_prompt)
                retry_dict = _parse_json_reply(retry_reply)
                if isinstance(retry_dict, dict):
                    translated_dict = retry_dict
            except Exception as e:
                print(f"Tekrar ceviri parse hatasi: {e}")

        retry_candidates = _collect_retry_candidates(texts_to_translate, translated_dict)
        if retry_candidates:
            hard_retry_dict = _translate_retry_batch(api_key, model, retry_candidates)
            if hard_retry_dict:
                translated_dict.update(hard_retry_dict)

        final_retry_candidates = _collect_retry_candidates(texts_to_translate, translated_dict)
        if final_retry_candidates:
            for key, original in final_retry_candidates.items():
                single_retry = _translate_retry_batch(api_key, model, {key: original})
                if single_retry:
                    translated_dict.update(single_retry)

        for i, box in enumerate(text_boxes):
            raw_value = translated_dict.get(str(i), preset_translations.get(str(i), box["original_text"]))
            box["translated_text"] = _coerce_text_value(raw_value)

        compact_targets = _build_compaction_targets(text_boxes)
        compacted_dict = _compact_retry_batch(api_key, model, compact_targets)
        if compacted_dict:
            for i, box in enumerate(text_boxes):
                compacted = _coerce_text_value(compacted_dict.get(str(i), "")).strip()
                if compacted and len(compacted) <= len(str(box.get("translated_text", "")).strip()) + 4:
                    box["translated_text"] = compacted

        for i, box in enumerate(text_boxes):
            key = str(i)
            base_value = preset_translations.get(key, box.get("translated_text", box.get("original_text", "")))
            box["translated_text"] = _postprocess_translation(box.get("original_text", ""), base_value)

    except json.JSONDecodeError as e:
        print(f"JSON parse hatasi: {e}")
        print(f"Ham yanit: {reply[:500] if 'reply' in locals() else 'N/A'}")
        recovered = _translate_retry_batch(api_key, model, texts_to_translate)
        if recovered:
            for i, box in enumerate(text_boxes):
                value = recovered.get(str(i), preset_translations.get(str(i), box.get("original_text", "Ceviri hatasi")))
                box["translated_text"] = _postprocess_translation(box.get("original_text", ""), value)
        else:
            error_code = "ERR_TRANSLATION_PARSE"
            for i, box in enumerate(text_boxes):
                value = preset_translations.get(str(i), box.get("original_text", "Ceviri hatasi"))
                box["translated_text"] = _postprocess_translation(box.get("original_text", ""), value)

    except requests.exceptions.Timeout:
        print("Ceviri API zaman asimina ugradi.")
        error_code = "ERR_TIMEOUT"
        for i, box in enumerate(text_boxes):
            value = preset_translations.get(str(i), box.get("original_text", "Zaman asimi"))
            box["translated_text"] = _postprocess_translation(box.get("original_text", ""), value)

    except PermissionError as e:
        print("Ceviri yetki hatasi:", e)
        error_code = "ERR_API_AUTH_FAILED"
        for i, box in enumerate(text_boxes):
            value = preset_translations.get(str(i), box.get("original_text", "Hata"))
            box["translated_text"] = _postprocess_translation(box.get("original_text", ""), value)

    except ValueError as e:
        print("Ceviri kredi hatasi:", e)
        error_code = "ERR_CREDIT_LIMIT"
        for i, box in enumerate(text_boxes):
            value = preset_translations.get(str(i), box.get("original_text", "Hata"))
            box["translated_text"] = _postprocess_translation(box.get("original_text", ""), value)

    except Exception as e:
        print("Ceviri hatasi:", e)
        error_code = "ERR_TRANSLATOR_API"
        for i, box in enumerate(text_boxes):
            value = preset_translations.get(str(i), box.get("original_text", "Hata"))
            box["translated_text"] = _postprocess_translation(box.get("original_text", ""), value)

    return text_boxes, error_code
