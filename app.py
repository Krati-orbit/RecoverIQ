import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select, delete, func, desc

from database import (
    AuditLog,
    IdempotencyKey,
    TransactionRecord,
    TransactionState,
    engine,
    get_session,
    init_db,
)
from engine import classify_and_plan, generate_razorpay_payment_link

app = FastAPI(
    title="RecoverIQ Revenue Recovery Engine",
    description="Autonomous payment recovery and intelligence engine for Razorpay",
    version="1.0.0",
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """Initialize database tables on application launch."""
    init_db()


def _extract_event_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to normalize Razorpay webhook payload structure."""
    event_type = payload.get("event") or payload.get("event_type", "unknown")
    event_id = payload.get("event_id") or payload.get("id")

    payment_entity = (
        payload.get("payload", {})
        .get("payment", {})
        .get("entity", {})
    )

    # Fallback to top-level if payload is simplified/flat
    if not payment_entity:
        payment_entity = payload

    order_id = (
        payment_entity.get("order_id")
        or payment_entity.get("reference_id")
        or payload.get("order_id")
        or f"order_{int(datetime.utcnow().timestamp())}"
    )

    # If event_id was not in payload, generate deterministic hash
    if not event_id:
        hash_seed = f"{event_type}_{order_id}_{payload.get('created_at', datetime.utcnow().isoformat())}"
        event_id = f"evt_{hashlib.sha256(hash_seed.encode('utf-8')).hexdigest()[:16]}"

    amount_raw = payment_entity.get("amount", 0.0)
    # If Razorpay amount in paise, convert to rupees (e.g. 150000 -> 1500.0)
    amount = float(amount_raw)
    if amount > 1000 and isinstance(amount_raw, int) and amount_raw % 100 == 0 and "paise" in str(payment_entity.get("notes", {})):
        amount = amount / 100.0
    elif amount > 5000 and isinstance(amount_raw, int) and amount_raw % 100 == 0:
        # Standard Razorpay webhook amount is in paise
        amount = amount / 100.0

    customer_notes = payment_entity.get("notes", {})
    customer_name = (
        customer_notes.get("customer_name")
        or customer_notes.get("name")
        or payment_entity.get("customer_name")
        or (payment_entity.get("customer", {}).get("name") if isinstance(payment_entity.get("customer"), dict) else None)
        or "Valued Customer"
    )

    email = (
        payment_entity.get("email")
        or customer_notes.get("email")
        or "customer@example.com"
    )
    contact = (
        payment_entity.get("contact")
        or customer_notes.get("contact")
        or "+919999999999"
    )

    failure_code = (
        payment_entity.get("error_code")
        or payment_entity.get("failure_code")
        or "PAYMENT_FAILED"
    )
    failure_desc = (
        payment_entity.get("error_description")
        or payment_entity.get("error_reason")
        or payment_entity.get("failure_reason")
        or "Transaction failed during processing."
    )

    return {
        "event_type": event_type,
        "event_id": event_id,
        "order_id": order_id,
        "amount": amount,
        "customer_name": customer_name,
        "email": email,
        "contact": contact,
        "failure_code": failure_code,
        "failure_desc": failure_desc,
    }


@app.post("/webhook/razorpay")
async def razorpay_webhook(request: Request, session: Session = Depends(get_session)):
    """
    Ingest and process Razorpay webhooks for payment recovery.
    Handles idempotency locking, anti-spam guardrails, diagnostic AI planning, and state transitions.
    """
    try:
        raw_body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    data = _extract_event_data(raw_body)
    event_id = data["event_id"]
    order_id = data["order_id"]
    event_type = data["event_type"]

    # 1. Idempotency Check
    existing_event = session.exec(
        select(IdempotencyKey).where(IdempotencyKey.event_id == event_id)
    ).first()

    if existing_event:
        return {
            "status": "ignored",
            "reason": "Duplicate webhook rejected by Idempotency Lock",
            "event_id": event_id,
            "order_id": order_id,
        }

    # Record Idempotency Key
    idempotency_entry = IdempotencyKey(
        event_id=event_id,
        order_id=order_id,
        processed_at=datetime.utcnow(),
    )
    session.add(idempotency_entry)
    session.commit()

    # 2. Handle payment.captured event
    if event_type in ["payment.captured", "order.paid"]:
        record = session.exec(
            select(TransactionRecord).where(TransactionRecord.order_id == order_id)
        ).first()

        if record:
            from_state = record.state.value if hasattr(record.state, "value") else str(record.state)
            record.state = TransactionState.RECOVERED
            record.updated_at = datetime.utcnow()
            session.add(record)

            audit = AuditLog(
                order_id=order_id,
                from_state=from_state,
                to_state=TransactionState.RECOVERED.value,
                action_taken="PAYMENT_CAPTURED",
                reasoning="Payment successfully received. Closed all active recovery loops.",
                is_llm_decision=False,
                timestamp=datetime.utcnow(),
            )
            session.add(audit)
            session.commit()

            return {
                "status": "success",
                "message": f"Order {order_id} marked as RECOVERED",
                "state": TransactionState.RECOVERED.value,
            }
        else:
            # Payment captured for an untracked order
            audit = AuditLog(
                order_id=order_id,
                from_state="UNKNOWN",
                to_state=TransactionState.RECOVERED.value,
                action_taken="PAYMENT_CAPTURED",
                reasoning="Direct payment captured. No prior recovery loop found.",
                is_llm_decision=False,
                timestamp=datetime.utcnow(),
            )
            session.add(audit)
            session.commit()
            return {
                "status": "success",
                "message": "Payment captured recorded",
                "state": TransactionState.RECOVERED.value,
            }

    # 3. Handle payment.failed event
    if event_type in ["payment.failed", "payment.error"]:
        record = session.exec(
            select(TransactionRecord).where(TransactionRecord.order_id == order_id)
        ).first()

        if not record:
            record = TransactionRecord(
                order_id=order_id,
                customer_name=data["customer_name"],
                email=data["email"],
                contact=data["contact"],
                amount=data["amount"],
                failure_code=data["failure_code"],
                failure_reason=data["failure_desc"],
                state=TransactionState.PENDING,
                retry_count=0,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            session.add(record)
            session.commit()
            session.refresh(record)

        from_state = record.state.value if hasattr(record.state, "value") else str(record.state)

        # Anti-Spam Guardrail Check
        if record.retry_count >= 3:
            record.state = TransactionState.TERMINATED
            record.updated_at = datetime.utcnow()
            session.add(record)

            audit = AuditLog(
                order_id=order_id,
                from_state=from_state,
                to_state=TransactionState.TERMINATED.value,
                action_taken="GUARDRAIL_TERMINATION",
                reasoning="Anti-Spam Guardrail: Exceeded maximum recovery attempts (3). Terminating recovery cycle.",
                is_llm_decision=False,
                timestamp=datetime.utcnow(),
            )
            session.add(audit)
            session.commit()

            return {
                "status": "terminated",
                "reason": "Anti-Spam Guardrail: Max retry attempts reached (3)",
                "order_id": order_id,
                "state": TransactionState.TERMINATED.value,
            }

        # Diagnostic & Planning via Engine
        plan = classify_and_plan(
            failure_code=record.failure_code,
            failure_desc=record.failure_reason,
            customer_name=record.customer_name,
            amount=record.amount,
        )

        action = plan.get("action", "SILENT_RETRY").upper()
        is_llm = plan.get("is_llm", False)
        reasoning = plan.get("explanation", "Diagnostic plan executed.")
        copy_text = plan.get("copy", "")

        target_state = TransactionState.SILENT_RETRY
        payment_link = record.payment_link_url

        if action == "SILENT_RETRY":
            target_state = TransactionState.SILENT_RETRY
        elif "WHATSAPP" in action:
            target_state = TransactionState.NUDGED_WHATSAPP
            if not payment_link:
                payment_link = generate_razorpay_payment_link(
                    order_id=record.order_id,
                    customer_name=record.customer_name,
                    email=record.email,
                    contact=record.contact,
                    amount=record.amount,
                )
        elif "EMAIL" in action:
            target_state = TransactionState.NUDGED_EMAIL
            if not payment_link:
                payment_link = generate_razorpay_payment_link(
                    order_id=record.order_id,
                    customer_name=record.customer_name,
                    email=record.email,
                    contact=record.contact,
                    amount=record.amount,
                )
        else:
            target_state = TransactionState.NUDGED_WHATSAPP
            if not payment_link:
                payment_link = generate_razorpay_payment_link(
                    order_id=record.order_id,
                    customer_name=record.customer_name,
                    email=record.email,
                    contact=record.contact,
                    amount=record.amount,
                )

        # Update Record State
        record.state = target_state
        record.payment_link_url = payment_link
        record.retry_count += 1
        record.updated_at = datetime.utcnow()
        session.add(record)

        # Record Audit Log
        audit = AuditLog(
            order_id=order_id,
            from_state=from_state,
            to_state=target_state.value,
            action_taken=action,
            reasoning=reasoning,
            is_llm_decision=is_llm,
            timestamp=datetime.utcnow(),
        )
        session.add(audit)
        session.commit()
        session.refresh(record)

        return {
            "status": "processed",
            "order_id": order_id,
            "action": action,
            "to_state": target_state.value,
            "is_llm": is_llm,
            "retry_count": record.retry_count,
            "payment_link_url": record.payment_link_url,
            "copy": copy_text.replace("[LINK]", record.payment_link_url or "") if copy_text else "",
            "reasoning": reasoning,
        }

    return {
        "status": "ignored",
        "reason": f"Unhandled event type: {event_type}",
        "event_id": event_id,
    }


@app.get("/api/stats")
def get_dashboard_stats(session: Session = Depends(get_session)):
    """
    Get aggregated dashboard statistics, all transaction records, and recent audit logs.
    """
    # Fetch all transactions
    transactions_query = select(TransactionRecord).order_by(desc(TransactionRecord.updated_at))
    transactions = session.exec(transactions_query).all()

    total_at_risk = 0.0
    total_recovered = 0.0
    total_events = len(transactions)

    for tx in transactions:
        total_at_risk += float(tx.amount or 0.0)
        if tx.state == TransactionState.RECOVERED:
            total_recovered += float(tx.amount or 0.0)

    recovery_rate = (
        round((total_recovered / total_at_risk) * 100, 2)
        if total_at_risk > 0
        else 0.0
    )

    # Fetch 15 most recent audit logs
    audit_query = select(AuditLog).order_by(desc(AuditLog.id)).limit(15)
    audit_logs = session.exec(audit_query).all()

    return {
        "metrics": {
            "total_at_risk": round(total_at_risk, 2),
            "total_recovered": round(total_recovered, 2),
            "recovery_rate": recovery_rate,
            "total_events": total_events,
        },
        "transactions": [
            {
                "id": tx.id,
                "order_id": tx.order_id,
                "customer_name": tx.customer_name,
                "email": tx.email,
                "contact": tx.contact,
                "amount": tx.amount,
                "failure_code": tx.failure_code,
                "failure_reason": tx.failure_reason,
                "state": tx.state.value if hasattr(tx.state, "value") else str(tx.state),
                "retry_count": tx.retry_count,
                "payment_link_url": tx.payment_link_url,
                "created_at": tx.created_at.isoformat() if tx.created_at else None,
                "updated_at": tx.updated_at.isoformat() if tx.updated_at else None,
            }
            for tx in transactions
        ],
        "audit_logs": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "order_id": log.order_id,
                "from_state": log.from_state,
                "to_state": log.to_state,
                "action_taken": log.action_taken,
                "reasoning": log.reasoning,
                "is_llm_decision": log.is_llm_decision,
            }
            for log in audit_logs
        ],
    }


from pydantic import BaseModel
class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    """Chat endpoint for the AI Assistant."""
    try:
        from engine import ask_gemini_chatbot
        reply = ask_gemini_chatbot(req.message, req.history)
        return {"reply": reply}
    except Exception as e:
        return {"reply": f"Error: {str(e)}"}

@app.post("/api/simulate-batch")
def simulate_batch():
    """
    Trigger the batch simulation script asynchronously in the background.
    """
    script_path = os.path.join(os.path.dirname(__file__), "simulate_batch.py")
    try:
        subprocess.Popen([sys.executable, script_path])
        return {
            "status": "success",
            "message": "Batch simulation triggered in background",
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to trigger simulation: {str(e)}",
        }


@app.post("/api/reset")
def reset_database(session: Session = Depends(get_session)):
    """
    Clear all transaction records, idempotency keys, and audit logs to reset demo to clean zero state.
    """
    try:
        session.exec(delete(TransactionRecord))
        session.exec(delete(IdempotencyKey))
        session.exec(delete(AuditLog))
        session.commit()
        return {"status": "success", "message": "Database successfully reset to clean zero state"}
    except Exception as e:
        session.rollback()
        return {"status": "error", "message": f"Failed to reset database: {str(e)}"}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
