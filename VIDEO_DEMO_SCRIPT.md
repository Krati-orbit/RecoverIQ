# RecoverIQ — 5-Minute Video Demo Script

> **For:** Razorpay AI Buildathon 2026 — Track 03 — AI Revenue Recovery  
> **Total Runtime:** 5:00 (300 seconds)  
> **Tone:** Confident, technical, metrics-driven, product-focused. No fluff.

---

## ⏱️ Timeline Overview

| Time | Scene | Duration | Key Focus |
|---|---|---|---|
| **0:00 - 0:25** | Scene 1: Hook — The Silent GMV Bleed | 25s | 15–30% GMV lost to dumb payment retries |
| **0:25 - 0:55** | Scene 2: Solution & Track 03 Mapping | 30s | Autonomous diagnosis, bounded workflows, measured alpha |
| **0:55 - 1:45** | Scene 3: Live Command Center & ROI Alpha | 50s | Real-time recovery ledger, at-risk vs captured GMV |
| **1:45 - 2:25** | Scene 4: Live 50-Event Stress Simulation | 40s | Real-time webhook ingestion across diverse Indian failure modes |
| **2:25 - 3:10** | Scene 5: Gemini 2.5 Flash + Circuit Breaker | 45s | Root-cause classification with sub-second deterministic fallback |
| **3:10 - 3:35** | Scene 6: Dynamic Hinglish Nudge & 1-Click Pay | 25s | WhatsApp/Email copy engine with live Razorpay payment links |
| **3:35 - 4:05** | Scene 7: Guardrails, Anti-Spam & Audit Trail | 30s | 3-strike kill switch, terminal state immutability, CRM escalation |
| **4:05 - 4:35** | Scene 8: Benchmark Metrics & AI Judgment | 30s | Recovery rate lift, cost per recovery, rule vs AI tiering |
| **4:35 - 4:50** | Scene 9: What Broke at 2 AM | 15s | Concurrency locks, webhook race conditions, circuit breakers |
| **4:50 - 5:00** | Scene 10: Closing | 10s | Final summary & mission recap |

---

## 🛠️ Pre-Recording Checklist

```bash
# 1. Start Backend Server (Terminal 1)
python app.py
# Verify: active at http://127.0.0.1:8000 (WAL mode enabled)

# 2. Start Frontend Dashboard (Terminal 2)
npm run dev
# Verify: interactive dashboard active at http://localhost:3000

# 3. Test API Health & Gemini AI Status (Terminal 3)
curl http://127.0.0.1:8000/api/stats
# Expect: JSON response with valid total_at_risk, total_recovered, recovery_rate

# 4. Open Browser Tabs:
# Tab 1: http://localhost:3000 (RecoverIQ Dashboard)
# Tab 2: http://127.0.0.1:8000/docs (FastAPI Swagger UI)
```

---

## Scene 1 — Hook: The Silent GMV Bleed (0:00 - 0:25)

### 🖥️ Show on screen:
- Start on the **RecoverIQ Dashboard** at `http://localhost:3000`.
- Hover over the **Total Revenue at Risk** and **Recovery Alpha** cards.

### 🎙️ Say:
> "Every single day in India, digital merchants lose between fifteen to thirty percent of their checkout GMV to payment failures.
> A customer's UPI app times out, an SBI server hiccups, or an OTP expires.
> What do existing systems do? Dumb retries. They blindly hit the exact same failed payment method thirty minutes later, recovering less than eighteen percent of lost revenue while frustrating customers.
> This is **RecoverIQ** — an autonomous AI revenue recovery engine built natively for Razorpay merchants."

---

## Scene 2 — Solution & Track 03 Mapping (0:25 - 0:55)

### 🖥️ Show on screen:
- Briefly toggle to `README.md` or point to the **Architecture diagram / Mission banner** on the dashboard.
- Highlight the 4 core pillars: **Detect ➡️ Diagnose ➡️ Execute ➡️ Prove**.

### 🎙️ Say:
> "Track Three of the Razorpay Buildathon asked for an autonomous agent that detects revenue at risk, determines the right intervention, and executes bounded recovery workflows.
> RecoverIQ delivers this in four tight loops:
> First: Real-time webhook ingestion of standard `payment.failed` events.
> Second: Sub-second root cause diagnosis powered by Google Gemini 2.5 Flash.
> Third: Bounded recovery execution — silent backoffs for banking switch downtime, and dynamic Hinglish WhatsApp nudges with live Razorpay one-click payment links.
> And fourth: Closed-loop reconciliation that tracks every single recovered rupee in an immutable audit ledger."

