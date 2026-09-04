# 🧠 RecoverIQ — How It Actually Works (End-to-End)

## The Big Picture (1 Sentence)

> RecoverIQ **simulates** Razorpay webhook events (payment failures), runs them through a real AI-powered recovery engine, and then **simulates** the customer paying back — all within your local system.

---

## 🔑 Key Concept: Nothing Is Pre-Saved

The data you see on the dashboard is **NOT hardcoded or pre-saved**. Here's where everything comes from:

| What you see | Where it comes from |
|---|---|
| Customer names (Aarav, Priya, etc.) | Randomly picked from a pool of 10 fake names in `simulate_batch.py` |
| Failure codes & reasons | Randomly selected from 7 realistic Razorpay error scenarios |
| Amounts (₹499–₹4999) | Randomly picked from a predefined list |
| AI diagnosis & recovery copy | **Generated in real-time** by Gemini 2.5 Flash (or deterministic fallback) in `engine.py` |
| Payment links | Created via **real Razorpay Test Mode API** (or mock fallback) |
| Dashboard metrics | Calculated **live** from the SQLite database via `/api/stats` |

---

## 🔄 The Complete Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RecoverIQ Recovery Lifecycle                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │  STEP 1       │    │  STEP 2       │    │  STEP 3                  │  │
│  │  Webhook      │───▶│  Idempotency  │───▶│  Hybrid AI Diagnosis     │  │
│  │  Ingestion    │    │  + Anti-Spam  │    │  (Gemini 2.5 Flash +     │  │
│  │               │    │  Guardrail    │    │   1.5s Circuit Breaker)  │  │
│  └──────────────┘    └──────────────┘    └──────────┬───────────────┘  │
│                                                      │                  │
│                                           ┌──────────▼───────────────┐  │
│                                           │  STEP 4                  │  │
│                                           │  Autonomous Action       │  │
│                                           │  ┌────────────────────┐  │  │
│                                           │  │ Bank Down?         │  │  │
│                                           │  │ → SILENT_RETRY     │  │  │
│                                           │  ├────────────────────┤  │  │
│                                           │  │ Low Balance/OTP?   │  │  │
│                                           │  │ → WHATSAPP_NUDGE   │  │  │
│                                           │  │   + Payment Link   │  │  │
│                                           │  ├────────────────────┤  │  │
│                                           │  │ Card Blocked?      │  │  │
│                                           │  │ → EMAIL_NUDGE      │  │  │
│                                           │  │   + Payment Link   │  │  │
│                                           │  └────────────────────┘  │  │
│                                           └──────────┬───────────────┘  │
│                                                      │                  │
│                                           ┌──────────▼───────────────┐  │
│                                           │  STEP 5                  │  │
│                                           │  Loop Closure            │  │
│                                           │  Customer pays via link  │  │
│                                           │  → payment.captured      │  │
│                                           │  → State = RECOVERED ✅  │  │
│                                           └──────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Frequently Asked Questions

### Q1: "I enter anything in the Playground and it answers — how?"

When you type "Ankit Verma" with ₹1499 and select "Insufficient Funds" in the **Interactive Playground**:

1. The frontend builds a **fake Razorpay webhook JSON payload** (exactly like what Razorpay would send in production).
2. It sends this JSON to your **local backend** via `POST http://127.0.0.1:8000/webhook/razorpay`.
3. The backend processes it through the **exact same code path** that handles real Razorpay webhooks.
4. The AI engine (Gemini 2.5 Flash or deterministic fallback) **analyzes the failure in real-time** and generates a recovery plan.
5. The result is stored in SQLite and displayed back on the dashboard.

> **It's NOT pre-saved data.** It's generated fresh every time by the real engine.

---

### Q2: "When a payment fails, we resolve it — but HOW does it become RECOVERED?"

There are **3 paths** to RECOVERED:

