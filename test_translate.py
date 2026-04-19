import sys, os
sys.path.insert(0, 'backend')
from dotenv import load_dotenv
load_dotenv('.env.local')
from translator import translate_texts

boxes = [
    {"original_text": "VAI DESISTIR"},
    {"original_text": "LEVANTE-SE SHIROKIBA"},
    {"original_text": "POR QUE VOCE NAO VOLTA PARA SUA ILHAZINHA?"}
]

key = os.getenv("GEMINI_API_KEY")
print(f"Key: {key[:10]}...")

results, err = translate_texts(boxes, key)
print(f"Error code: {err}")
for b in results:
    print(f"  [{b['original_text']}] => [{b['translated_text']}]")
