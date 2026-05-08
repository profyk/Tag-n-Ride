from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

import asyncpg
import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator


# ---- Config ----
DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET = os.getenv("JWT_SECRET")

if not DATABASE_URL:
    raise Exception("DATABASE_URL is not set in environment variables")

if not JWT_SECRET:
    raise Exception("JWT_SECRET is not set in environment variables")

JWT_ALG = "HS256"
ACCESS_TTL_MIN = 60 * 24 * 7  # 7 days

pool: asyncpg.Pool = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tagnride")


CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
    balance NUMERIC(14,2) DEFAULT 0.0,
    currency TEXT DEFAULT 'ZAR',
    is_frozen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
    qr_code TEXT UNIQUE NOT NULL,
    vehicle_plate TEXT DEFAULT '',
    total_earnings NUMERIC(14,2) DEFAULT 0.0,
    is_verified BOOLEAN DEFAULT FALSE,
    rating_avg NUMERIC(4,2) DEFAULT 0.0,
    rating_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    currency TEXT DEFAULT 'ZAR',
    sender_id TEXT REFERENCES users(id),
    receiver_id TEXT REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    driver_user_id TEXT NOT NULL REFERENCES users(id),
    passenger_user_id TEXT NOT NULL REFERENCES users(id),
    transaction_id TEXT UNIQUE NOT NULL REFERENCES transactions(id),
    stars INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    amount NUMERIC(14,2) NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payout_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('self', 'owner')),
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, type)
);
"""


# ---- Lifespan ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    try:
        pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=1,
            max_size=5
        )
        async with pool.acquire() as conn:
            await conn.execute(CREATE_TABLES_SQL)
        print("DB pool created, tables ready")
    except Exception as e:
        print("DB connection failed:", e)
        pool = None

    yield

    if pool:
        await pool.close()


app = FastAPI(title="Tag n Ride API", lifespan=lifespan)
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Helpers ----
def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, phone_number, full_name, role, is_active FROM users WHERE id=$1",
            payload["sub"]
        )
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account disabled")
    return dict(row)


def iso(dt: datetime) -> str:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def gen_ref() -> str:
    return f"PAY-{secrets.token_hex(6).upper()}"


async def _do_withdraw(conn, user: dict, amount: float, bank_name: str,
                       account_number: str, account_name: str) -> dict:
    async with conn.transaction():
        wallet = await conn.fetchrow(
            "SELECT balance, is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE",
            user["id"]
        )
        if not wallet or wallet["is_frozen"]:
            raise HTTPException(status_code=400, detail="Wallet not available")
        if float(wallet["balance"]) < amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        new_balance = float(wallet["balance"]) - amount
        await conn.execute(
            "UPDATE wallets SET balance=$1 WHERE user_id=$2", new_balance, user["id"]
        )
        req_id = str(uuid.uuid4())
        acct_name = account_name or user["full_name"]
        await conn.execute(
            """INSERT INTO withdrawal_requests
               (id, user_id, amount, bank_name, account_number, account_name)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            req_id, user["id"], amount, bank_name, account_number, acct_name
        )
        txn_id = str(uuid.uuid4())
        ref = gen_ref()
        note = f"Withdraw to {bank_name} {account_number}"
        await conn.execute(
            """INSERT INTO transactions
               (id, reference, type, status, amount, sender_id, receiver_id, note)
               VALUES ($1,$2,'withdrawal','pending',$3,$4,NULL,$5)""",
            txn_id, ref, amount, user["id"], note
        )
        req_row = await conn.fetchrow(
            "SELECT * FROM withdrawal_requests WHERE id=$1", req_id
        )
        txn_row = await conn.fetchrow(
            "SELECT * FROM transactions WHERE id=$1", txn_id
        )
    req = dict(req_row)
    req["amount"] = float(req["amount"])
    req["created_at"] = iso(req["created_at"])
    txn = dict(txn_row)
    txn["amount"] = float(txn["amount"])
    txn["created_at"] = iso(txn["created_at"])
    return {"balance": new_balance, "withdrawal": req, "transaction": txn}


# ---- Models ----
Role = Literal["passenger", "driver"]
PayoutType = Literal["self", "owner"]


class RegisterIn(BaseModel):
    phone_number: str = Field(min_length=7, max_length=20)
    full_name: str = Field(min_length=2, max_length=100)
    pin: str = Field(min_length=4, max_length=4)
    role: Role
    vehicle_plate: Optional[str] = Field(default=None, min_length=2, max_length=15)

    @field_validator("pin")
    @classmethod
    def pin_digits(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("PIN must be 4 digits")
        return v

    @field_validator("phone_number")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        v = v.strip().replace(" ", "")
        if not (v.startswith("+") or v.isdigit()):
            raise ValueError("Invalid phone number")
        return v


class DriverProfileIn(BaseModel):
    vehicle_plate: str = Field(min_length=2, max_length=15)


class LoginIn(BaseModel):
    phone_number: str
    pin: str


class TopUpIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)


