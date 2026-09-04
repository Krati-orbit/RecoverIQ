import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

# Razorpay Client Initialization
try:
    import razorpay
    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "rzp_test_dummy_key")
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "rzp_test_dummy_secret")
    rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
except ImportError:
    rzp_client = None
    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "rzp_test_dummy_key")
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "rzp_test_dummy_secret")

# Google GenAI / Gemini Client Initialization
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

gemini_client = None
genai_legacy = None

if GEMINI_API_KEY and GEMINI_API_KEY != "dummy_gemini_key":
    try:
        from google import genai
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    except (ImportError, Exception):
        try:
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=GEMINI_API_KEY)
        except (ImportError, Exception):
            pass


def deterministic_fallback(
    failure_code: str,
    failure_desc: str,
    customer_name: str,
    amount: float,
) -> Dict[str, Any]:
    """Deterministic fallback strategy when LLM is offline, times out, or fails."""
    combined_text = f"{failure_code or ''} {failure_desc or ''}".lower()
    transient_keywords = ["timeout", "gateway", "down", "network", "server_error", "bank_unavailable"]

    if any(keyword in combined_text for keyword in transient_keywords):
        return {
            "category": "BANK_DOWNTIME",
            "action": "SILENT_RETRY",
            "copy": "",
            "explanation": "Circuit Breaker: Transient bank downtime detected. Silent backoff scheduled.",
            "is_llm": False,
        }

    formatted_amount = f"{amount:,.2f}" if isinstance(amount, (int, float)) else str(amount)
    return {
        "category": "INSUFFICIENT_FUNDS",
        "action": "WHATSAPP_NUDGE",
        "copy": (
            f"Hey {customer_name}! Aapka ₹{formatted_amount} ka payment complete nahi ho paya. "
            f"1-click me turant retry karein: [LINK]"
        ),
        "explanation": "Circuit Breaker: Direct 1-click recovery dispatched.",
        "is_llm": False,
    }


def _invoke_gemini_llm(
    failure_code: str,
    failure_desc: str,
    customer_name: str,
    amount: float,
) -> Dict[str, Any]:
    """Invoke Gemini model (gemini-2.5-flash) to classify the failure and generate recovery copy."""
    system_prompt = (
        "You are RecoverIQ, an autonomous payment recovery intelligence engine for Razorpay merchants.\n"
        "Analyze the payment failure metadata and output a valid JSON object with the exact keys:\n"
        '- "category": must be one of ["BANK_DOWNTIME", "INSUFFICIENT_FUNDS", "USER_ABANDONMENT", "CARD_BLOCKED"]\n'
        '- "action": must be one of ["SILENT_RETRY", "WHATSAPP_NUDGE", "EMAIL_NUDGE"]\n'
        '- "copy": contextual Hinglish customer communication message containing the exact placeholder "[LINK]". '
        'For SILENT_RETRY action, copy should be empty string "".\n'
        '- "explanation": exactly 1 concise sentence explaining the diagnostic reasoning for audit logs.\n\n'
        "Guidelines:\n"
        "- BANK_DOWNTIME -> action: SILENT_RETRY, copy: \"\"\n"
        "- INSUFFICIENT_FUNDS / USER_ABANDONMENT -> action: WHATSAPP_NUDGE, friendly Hinglish copy with [LINK]\n"
        "- CARD_BLOCKED -> action: EMAIL_NUDGE, polite Hinglish copy suggesting alternative payment method with [LINK]\n"
        "Respond ONLY with valid JSON."
    )

    user_prompt = (
        f"Customer Name: {customer_name}\n"
        f"Amount: INR {amount}\n"
        f"Failure Code: {failure_code}\n"
        f"Failure Description: {failure_desc}\n"
    )

    response_text = ""

    # Strategy 1: Modern google-genai SDK
    if gemini_client:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"{system_prompt}\n\n{user_prompt}",
            config={
                "response_mime_type": "application/json",
            }
        )
        response_text = response.text

    # Strategy 2: Legacy google.generativeai SDK
    elif genai_legacy:
        model = genai_legacy.GenerativeModel(
            model_name="gemini-2.5-flash",
            generation_config={"response_mime_type": "application/json"}
        )
        response = model.generate_content(f"{system_prompt}\n\n{user_prompt}")
        response_text = response.text
    else:
        raise RuntimeError("No configured Gemini Client or API key found.")

    if not response_text:
        raise ValueError("Empty response from Gemini LLM.")

    # Clean markdown fences if any
    cleaned_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", response_text.strip(), flags=re.MULTILINE)
    parsed = json.loads(cleaned_json)

    # Validate required keys
    required_keys = ["category", "action", "copy", "explanation"]
    if not all(k in parsed for k in required_keys):
        raise ValueError(f"Missing required keys in LLM output: {parsed}")

    parsed["is_llm"] = True
    return parsed


