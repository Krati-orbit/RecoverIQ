from datetime import datetime
from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel, create_engine, Session


class TransactionState(str, Enum):
    PENDING = "PENDING"
    SILENT_RETRY = "SILENT_RETRY"
    NUDGED_WHATSAPP = "NUDGED_WHATSAPP"
    NUDGED_EMAIL = "NUDGED_EMAIL"
    RECOVERED = "RECOVERED"
    TERMINATED = "TERMINATED"


class TransactionRecord(SQLModel, table=True):
    __tablename__ = "transaction_records"

    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: str = Field(unique=True, index=True)
    customer_name: str
    email: str
    contact: str
    amount: float
    failure_code: str
    failure_reason: str
    state: TransactionState = Field(default=TransactionState.PENDING)
    retry_count: int = Field(default=0)
    payment_link_url: Optional[str] = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class IdempotencyKey(SQLModel, table=True):
    __tablename__ = "idempotency_keys"

    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: str = Field(unique=True, index=True)
    order_id: str = Field(index=True)
    processed_at: datetime = Field(default_factory=datetime.utcnow)


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: str = Field(index=True)
    from_state: str
    to_state: str
    action_taken: str
    reasoning: str
    is_llm_decision: bool = Field(default=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


DATABASE_URL = "sqlite:///./recovery_engine.db"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db():
    """Create all database tables defined in SQLModel metadata."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency helper to yield database sessions."""
    with Session(engine) as session:
        yield session


if __name__ == "__main__":
    init_db()
    print("Database tables initialized successfully.")