class TransferIn(BaseModel):
    driver_user_id: str
    amount: float = Field(gt=0, le=1_000_000)
    note: Optional[str] = None


class WithdrawIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    bank_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    account_number: Optional[str] = Field(default=None, min_length=6, max_length=20)
    account_name: Optional[str] = None


class PayoutAccountIn(BaseModel):
    bank_name: str = Field(min_length=2, max_length=100)
    account_number: str = Field(min_length=6, max_length=20)
    account_name: Optional[str] = None
    type: PayoutType


class CashUpIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    type: PayoutType


class RateIn(BaseModel):
    driver_user_id: str
    transaction_id: str
    stars: int = Field(ge=1, le=5)
    comment: Optional[str] = None


# ---- Routes ----
@api.get("/")
async def health():
    return {"ok": True, "name": "Tag n Ride"}


# ---- Auth ----
@api.post("/auth/register")
async def register(body: RegisterIn):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE phone_number=$1", body.phone_number
        )
        if existing:
            raise HTTPException(status_code=400, detail="Phone number already registered")
        user_id = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO users (id, phone_number, full_name, role, pin_hash)
               VALUES ($1, $2, $3, $4, $5)""",
            user_id, body.phone_number, body.full_name, body.role, hash_pin(body.pin)
        )
        wallet_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO wallets (id, user_id) VALUES ($1, $2)",
            wallet_id, user_id
        )
        if body.role == "driver":
            driver_id = str(uuid.uuid4())
            plate = (body.vehicle_plate or "").upper().strip()
            await conn.execute(
                """INSERT INTO drivers (id, user_id, qr_code, vehicle_plate)
                   VALUES ($1, $2, $3, $4)""",
                driver_id, user_id,
                f"app://pay?driver_id={user_id}", plate
            )
    token = create_access_token(user_id, body.role)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "phone_number": body.phone_number,
            "full_name": body.full_name,
            "role": body.role,
        },
    }


@api.post("/auth/login")
async def login(body: LoginIn):
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, phone_number, full_name, role, pin_hash, is_active FROM users WHERE phone_number=$1",
            body.phone_number.strip()
        )
    if not user or not verify_pin(body.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid phone number or PIN")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_access_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "phone_number": user["phone_number"],
            "full_name": user["full_name"],
            "role": user["role"],
        },
    }


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    if user["role"] == "driver":
        async with pool.acquire() as conn:
            drv = await conn.fetchrow(
                "SELECT vehicle_plate FROM drivers WHERE user_id=$1", user["id"]
            )
        if drv:
            user["vehicle_plate"] = drv["vehicle_plate"]
    return user


@api.patch("/driver/profile")
async def update_driver_profile(body: DriverProfileIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    plate = body.vehicle_plate.upper().strip()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE drivers SET vehicle_plate=$1 WHERE user_id=$2", plate, user["id"]
        )
    return {"vehicle_plate": plate}


# ---- Wallet ----
@api.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        wallet = await conn.fetchrow(
            "SELECT id, user_id, balance, currency, is_frozen, created_at FROM wallets WHERE user_id=$1",
            user["id"]
        )
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
        result = dict(wallet)
        result["balance"] = float(result["balance"])
        result["created_at"] = iso(result["created_at"])
        if user["role"] == "driver":
            drv = await conn.fetchrow(
                "SELECT qr_code, vehicle_plate, total_earnings, is_verified, rating_avg, rating_count FROM drivers WHERE user_id=$1",
                user["id"]
            )
            if drv:
                result["qr_code"] = drv["qr_code"]
                result["vehicle_plate"] = drv["vehicle_plate"]
                result["total_earnings"] = float(drv["total_earnings"])
                result["is_verified"] = drv["is_verified"]
                result["rating_avg"] = float(drv["rating_avg"])
                result["rating_count"] = drv["rating_count"]
    return result


@api.post("/wallet/topup")
async def topup(body: TopUpIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can top up")
    async with pool.acquire() as conn:
        async with conn.transaction():
            wallet = await conn.fetchrow(
                "SELECT balance, is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE", user["id"]
            )
            if not wallet or wallet["is_frozen"]:
                raise HTTPException(status_code=400, detail="Wallet not available")
            new_balance = float(wallet["balance"]) + body.amount
            await conn.execute(
                "UPDATE wallets SET balance=$1 WHERE user_id=$2", new_balance, user["id"]
            )
            txn_id = str(uuid.uuid4())
            ref = gen_ref()
            await conn.execute(
                """INSERT INTO transactions (id, reference, type, status, amount, sender_id, receiver_id, note)
                   VALUES ($1,$2,'topup','completed',$3,NULL,$4,'Wallet top-up')""",
                txn_id, ref, body.amount, user["id"]
            )
            txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)
    txn = dict(txn_row)
    txn["amount"] = float(txn["amount"])
    txn["created_at"] = iso(txn["created_at"])
    return {"balance": new_balance, "transaction": txn}


@api.get("/wallet/driver/{driver_user_id}")
async def lookup_driver(driver_user_id: str, _: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        drv = await conn.fetchrow(
            "SELECT qr_code, vehicle_plate, is_verified, rating_avg, rating_count FROM drivers WHERE user_id=$1",
            driver_user_id
        )
        if not drv:
            raise HTTPException(status_code=404, detail="Driver not found")
        user = await conn.fetchrow(
            "SELECT id, full_name, phone_number FROM users WHERE id=$1", driver_user_id
        )
        if not user:
            raise HTTPException(status_code=404, detail="Driver user not found")
    return {
        "user_id": user["id"],
        "full_name": user["full_name"],
        "phone_number": user["phone_number"],
        "qr_code": drv["qr_code"],
        "vehicle_plate": drv["vehicle_plate"],
        "is_verified": drv["is_verified"],
        "rating_avg": float(drv["rating_avg"]),
        "rating_count": drv["rating_count"],
    }


@api.post("/wallet/transfer")
async def transfer(body: TransferIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can pay")
    if body.driver_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot pay yourself")
    async with pool.acquire() as conn:
        drv = await conn.fetchrow(
            "SELECT id FROM drivers WHERE user_id=$1", body.driver_user_id
        )
        if not drv:
            raise HTTPException(status_code=404, detail="Driver not found")
        async with conn.transaction():
            sender_w = await conn.fetchrow(
                "SELECT balance, is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE",
                user["id"]
            )
            if not sender_w or sender_w["is_frozen"]:
                raise HTTPException(status_code=400, detail="Wallet not available")
            if float(sender_w["balance"]) < body.amount:
                raise HTTPException(status_code=400, detail="Insufficient balance")
            new_sender_balance = float(sender_w["balance"]) - body.amount
            await conn.execute(
                "UPDATE wallets SET balance=$1 WHERE user_id=$2", new_sender_balance, user["id"]
            )
            await conn.execute(
                "UPDATE wallets SET balance=balance+$1 WHERE user_id=$2",
                body.amount, body.driver_user_id
            )
            await conn.execute(
                "UPDATE drivers SET total_earnings=total_earnings+$1 WHERE user_id=$2",
                body.amount, body.driver_user_id
            )
            txn_id = str(uuid.uuid4())
            ref = gen_ref()
            note = body.note or "Ride payment"
            await conn.execute(
                """INSERT INTO transactions (id, reference, type, status, amount, sender_id, receiver_id, note)
                   VALUES ($1,$2,'payment','completed',$3,$4,$5,$6)""",
                txn_id, ref, body.amount, user["id"], body.driver_user_id, note
            )
            txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)
    txn = dict(txn_row)
    txn["amount"] = float(txn["amount"])
    txn["created_at"] = iso(txn["created_at"])
    return {"balance": new_sender_balance, "transaction": txn}


@api.get("/wallet/transactions")
async def transactions(limit: int = 50, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM transactions
               WHERE sender_id=$1 OR receiver_id=$1
               ORDER BY created_at DESC LIMIT $2""",
            user["id"], min(limit, 200)
        )
        items = []
        for row in rows:
            t = dict(row)
            t["amount"] = float(t["amount"])
            t["created_at"] = iso(t["created_at"])
            cp_id = t["receiver_id"] if t["sender_id"] == user["id"] else t["sender_id"]
            cp_name = None
            if cp_id:
                cp_row = await conn.fetchrow("SELECT full_name FROM users WHERE id=$1", cp_id)
                cp_name = cp_row["full_name"] if cp_row else None
            t["counterparty_name"] = cp_name
            t["direction"] = "out" if t.get("sender_id") == user["id"] else "in"
            items.append(t)
    return items


