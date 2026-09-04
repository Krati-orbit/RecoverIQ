# RecoverIQ — Technical Architecture Reference

This document provides a complete technical breakdown of RecoverIQ's internals: the processing pipeline, AI integration strategy, reliability guarantees, database schema, and API contracts. It is intended for engineers reviewing the codebase and for hackathon judges evaluating the depth of the system design.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Request Lifecycle](#request-lifecycle)
3. [Stage 1: Webhook Ingestion & Payload Normalization](#stage-1-webhook-ingestion--payload-normalization)
4. [Stage 2: Idempotency Gate & Anti-Spam Guardrails](#stage-2-idempotency-gate--anti-spam-guardrails)
5. [Stage 3: Hybrid AI Diagnostic Engine](#stage-3-hybrid-ai-diagnostic-engine)
6. [Stage 4: Autonomous Action Dispatch](#stage-4-autonomous-action-dispatch)
7. [Stage 5: Recovery Loop Closure](#stage-5-recovery-loop-closure)
8. [Database Schema & ERD](#database-schema--erd)
9. [State Machine Specification](#state-machine-specification)
10. [Frontend Architecture](#frontend-architecture)
11. [AI Chatbot Integration](#ai-chatbot-integration)
12. [API Contract Reference](#api-contract-reference)
13. [Reliability & Fault Tolerance](#reliability--fault-tolerance)

---

## System Overview

RecoverIQ operates as a **webhook-driven event processing system**. It does not poll Razorpay — instead, it registers as a webhook listener and reacts to payment lifecycle events as they occur.

```
                         Razorpay Payment Gateway
                                  │
                    ┌─────────────┴──────────────┐
                    │                             │
              payment.failed               payment.captured
                    │                             │
                    ▼                             ▼
         ┌──────────────────────────────────────────────────┐
         │              RecoverIQ Backend                    │
         │              (FastAPI + Uvicorn)                   │
         │                                                    │
         │  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
         │  │Idempotency│  │  Hybrid  │  │  Razorpay SDK  │  │
         │  │   Gate    │  │AI Engine │  │ (Payment Links)│  │
         │  └─────┬────┘  └────┬─────┘  └───────┬────────┘  │
         │        │            │                 │            │
         │        └────────────┼─────────────────┘            │
         │                     │                              │
         │              ┌──────▼──────┐                       │
         │              │   SQLite    │                       │
         │              │ (SQLModel)  │                       │
         │              └─────────────┘                       │
         └──────────────────────┬─────────────────────────────┘
                                │
                          REST API Layer
                          /api/stats
                          /api/chat
                                │
                    ┌───────────▼───────────┐
                    │   React Dashboard     │
                    │   (Vite + Tailwind)   │
                    │   Polls every 3s      │
                    └───────────────────────┘
```

The backend is **stateless across requests** — all state lives in SQLite. This means the server can be restarted at any time without data loss, and multiple instances could share the same database file in a production deployment.

---

## Request Lifecycle

When Razorpay fires a `payment.failed` webhook, the following sequence executes synchronously within a single HTTP request:

```
1. POST /webhook/razorpay receives JSON payload
2. _extract_event_data() normalizes Razorpay's nested payload structure
3. Idempotency check: query idempotency_keys table for event_id
   ├─ If exists → return 200 {"status": "ignored"} (duplicate rejected)
   └─ If new → insert event_id, continue
4. Anti-spam check: query transaction retry_count
   ├─ If retry_count >= 3 → transition to TERMINATED, return
   └─ If under limit → continue
5. classify_and_plan() invokes hybrid AI engine
   ├─ Gemini 2.5 Flash (within 1.5s timeout)
   └─ Deterministic fallback (if timeout or error)
6. Based on action:
   ├─ SILENT_RETRY → update state, no customer contact
   ├─ WHATSAPP_NUDGE → generate Razorpay payment link, update state
   └─ EMAIL_NUDGE → generate Razorpay payment link, update state
7. Record AuditLog entry with diagnostic reasoning
8. Return JSON response with action taken, state, and payment link
```

Total end-to-end latency: **< 2 seconds** (dominated by Gemini call; < 50ms if circuit breaker triggers).

---

## Stage 1: Webhook Ingestion & Payload Normalization

**File:** [`app.py`](app.py) → `_extract_event_data()`

Razorpay webhook payloads have a nested structure (`payload.payment.entity.*`). The normalization function handles:

- **Payload flattening:** Extracts `order_id`, `amount`, `failure_code`, `failure_desc`, customer metadata from nested entities.
- **Amount conversion:** Razorpay transmits amounts in paise (e.g., `150000` = ₹1,500.00). The normalizer detects this and converts to rupees.
- **Deterministic event IDs:** If the payload lacks an `event_id`, the function generates one via `SHA-256(event_type + order_id + created_at)` to guarantee idempotency even for malformed payloads.
- **Customer extraction:** Pulls `customer_name`, `email`, `contact` from multiple possible locations (`notes`, `customer` object, top-level fields) with fallback defaults.

---

## Stage 2: Idempotency Gate & Anti-Spam Guardrails

**File:** [`app.py`](app.py) → `razorpay_webhook()`, [`database.py`](database.py) → `IdempotencyKey`

### Idempotency

Razorpay's webhook infrastructure may deliver the same event multiple times (at-least-once delivery). Without deduplication, a single payment failure could trigger multiple nudges to the same customer.

RecoverIQ solves this with an `idempotency_keys` table:
- Before processing, the handler queries `SELECT ... WHERE event_id = ?`.
- If a matching row exists, the request is immediately rejected with `{"status": "ignored"}`.
- If new, the `event_id` is inserted *before* processing begins, creating a lock.

### Anti-Spam Guardrail

Each `TransactionRecord` tracks a `retry_count`. When the count reaches **3**, the engine:
1. Transitions the order to `TERMINATED` state.
2. Logs an audit entry with reasoning `"Anti-Spam Guardrail: Exceeded maximum recovery attempts (3)"`.
3. Returns immediately — no further nudges will ever be sent for this order.

This is a hard business rule, not configurable per-request. The rationale: sending more than 3 recovery messages to the same customer for the same order degrades merchant brand trust and risks being flagged as spam by WhatsApp Business API policies.

---

## Stage 3: Hybrid AI Diagnostic Engine

**File:** [`engine.py`](engine.py) → `classify_and_plan()`, `_invoke_gemini_llm()`, `deterministic_fallback()`

This is the core intelligence layer. It uses a **hybrid architecture**: an LLM primary path with a deterministic fallback, connected by a circuit breaker.

### Primary Path: Gemini 2.5 Flash

The LLM receives a structured prompt containing:
- Customer name, amount, failure code, and failure description.
- A system prompt constraining output to a strict JSON schema with four keys: `category`, `action`, `copy`, `explanation`.
- Category must be one of: `BANK_DOWNTIME`, `INSUFFICIENT_FUNDS`, `USER_ABANDONMENT`, `CARD_BLOCKED`.
- Action must be one of: `SILENT_RETRY`, `WHATSAPP_NUDGE`, `EMAIL_NUDGE`.
- Copy must be Hinglish (Hindi-English mix) for WhatsApp/Email, or empty string for silent retry.

The response is requested with `response_mime_type: "application/json"` to enforce structured output. After receiving the response, the engine strips any markdown fencing, parses JSON, and validates all required keys are present.

### Circuit Breaker: 1.5-Second Timeout

The Gemini call runs inside a `ThreadPoolExecutor` with a **1.5-second** `future.result(timeout=1.5)`:

```python
with ThreadPoolExecutor(max_workers=1) as executor:
    future = executor.submit(_invoke_gemini_llm, ...)
    result = future.result(timeout=1.5)  # Circuit breaker
```

If the LLM exceeds 1.5 seconds, raises an exception, or returns unparseable output, the circuit breaker catches the `FuturesTimeoutError` (or any `Exception`) and immediately routes to the deterministic fallback.

### Fallback Path: Deterministic Rules

The fallback function performs keyword matching on `failure_code` and `failure_desc`:
- **Transient keywords** (`timeout`, `gateway`, `down`, `network`, `server_error`, `bank_unavailable`) → `SILENT_RETRY`
- **Everything else** → `WHATSAPP_NUDGE` with a generic Hinglish recovery template

The fallback executes in **< 2ms** and is the absolute floor — it guarantees that RecoverIQ always produces an action, regardless of external API availability.

### Why This Design?

| Consideration | LLM-Only | Rules-Only | Hybrid (RecoverIQ) |
|:---|:---|:---|:---|
| Nuanced diagnosis | ✅ | ❌ | ✅ |
| Contextual copy generation | ✅ | ❌ | ✅ |
| Guaranteed latency | ❌ | ✅ | ✅ (1.5s cap) |
| Works offline / no API key | ❌ | ✅ | ✅ |
| Production reliability | Risky | ✅ | ✅ |

---

## Stage 4: Autonomous Action Dispatch

**File:** [`app.py`](app.py) → `razorpay_webhook()`, [`engine.py`](engine.py) → `generate_razorpay_payment_link()`

Based on the diagnostic output, the engine takes one of three actions:

### SILENT_RETRY
- State transition: `PENDING` → `SILENT_RETRY`
- No customer communication. No payment link generated.
- Used when the failure is infrastructure-related (bank downtime). The customer is not at fault, so contacting them would be confusing and counterproductive.

### WHATSAPP_NUDGE
- State transition: `PENDING` → `NUDGED_WHATSAPP`
- Generates a Razorpay Payment Link via the SDK:
  ```python
  rzp_client.payment_link.create({
      "amount": amount_in_paise,
      "currency": "INR",
      "reference_id": order_id,
      "customer": {"name": ..., "email": ..., "contact": ...},
      "notify": {"sms": False, "email": False},  # We handle delivery
  })
  ```
- The returned `short_url` is stored on the `TransactionRecord` and embedded in the recovery copy.
- If Razorpay SDK authentication fails (invalid test keys), falls back to a mock link: `https://rzp.io/i/test_{order_id}`.

### EMAIL_NUDGE
- State transition: `PENDING` → `NUDGED_EMAIL`
- Same payment link generation as WhatsApp, but the recovery copy suggests alternate payment methods (UPI, NetBanking) since the original card is blocked.

---

## Stage 5: Recovery Loop Closure

When a customer completes payment via the generated link, Razorpay fires a `payment.captured` webhook. RecoverIQ handles this event by:

1. Looking up the `TransactionRecord` by `order_id`.
2. Transitioning the state to `RECOVERED`.
3. Logging an audit entry: `"Payment successfully received. Closed all active recovery loops."`

This closes the recovery cycle with **zero human intervention** — the entire flow from failure detection to revenue recovery is fully autonomous.

---

## Database Schema & ERD

**File:** [`database.py`](database.py)

Three tables, all managed via SQLModel ORM with SQLite:

### `transaction_records`

| Column | Type | Constraints | Purpose |
|:---|:---|:---|:---|
| `id` | INTEGER | PK, autoincrement | Internal row ID |
| `order_id` | TEXT | UNIQUE, INDEXED | Razorpay order reference |
| `customer_name` | TEXT | | Customer display name |
| `email` | TEXT | | Customer email |
| `contact` | TEXT | | Customer phone (E.164) |
| `amount` | REAL | | Transaction amount in INR |
| `failure_code` | TEXT | | Razorpay error code |
| `failure_reason` | TEXT | | Human-readable failure description |
| `state` | TEXT | Enum | Current state machine position |
| `retry_count` | INTEGER | Default 0 | Number of recovery attempts |
| `payment_link_url` | TEXT | Nullable | Generated Razorpay payment link |
| `created_at` | DATETIME | | First failure timestamp |
| `updated_at` | DATETIME | | Last state change timestamp |

### `idempotency_keys`

| Column | Type | Constraints | Purpose |
|:---|:---|:---|:---|
| `id` | INTEGER | PK | Internal row ID |
| `event_id` | TEXT | UNIQUE, INDEXED | SHA-256 webhook event hash |
| `order_id` | TEXT | INDEXED | Associated order |
| `processed_at` | DATETIME | | Ingestion timestamp |

### `audit_logs`

| Column | Type | Constraints | Purpose |
|:---|:---|:---|:---|
| `id` | INTEGER | PK | Internal row ID |
| `order_id` | TEXT | INDEXED | Associated order |
| `from_state` | TEXT | | Previous state |
| `to_state` | TEXT | | New state |
| `action_taken` | TEXT | | Recovery action dispatched |
| `reasoning` | TEXT | | Diagnostic explanation (AI or rule-based) |
| `is_llm_decision` | BOOLEAN | | True if Gemini made the decision |
| `timestamp` | DATETIME | | Decision timestamp |

### Entity Relationships

```
transaction_records ──(1:N)──► audit_logs        (via order_id)
transaction_records ──(1:N)──► idempotency_keys  (via order_id)
```

---

## State Machine Specification

```
                                    ┌──────────────────────┐
                                    │       PENDING        │
                                    │  (initial failure)   │
                                    └──────┬───┬───┬───────┘
                                           │   │   │
                        ┌──────────────────┘   │   └──────────────────┐
                        ▼                      ▼                      ▼
               ┌────────────────┐   ┌──────────────────┐   ┌─────────────────┐
               │  SILENT_RETRY  │   │ NUDGED_WHATSAPP  │   │  NUDGED_EMAIL   │
               │ (bank issue —  │   │ (1-click link    │   │ (alt payment    │
               │  no contact)   │   │  sent via WA)    │   │  suggestion)    │
               └────────────────┘   └────────┬─────────┘   └────────┬────────┘
                                             │                      │
                              ┌──────────────┼──────────────────────┘
                              │              │
                              ▼              ▼
                    ┌──────────────┐  ┌──────────────┐
                    │  RECOVERED   │  │  TERMINATED  │
                    │  (customer   │  │  (3 attempts  │
                    │   paid ✅)   │  │   exceeded ❌)│
                    └──────────────┘  └──────────────┘
```

**Transition rules:**
- `PENDING` → `SILENT_RETRY`: Bank/infrastructure failure detected. No customer action.
- `PENDING` → `NUDGED_WHATSAPP`: Recoverable failure. WhatsApp nudge + payment link dispatched.
- `PENDING` → `NUDGED_EMAIL`: Card decline. Email with alternate method suggestion dispatched.
- `NUDGED_*` → `RECOVERED`: `payment.captured` webhook received. Revenue recovered.
- Any state → `TERMINATED`: `retry_count >= 3`. Anti-spam guardrail triggered.

---

## Frontend Architecture

**File:** [`src/App.jsx`](src/App.jsx)

The frontend is a single-page React 18 application with three views managed by a top-level `view` state:

1. **Landing Page** (`LandingPage` component): Marketing hero with feature highlights. Entry point for judges.
2. **Login Page** (`LoginPage` component): Pre-filled demo credentials for frictionless access.
3. **Dashboard** (`Dashboard` component): The operational heart — real-time metrics, transaction ledger, audit stream, and interactive modals.

### Dashboard Data Flow

```
Dashboard mounts
      │
      ▼
useEffect → fetchStats() every 3 seconds
      │
      ▼
GET /api/stats → { metrics, transactions, audit_logs }
      │
      ▼
State updates → React re-renders KPI cards, table, audit feed
```

### Interactive Components

| Component | Trigger | What It Does |
|:---|:---|:---|
| **5-Stage Pipeline Bar** | Click any stage card | Opens modal with technical deep-dive for that stage |
| **Interactive Playground** | Header button | Inject single failure with custom scenario/name/amount |
| **Transaction Inspector** | Click any table row | Slide-out drawer with diagnostics, recovery copy preview, "Simulate Paid" button |
| **Batch Simulation** | Header button | Triggers `POST /api/simulate-batch` → runs `simulate_batch.py` in background |
| **AI Chatbot** | Floating button (bottom-right) | Opens chat window connected to `/api/chat` |

---

## AI Chatbot Integration

**Files:** [`engine.py`](engine.py) → `ask_gemini_chatbot()`, [`app.py`](app.py) → `POST /api/chat`

The chatbot is a separate Gemini integration from the diagnostic engine:

- **System prompt** instructs the model to act as "RecoverIQ Assistant" — conversational, concise, focused on explaining payment recovery concepts.
- **Conversation history** is maintained client-side and sent with each request (last 4 messages for context window efficiency).
- **No API key exposure:** The frontend sends messages to the backend proxy, which calls Gemini server-side.
- **Graceful degradation:** If no API key is configured, returns a friendly offline message.

---

## API Contract Reference

### `POST /webhook/razorpay`

Ingests Razorpay webhook events. Handles both `payment.failed` and `payment.captured`.

**Request body:** Standard Razorpay webhook JSON payload.

**Response (payment.failed):**
```json
{
  "status": "processed",
  "order_id": "rzp_ord_abc123",
  "action": "WHATSAPP_NUDGE",
  "to_state": "NUDGED_WHATSAPP",
  "is_llm": true,
  "retry_count": 1,
  "payment_link_url": "https://rzp.io/i/abc123",
  "copy": "Hey Priya! Aapka ₹2,499 ka payment...",
  "reasoning": "Insufficient balance detected. Generated 1-click recovery link."
}
```

### `GET /api/stats`

Returns aggregated dashboard data.

**Response:**
```json
{
  "metrics": {
    "total_at_risk": 148950.00,
    "total_recovered": 96420.00,
    "recovery_rate": 64.73,
    "total_events": 50
  },
  "transactions": [...],
  "audit_logs": [...]
}
```

### `POST /api/chat`

AI chatbot proxy endpoint.

**Request:**
```json
{
  "message": "What is Silent Retry?",
  "history": [
    {"role": "user", "content": "Hi"},
    {"role": "assistant", "content": "Hello! How can I help?"}
  ]
}
```

**Response:**
```json
{
  "reply": "Silent Retry is when RecoverIQ detects a bank infrastructure issue..."
}
```

### `POST /api/simulate-batch`

Triggers the 50-event benchmark simulation asynchronously.

**Response:**
```json
{
  "status": "success",
  "message": "Batch simulation triggered in background"
}
```

### `POST /api/reset`

Clears all `transaction_records`, `idempotency_keys`, and `audit_logs` from the SQLite database to reset demo state back to clean zero metrics.

**Response:**
```json
{
  "status": "success",
  "message": "Database successfully reset to clean zero state"
}
```

---

## Reliability & Fault Tolerance

| Failure Scenario | RecoverIQ Behavior |
|:---|:---|
| Gemini API key missing | Falls through to deterministic fallback. All features work except AI copy generation. |
| Gemini API timeout (> 1.5s) | Circuit breaker catches `FuturesTimeoutError`. Deterministic rules execute in < 2ms. |
| Gemini returns malformed JSON | `json.loads()` raises `ValueError`. Caught by circuit breaker. Falls back to rules. |
| Razorpay SDK auth fails | Payment link generation falls back to mock URL: `https://rzp.io/i/test_{id}`. |
| Duplicate webhook received | Idempotency gate rejects it silently. No state changes. No duplicate nudges. |
| Customer spammed (> 3 attempts) | Anti-spam guardrail terminates recovery cycle permanently. |
| Backend server restart | Zero data loss. All state is persisted in SQLite. Dashboard reconnects on next 3s poll. |
| Frontend loses backend connection | Dashboard falls back to mock data. Shows "Demo Mode" indicator. Recovers automatically. |