def classify_and_plan(
    failure_code: str,
    failure_desc: str,
    customer_name: str,
    amount: float,
    timeout_seconds: float = 1.5,
) -> Dict[str, Any]:
    """Hybrid Diagnostic & Planning engine with Circuit Breaker (1.5s timeout)."""
    if not GEMINI_API_KEY or GEMINI_API_KEY == "dummy_gemini_key":
        return deterministic_fallback(failure_code, failure_desc, customer_name, amount)

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                _invoke_gemini_llm,
                failure_code,
                failure_desc,
                customer_name,
                amount,
            )
            result = future.result(timeout=timeout_seconds)
            return result
    except (FuturesTimeoutError, Exception):
        # Circuit Breaker triggered on timeout, API error, or parsing failure
        return deterministic_fallback(failure_code, failure_desc, customer_name, amount)


def ask_gemini_chatbot(query: str, history: list = None) -> str:
    """Chatbot function to answer questions about RecoverIQ."""
    if not GEMINI_API_KEY or GEMINI_API_KEY == "dummy_gemini_key":
        return "Sorry, the AI chatbot is currently offline. Please provide a valid Gemini API Key in your environment to enable me!"
    
    system_prompt = (
        "You are RecoverIQ Assistant, a helpful AI chatbot built directly into the RecoverIQ platform. "
        "Your job is to help users (merchants) understand how the system works. "
        "Keep your answers concise, friendly, and focused on the payment recovery features of RecoverIQ. "
        "Do not use markdown headers unless necessary, keep it conversational."
    )
    
    # Format history if any
    context = ""
    if history:
        for msg in history[-4:]: # keep last 4 msgs for context
            role = "User" if msg.get("role") == "user" else "Assistant"
            context += f"{role}: {msg.get('content')}\n"
    
    prompt = f"{system_prompt}\n\nRecent Chat History:\n{context}\nUser: {query}\nAssistant:"

    try:
        if gemini_client:
            response = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            return response.text
        elif genai_legacy:
            model = genai_legacy.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text
        else:
            return "AI Client not configured."
    except Exception as e:
        return f"I encountered an error while thinking: {str(e)}"
def generate_razorpay_payment_link(
    order_id: str,
    customer_name: str,
    email: str,
    contact: str,
    amount: float,
) -> str:
    """Generate a Razorpay Payment Link or fallback to a mock test link on credentials failure."""
    fallback_mock_link = f"https://rzp.io/i/test_{order_id[:8]}"

    if not rzp_client:
        return fallback_mock_link

    try:
        # Amount in paise for Razorpay API (e.g. ₹500.00 -> 50000)
        amount_in_paise = int(round(float(amount) * 100))

        # Basic phone sanitization
        clean_contact = re.sub(r"[^\d+]", "", contact or "")
        if clean_contact and not clean_contact.startswith("+"):
            # Assume 10-digit Indian number if 10 digits
            if len(clean_contact) == 10:
                clean_contact = f"+91{clean_contact}"

        payload = {
            "amount": amount_in_paise,
            "currency": "INR",
            "accept_partial": False,
            "reference_id": order_id,
            "description": f"RecoverIQ Payment Recovery for Order #{order_id}",
            "customer": {
                "name": customer_name,
                "email": email or "customer@example.com",
                "contact": clean_contact or "+919999999999",
            },
            "notify": {
                "sms": False,
                "email": False,
            },
            "reminder_enable": False,
        }

        payment_link = rzp_client.payment_link.create(payload)
        return payment_link.get("short_url") or payment_link.get("url") or fallback_mock_link
    except Exception:
        # Fallback to mock link on API / Auth failure
        return fallback_mock_link


if __name__ == "__main__":
    test_result = classify_and_plan("GATEWAY_TIMEOUT", "Bank network gateway timed out", "Rahul Sharma", 1499.0)
    print("Classify & Plan Test Output:", json.dumps(test_result, indent=2))
    
    mock_link = generate_razorpay_payment_link("order_test_987654321", "Rahul Sharma", "rahul@example.com", "+919876543210", 1499.0)
    print("Generated Payment Link:", mock_link)