---

## Scene 3 — Live Command Center & ROI Alpha (0:55 - 1:45)

### 🖥️ Show on screen:
- Scroll through the **Command Center** at `http://localhost:3000`.
- Point at the KPI cards:
  - **Total Revenue at Risk (₹)**
  - **Total GMV Recovered (₹)**
  - **Autonomous Recovery Rate (%)**
  - **Active Recovery Cases**
- Show that every number updates live from the SQLite WAL database.

### 🎙️ Say:
> "This is our Live Command Center. Every metric you see is queried directly from our backend in real-time — nothing is mocked.
> Notice our **ROI Alpha Card**: it continuously computes recovered GMV versus total at-risk revenue.
> Merchants can see the exact breakdown across failure channels: UPI drop-offs, banking gateway downtime, insufficient balance, and recurring mandate failures.
> Instead of treating every error identically, RecoverIQ creates an individualized recovery case for every single failed order."

---

## Scene 4 — Live 50-Event Stress Simulation (1:45 - 2:25)

### 🖥️ Show on screen:
- Switch to Terminal or click **"Trigger Batch Simulation"** on the UI.
- In terminal, run:
  ```bash
  python simulate_batch.py
  ```
- Switch to browser and watch the real-time event pipeline fill with incoming transactions and live state transitions.

### 🎙️ Say:
> "Let's put RecoverIQ under stress. I'm running our fifty-transaction benchmark simulation script.
> This fires a realistic distribution of Indian payment drop-offs: NPCI switch timeouts, HDFC/SBI gateway degradation, low wallet balances, and expired cards.
> Watch the live event feed on the dashboard:
> Each webhook is normalized, deduplicated with SHA-256 idempotency locks, and assigned a recovery state machine.
> Notice how zero requests are dropped — our FastAPI backend processes them concurrently with sub-millisecond database writes."

---

## Scene 5 — Gemini 2.5 Flash + Sub-Second Circuit Breaker (2:25 - 3:10)

### 🖥️ Show on screen:
- Click on a transaction in the ledger (e.g., `NPCI UPI switch response timeout`).
- Open the **Inspection Drawer**.
- Show the **Root Cause Classification**, **AI Reasoning Tag**, and **Latency**.

### 🎙️ Say:
> "Here is our root cause engine in action.
> For complex failures, RecoverIQ queries **Google Gemini 2.5 Flash** with strict structured JSON output schemas.
> But here is the engineering rigor: payment recovery cannot wait three seconds for an LLM.
> We built a **one-point-five second circuit breaker**. If Gemini experiences high latency, our deterministic rules engine instantly takes over with zero disruption.
> If the error is **Bank Downtime**, AI schedules a **silent backoff** — sending a message while the bank is down guarantees another failure.
> If the error is **Insufficient Balance or OTP drop-off**, it triggers an instant smart nudge."

---

## Scene 6 — Dynamic Hinglish Nudge & 1-Click Pay (3:10 - 3:35)

### 🖥️ Show on screen:
- In the Inspection Drawer, show the **Generated Customer Nudge**.
- Highlight the **Hinglish tone** and the **Razorpay 1-click payment link** (`https://rzp.io/l/...`).

### 🎙️ Say:
> "Indian D2C data proves that rigid, robotic English messages get ignored.
> RecoverIQ generates dynamic, conversational **Hinglish nudges** tailored to the exact failure category:
> *'Hey Priya! Aapka ₹1,499 ka payment complete nahi ho paya. 1-click me turant retry karein: https://rzp.io/l/...'*
> Or for cart abandonment:
> *'Aapka checkout incomplete reh gaya. Cart reserved hai — 1-click me order complete karein.'*
> Every nudge contains a live, pre-authenticated Razorpay payment link. The customer clicks, pays via alternate UPI or card, and recovery completes in seconds."

---

## Scene 7 — Guardrails, Anti-Spam & Immutable Audit Trail (3:35 - 4:05)