#### Path A: Batch Simulation (Automatic — for demo)
The `simulate_batch.py` script:
1. First sends a `payment.failed` webhook (the failure happens).
2. Then, for nudgeable scenarios (insufficient funds / user drop-off), it **randomly decides** with a **65% probability** whether the customer "paid back".
3. If yes → it sends a **second** webhook: `payment.captured` → the backend marks it as **RECOVERED**.

```python
# From simulate_batch.py
converted = is_nudge_scenario and (random.random() < 0.65)  # 65% chance of recovery
```

#### Path B: Interactive Checkout & Playground (Manual — for demo)
When you click **"Pay Link"** in the transaction ledger, **"⚡ 1-Click Pay Now"** in the inspection drawer, or **"⚡ 1-Click Test Checkout"** in the Playground:
1. The in-app **Razorpay 1-Click Recovery Checkout Modal** opens.
2. You can choose a payment method (**UPI Apps/QR**, **Cards**, or **NetBanking**).
3. Clicking **"Pay & Recover Order"** fires a `payment.captured` webhook to `/webhook/razorpay` → backend updates SQLite and marks the transaction as **`RECOVERED`** ✅, updating KPIs in real-time.

#### Path C: Real Production (Razorpay closes the loop)
In a real deployment:
1. Customer receives the **1-click payment link** we generated (via WhatsApp/Email).
2. Customer opens the link and **completes the payment** on Razorpay's checkout page.
3. Razorpay **automatically fires** a `payment.captured` webhook to our `/webhook/razorpay` endpoint.
4. Our backend receives it and marks the transaction as **RECOVERED** — the loop closes itself.

---

### Q3: "Can I reset all demo data back to a clean zero state?"

Yes! Click the **"Reset Data"** button in the top navigation bar. It calls `POST /api/reset` to clear all `transaction_records`, `idempotency_keys`, and `audit_logs` from the SQLite database. All metrics return to zero (`₹0` Revenue at Risk, `0.0%` Recovery Rate) until you run a new batch test or inject a failure.

---

### Q4: "The data with Ankit Verma fails — what happens next in real life?"

| Scenario | What would happen in production |
|---|---|
| Bank downtime (SILENT_RETRY) | A scheduled job would re-attempt the payment after 15-30 minutes automatically |
| WhatsApp nudge sent | Customer receives a 1-click payment link on WhatsApp. If they pay → Razorpay fires `payment.captured` → auto-RECOVERED |
| Email nudge sent | Same as WhatsApp, but via email with alternate payment method suggestion |
| Customer ignores nudge | System would re-nudge (up to **3 times max**). After 3 failed attempts → **TERMINATED** (anti-spam guardrail) |
| Customer pays via link | Razorpay fires a **real** `payment.captured` webhook → our system marks it RECOVERED instantly |

---

## 🏗️ What's Real vs What's Simulated

| Component | Status | Details |
|---|---|---|
| Backend API (FastAPI) | ✅ **Real** | Production-grade code, same for demo and production |
| Webhook processing logic | ✅ **Real** | Same code handles real & simulated webhooks |
| AI classification (Gemini 2.5 Flash) | ✅ **Real** | Actual LLM API call with 1.5s circuit breaker timeout |
| Razorpay Payment Links | ✅ **Real** | Uses Razorpay **Test Mode API** (`rzp_test_xxx` keys) |
| SQLite database & state machine | ✅ **Real** | Persistent storage with full audit trail |
| Idempotency & anti-spam guards | ✅ **Real** | Production-ready deduplication & 3x retry limit |
| Deterministic fallback engine | ✅ **Real** | Works even without internet/API keys |
| Customer data (names, emails) | 🎲 **Simulated** | Fake data pool for demo purposes |
| The payment failure event | 🎲 **Simulated** | We generate the webhook; in production, Razorpay sends it |
| Customer "paying back" | 🎲 **Simulated** | 65% random probability in batch mode |
| WhatsApp/Email delivery | 🎲 **Simulated** | Recovery copy is generated but not actually sent |

