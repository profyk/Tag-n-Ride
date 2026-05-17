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

OWNER_TABLES = """
CREATE TABLE IF NOT EXISTS fleet_owners (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
    business_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owner_drivers (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES fleet_owners(id),
    driver_user_id TEXT NOT NULL REFERENCES users(id),
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, driver_user_id)
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(14,2) DEFAULT 0.0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS driver_net NUMERIC(14,2);
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


class AdminLoginIn(BaseModel):
    email: str
    password: str


class CreateAdminIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=100)
    password: str = Field(min_length=8, max_length=100)


class TransferFundsIn(BaseModel):
    from_user_id: str
    to_user_id: str
    amount: float = Field(gt=0, le=1_000_000)
    note: Optional[str] = None


class AdjustBalanceIn(BaseModel):
    user_id: str
    amount: float
    note: Optional[str] = None


# ---- Routes ----
@api.get("/")
async def health():
    return {"ok": True, "name": "Tag n Ride"}


# ---- Auth ----
@api.post("/auth/admin-login")
async def admin_login(body: AdminLoginIn):
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, email, full_name, role, password_hash, is_active FROM users WHERE email=$1",
            body.email.strip().lower()
        )
    if not user or user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not bcrypt.checkpw(body.password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
        },
    }


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
        if body.role == "owner":
    owner_id = str(uuid.uuid4())
    user_id = user["id"]

    await conn.execute(
        "INSERT INTO fleet_owners (id, user_id) VALUES ($1, $2)",
        owner_id,
        user_id
    )
        if body.role == "driver":
            driver_id = str(uuid.uuid4())
            plate = (body.vehicle_plate or "").upper().strip()
            qr_code = "TNR" + "".join(random.choices(string.digits, k=13))
            await conn.execute(
                """INSERT INTO drivers (id, user_id, qr_code, vehicle_plate)
                   VALUES ($1, $2, $3, $4)""",
                driver_id, user_id, qr_code, plate
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


@api.get("/wallet/driver/qr/{code}")
async def lookup_driver_by_qr(code: str, _: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        # Try QR code first (TNR format)
        drv = await conn.fetchrow(
            """SELECT d.qr_code, d.vehicle_plate, d.is_verified, d.rating_avg,
                      d.rating_count, d.user_id
               FROM drivers d WHERE d.qr_code=$1""",
            code
        )
        # Fall back to user_id lookup
        if not drv:
            drv = await conn.fetchrow(
                """SELECT d.qr_code, d.vehicle_plate, d.is_verified, d.rating_avg,
                          d.rating_count, d.user_id
                   FROM drivers d WHERE d.user_id=$1""",
                code
            )
        if not drv:
            raise HTTPException(status_code=404, detail="Driver not found")
        user = await conn.fetchrow(
            "SELECT id, full_name, phone_number FROM users WHERE id=$1",
            drv["user_id"]
        )
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


PLATFORM_FEE_PERCENT = 3.0

@api.post("/wallet/transfer")
async def transfer(body: TransferIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can pay")
    if body.driver_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot pay yourself")

    # Calculate fee
    fee = round(body.amount * (PLATFORM_FEE_PERCENT / 100), 2)
    driver_net = round(body.amount - fee, 2)

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

            # Deduct full amount from passenger
            new_sender_balance = float(sender_w["balance"]) - body.amount
            await conn.execute(
                "UPDATE wallets SET balance=$1 WHERE user_id=$2",
                new_sender_balance, user["id"]
            )
            # Credit only net amount to driver
            await conn.execute(
                "UPDATE wallets SET balance=balance+$1 WHERE user_id=$2",
                driver_net, body.driver_user_id
            )
            # Update driver total earnings with net amount
            await conn.execute(
                "UPDATE drivers SET total_earnings=total_earnings+$1 WHERE user_id=$2",
                driver_net, body.driver_user_id
            )
            txn_id = str(uuid.uuid4())
            ref = gen_ref()
            note = body.note or "Ride payment"
            await conn.execute(
                """INSERT INTO transactions
                   (id, reference, type, status, amount, platform_fee, driver_net,
                    sender_id, receiver_id, note)
                   VALUES ($1,$2,'payment','completed',$3,$4,$5,$6,$7,$8)""",
                txn_id, ref, body.amount, fee, driver_net,
                user["id"], body.driver_user_id, note
            )
            txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)

    txn = dict(txn_row)
    txn["amount"] = float(txn["amount"])
    txn["platform_fee"] = float(txn["platform_fee"] or 0)
    txn["driver_net"] = float(txn["driver_net"] or driver_net)
    txn["created_at"] = iso(txn["created_at"])
    return {
        "balance": new_sender_balance,
        "transaction": txn,
        "fee_breakdown": {
            "gross_amount": body.amount,
            "platform_fee": fee,
            "platform_fee_percent": PLATFORM_FEE_PERCENT,
            "driver_net": driver_net,
        }
            }


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

class ChangePinIn(BaseModel):
    current_pin: str = Field(min_length=4, max_length=4)
    new_pin: str = Field(min_length=4, max_length=4)

    @field_validator("new_pin")
    @classmethod
    def pin_digits(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("PIN must be 4 digits")
        return v

@api.post("/auth/change-pin")
async def change_pin(body: ChangePinIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT pin_hash FROM users WHERE id=$1", user["id"]
        )
        if not verify_pin(body.current_pin, row["pin_hash"]):
            raise HTTPException(status_code=400, detail="Current PIN is incorrect")
        await conn.execute(
            "UPDATE users SET pin_hash=$1 WHERE id=$2",
            hash_pin(body.new_pin), user["id"]
        )
    return {"ok": True}
    
# ---- Admin auth guard ----
async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user


# ---- Admin: Dashboard ----
@api.get("/admin/dashboard")
async def admin_dashboard(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        total_users = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role != 'admin'")
        total_drivers = await conn.fetchval("SELECT COUNT(*) FROM drivers")
        total_transactions = await conn.fetchval("SELECT COUNT(*) FROM transactions")
        total_revenue = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed'"
        )
        recent = await conn.fetch(
            "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10"
        )
    return {
        "total_users": total_users,
        "total_drivers": total_drivers,
        "total_transactions": total_transactions,
        "total_revenue": float(total_revenue),
        "recent_transactions": [
            {**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])}
            for r in recent
        ],
    }


# ---- Admin: Users ----
@api.get("/admin/users")
async def admin_users(search: Optional[str] = None, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        if search:
            rows = await conn.fetch(
                "SELECT id, phone_number, full_name, role, is_active, created_at FROM users WHERE phone_number ILIKE $1 ORDER BY created_at DESC",
                f"%{search}%"
            )
        else:
            rows = await conn.fetch(
                "SELECT id, phone_number, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC"
            )
    return [
        {**dict(r), "created_at": iso(r["created_at"])}
        for r in rows
    ]


@api.post("/admin/block/{user_id}")
async def admin_block(user_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET is_active=FALSE WHERE id=$1", user_id)
    log.info("admin block | by=%s target=%s", admin["id"], user_id)
    return {"ok": True}


@api.post("/admin/unblock/{user_id}")
async def admin_unblock(user_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET is_active=TRUE WHERE id=$1", user_id)
    log.info("admin unblock | by=%s target=%s", admin["id"], user_id)
    return {"ok": True}


@api.post("/admin/reset-pin/{user_id}")
async def admin_reset_pin(user_id: str, admin: dict = Depends(require_admin)):
    import random
    temp_pin = str(random.randint(1000, 9999))
    new_hash = hash_pin(temp_pin)
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET pin_hash=$1 WHERE id=$2", new_hash, user_id)
    log.info("admin reset-pin | by=%s target=%s", admin["id"], user_id)
    return {"ok": True, "temporary_pin": temp_pin}


# ---- Admin: Drivers ----
@api.get("/admin/drivers")
async def admin_drivers(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT d.*, u.full_name, u.phone_number
            FROM drivers d JOIN users u ON u.id = d.user_id
            ORDER BY d.created_at DESC
        """)
    return [
        {
            "user_id": r["user_id"],
            "full_name": r["full_name"],
            "phone_number": r["phone_number"],
            "vehicle_plate": r["vehicle_plate"],
            "total_earnings": float(r["total_earnings"]),
            "is_verified": r["is_verified"],
            "rating_avg": float(r["rating_avg"]),
            "rating_count": r["rating_count"],
            "qr_code": r["qr_code"],
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]


@api.get("/admin/drivers/{user_id}")
async def admin_driver_detail(user_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT d.*, u.full_name, u.phone_number
            FROM drivers d JOIN users u ON u.id = d.user_id
            WHERE d.user_id=$1
        """, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {
        "user_id": row["user_id"],
        "full_name": row["full_name"],
        "phone_number": row["phone_number"],
        "vehicle_plate": row["vehicle_plate"],
        "total_earnings": float(row["total_earnings"]),
        "is_verified": row["is_verified"],
        "rating_avg": float(row["rating_avg"]),
        "rating_count": row["rating_count"],
        "qr_code": row["qr_code"],
        "created_at": iso(row["created_at"]),
    }


@api.post("/admin/verify-driver/{user_id}")
async def admin_verify_driver(user_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE drivers SET is_verified=TRUE WHERE user_id=$1", user_id)
    log.info("admin verify-driver | by=%s driver=%s", admin["id"], user_id)
    return {"ok": True}


# ---- Admin: Transactions ----
@api.get("/admin/transactions")
async def admin_transactions(
    type: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    conditions = []
    params = []
    if type:
        params.append(type)
        conditions.append(f"t.type=${len(params)}")
    if from_date:
        params.append(from_date)
        conditions.append(f"t.created_at >= ${len(params)}::date")
    if to_date:
        params.append(to_date)
        conditions.append(f"t.created_at < (${len(params)}::date + interval '1 day')")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT t.*,
              su.full_name as sender_name,
              ru.full_name as receiver_name
            FROM transactions t
            LEFT JOIN users su ON su.id = t.sender_id
            LEFT JOIN users ru ON ru.id = t.receiver_id
            {where}
            ORDER BY t.created_at DESC
            LIMIT 500
        """, *params)
    return [
        {
            **dict(r),
            "amount": float(r["amount"]),
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]


# ---- Admin: Withdrawals ----
@api.get("/admin/withdrawals")
async def admin_withdrawals(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT w.*, u.full_name as user_name
            FROM withdrawal_requests w
            JOIN users u ON u.id = w.user_id
            ORDER BY w.created_at DESC
        """)
    return [
        {**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])}
        for r in rows
    ]


@api.post("/admin/withdraw/{withdrawal_id}/approve")
async def admin_approve_withdrawal(withdrawal_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE withdrawal_requests SET status='approved' WHERE id=$1", withdrawal_id
        )
        await conn.execute(
            "UPDATE transactions SET status='completed' WHERE note LIKE '%' || (SELECT account_number FROM withdrawal_requests WHERE id=$1) || '%' AND status='pending'",
            withdrawal_id
        )
    log.info("admin approve-withdrawal | by=%s id=%s", admin["id"], withdrawal_id)
    return {"ok": True}


@api.post("/admin/withdraw/{withdrawal_id}/reject")
async def admin_reject_withdrawal(withdrawal_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        req = await conn.fetchrow(
            "SELECT user_id, amount FROM withdrawal_requests WHERE id=$1 AND status='pending'",
            withdrawal_id
        )
        if not req:
            raise HTTPException(status_code=404, detail="Withdrawal not found or already processed")
        async with conn.transaction():
            await conn.execute(
                "UPDATE withdrawal_requests SET status='rejected' WHERE id=$1", withdrawal_id
            )
            # Refund the balance
            await conn.execute(
                "UPDATE wallets SET balance=balance+$1 WHERE user_id=$2",
                req["amount"], req["user_id"]
            )
    log.info("admin reject-withdrawal | by=%s id=%s", admin["id"], withdrawal_id)
    return {"ok": True}


# ---- Admin: Payout Accounts ----
@api.get("/admin/payout-accounts")
async def admin_payout_accounts(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT p.*, u.full_name as driver_name
            FROM payout_accounts p
            JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
        """)
    return [
        {**dict(r), "created_at": iso(r["created_at"])}
        for r in rows
    ]


# ---- Admin: Analytics ----
@api.get("/admin/analytics")
async def admin_analytics(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        daily = await conn.fetch("""
            SELECT
                DATE(created_at) as date,
                SUM(amount) as amount,
                COUNT(*) as count
            FROM transactions
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """)
        leaderboard = await conn.fetch("""
            SELECT u.full_name as name, d.total_earnings as earnings
            FROM drivers d JOIN users u ON u.id = d.user_id
            ORDER BY d.total_earnings DESC
            LIMIT 10
        """)
    return {
        "daily_volume": [
            {"date": str(r["date"]), "amount": float(r["amount"]), "count": r["count"]}
            for r in daily
        ],
        "driver_leaderboard": [
            {"name": r["name"], "earnings": float(r["earnings"])}
            for r in leaderboard
        ],
    }


# ---- Superadmin: Create Admin ----
@api.post("/superadmin/create-admin")
async def superadmin_create_admin(body: CreateAdminIn, admin: dict = Depends(require_superadmin)):
    hashed_password = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email=$1", body.email.lower())
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")
        user_id = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO users (id, phone_number, full_name, role, pin_hash, email, password_hash)
               VALUES ($1,$2,$3,'admin',$4,$5,$6)""",
            user_id, f"admin_{user_id[:8]}", body.full_name,
            hash_pin("0000"), body.email.lower(), hashed_password
        )
    log.info("superadmin create-admin | by=%s email=%s", admin["id"], body.email)
    return {"ok": True, "id": user_id}


# ---- Superadmin: List Admins ----
@api.get("/superadmin/admins")
async def superadmin_list_admins(admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, full_name, email, role, is_active, created_at
               FROM users WHERE role IN ('admin', 'superadmin')
               ORDER BY created_at DESC"""
        )
    return [
        {**dict(r), "created_at": iso(r["created_at"])}
        for r in rows
    ]


# ---- Superadmin: Delete Admin ----
@api.delete("/superadmin/admins/{user_id}")
async def superadmin_delete_admin(user_id: str, admin: dict = Depends(require_superadmin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role FROM users WHERE id=$1", user_id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if target["role"] == "superadmin":
            raise HTTPException(status_code=403, detail="Cannot delete superadmin")
        await conn.execute("DELETE FROM users WHERE id=$1 AND role='admin'", user_id)
    log.info("superadmin delete-admin | by=%s target=%s", admin["id"], user_id)
    return {"ok": True}


# ---- Superadmin: Delete Any User ----
@api.delete("/superadmin/users/{user_id}")
async def superadmin_delete_user(user_id: str, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role FROM users WHERE id=$1", user_id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if target["role"] in ("admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Cannot delete admin accounts from here")
        async with conn.transaction():
            await conn.execute("DELETE FROM ratings WHERE driver_user_id=$1 OR passenger_user_id=$1", user_id)
            await conn.execute("DELETE FROM withdrawal_requests WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM payout_accounts WHERE user_id=$1", user_id)
            await conn.execute("UPDATE transactions SET sender_id=NULL WHERE sender_id=$1", user_id)
            await conn.execute("UPDATE transactions SET receiver_id=NULL WHERE receiver_id=$1", user_id)
            await conn.execute("DELETE FROM drivers WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM wallets WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM users WHERE id=$1", user_id)
    log.info("superadmin delete-user | by=%s target=%s", admin["id"], user_id)
    return {"ok": True}


# ---- Superadmin: Freeze / Unfreeze Wallet ----
@api.post("/superadmin/freeze-wallet/{user_id}")
async def superadmin_freeze_wallet(user_id: str, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE wallets SET is_frozen=TRUE WHERE user_id=$1", user_id)
    log.info("superadmin freeze-wallet | by=%s target=%s", admin["id"], user_id)
    return {"ok": True}


@api.post("/superadmin/unfreeze-wallet/{user_id}")
async def superadmin_unfreeze_wallet(user_id: str, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE wallets SET is_frozen=FALSE WHERE user_id=$1", user_id)
    log.info("superadmin unfreeze-wallet | by=%s target=%s", admin["id"], user_id)
    return {"ok": True}


# ---- Superadmin: Transfer Funds Between Users ----
@api.post("/superadmin/transfer-funds")
async def superadmin_transfer_funds(body: TransferFundsIn, admin: dict = Depends(require_superadmin)):
    if body.from_user_id == body.to_user_id:
        raise HTTPException(status_code=400, detail="Cannot transfer to same account")
    async with pool.acquire() as conn:
        async with conn.transaction():
            sender_w = await conn.fetchrow(
                "SELECT balance, is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE",
                body.from_user_id
            )
            if not sender_w:
                raise HTTPException(status_code=404, detail="Sender wallet not found")
            if float(sender_w["balance"]) < body.amount:
                raise HTTPException(status_code=400, detail="Insufficient balance")
            await conn.execute(
                "UPDATE wallets SET balance=balance-$1 WHERE user_id=$2",
                body.amount, body.from_user_id
            )
            await conn.execute(
                "UPDATE wallets SET balance=balance+$1 WHERE user_id=$2",
                body.amount, body.to_user_id
            )
            txn_id = str(uuid.uuid4())
            ref = gen_ref()
            await conn.execute(
                """INSERT INTO transactions (id, reference, type, status, amount, sender_id, receiver_id, note)
                   VALUES ($1,$2,'payment','completed',$3,$4,$5,$6)""",
                txn_id, ref, body.amount, body.from_user_id, body.to_user_id,
                body.note or "Admin fund transfer"
            )
    log.info("superadmin transfer-funds | by=%s from=%s to=%s amount=%.2f",
             admin["id"], body.from_user_id, body.to_user_id, body.amount)
    return {"ok": True, "reference": ref}


# ---- Superadmin: Adjust Balance (credit or debit) ----
@api.post("/superadmin/adjust-balance")
async def superadmin_adjust_balance(body: AdjustBalanceIn, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        async with conn.transaction():
            wallet = await conn.fetchrow(
                "SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE", body.user_id
            )
            if not wallet:
                raise HTTPException(status_code=404, detail="Wallet not found")
            new_balance = float(wallet["balance"]) + body.amount
            if new_balance < 0:
                raise HTTPException(status_code=400, detail="Balance cannot go below zero")
            await conn.execute(
                "UPDATE wallets SET balance=$1 WHERE user_id=$2", new_balance, body.user_id
            )
            txn_id = str(uuid.uuid4())
            ref = gen_ref()
            txn_type = "topup" if body.amount > 0 else "withdrawal"
            await conn.execute(
                """INSERT INTO transactions (id, reference, type, status, amount, sender_id, receiver_id, note)
                   VALUES ($1,$2,$3,'completed',$4,NULL,$5,$6)""",
                txn_id, ref, txn_type, abs(body.amount), body.user_id,
                body.note or f"Admin balance adjustment ({'+' if body.amount > 0 else ''}{body.amount})"
            )
    log.info("superadmin adjust-balance | by=%s user=%s amount=%.2f",
             admin["id"], body.user_id, body.amount)
    return {"ok": True, "new_balance": new_balance}


# ---- Superadmin: Get Wallet Details ----
@api.get("/superadmin/wallet/{user_id}")
async def superadmin_get_wallet(user_id: str, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        wallet = await conn.fetchrow(
            "SELECT * FROM wallets WHERE user_id=$1", user_id
        )
        user = await conn.fetchrow(
            "SELECT id, full_name, phone_number, role FROM users WHERE id=$1", user_id
        )
        if not wallet or not user:
            raise HTTPException(status_code=404, detail="User or wallet not found")
    return {
        "user": dict(user),
        "wallet": {
            **dict(wallet),
            "balance": float(wallet["balance"]),
            "created_at": iso(wallet["created_at"]),
        }
}


# ── 5. OWNER ENDPOINTS ───────────────────────────────────────

async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Fleet owner access required")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Account suspended")
    return user


async def get_owner_record(conn, user_id: str):
    owner = await conn.fetchrow(
        "SELECT * FROM fleet_owners WHERE user_id=$1", user_id
    )
    if not owner:
        raise HTTPException(status_code=404, detail="Owner account not found")
    return owner


# ── DASHBOARD ───────────────────────────────────────────────

@api.get("/owner/dashboard")
async def owner_dashboard(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])

        drivers = await conn.fetch(
            """SELECT od.driver_user_id, u.full_name, u.phone_number,
                      d.qr_code, d.vehicle_plate, d.total_earnings,
                      d.rating_avg, d.rating_count, d.is_verified
               FROM owner_drivers od
               JOIN users u ON u.id = od.driver_user_id
               JOIN drivers d ON d.user_id = od.driver_user_id
               WHERE od.owner_id=$1""",
            owner["id"]
        )

        driver_ids = [d["driver_user_id"] for d in drivers]

        total_earnings = 0
        today_revenue = 0

        if driver_ids:
            total_earnings = await conn.fetchval(
                "SELECT COALESCE(SUM(total_earnings),0) FROM drivers WHERE user_id = ANY($1::text[])",
                driver_ids
            )

            today_revenue = await conn.fetchval(
                """SELECT COALESCE(SUM(amount),0)
                   FROM transactions
                   WHERE receiver_id = ANY($1::text[])
                   AND type='payment'
                   AND status='completed'
                   AND DATE(created_at)=CURRENT_DATE""",
                driver_ids
            )

    return {
        "total_earnings": float(total_earnings or 0),
        "today_revenue": float(today_revenue or 0),
        "driver_count": len(drivers),
        "drivers": [{
            "user_id": d["driver_user_id"],
            "full_name": d["full_name"],
            "phone_number": d["phone_number"],
            "qr_code": d["qr_code"],
            "vehicle_plate": d["vehicle_plate"],
            "total_earnings": float(d["total_earnings"] or 0),
            "rating_avg": float(d["rating_avg"] or 0),
            "rating_count": d["rating_count"] or 0,
            "is_verified": d["is_verified"],
        } for d in drivers]
    }


# ── LINK DRIVER ─────────────────────────────────────────────

class LinkDriverIn(BaseModel):
    driver_code: str = Field(min_length=3, max_length=20)


@api.post("/owner/drivers/link")
async def owner_link_driver(body: LinkDriverIn, user: dict = Depends(require_owner)):
    code = body.driver_code.strip().upper()

    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])

        drv = await conn.fetchrow(
            """SELECT d.user_id, u.full_name, u.phone_number,
                      d.vehicle_plate, d.qr_code
               FROM drivers d
               JOIN users u ON u.id=d.user_id
               WHERE d.qr_code=$1 OR d.user_id=$1""",
            code
        )

        if not drv:
            raise HTTPException(status_code=404, detail="Driver not found")

        existing = await conn.fetchrow(
            "SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2",
            owner["id"], drv["user_id"]
        )

        if existing:
            raise HTTPException(status_code=400, detail="Driver already linked")

        link_id = str(uuid.uuid4())

        await conn.execute(
            "INSERT INTO owner_drivers (id, owner_id, driver_user_id) VALUES ($1,$2,$3)",
            link_id, owner["id"], drv["user_id"]
        )

    return {"ok": True, "driver": dict(drv)}


# ── UNLINK DRIVER ───────────────────────────────────────────

@api.delete("/owner/drivers/{driver_user_id}")
async def owner_unlink_driver(driver_user_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])

        await conn.execute(
            "DELETE FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2",
            owner["id"], driver_user_id
        )

    return {"ok": True}


# ── DRIVER EARNINGS ─────────────────────────────────────────

@api.get("/owner/drivers/{driver_user_id}/earnings")
async def owner_driver_earnings(driver_user_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])

        link = await conn.fetchrow(
            "SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2",
            owner["id"], driver_user_id
        )

        if not link:
            raise HTTPException(status_code=403, detail="Driver not in fleet")

        driver = await conn.fetchrow(
            """SELECT d.*, u.full_name, u.phone_number
               FROM drivers d
               JOIN users u ON u.id=d.user_id
               WHERE d.user_id=$1""",
            driver_user_id
        )

        if not driver:
            raise HTTPException(status_code=404, detail="Driver not found")

        today_trips = await conn.fetch(
            """SELECT t.reference, t.amount, t.driver_net, t.created_at,
                      su.full_name as passenger_name
               FROM transactions t
               LEFT JOIN users su ON su.id=t.sender_id
               WHERE t.receiver_id=$1
               AND t.type='payment'
               AND DATE(t.created_at)=CURRENT_DATE
               ORDER BY t.created_at DESC""",
            driver_user_id
        )

        all_trips = await conn.fetch(
            """SELECT t.reference, t.amount, t.driver_net, t.created_at,
                      su.full_name as passenger_name
               FROM transactions t
               LEFT JOIN users su ON su.id=t.sender_id
               WHERE t.receiver_id=$1
               AND t.type='payment'
               ORDER BY t.created_at DESC
               LIMIT 50""",
            driver_user_id
        )

        today_total = sum(float(t["driver_net"] or t["amount"] or 0) for t in today_trips)

    return {
        "driver": {
            "user_id": driver["user_id"],
            "full_name": driver["full_name"],
            "phone_number": driver["phone_number"],
            "vehicle_plate": driver["vehicle_plate"],
            "total_earnings": float(driver["total_earnings"] or 0),
            "qr_code": driver["qr_code"],
            "rating_avg": float(driver["rating_avg"] or 0),
            "rating_count": driver["rating_count"] or 0,
        },
        "today_total": today_total,
        "today_trip_count": len(today_trips),
        "today_trips": [
            {
                "reference": t["reference"],
                "amount": float(t["amount"]),
                "driver_net": float(t["driver_net"] or t["amount"]),
                "passenger": t["passenger_name"] or "Passenger",
                "created_at": iso(t["created_at"]),
            }
            for t in today_trips
        ],
        "all_trips": [
            {
                "reference": t["reference"],
                "amount": float(t["amount"]),
                "driver_net": float(t["driver_net"] or t["amount"]),
                "passenger": t["passenger_name"] or "Passenger",
                "created_at": iso(t["created_at"]),
            }
            for t in all_trips
        ],
    }


# ── OWNER TRANSACTIONS ──────────────────────────────────────

@api.get("/owner/transactions")
async def owner_transactions(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])

        driver_ids = await conn.fetch(
            "SELECT driver_user_id FROM owner_drivers WHERE owner_id=$1",
            owner["id"]
        )

        ids = [d["driver_user_id"] for d in driver_ids]

        if not ids:
            return {"transactions": []}

        rows = await conn.fetch(
            """SELECT t.*, u.full_name as driver_name, d.vehicle_plate,
                      su.full_name as passenger_name
               FROM transactions t
               JOIN drivers d ON d.user_id = t.receiver_id
               LEFT JOIN users u ON u.id = d.user_id
               LEFT JOIN users su ON su.id = t.sender_id
               WHERE t.receiver_id = ANY($1::text[])
               AND t.type='payment'
               ORDER BY t.created_at DESC
               LIMIT 100""",
            ids
        )

    return {
        "transactions": [
            {
                "id": r["id"],
                "reference": r["reference"],
                "driver_name": r["driver_name"],
                "vehicle_plate": r["vehicle_plate"],
                "passenger": r["passenger_name"] or "Passenger",
                "gross_amount": float(r["amount"] or 0),
                "driver_net": float(r["driver_net"] or r["amount"] or 0),
                "platform_fee": float(r["platform_fee"] or 0),
                "created_at": iso(r["created_at"]),
            }
            for r in rows
        ]
            }

app.include_router(api)