@api.post("/wallet/withdraw")
async def withdraw(body: WithdrawIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can withdraw")

    bank_name = body.bank_name
    account_number = body.account_number
    account_name = body.account_name

    async with pool.acquire() as conn:
        if not bank_name or not account_number:
            saved = await conn.fetchrow(
                "SELECT * FROM payout_accounts WHERE user_id=$1 AND type='self'",
                user["id"]
            )
            if not saved:
                raise HTTPException(
                    status_code=400,
                    detail="No saved payout account found. Please provide bank details or save a payout account."
                )
            bank_name = saved["bank_name"]
            account_number = saved["account_number"]
            account_name = saved["account_name"] or account_name

        result = await _do_withdraw(conn, user, body.amount, bank_name, account_number, account_name)

    log.info("withdraw | user=%s amount=%.2f bank=%s", user["id"], body.amount, bank_name)
    return result


@api.post("/wallet/payout-account")
async def save_payout_account(body: PayoutAccountIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM payout_accounts WHERE user_id=$1 AND type=$2",
            user["id"], body.type
        )
        if existing:
            await conn.execute(
                """UPDATE payout_accounts
                   SET bank_name=$1, account_number=$2, account_name=$3
                   WHERE user_id=$4 AND type=$5""",
                body.bank_name, body.account_number, body.account_name,
                user["id"], body.type
            )
            log.info("payout_account updated | user=%s type=%s", user["id"], body.type)
        else:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM payout_accounts WHERE user_id=$1", user["id"]
            )
            if count >= 2:
                raise HTTPException(
                    status_code=400,
                    detail="Maximum of 2 payout accounts allowed (self and owner)"
                )
            acct_id = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO payout_accounts
                   (id, user_id, type, bank_name, account_number, account_name)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                acct_id, user["id"], body.type,
                body.bank_name, body.account_number, body.account_name
            )
            log.info("payout_account created | user=%s type=%s", user["id"], body.type)

        row = await conn.fetchrow(
            "SELECT * FROM payout_accounts WHERE user_id=$1 AND type=$2",
            user["id"], body.type
        )

    result = dict(row)
    result["created_at"] = iso(result["created_at"])
    return result