---

## 💡 How to Explain to Judges

> "RecoverIQ is a **production-ready autonomous recovery engine** built on top of Razorpay's webhook infrastructure.
>
> In our demo, we simulate payment failures by generating realistic Razorpay webhook payloads. Our backend processes them through the **same code path** that would handle real Razorpay webhooks in production — there is zero difference in the processing logic.
>
> The AI engine (Gemini 2.5 Flash with a 1.5-second circuit breaker fallback) diagnoses the root cause in real-time and decides the optimal recovery action — whether to silently retry, send a WhatsApp nudge, or email an alternate payment suggestion. Payment links are generated via **Razorpay's real Test Mode API**.
>
> In production, when a customer clicks the recovery link and completes the payment, Razorpay fires a `payment.captured` webhook back to our system, and the recovery loop closes automatically — zero human intervention required. In our demo, we simulate this with a 65% conversion probability to show realistic recovery metrics.
>
> The only things simulated are the **trigger** (the initial failure webhook) and the **customer's response** (paying back). Everything in between — AI diagnosis, payment link generation, state management, idempotency, anti-spam guardrails — is **100% production-grade code**."

---

## 🔧 Technical Architecture Summary

```
Frontend (React + Vite)          Backend (FastAPI + Uvicorn)
┌─────────────────────┐          ┌─────────────────────────────┐
│  localhost:3000      │          │  localhost:8000              │
│                      │          │                              │
│  Dashboard           │◄────────│  GET /api/stats              │
│  (polls every 3s)    │         │  (metrics + transactions     │
│                      │         │   + audit logs from SQLite)  │
│  Playground          │────────▶│  POST /webhook/razorpay      │
│  (sends fake webhook)│         │  (processes payment events)  │
│                      │         │                              │
│  Batch Simulation    │────────▶│  POST /api/simulate-batch    │
│  Button              │         │  (triggers simulate_batch.py)│
└─────────────────────┘          └──────────────┬──────────────┘
                                                │
                                   ┌────────────▼────────────┐
                                   │  engine.py               │
                                   │  ┌────────────────────┐  │
                                   │  │ Gemini 2.5 Flash   │  │
                                   │  │ (AI Classification)│  │
                                   │  └────────┬───────────┘  │
                                   │           │ 1.5s timeout? │
                                   │  ┌────────▼───────────┐  │
                                   │  │ Deterministic       │  │
                                   │  │ Fallback (Circuit   │  │
                                   │  │ Breaker)            │  │
                                   │  └────────────────────┘  │
                                   │                          │
                                   │  Razorpay Test Mode API  │
                                   │  (Payment Link Creation) │
                                   └──────────────────────────┘
                                                │
                                   ┌────────────▼────────────┐
                                   │  SQLite Database         │
                                   │  recovery_engine.db      │
                                   │  ┌────────────────────┐  │
                                   │  │ transaction_records │  │
                                   │  │ idempotency_keys   │  │
                                   │  │ audit_logs         │  │
                                   │  └────────────────────┘  │
                                   └──────────────────────────┘
```

---

## 📌 State Machine Transitions

```
PENDING ──▶ SILENT_RETRY ──────────────────▶ (re-attempt later)
   │
   ├──────▶ NUDGED_WHATSAPP ──▶ RECOVERED ✅  (customer paid via link)
   │                          └▶ TERMINATED ❌ (3x retries exceeded)
   │
   └──────▶ NUDGED_EMAIL ─────▶ RECOVERED ✅  (customer paid via link)
                              └▶ TERMINATED ❌ (3x retries exceeded)
```

Each transition is logged in the `audit_logs` table with:
- From state → To state
- Action taken
- AI reasoning (or circuit breaker reasoning)
- Whether the decision was made by LLM or deterministic fallback
- Timestamp
