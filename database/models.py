from sqlalchemy import Column, BigInteger, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.ext.asyncio import AsyncAttrs, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

class Base(AsyncAttrs, DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False)
    username = Column(String(255))
    first_name = Column(String(255))
    last_name = Column(String(255))
    photo_url = Column(String(512))
    balance = Column(Integer, default=0)
    free_case_available = Column(Boolean, default=True)
    last_free_case = Column(DateTime, nullable=True)
    
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    referral_code = Column(String(50), unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    openings = relationship("CaseOpening", back_populates="user")
    withdrawals = relationship("Withdrawal", back_populates="user")
    referral_earnings = relationship("ReferralEarning", foreign_keys="ReferralEarning.referrer_id", back_populates="user")

class ReferralEarning(Base):
    __tablename__ = "referral_earnings"

    id = Column(Integer, primary_key=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    referred_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, default=0)
    source = Column(String(50), default="deposit_bonus")
    is_withdrawn = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[referrer_id], back_populates="referral_earnings")
    referred_user = relationship("User", foreign_keys=[referred_user_id])

class Case(Base):
    __tablename__ = "cases"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    price = Column(Integer, nullable=False)
    image_url = Column(String(512))
    is_free = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    items = relationship("CaseItem", back_populates="case")
    openings = relationship("CaseOpening", back_populates="case")

class Gift(Base):
    __tablename__ = "gifts"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    gift_id = Column(String(255), unique=True)
    image_url = Column(String(512))
    rarity = Column(String(50))
    value = Column(Integer)
    gift_number = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    case_items = relationship("CaseItem", back_populates="gift")

class CaseItem(Base):
    __tablename__ = "case_items"
    
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey("cases.id"))
    gift_id = Column(Integer, ForeignKey("gifts.id"))
    drop_chance = Column(Float)
    
    case = relationship("Case", back_populates="items")
    gift = relationship("Gift", back_populates="case_items")

class CaseOpening(Base):
    __tablename__ = "case_openings"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    case_id = Column(Integer, ForeignKey("cases.id"))
    gift_id = Column(Integer, ForeignKey("gifts.id"))
    is_withdrawn = Column(Boolean, default=False)
    is_sold = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="openings")
    case = relationship("Case", back_populates="openings")
    gift = relationship("Gift")

class Withdrawal(Base):
    __tablename__ = "withdrawals"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    opening_id = Column(Integer, ForeignKey("case_openings.id"))
    status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="withdrawals")
    opening = relationship("CaseOpening")

class Payment(Base):
    __tablename__ = "payments"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Integer)
    status = Column(String(50), default="pending")
    telegram_payment_id = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User")


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./database/cases.db")
if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"server_settings": {"search_path": "public"}}
)
async_session = async_sessionmaker(engine, expire_on_commit=False)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(_migrate_columns)
    except Exception as e:
        print(f"⚠️ Migration warning: {e}")

def _migrate_columns(conn):
    # Убрали DEFAULT из миграции, чтобы PostgreSQL не ругался!
    migrations = [
        ("gifts",         "gift_number", "INTEGER"),
        ("case_openings", "is_sold",     "BOOLEAN"),
        ("users",         "photo_url",   "TEXT"),
        ("users",         "referrer_id", "INTEGER"),
        ("users",         "referral_code", "TEXT"),
        ("referral_earnings", "is_withdrawn", "BOOLEAN"),
    ]
    for table, col, col_type in migrations:
        try:
            conn.execute(__import__('sqlalchemy').text(
                f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"
            ))
        except Exception:
            pass