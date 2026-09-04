import io
import json
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, List, Tuple

# Fix Windows console encoding — cp1252 cannot handle emoji characters
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer, encoding="utf-8", errors="replace"
    )
    sys.stderr = io.TextIOWrapper(
        sys.stderr.buffer, encoding="utf-8", errors="replace"
    )

TARGET_URL = "http://127.0.0.1:8000/webhook/razorpay"

# Error Scenario Pool with Distribution Weights
# 30% Bank/Gateway Timeouts, 50% Insufficient Funds / Drop-offs, 20% Hard Declines
SCENARIOS: List[Tuple[str, str, str, float]] = [
    # (Category, Error Code, Error Description, Weight)
    ("BANK_DOWNTIME", "GATEWAY_TIMEOUT_HDFC", "NPCI UPI switch response timeout from HDFC Bank", 0.15),
    ("BANK_DOWNTIME", "BAD_REQUEST_GATEWAY_DOWN", "State Bank of India core banking gateway is temporarily down", 0.15),
    ("INSUFFICIENT_FUNDS", "BAD_REQUEST_INSUFFICIENT_FUNDS", "Insufficient balance in customer bank account", 0.20),
    ("USER_ABANDONMENT", "USER_DROPPED_OTP", "Customer abandoned transaction during OTP verification step", 0.15),
    ("INSUFFICIENT_FUNDS", "UPI_INSUFFICIENT_FUNDS", "Payment failed due to low balance in primary UPI VPA", 0.15),
    ("CARD_BLOCKED", "CARD_INACTIVE_OR_EXPIRED", "Card validity expired or card is currently inactive", 0.10),
    ("CARD_BLOCKED", "CARD_BLOCKED_BY_ISSUER", "Debit/Credit card is blocked by issuing bank due to security risk", 0.10),
]

NAMES_AND_CONTACTS = [
    ("Aarav Patel", "aarav.patel@gmail.com", "+919820123456"),
    ("Priya Sharma", "priya.sharma@yahoo.co.in", "+919876543210"),
    ("Rohan Gupta", "rohan.gupta@outlook.com", "+919811223344"),
    ("Sneha Nair", "sneha.nair@hotmail.com", "+919944556677"),
    ("Vikram Singh", "vikram.singh@gmail.com", "+919711889900"),
    ("Ananya Iyer", "ananya.iyer@gmail.com", "+919840112233"),
    ("Rajesh Verma", "rajesh.verma@rediffmail.com", "+919829988776"),
    ("Pooja Kulkarni", "pooja.k@gmail.com", "+919822334455"),
    ("Aditya Mehta", "aditya.mehta@gmail.com", "+919899001122"),
    ("Divya Rao", "divya.rao@yahoo.com", "+919845667788"),
]

AMOUNTS = [499.0, 799.0, 999.0, 1299.0, 1499.0, 1999.0, 2499.0, 2999.0, 3499.0, 4999.0]