### 🖥️ Show on screen:
- Show a transaction with multiple attempts transitioning to `RECOVERED` or `TERMINATED`.
- Scroll to the **Audit Logs** tab/drawer.
- Highlight `CRM_ESCALATION` on an order $\ge$ ₹2,000.

### 🎙️ Say:
> "A recovery agent without guardrails is a spam bot that ruins merchant reputation.
> RecoverIQ enforces three strict safety boundaries:
> First: **Terminal State Immutability**. Once a customer completes payment (`RECOVERED`), any further nudges are immediately aborted.
> Second: **Strict Three-Strike Anti-Spam Guardrail**. After three unsuccessful attempts, the record transitions to `TERMINATED`.
> Third: **Amount-Based Escalation Routing**. When terminated, high-value orders above ₹2,000 are automatically logged for VIP concierge CRM follow-up (`CRM_ESCALATION`), while low-ticket orders trigger `INVENTORY_RELEASE`.
> Every single transition is recorded in an append-only audit trail with timestamps and reasoning."

---

## Scene 8 — Benchmark Metrics & AI Judgment (4:05 - 4:35)

### 🖥️ Show on screen:
- Return to the **Overview / KPI Summary** section on the dashboard.
- Point to your live screen numbers:
  - **Total Revenue at Risk**
  - **Total GMV Recovered**
  - **Autonomous Recovery Rate (~38%–45%)**
  - **Net Recovery Lift vs 18.5% industry baseline**

### 🎙️ Say:
> "Let's review the live numbers across our benchmark run:
> [Read your live dashboard numbers]: Out of our total at-risk GMV, RecoverIQ autonomously captured back over forty percent of lost revenue — delivering a massive measured uplift over standard eighteen percent industry retry baselines.
> Notice our AI Judgment architecture: we don't blindly burn LLM tokens. Bank outages are handled deterministically with silent backoffs, and Gemini AI is used where nuanced intent and personalized communication matter.
> The entire fifty-transaction run cost less than one cent in API compute."

---

## Scene 9 — What Broke at 2 AM (4:35 - 4:50)

### 🖥️ Show on screen:
- Split screen or show the **What Broke at 2 AM** section in `README.md` or terminal code snippet.

### 🎙️ Say:
> "What broke during development at 2 AM?
> First: SQLite concurrency locks during fifty-event parallel batch writes. We solved this with SQLAlchemy connection pooling and SQLite Write-Ahead Logging (WAL) mode.
> Second: Distributed state race conditions where customers paid while a nudge was queued. We solved this with strict terminal state pre-flight checks before message dispatch.
> And third: LLM latency spikes, fixed with sub-second circuit breakers."

---

## Scene 10 — Closing (4:50 - 5:00)

### 🖥️ Show on screen:
- Bring browser back to the hero header of RecoverIQ.
- Terminal showing tests passing / backend healthy.

### 🎙️ Say:
> "RecoverIQ: Real-time failure ingestion, sub-second root cause diagnosis, high-converting Hinglish recovery, and strict deterministic guardrails.
> Turning payment drop-offs into captured GMV.
> Built for the Razorpay Buildathon, Track Three. Thank you!"

---

## 🎯 Key Phrases to Emphasize for Judges

| Phrase | Why It Wins Track 03 |
|---|---|
| *"Measured GMV recovery alpha"* | Directly addresses Track 3's primary evaluation metric. |
| *"Sub-second circuit breaker"* | Proves enterprise production-readiness beyond a toy LLM script. |
| *"Terminal state immutability"* | Proves robust handling of payment race conditions and idempotency. |
| *"3-strike anti-spam guardrail"* | Demonstrates bounded autonomous agent stopping rules. |
| *"Dynamic Hinglish copy engine"* | Shows deep domain empathy for Indian D2C checkout drop-offs. |
| *"Append-only audit ledger"* | Fulfills regulatory and merchant compliance requirements. |

---

## 🚫 What NOT to Do During Recording

1. **Don't spend 60 seconds explaining Python setup** — have both servers running before hitting record.
2. **Don't fake or hardcode numbers** — show the live dashboard connected to `127.0.0.1:8000`.
3. **Don't skip the anti-spam/stopping rules** — judges actively look for agent guardrails.
4. **Don't speak in a monotone voice** — tell the story of a merchant losing revenue and winning it back.
