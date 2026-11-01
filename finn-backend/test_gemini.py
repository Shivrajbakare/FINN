import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("RESEARCH_LLM_API_KEY", "").strip()
model = os.getenv("RESEARCH_LLM_MODEL", "gemini-flash-lite-latest").strip()
url = os.getenv("RESEARCH_LLM_URL", "https://generativelanguage.googleapis.com/v1beta").strip()

def test_api():
    if not key or key == "your_gemini_api_key_here":
        print("Result: NOT_CONFIGURED")
        print("RESEARCH_LLM_API_KEY is missing in .env")
        return

    print("=" * 60)
    print("VERIFYING GEMINI API CONNECTION")
    print("=" * 60)
    print(f"Model: {model}")
    print(f"Key preview: {key[:8]}...{key[-4:] if len(key) > 12 else ''}")

    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    payload = {
        "contents": [{"parts": [{"text": "Reply with 'Gemini API is fully operational' and nothing else."}]}],
        "generationConfig": {
            "maxOutputTokens": 30,
            "temperature": 0.0,
        }
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(endpoint, json=payload)
            if r.status_code == 200:
                answer = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                print("\n[SUCCESS] Gemini API responded successfully!")
                print(f"Gemini output: \"{answer}\"")
                print("=" * 60)
            else:
                print(f"\n[ERROR] HTTP {r.status_code}")
                print(r.text[:400])
    except Exception as exc:
        print(f"\n[NETWORK ERROR] {exc}")

if __name__ == "__main__":
    test_api()