def send_webhook(payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """Send JSON payload to webhook endpoint using standard library urllib."""
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        TARGET_URL,
        data=data_bytes,
        headers={"Content-Type": "application/json", "User-Agent": "RecoverIQ-Simulator/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            status_code = response.status
            body = response.read().decode("utf-8")
            return status_code, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return e.code, {"error": body}
    except Exception as e:
        return 500, {"error": str(e)}


def choose_scenario() -> Tuple[str, str, str]:
    """Select a scenario based on defined probability distribution weights."""
    weights = [s[3] for s in SCENARIOS]
    selected = random.choices(SCENARIOS, weights=weights, k=1)[0]
    return selected[0], selected[1], selected[2]


def run_simulation(total_transactions: int = 50):
    print("=" * 78)
    print(f"🚀 RecoverIQ Autonomous Recovery Benchmark & Stress Test ({total_transactions} Transactions)")
    print(f"📡 Target Endpoint: {TARGET_URL}")
    print("=" * 78)

    failures_injected = 0
    recoveries_triggered = 0
    total_amount_failed = 0.0
    total_amount_recovered = 0.0
    category_counts: Dict[str, int] = {}
    action_counts: Dict[str, int] = {}

    start_time = time.time()

    for i in range(1, total_transactions + 1):
        rand_id = uuid.uuid4().hex[:6]
        order_id = f"rzp_ord_{rand_id}_{i:02d}"
        fail_event_id = f"evt_fail_order_{rand_id}_{i:02d}"

        name, email, contact = random.choice(NAMES_AND_CONTACTS)
        amount = random.choice(AMOUNTS)
        total_amount_failed += amount

        category, error_code, error_desc = choose_scenario()
        category_counts[category] = category_counts.get(category, 0) + 1

        # Build realistic Razorpay payment.failed payload
        failed_payload = {
            "entity": "event",
            "account_id": "acc_recoveryiq_demo",
            "event": "payment.failed",
            "event_id": fail_event_id,
            "contains": ["payment"],
            "payload": {
                "payment": {
                    "entity": {
                        "id": f"pay_fail_{uuid.uuid4().hex[:10]}",
                        "order_id": order_id,
                        "amount": int(round(amount * 100)),
                        "currency": "INR",
                        "status": "failed",
                        "error_code": error_code,
                        "error_description": error_desc,
                        "email": email,
                        "contact": contact,
                        "notes": {
                            "customer_name": name,
                        },
                    }
                }
            },
            "created_at": int(time.time()),
        }

        # Step 1: Inject Payment Failure
        status_code, resp = send_webhook(failed_payload)
        failures_injected += 1

        action = resp.get("action", "UNKNOWN")
        is_llm = resp.get("is_llm", False)
        action_counts[action] = action_counts.get(action, 0) + 1

        planner_tag = "🤖 [AI Planner]" if is_llm else "⚡ [Circuit Brk]"
        print(f"[{i:02d}/{total_transactions}] Order: {order_id} | ₹{amount:,.0f} | {error_code[:22]:<22} | {planner_tag} -> {action}")

        # Step 2: Simulate Recovery Callback for Nudgeable Scenarios (65% conversion rate)
        is_nudge_scenario = category in ["INSUFFICIENT_FUNDS", "USER_ABANDONMENT"]
        converted = is_nudge_scenario and (random.random() < 0.65)

        if converted:
            time.sleep(0.05)  # 50ms realistic customer interaction latency
            succ_event_id = f"evt_succ_order_{rand_id}_{i:02d}"
            success_payload = {
                "entity": "event",
                "account_id": "acc_recoveryiq_demo",
                "event": "payment.captured",
                "event_id": succ_event_id,
                "contains": ["payment"],
                "payload": {
                    "payment": {
                        "entity": {
                            "id": f"pay_succ_{uuid.uuid4().hex[:10]}",
                            "order_id": order_id,
                            "amount": int(round(amount * 100)),
                            "currency": "INR",
                            "status": "captured",
                            "email": email,
                            "contact": contact,
                            "notes": {
                                "customer_name": name,
                            },
                        }
                    }
                },
                "created_at": int(time.time()),
            }

            succ_status, succ_resp = send_webhook(success_payload)
            if succ_status in [200, 201]:
                recoveries_triggered += 1
                total_amount_recovered += amount
                print(f"       ↳ 🟢 RECOVERED: Customer converted via 1-click payment link (₹{amount:,.0f})")

        time.sleep(0.02)

    elapsed_time = time.time() - start_time
    recovery_rate = (total_amount_recovered / total_amount_failed * 100) if total_amount_failed > 0 else 0.0

    # Print Summary ASCII Table
    print("\n" + "=" * 78)
    print("                📊 RecoverIQ Benchmark Simulation Summary")
    print("=" * 78)
    print(f" Total Injected Failures    : {failures_injected}")
    print(f" Total Recoveries Triggered : {recoveries_triggered}")
    print(f" Total At-Risk GMV          : ₹{total_amount_failed:,.2f}")
    print(f" Total Revenue Recovered    : ₹{total_amount_recovered:,.2f}")
    print(f" Revenue Recovery Rate      : {recovery_rate:.2f}%")
    print(f" Total Simulation Runtime   : {elapsed_time:.2f}s ({(failures_injected + recoveries_triggered)/elapsed_time:.1f} events/sec)")
    print("-" * 78)
    print(" Breakdown by Failure Category:")
    for cat, count in category_counts.items():
        pct = (count / failures_injected) * 100
        print(f"   • {cat:<24}: {count:>2} transactions ({pct:>4.1f}%)")
    print("-" * 78)
    print(" Breakdown by Action Dispatched:")
    for act, count in action_counts.items():
        pct = (count / failures_injected) * 100
        print(f"   • {act:<24}: {count:>2} actions ({pct:>4.1f}%)")
    print("=" * 78 + "\n")


if __name__ == "__main__":
    run_simulation(50)