@api.get("/wallet/payout-account")
async def get_payout_accounts(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM payout_accounts WHERE user_id=$1 ORDER BY created_at ASC",
            user["id"]
        )

    result = []
    for row in rows:
        r = dict(row)
        r["created_at"] = iso(r["created_at"])
        result.append(r)
    return result


@api.post("/wallet/cashup")
async def cashup(body: CashUpIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")

    log.info("cashup request | user=%s amount=%.2f type=%s", user["id"], body.amount, body.type)

    async with pool.acquire() as conn:
        account = await conn.fetchrow(
            "SELECT * FROM payout_accounts WHERE user_id=$1 AND type=$2",
            user["id"], body.type
        )
        if not account:
            raise HTTPException(
                status_code=400,
                detail=f"No '{body.type}' payout account saved. Please add one first."
            )
        result = await _do_withdraw(
            conn, user, body.amount,
            account["bank_name"],
            account["account_number"],
            account["account_name"]
        )

    log.info("cashup completed | user=%s amount=%.2f type=%s", user["id"], body.amount, body.type)
    return {**result, "payout_type": body.type}


@api.post("/wallet/rate")
async def rate(body: RateIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can rate")
    async with pool.acquire() as conn:
        txn = await conn.fetchrow(
            "SELECT id, type, receiver_id FROM transactions WHERE id=$1 AND sender_id=$2",
            body.transaction_id, user["id"]
        )
        if not txn:
            raise HTTPException(status_code=404, detail="Transaction not found")
        if txn["type"] != "payment":
            raise HTTPException(status_code=400, detail="Can only rate ride payments")
        if txn["receiver_id"] != body.driver_user_id:
            raise HTTPException(status_code=400, detail="Driver mismatch")
        existing_rating = await conn.fetchrow(
            "SELECT id FROM ratings WHERE transaction_id=$1", body.transaction_id
        )
        if existing_rating:
            raise HTTPException(status_code=400, detail="Already rated this transaction")
        rating_id = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO ratings (id, driver_user_id, passenger_user_id, transaction_id, stars, comment)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            rating_id, body.driver_user_id, user["id"], body.transaction_id, body.stars, body.comment
        )
        rows = await conn.fetch(
            "SELECT stars FROM ratings WHERE driver_user_id=$1", body.driver_user_id
        )
        all_stars = [r["stars"] for r in rows]
        new_avg = sum(all_stars) / len(all_stars)
        await conn.execute(
            "UPDATE drivers SET rating_avg=$1, rating_count=$2 WHERE user_id=$3",
            new_avg, len(all_stars), body.driver_user_id
        )
    return {"rated": True, "stars": body.stars, "new_avg": round(new_avg, 2)}


app.include_router(api)
