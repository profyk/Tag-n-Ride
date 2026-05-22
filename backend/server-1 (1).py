from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import csv
import json
import random
import string
import logging
import uuid
import secrets
import hashlib
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

import asyncpg
import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, File, UploadFile
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
import base64

# ── Config ──────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET   = os.getenv("JWT_SECRET")

if not DATABASE_URL:
    raise Exception("DATABASE_URL is not set")
if not JWT_SECRET:
    raise Exception("JWT_SECRET is not set")

JWT_ALG        = "HS256"
ACCESS_TTL_MIN = 60 * 24 * 7  # 7 days
PLATFORM_FEE_PERCENT = 3.0

pool: asyncpg.Pool = None

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tagnride")

ADMIN_ROLES = ("superadmin", "ceo", "cto", "cfo", "admin", "finance", "support")

ROLE_PERMISSIONS = {
    "superadmin": [
        "manage_admins", "freeze_wallet", "transfer_funds", "adjust_balance",
        "view_audit", "export_data", "manage_users", "manage_drivers",
        "approve_withdrawals", "reset_pin", "view_sessions", "revoke_sessions",
        "flag_accounts", "view_analytics", "review_kyc", "edit_system",
        "promote_admins", "manage_roles",
    ],
    "ceo": [
        "view_audit", "view_analytics", "export_data", "manage_admins",
        "promote_admins", "manage_roles", "manage_users", "manage_drivers",
        "freeze_wallet", "transfer_funds", "adjust_balance",
        "approve_withdrawals", "review_kyc", "flag_accounts",
    ],
    "cto": [
        "view_audit", "view_analytics", "export_data", "manage_drivers",
        "review_kyc", "view_sessions", "edit_system",
    ],
    "cfo": [
        "approve_withdrawals", "view_analytics", "export_data",
        "view_audit", "freeze_wallet", "transfer_funds", "adjust_balance",
    ],
    "admin": [
        "manage_users", "manage_drivers", "reset_pin",
        "view_audit", "flag_accounts", "view_analytics", "review_kyc",
    ],
    "finance": [
        "approve_withdrawals", "view_analytics", "export_data",
        "view_audit", "freeze_wallet",
    ],
    "support": ["reset_pin", "manage_users"],
}

def has_permission(user: dict, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(user.get("role", ""), [])

def token_hash_fn(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:32]

def generate_qr_code() -> str:
    return "TNR" + "".join(random.choices(string.digits, k=13))

# ── Tables ───────────────────────────────────────────────────
CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    email TEXT UNIQUE,
    password_hash TEXT,
    last_login TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    created_by TEXT,
    flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT
);

CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
    balance NUMERIC(14,2) DEFAULT 0.0,
    currency TEXT DEFAULT 'ZAR',
    is_frozen BOOLEAN DEFAULT FALSE,
    frozen_reason TEXT,
    frozen_at TIMESTAMPTZ,
    driver_mode_active BOOLEAN DEFAULT FALSE,
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
    platform_fee NUMERIC(14,2) DEFAULT 0.0,
    driver_net NUMERIC(14,2),
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
    type TEXT NOT NULL CHECK (type IN ('self','owner')),
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, type)
);

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

CREATE TABLE IF NOT EXISTS kyc_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    selfie_url TEXT,
    licence_front_url TEXT,
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    target_id TEXT,
    target_type TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address TEXT,
    success BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flagged_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    flagged_by TEXT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    resolved_by TEXT REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

# ── Lifespan ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    try:
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
        async with pool.acquire() as conn:
            await conn.execute(CREATE_TABLES_SQL)
        print("DB pool created, tables ready")
        await create_new_tables()
    except Exception as e:
        print("DB connection failed:", e)
        pool = None
    yield
    if pool:
        await pool.close()

app = FastAPI(title="Tag n Ride API", version="0.1.0", lifespan=lifespan)
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ──────────────────────────────────────────────────
def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "iat": datetime.now(timezone.utc), "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def iso(dt) -> Optional[str]:
    if dt is None: return None
    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

def gen_ref() -> str:
    return f"PAY-{secrets.token_hex(6).upper()}"

async def audit(conn, admin_id, action, target_id=None, target_type=None,
                metadata=None, ip=None, success=True):
    try:
        await conn.execute(
            """INSERT INTO audit_logs
               (id,admin_id,action,target_id,target_type,metadata,ip_address,success)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            str(uuid.uuid4()), admin_id, action, target_id, target_type,
            json.dumps(metadata or {}), ip, success
        )
    except Exception:
        pass

# ── Auth helpers ─────────────────────────────────────────────
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

    th = token_hash_fn(token)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id,phone_number,full_name,role,is_active,email FROM users WHERE id=$1",
            payload["sub"]
        )
        session = await conn.fetchrow(
            "SELECT revoked FROM admin_sessions WHERE admin_id=$1 AND token_hash=$2",
            payload["sub"], th
        )
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account suspended")
    if session and session["revoked"]:
        raise HTTPException(status_code=401, detail="Session revoked")
    return dict(row)

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Account suspended")
    return user

async def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("superadmin", "ceo"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user

async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Fleet owner access required")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Account suspended")
    return user

async def get_owner_record(conn, user_id: str):
    owner = await conn.fetchrow("SELECT * FROM fleet_owners WHERE user_id=$1", user_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner account not found")
    return owner

# ── Withdraw helper ──────────────────────────────────────────
async def _do_withdraw(conn, user, amount, bank_name, account_number, account_name):
    async with conn.transaction():
        wallet = await conn.fetchrow(
            "SELECT balance,is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE", user["id"]
        )
        if not wallet or wallet["is_frozen"]:
            raise HTTPException(status_code=400, detail="Wallet not available")
        if float(wallet["balance"]) < amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        new_balance = float(wallet["balance"]) - amount
        await conn.execute("UPDATE wallets SET balance=$1 WHERE user_id=$2", new_balance, user["id"])
        req_id = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO withdrawal_requests
               (id,user_id,amount,bank_name,account_number,account_name)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            req_id, user["id"], amount, bank_name, account_number,
            account_name or user["full_name"]
        )
        txn_id = str(uuid.uuid4()); ref = gen_ref()
        await conn.execute(
            """INSERT INTO transactions
               (id,reference,type,status,amount,sender_id,receiver_id,note)
               VALUES ($1,$2,'withdrawal','pending',$3,$4,NULL,$5)""",
            txn_id, ref, amount, user["id"], f"Withdraw to {bank_name} {account_number}"
        )
        req_row = await conn.fetchrow("SELECT * FROM withdrawal_requests WHERE id=$1", req_id)
        txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)
    req = dict(req_row); req["amount"] = float(req["amount"]); req["created_at"] = iso(req["created_at"])
    txn = dict(txn_row); txn["amount"] = float(txn["amount"]); txn["created_at"] = iso(txn["created_at"])
    return {"balance": new_balance, "withdrawal": req, "transaction": txn}

# ── Models ───────────────────────────────────────────────────
class RegisterIn(BaseModel):
    phone_number: str = Field(min_length=7, max_length=20)
    full_name: str = Field(min_length=2, max_length=100)
    pin: str = Field(min_length=4, max_length=4)
    role: str = Field(default="passenger")
    vehicle_plate: Optional[str] = None
    business_name: Optional[str] = None

    @field_validator("pin")
    @classmethod
    def pin_digits(cls, v):
        if not v.isdigit(): raise ValueError("PIN must be 4 digits")
        return v

    @field_validator("phone_number")
    @classmethod
    def normalize_phone(cls, v):
        v = v.strip().replace(" ", "")
        if not (v.startswith("+") or v.isdigit()): raise ValueError("Invalid phone number")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("passenger","driver","owner"): raise ValueError("Invalid role")
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
    type: str

class CashUpIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    type: str

class RateIn(BaseModel):
    driver_user_id: str
    transaction_id: str
    stars: int = Field(ge=1, le=5)
    comment: Optional[str] = None

class ChangePinIn(BaseModel):
    current_pin: str = Field(min_length=4, max_length=4)
    new_pin: str = Field(min_length=4, max_length=4)

    @field_validator("new_pin")
    @classmethod
    def pin_digits(cls, v):
        if not v.isdigit(): raise ValueError("PIN must be 4 digits")
        return v

class AdminLoginIn(BaseModel):
    email: str
    password: str

class CreateAdminIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=100)
    password: str = Field(min_length=8, max_length=100)
    role: str = Field(default="admin")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("admin","finance","support","cfo","cto","ceo"):
            raise ValueError("Invalid role")
        return v

class UpdateAdminIn(BaseModel):
    role: Optional[str] = None
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    email: Optional[str] = Field(default=None, min_length=5, max_length=100)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v is not None and v not in ("admin","finance","support","cfo","cto","ceo"):
            raise ValueError("Invalid role")
        return v

class ResetAdminPasswordIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=100)

class TransferFundsIn(BaseModel):
    from_user_id: str
    to_user_id: str
    amount: float = Field(gt=0, le=1_000_000)
    note: Optional[str] = None

class AdjustBalanceIn(BaseModel):
    user_id: str
    amount: float
    note: Optional[str] = None

class FreezeWalletIn(BaseModel):
    reason: str = Field(min_length=3, max_length=200)

class FlagAccountIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)

class KYCReviewIn(BaseModel):
    action: str
    rejection_reason: Optional[str] = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, v):
        if v not in ("approve","reject"): raise ValueError("action must be approve or reject")
        return v

class LinkDriverIn(BaseModel):
    driver_code: str = Field(min_length=3, max_length=20)

# ── Routes ───────────────────────────────────────────────────
@api.get("/")
async def health():
    return {"ok": True, "name": "Tag n Ride"}

# ── Auth ─────────────────────────────────────────────────────
@api.post("/auth/register")
async def register(body: RegisterIn):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE phone_number=$1", body.phone_number
        )
        if existing:
            raise HTTPException(status_code=400, detail="Phone number already registered")
        user_id = str(uuid.uuid4())
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO users (id,phone_number,full_name,role,pin_hash) VALUES ($1,$2,$3,$4,$5)",
                user_id, body.phone_number, body.full_name, body.role, hash_pin(body.pin)
            )
            await conn.execute(
                "INSERT INTO wallets (id,user_id) VALUES ($1,$2)",
                str(uuid.uuid4()), user_id
            )
            if body.role == "driver":
                await conn.execute(
                    "INSERT INTO drivers (id,user_id,qr_code,vehicle_plate) VALUES ($1,$2,$3,$4)",
                    str(uuid.uuid4()), user_id, generate_qr_code(),
                    (body.vehicle_plate or "").upper().strip()
                )
            if body.role == "owner":
                await conn.execute(
                    "INSERT INTO fleet_owners (id,user_id,business_name) VALUES ($1,$2,$3)",
                    str(uuid.uuid4()), user_id, body.business_name
                )
    log.info("register | id=%s role=%s", user_id, body.role)
    token = create_access_token(user_id, body.role)
    return {
        "token": token,
        "user": {"id": user_id, "phone_number": body.phone_number,
                 "full_name": body.full_name, "role": body.role}
    }

@api.post("/auth/login")
async def login(body: LoginIn):
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id,phone_number,full_name,role,pin_hash,is_active FROM users WHERE phone_number=$1",
            body.phone_number.strip()
        )
    if not user or not verify_pin(body.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid phone number or PIN")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_access_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {"id": user["id"], "phone_number": user["phone_number"],
                 "full_name": user["full_name"], "role": user["role"]}
    }

@api.post("/auth/admin-login")
async def admin_login(body: AdminLoginIn, request: Request):
    ip = request.client.host if request.client else "unknown"
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id,email,full_name,role,password_hash,is_active FROM users WHERE email=$1",
            body.email.strip().lower()
        )
        if not user or user["role"] not in ADMIN_ROLES:
            await audit(conn, None, "LOGIN_FAILED", metadata={"email": body.email}, ip=ip, success=False)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user["is_active"]:
            await audit(conn, user["id"], "LOGIN_SUSPENDED", ip=ip, success=False)
            raise HTTPException(status_code=403, detail="Account suspended")
        if not user["password_hash"] or not bcrypt.checkpw(
            body.password.encode(), user["password_hash"].encode()
        ):
            await audit(conn, user["id"], "LOGIN_FAILED", ip=ip, success=False)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_access_token(user["id"], user["role"])
        th = token_hash_fn(token)
        await conn.execute(
            "INSERT INTO admin_sessions (id,admin_id,token_hash,ip_address,expires_at) VALUES ($1,$2,$3,$4,NOW()+INTERVAL '7 days')",
            str(uuid.uuid4()), user["id"], th, ip
        )
        await conn.execute("UPDATE users SET last_login=NOW() WHERE id=$1", user["id"])
        await audit(conn, user["id"], "LOGIN_SUCCESS", ip=ip)
    return {
        "token": token,
        "user": {
            "id": user["id"], "email": user["email"],
            "full_name": user["full_name"], "role": user["role"],
            "permissions": ROLE_PERMISSIONS.get(user["role"], [])
        }
    }

@api.post("/auth/admin-logout")
async def admin_logout(request: Request, admin: dict = Depends(require_admin)):
    token = request.headers.get("Authorization", "")[7:]
    th = token_hash_fn(token)
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE admin_sessions SET revoked=TRUE,revoked_at=NOW() WHERE admin_id=$1 AND token_hash=$2",
            admin["id"], th
        )
        await audit(conn, admin["id"], "LOGOUT")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    if user["role"] == "driver":
        async with pool.acquire() as conn:
            drv = await conn.fetchrow("SELECT vehicle_plate FROM drivers WHERE user_id=$1", user["id"])
        if drv: user["vehicle_plate"] = drv["vehicle_plate"]
    return user

@api.post("/auth/change-pin")
async def change_pin(body: ChangePinIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT pin_hash FROM users WHERE id=$1", user["id"])
        if not verify_pin(body.current_pin, row["pin_hash"]):
            raise HTTPException(status_code=400, detail="Current PIN is incorrect")
        await conn.execute("UPDATE users SET pin_hash=$1 WHERE id=$2", hash_pin(body.new_pin), user["id"])
    return {"ok": True}

# ── Driver profile ───────────────────────────────────────────
@api.patch("/driver/profile")
async def update_driver_profile(body: DriverProfileIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    plate = body.vehicle_plate.upper().strip()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE drivers SET vehicle_plate=$1 WHERE user_id=$2", plate, user["id"])
    return {"vehicle_plate": plate}

# ── Wallet ───────────────────────────────────────────────────
@api.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        wallet = await conn.fetchrow("SELECT * FROM wallets WHERE user_id=$1", user["id"])
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
        driver = None
        if user["role"] in ("driver", "owner"):
            driver = await conn.fetchrow(
                "SELECT qr_code,vehicle_plate,total_earnings,is_verified,rating_avg,rating_count FROM drivers WHERE user_id=$1",
                user["id"]
            )
    result = {
        "balance": float(wallet["balance"]),
        "currency": wallet.get("currency", "ZAR"),
        "is_frozen": wallet["is_frozen"],
        "driver_mode_active": wallet.get("driver_mode_active", False),
        "created_at": iso(wallet["created_at"]),
    }
    if driver:
        result["qr_code"] = driver["qr_code"]
        result["vehicle_plate"] = driver["vehicle_plate"]
        result["total_earnings"] = float(driver["total_earnings"])
        result["is_verified"] = driver["is_verified"]
        result["rating_avg"] = float(driver["rating_avg"])
        result["rating_count"] = driver["rating_count"]
    return result

@api.post("/wallet/topup")
async def topup(body: TopUpIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can top up")
    async with pool.acquire() as conn:
        async with conn.transaction():
            wallet = await conn.fetchrow(
                "SELECT balance,is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE", user["id"]
            )
            if not wallet or wallet["is_frozen"]:
                raise HTTPException(status_code=400, detail="Wallet not available")
            new_balance = float(wallet["balance"]) + body.amount
            await conn.execute("UPDATE wallets SET balance=$1 WHERE user_id=$2", new_balance, user["id"])
            txn_id = str(uuid.uuid4()); ref = gen_ref()
            await conn.execute(
                "INSERT INTO transactions (id,reference,type,status,amount,sender_id,receiver_id,note) VALUES ($1,$2,'topup','completed',$3,NULL,$4,'Wallet top-up')",
                txn_id, ref, body.amount, user["id"]
            )
            txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)
    txn = dict(txn_row); txn["amount"] = float(txn["amount"]); txn["created_at"] = iso(txn["created_at"])
    return {"balance": new_balance, "transaction": txn}

@api.get("/wallet/driver/qr/{code}")
async def lookup_driver_by_qr(code: str, _: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        drv = await conn.fetchrow(
            "SELECT d.qr_code,d.vehicle_plate,d.is_verified,d.rating_avg,d.rating_count,d.user_id FROM drivers d WHERE d.qr_code=$1",
            code
        )
        if not drv:
            drv = await conn.fetchrow(
                "SELECT d.qr_code,d.vehicle_plate,d.is_verified,d.rating_avg,d.rating_count,d.user_id FROM drivers d WHERE d.user_id=$1",
                code
            )
        if not drv:
            raise HTTPException(status_code=404, detail="Driver not found")
        user = await conn.fetchrow("SELECT id,full_name,phone_number FROM users WHERE id=$1", drv["user_id"])
    return {
        "user_id": user["id"], "full_name": user["full_name"], "phone_number": user["phone_number"],
        "qr_code": drv["qr_code"], "vehicle_plate": drv["vehicle_plate"],
        "is_verified": drv["is_verified"], "rating_avg": float(drv["rating_avg"]),
        "rating_count": drv["rating_count"],
    }

@api.post("/wallet/transfer")
async def transfer(body: TransferIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can pay")
    if body.driver_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot pay yourself")
    fee = round(body.amount * (PLATFORM_FEE_PERCENT / 100), 2)
    driver_net = round(body.amount - fee, 2)
    async with pool.acquire() as conn:
        drv = await conn.fetchrow("SELECT id FROM drivers WHERE user_id=$1", body.driver_user_id)
        if not drv:
            raise HTTPException(status_code=404, detail="Driver not found")
        async with conn.transaction():
            sender_w = await conn.fetchrow(
                "SELECT balance,is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE", user["id"]
            )
            if not sender_w or sender_w["is_frozen"]:
                raise HTTPException(status_code=400, detail="Wallet not available")
            if float(sender_w["balance"]) < body.amount:
                raise HTTPException(status_code=400, detail="Insufficient balance")
            new_sender_balance = float(sender_w["balance"]) - body.amount
            await conn.execute("UPDATE wallets SET balance=$1 WHERE user_id=$2", new_sender_balance, user["id"])
            await conn.execute("UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", driver_net, body.driver_user_id)
            await conn.execute("UPDATE drivers SET total_earnings=total_earnings+$1 WHERE user_id=$2", driver_net, body.driver_user_id)
            txn_id = str(uuid.uuid4()); ref = gen_ref()
            await conn.execute(
                "INSERT INTO transactions (id,reference,type,status,amount,platform_fee,driver_net,sender_id,receiver_id,note) VALUES ($1,$2,'payment','completed',$3,$4,$5,$6,$7,$8)",
                txn_id, ref, body.amount, fee, driver_net, user["id"], body.driver_user_id, body.note or "Ride payment"
            )
            txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)
    txn = dict(txn_row); txn["amount"] = float(txn["amount"])
    txn["platform_fee"] = float(txn["platform_fee"] or 0)
    txn["driver_net"] = float(txn["driver_net"] or driver_net)
    txn["created_at"] = iso(txn["created_at"])
    return {"balance": new_sender_balance, "transaction": txn,
            "fee_breakdown": {"gross_amount": body.amount, "platform_fee": fee,
                              "platform_fee_percent": PLATFORM_FEE_PERCENT, "driver_net": driver_net}}

@api.get("/wallet/transactions")
async def wallet_transactions(limit: int = 50, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM transactions WHERE sender_id=$1 OR receiver_id=$1 ORDER BY created_at DESC LIMIT $2",
            user["id"], min(limit, 200)
        )
        items = []
        for row in rows:
            t = dict(row); t["amount"] = float(t["amount"]); t["created_at"] = iso(t["created_at"])
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
    bank_name = body.bank_name; account_number = body.account_number; account_name = body.account_name
    async with pool.acquire() as conn:
        if not bank_name or not account_number:
            saved = await conn.fetchrow(
                "SELECT * FROM payout_accounts WHERE user_id=$1 AND type='self'", user["id"]
            )
            if not saved:
                raise HTTPException(status_code=400, detail="No saved payout account found.")
            bank_name = saved["bank_name"]; account_number = saved["account_number"]
            account_name = saved["account_name"] or account_name
        result = await _do_withdraw(conn, user, body.amount, bank_name, account_number, account_name)
    return result

@api.post("/wallet/payout-account")
async def save_payout_account(body: PayoutAccountIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM payout_accounts WHERE user_id=$1 AND type=$2", user["id"], body.type
        )
        if existing:
            await conn.execute(
                "UPDATE payout_accounts SET bank_name=$1,account_number=$2,account_name=$3 WHERE user_id=$4 AND type=$5",
                body.bank_name, body.account_number, body.account_name, user["id"], body.type
            )
        else:
            count = await conn.fetchval("SELECT COUNT(*) FROM payout_accounts WHERE user_id=$1", user["id"])
            if count >= 2:
                raise HTTPException(status_code=400, detail="Maximum 2 payout accounts allowed")
            await conn.execute(
                "INSERT INTO payout_accounts (id,user_id,type,bank_name,account_number,account_name) VALUES ($1,$2,$3,$4,$5,$6)",
                str(uuid.uuid4()), user["id"], body.type, body.bank_name, body.account_number, body.account_name
            )
        row = await conn.fetchrow("SELECT * FROM payout_accounts WHERE user_id=$1 AND type=$2", user["id"], body.type)
    result = dict(row); result["created_at"] = iso(result["created_at"])
    return result

@api.get("/wallet/payout-account")
async def get_payout_accounts(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM payout_accounts WHERE user_id=$1 ORDER BY created_at ASC", user["id"])
    return [{**dict(r), "created_at": iso(r["created_at"])} for r in rows]

@api.post("/wallet/cashup")
async def cashup(body: CashUpIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        account = await conn.fetchrow(
            "SELECT * FROM payout_accounts WHERE user_id=$1 AND type=$2", user["id"], body.type
        )
        if not account:
            raise HTTPException(status_code=400, detail=f"No '{body.type}' payout account saved.")
        result = await _do_withdraw(conn, user, body.amount, account["bank_name"], account["account_number"], account["account_name"])
    return {**result, "payout_type": body.type}

@api.post("/wallet/rate")
async def rate(body: RateIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can rate")
    async with pool.acquire() as conn:
        txn = await conn.fetchrow("SELECT id,type,receiver_id FROM transactions WHERE id=$1 AND sender_id=$2", body.transaction_id, user["id"])
        if not txn: raise HTTPException(status_code=404, detail="Transaction not found")
        if txn["type"] != "payment": raise HTTPException(status_code=400, detail="Can only rate ride payments")
        if txn["receiver_id"] != body.driver_user_id: raise HTTPException(status_code=400, detail="Driver mismatch")
        if await conn.fetchrow("SELECT id FROM ratings WHERE transaction_id=$1", body.transaction_id):
            raise HTTPException(status_code=400, detail="Already rated this transaction")
        await conn.execute(
            "INSERT INTO ratings (id,driver_user_id,passenger_user_id,transaction_id,stars,comment) VALUES ($1,$2,$3,$4,$5,$6)",
            str(uuid.uuid4()), body.driver_user_id, user["id"], body.transaction_id, body.stars, body.comment
        )
        rows = await conn.fetch("SELECT stars FROM ratings WHERE driver_user_id=$1", body.driver_user_id)
        all_stars = [r["stars"] for r in rows]
        new_avg = sum(all_stars) / len(all_stars)
        await conn.execute("UPDATE drivers SET rating_avg=$1,rating_count=$2 WHERE user_id=$3", new_avg, len(all_stars), body.driver_user_id)
    return {"rated": True, "stars": body.stars, "new_avg": round(new_avg, 2)}

# ── KYC ──────────────────────────────────────────────────────
@api.post("/kyc/submit")
async def kyc_submit(
    user: dict = Depends(get_current_user),
    selfie: UploadFile = File(...),
    licence_front: UploadFile = File(...)
):
    selfie_b64 = base64.b64encode(await selfie.read()).decode()
    licence_b64 = base64.b64encode(await licence_front.read()).decode()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id,status FROM kyc_documents WHERE user_id=$1", user["id"])
        if existing and existing["status"] == "approved":
            raise HTTPException(status_code=400, detail="KYC already approved")
        if existing:
            await conn.execute(
                "UPDATE kyc_documents SET selfie_url=$1,licence_front_url=$2,status='pending',submitted_at=NOW(),rejection_reason=NULL WHERE user_id=$3",
                selfie_b64, licence_b64, user["id"]
            )
        else:
            await conn.execute(
                "INSERT INTO kyc_documents (id,user_id,selfie_url,licence_front_url) VALUES ($1,$2,$3,$4)",
                str(uuid.uuid4()), user["id"], selfie_b64, licence_b64
            )
    return {"ok": True, "status": "pending"}

@api.get("/kyc/status")
async def kyc_status(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        doc = await conn.fetchrow("SELECT status,rejection_reason,submitted_at FROM kyc_documents WHERE user_id=$1", user["id"])
    if not doc: return {"status": "not_submitted"}
    return {"status": doc["status"], "rejection_reason": doc["rejection_reason"], "submitted_at": iso(doc["submitted_at"])}

# ── Admin: Dashboard ─────────────────────────────────────────
@api.get("/admin/dashboard")
async def admin_dashboard(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        total_users = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo')")
        total_drivers = await conn.fetchval("SELECT COUNT(*) FROM drivers")
        total_passengers = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role='passenger'")
        total_transactions = await conn.fetchval("SELECT COUNT(*) FROM transactions")
        total_revenue = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed'")
        total_wallet_balance = await conn.fetchval("SELECT COALESCE(SUM(balance),0) FROM wallets")
        total_withdrawn = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='approved'")
        pending_withdrawals = await conn.fetchval("SELECT COUNT(*) FROM withdrawal_requests WHERE status='pending'")
        pending_drivers = await conn.fetchval("SELECT COUNT(*) FROM drivers WHERE is_verified=FALSE")
        pending_kyc = await conn.fetchval("SELECT COUNT(*) FROM kyc_documents WHERE status='pending'")
        flagged_count = await conn.fetchval("SELECT COUNT(*) FROM flagged_accounts WHERE status='open'")
        today_revenue = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE")
        today_txns = await conn.fetchval("SELECT COUNT(*) FROM transactions WHERE DATE(created_at)=CURRENT_DATE")
        today_signups = await conn.fetchval("SELECT COUNT(*) FROM users WHERE DATE(created_at)=CURRENT_DATE")
        suspicious = await conn.fetch(
            "SELECT t.*,su.full_name as sender_name,ru.full_name as receiver_name FROM transactions t LEFT JOIN users su ON su.id=t.sender_id LEFT JOIN users ru ON ru.id=t.receiver_id WHERE t.amount>5000 AND t.created_at>NOW()-INTERVAL '7 days' ORDER BY t.amount DESC LIMIT 5"
        )
        recent = await conn.fetch(
            "SELECT t.*,su.full_name as sender_name,ru.full_name as receiver_name FROM transactions t LEFT JOIN users su ON su.id=t.sender_id LEFT JOIN users ru ON ru.id=t.receiver_id ORDER BY t.created_at DESC LIMIT 10"
        )
        pending_driver_list = await conn.fetch(
            "SELECT d.user_id,d.vehicle_plate,d.created_at,u.full_name,u.phone_number FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.is_verified=FALSE ORDER BY d.created_at DESC"
        )
    return {
        "total_users": total_users, "total_drivers": total_drivers, "total_passengers": total_passengers,
        "total_transactions": total_transactions, "total_revenue": float(total_revenue),
        "total_wallet_balance": float(total_wallet_balance), "total_withdrawn": float(total_withdrawn),
        "pending_withdrawals": pending_withdrawals, "pending_drivers": pending_drivers,
        "pending_kyc": pending_kyc, "flagged_accounts": flagged_count,
        "today_revenue": float(today_revenue), "today_transactions": today_txns, "today_signups": today_signups,
        "suspicious_transactions": [{**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])} for r in suspicious],
        "recent_transactions": [{**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])} for r in recent],
        "pending_driver_list": [{**dict(r), "created_at": iso(r["created_at"])} for r in pending_driver_list],
    }

# ── Admin: Users ─────────────────────────────────────────────
@api.get("/admin/users")
async def admin_users(search: Optional[str] = None, admin: dict = Depends(require_admin)):
    is_super = admin["role"] in ("superadmin", "ceo")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id,phone_number,full_name,role,is_active,flagged,created_at FROM users
               WHERE ($1 OR role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo'))
               AND ($2::text IS NULL OR phone_number ILIKE $2 OR full_name ILIKE $2)
               ORDER BY created_at DESC""",
            is_super, f"%{search}%" if search else None
        )
    return [{**dict(r), "created_at": iso(r["created_at"])} for r in rows]

@api.post("/admin/block/{user_id}")
async def admin_block(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_users"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role,full_name FROM users WHERE id=$1", user_id)
        if not target: raise HTTPException(status_code=404, detail="User not found")
        if target["role"] in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="Cannot block admin accounts")
        await conn.execute("UPDATE users SET is_active=FALSE WHERE id=$1", user_id)
        await audit(conn, admin["id"], "BLOCK_USER", user_id, "user", {"name": target["full_name"]}, request.client.host)
    return {"ok": True}

@api.post("/admin/unblock/{user_id}")
async def admin_unblock(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_users"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role,full_name FROM users WHERE id=$1", user_id)
        if not target: raise HTTPException(status_code=404, detail="User not found")
        if target["role"] in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="Cannot unblock admin accounts this way")
        await conn.execute("UPDATE users SET is_active=TRUE WHERE id=$1", user_id)
        await audit(conn, admin["id"], "UNBLOCK_USER", user_id, "user", {"name": target["full_name"]}, request.client.host)
    return {"ok": True}

@api.post("/admin/reset-pin/{user_id}")
async def admin_reset_pin(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "reset_pin"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role,full_name FROM users WHERE id=$1", user_id)
        if not target: raise HTTPException(status_code=404, detail="User not found")
        if target["role"] in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="Cannot reset admin PIN")
        temp_pin = str(random.randint(1000, 9999))
        await conn.execute("UPDATE users SET pin_hash=$1 WHERE id=$2", hash_pin(temp_pin), user_id)
        await audit(conn, admin["id"], "RESET_PIN", user_id, "user", {"name": target["full_name"]}, request.client.host)
    return {"ok": True, "temporary_pin": temp_pin}

@api.post("/admin/flag/{user_id}")
async def admin_flag(user_id: str, body: FlagAccountIn, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "flag_accounts"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET flagged=TRUE,flag_reason=$1 WHERE id=$2", body.reason, user_id)
        await conn.execute(
            "INSERT INTO flagged_accounts (id,user_id,flagged_by,reason) VALUES ($1,$2,$3,$4)",
            str(uuid.uuid4()), user_id, admin["id"], body.reason
        )
        await audit(conn, admin["id"], "FLAG_ACCOUNT", user_id, "user", {"reason": body.reason}, request.client.host)
    return {"ok": True}

@api.post("/admin/unflag/{user_id}")
async def admin_unflag(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET flagged=FALSE,flag_reason=NULL WHERE id=$1", user_id)
        await conn.execute(
            "UPDATE flagged_accounts SET status='resolved',resolved_by=$1,resolved_at=NOW() WHERE user_id=$2 AND status='open'",
            admin["id"], user_id
        )
        await audit(conn, admin["id"], "UNFLAG_ACCOUNT", user_id, "user", {}, request.client.host)
    return {"ok": True}

@api.get("/admin/flagged")
async def admin_flagged(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT fa.*,u.full_name,u.phone_number,u.role,ab.full_name as flagged_by_name FROM flagged_accounts fa JOIN users u ON u.id=fa.user_id JOIN users ab ON ab.id=fa.flagged_by WHERE fa.status='open' ORDER BY fa.created_at DESC"
        )
    return [{**dict(r), "created_at": iso(r["created_at"])} for r in rows]

# ── Admin: Drivers ───────────────────────────────────────────
@api.get("/admin/drivers")
async def admin_drivers(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT d.*,u.full_name,u.phone_number,k.status as kyc_status FROM drivers d JOIN users u ON u.id=d.user_id LEFT JOIN kyc_documents k ON k.user_id=d.user_id ORDER BY d.created_at DESC"
        )
    return [{
        "user_id": r["user_id"], "full_name": r["full_name"], "phone_number": r["phone_number"],
        "vehicle_plate": r["vehicle_plate"], "total_earnings": float(r["total_earnings"]),
        "is_verified": r["is_verified"], "rating_avg": float(r["rating_avg"]),
        "rating_count": r["rating_count"], "qr_code": r["qr_code"],
        "kyc_status": r["kyc_status"] or "not_submitted", "created_at": iso(r["created_at"])
    } for r in rows]

@api.get("/admin/drivers/{user_id}")
async def admin_driver_detail(user_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT d.*,u.full_name,u.phone_number FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.user_id=$1", user_id)
    if not row: raise HTTPException(status_code=404, detail="Driver not found")
    return {"user_id": row["user_id"], "full_name": row["full_name"], "phone_number": row["phone_number"],
            "vehicle_plate": row["vehicle_plate"], "total_earnings": float(row["total_earnings"]),
            "is_verified": row["is_verified"], "rating_avg": float(row["rating_avg"]),
            "rating_count": row["rating_count"], "qr_code": row["qr_code"], "created_at": iso(row["created_at"])}

@api.post("/admin/verify-driver/{user_id}")
async def admin_verify_driver(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_drivers"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        await conn.execute("UPDATE drivers SET is_verified=TRUE WHERE user_id=$1", user_id)
        await audit(conn, admin["id"], "VERIFY_DRIVER", user_id, "driver", {}, request.client.host)
    return {"ok": True}

# ── Admin: Transactions ──────────────────────────────────────
@api.get("/admin/transactions")
async def admin_transactions(
    type: Optional[str] = None, from_date: Optional[str] = None,
    to_date: Optional[str] = None, search: Optional[str] = None,
    min_amount: Optional[float] = None, max_amount: Optional[float] = None,
    admin: dict = Depends(require_admin)
):
    conditions = []; params = []
    if type: params.append(type); conditions.append(f"t.type=${len(params)}")
    if from_date: params.append(from_date); conditions.append(f"t.created_at>=${len(params)}::date")
    if to_date: params.append(to_date); conditions.append(f"t.created_at<(${len(params)}::date+interval '1 day')")
    if search:
        params.append(f"%{search}%")
        conditions.append(f"(t.reference ILIKE ${len(params)} OR su.full_name ILIKE ${len(params)} OR ru.full_name ILIKE ${len(params)})")
    if min_amount is not None: params.append(min_amount); conditions.append(f"t.amount>=${len(params)}")
    if max_amount is not None: params.append(max_amount); conditions.append(f"t.amount<=${len(params)}")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT t.*,su.full_name as sender_name,ru.full_name as receiver_name
            FROM transactions t
            LEFT JOIN users su ON su.id=t.sender_id
            LEFT JOIN users ru ON ru.id=t.receiver_id
            {where} ORDER BY t.created_at DESC LIMIT 500
        """, *params)
    return [{**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])} for r in rows]

# ── Admin: Withdrawals ───────────────────────────────────────
@api.get("/admin/withdrawals")
async def admin_withdrawals(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT w.*,u.full_name as user_name,u.phone_number,wa.balance as wallet_balance,wa.is_frozen FROM withdrawal_requests w JOIN users u ON u.id=w.user_id LEFT JOIN wallets wa ON wa.user_id=w.user_id ORDER BY w.created_at DESC"
        )
    return [{**dict(r), "amount": float(r["amount"]), "wallet_balance": float(r["wallet_balance"] or 0), "created_at": iso(r["created_at"])} for r in rows]

@api.post("/admin/withdraw/{withdrawal_id}/approve")
async def admin_approve_withdrawal(withdrawal_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "approve_withdrawals"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        req = await conn.fetchrow("SELECT * FROM withdrawal_requests WHERE id=$1 AND status='pending'", withdrawal_id)
        if not req: raise HTTPException(status_code=404, detail="Withdrawal not found")
        if float(req["amount"]) > 10000 and admin["role"] not in ("superadmin", "ceo", "cfo"):
            raise HTTPException(status_code=403, detail="Withdrawals over R10,000 require superadmin approval")
        await conn.execute("UPDATE withdrawal_requests SET status='approved' WHERE id=$1", withdrawal_id)
        await conn.execute(
            "UPDATE transactions SET status='completed' WHERE sender_id=$1 AND type='withdrawal' AND status='pending' AND created_at>NOW()-INTERVAL '1 hour'",
            req["user_id"]
        )
        await audit(conn, admin["id"], "APPROVE_WITHDRAWAL", withdrawal_id, "withdrawal", {"amount": float(req["amount"])}, request.client.host)
    return {"ok": True}

@api.post("/admin/withdraw/{withdrawal_id}/reject")
async def admin_reject_withdrawal(withdrawal_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "approve_withdrawals"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        req = await conn.fetchrow("SELECT user_id,amount FROM withdrawal_requests WHERE id=$1 AND status='pending'", withdrawal_id)
        if not req: raise HTTPException(status_code=404, detail="Withdrawal not found or already processed")
        async with conn.transaction():
            await conn.execute("UPDATE withdrawal_requests SET status='rejected' WHERE id=$1", withdrawal_id)
            await conn.execute("UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", req["amount"], req["user_id"])
            await audit(conn, admin["id"], "REJECT_WITHDRAWAL", withdrawal_id, "withdrawal", {"amount": float(req["amount"]), "refunded": True}, request.client.host)
    return {"ok": True}

# ── Admin: Payout accounts ───────────────────────────────────
@api.get("/admin/payout-accounts")
async def admin_payout_accounts(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT p.*,u.full_name as driver_name FROM payout_accounts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC")
    return [{**dict(r), "created_at": iso(r["created_at"])} for r in rows]

# ── Admin: KYC ───────────────────────────────────────────────
@api.get("/admin/kyc")
async def admin_kyc_list(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "review_kyc"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT k.*,u.full_name,u.phone_number FROM kyc_documents k JOIN users u ON u.id=k.user_id ORDER BY k.submitted_at DESC")
    return [{**dict(r), "submitted_at": iso(r["submitted_at"]), "reviewed_at": iso(r["reviewed_at"]) if r["reviewed_at"] else None,
             "selfie_url": None, "licence_front_url": None} for r in rows]

@api.get("/admin/kyc/{user_id}")
async def admin_kyc_detail(user_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "review_kyc"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        doc = await conn.fetchrow("SELECT * FROM kyc_documents WHERE user_id=$1", user_id)
    if not doc: raise HTTPException(status_code=404, detail="KYC not found")
    return {**dict(doc), "submitted_at": iso(doc["submitted_at"]), "reviewed_at": iso(doc["reviewed_at"]) if doc["reviewed_at"] else None}

@api.post("/admin/kyc/{user_id}/review")
async def admin_kyc_review(user_id: str, body: KYCReviewIn, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "review_kyc"):
        raise HTTPException(status_code=403, detail="Permission denied")
    if body.action == "reject" and not body.rejection_reason:
        raise HTTPException(status_code=400, detail="Rejection reason required")
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE kyc_documents SET status=$1,reviewed_by=$2,reviewed_at=NOW(),rejection_reason=$3 WHERE user_id=$4",
            body.action + "d", admin["id"], body.rejection_reason, user_id
        )
        if body.action == "approve":
            await conn.execute("UPDATE drivers SET is_verified=TRUE WHERE user_id=$1", user_id)
        await audit(conn, admin["id"], f"KYC_{body.action.upper()}", user_id, "kyc", {"reason": body.rejection_reason}, request.client.host)
    return {"ok": True}

# ── Admin: Analytics ─────────────────────────────────────────
@api.get("/admin/analytics")
async def admin_analytics(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_analytics"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        daily = await conn.fetch("SELECT DATE(created_at) as date,SUM(amount) as amount,COUNT(*) as count FROM transactions WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date ASC")
        weekly = await conn.fetch("SELECT DATE_TRUNC('week',created_at) as week,SUM(amount) as amount FROM transactions WHERE type='payment' AND status='completed' AND created_at>=NOW()-INTERVAL '12 weeks' GROUP BY DATE_TRUNC('week',created_at) ORDER BY week ASC")
        leaderboard = await conn.fetch("SELECT u.full_name as name,d.total_earnings as earnings FROM drivers d JOIN users u ON u.id=d.user_id ORDER BY d.total_earnings DESC LIMIT 10")
        by_type = await conn.fetch("SELECT type,COUNT(*) as count,SUM(amount) as total FROM transactions GROUP BY type")
        top_passengers = await conn.fetch("SELECT u.full_name as name,COUNT(t.id) as txn_count,SUM(t.amount) as total_spent FROM transactions t JOIN users u ON u.id=t.sender_id WHERE t.type='payment' GROUP BY u.full_name ORDER BY total_spent DESC LIMIT 5")
        withdrawal_trend = await conn.fetch("SELECT DATE(created_at) as date,SUM(amount) as amount,COUNT(*) as count FROM withdrawal_requests WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date ASC")
    return {
        "daily_volume": [{"date": str(r["date"]), "amount": float(r["amount"]), "count": r["count"]} for r in daily],
        "weekly_revenue": [{"week": str(r["week"])[:10], "amount": float(r["amount"])} for r in weekly],
        "driver_leaderboard": [{"name": r["name"], "earnings": float(r["earnings"])} for r in leaderboard],
        "transactions_by_type": [{"type": r["type"], "count": r["count"], "total": float(r["total"])} for r in by_type],
        "top_passengers": [{"name": r["name"], "txn_count": r["txn_count"], "total_spent": float(r["total_spent"])} for r in top_passengers],
        "withdrawal_trend": [{"date": str(r["date"]), "amount": float(r["amount"]), "count": r["count"]} for r in withdrawal_trend],
    }

# ── Admin: Audit log ─────────────────────────────────────────
@api.get("/admin/audit-logs")
async def admin_audit_logs(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_audit"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT al.*,u.full_name as admin_name,u.role as admin_role FROM audit_logs al LEFT JOIN users u ON u.id=al.admin_id ORDER BY al.created_at DESC LIMIT 500")
    return [{**dict(r), "metadata": json.loads(r["metadata"]) if r["metadata"] else {}, "created_at": iso(r["created_at"])} for r in rows]

# ── Admin: Support lookup ────────────────────────────────────
@api.get("/admin/support/user/{phone}")
async def support_user_lookup(phone: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id,phone_number,full_name,role,is_active,created_at FROM users WHERE phone_number ILIKE $1", f"%{phone}%")
        if not user: raise HTTPException(status_code=404, detail="User not found")
        wallet = await conn.fetchrow("SELECT balance,is_frozen FROM wallets WHERE user_id=$1", user["id"])
        txns = await conn.fetch("SELECT reference,type,status,amount,created_at FROM transactions WHERE sender_id=$1 OR receiver_id=$1 ORDER BY created_at DESC LIMIT 10", user["id"])
    return {
        "user": {**dict(user), "created_at": iso(user["created_at"])},
        "wallet": {"balance": float(wallet["balance"]) if wallet else 0, "is_frozen": wallet["is_frozen"] if wallet else False},
        "recent_transactions": [{**dict(t), "amount": float(t["amount"]), "created_at": iso(t["created_at"])} for t in txns]
    }

# ── Admin: Export ────────────────────────────────────────────
@api.get("/admin/export/transactions")
async def export_transactions(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "export_data"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT t.reference,t.type,t.status,t.amount,t.currency,su.full_name as sender,ru.full_name as receiver,t.note,t.created_at FROM transactions t LEFT JOIN users su ON su.id=t.sender_id LEFT JOIN users ru ON ru.id=t.receiver_id ORDER BY t.created_at DESC")
        await audit(conn, admin["id"], "EXPORT_TRANSACTIONS", None, None, {"count": len(rows)}, request.client.host)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Reference","Type","Status","Amount","Currency","Sender","Receiver","Note","Date"])
    for r in rows:
        writer.writerow([r["reference"],r["type"],r["status"],float(r["amount"]),r["currency"],r["sender"] or "",r["receiver"] or "",r["note"] or "",iso(r["created_at"])])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=transactions.csv"})

@api.get("/admin/export/users")
async def export_users(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "export_data"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT u.full_name,u.phone_number,u.role,u.is_active,COALESCE(w.balance,0) as balance,u.created_at FROM users u LEFT JOIN wallets w ON w.user_id=u.id WHERE u.role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo') ORDER BY u.created_at DESC")
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Full Name","Phone","Role","Active","Balance","Joined"])
    for r in rows:
        writer.writerow([r["full_name"],r["phone_number"],r["role"],r["is_active"],float(r["balance"]),iso(r["created_at"])])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=users.csv"})

# ── Superadmin: Admins ───────────────────────────────────────
@api.get("/superadmin/admins")
async def superadmin_list_admins(admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT u.id,u.full_name,u.email,u.role,u.is_active,u.last_login,u.created_at,u.created_by,cb.full_name as created_by_name FROM users u LEFT JOIN users cb ON cb.id=u.created_by WHERE u.role IN ('admin','superadmin','finance','support','ceo','cto','cfo') ORDER BY u.created_at DESC"
        )
    return [{**dict(r), "last_login": iso(r["last_login"]) if r["last_login"] else None, "created_at": iso(r["created_at"])} for r in rows]

@api.post("/superadmin/create-admin")
async def superadmin_create_admin(body: CreateAdminIn, request: Request, admin: dict = Depends(require_superadmin)):
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email=$1", body.email.lower())
        if existing: raise HTTPException(status_code=400, detail="Email already exists")
        user_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO users (id,phone_number,full_name,role,pin_hash,email,password_hash,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            user_id, f"admin_{user_id[:8]}", body.full_name, body.role, hash_pin("0000"), body.email.lower(), hashed, admin["id"]
        )
        await audit(conn, admin["id"], "CREATE_ADMIN", user_id, "admin", {"email": body.email, "role": body.role}, request.client.host)
    return {"ok": True, "id": user_id}

@api.patch("/superadmin/admins/{user_id}")
async def superadmin_update_admin(user_id: str, body: UpdateAdminIn, request: Request, admin: dict = Depends(require_superadmin)):
    if user_id == admin["id"]: raise HTTPException(status_code=400, detail="Cannot edit your own account")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role,full_name,email FROM users WHERE id=$1", user_id)
        if not target: raise HTTPException(status_code=404, detail="Admin not found")
        if target["role"] == "superadmin": raise HTTPException(status_code=403, detail="Cannot modify superadmin")
        changes = {}
        if body.role and body.role != target["role"]: changes["role"] = body.role
        if body.full_name and body.full_name != target["full_name"]: changes["full_name"] = body.full_name
        if body.email and body.email != target["email"]:
            ex = await conn.fetchrow("SELECT id FROM users WHERE email=$1 AND id!=$2", body.email.lower(), user_id)
            if ex: raise HTTPException(status_code=400, detail="Email already taken")
            changes["email"] = body.email.lower()
        if not changes: return {"ok": True, "message": "No changes"}
        set_clauses = []; params = []
        for k, v in changes.items():
            params.append(v); set_clauses.append(f"{k}=${len(params)}")
        params.append(user_id)
        await conn.execute(f"UPDATE users SET {', '.join(set_clauses)} WHERE id=${len(params)}", *params)
        await audit(conn, admin["id"], "UPDATE_ADMIN", user_id, "admin", {"changes": changes}, request.client.host)
    return {"ok": True, "changes": changes}

@api.post("/superadmin/admins/{user_id}/suspend")
async def superadmin_suspend_admin(user_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    if user_id == admin["id"]: raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role FROM users WHERE id=$1", user_id)
        if not target or target["role"] == "superadmin": raise HTTPException(status_code=403, detail="Cannot suspend superadmin")
        await conn.execute("UPDATE users SET is_active=FALSE,suspended_at=NOW() WHERE id=$1", user_id)
        await conn.execute("UPDATE admin_sessions SET revoked=TRUE,revoked_at=NOW() WHERE admin_id=$1", user_id)
        await audit(conn, admin["id"], "SUSPEND_ADMIN", user_id, "admin", {}, request.client.host)
    return {"ok": True}

@api.post("/superadmin/admins/{user_id}/reactivate")
async def superadmin_reactivate_admin(user_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET is_active=TRUE,suspended_at=NULL WHERE id=$1", user_id)
        await audit(conn, admin["id"], "REACTIVATE_ADMIN", user_id, "admin", {}, request.client.host)
    return {"ok": True}

@api.delete("/superadmin/admins/{user_id}")
async def superadmin_delete_admin(user_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    if user_id == admin["id"]: raise HTTPException(status_code=400, detail="Cannot delete yourself")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role FROM users WHERE id=$1", user_id)
        if not target or target["role"] == "superadmin": raise HTTPException(status_code=403, detail="Cannot delete superadmin")
        await conn.execute("UPDATE admin_sessions SET revoked=TRUE WHERE admin_id=$1", user_id)
        await conn.execute("DELETE FROM users WHERE id=$1 AND role!='superadmin'", user_id)
        await audit(conn, admin["id"], "DELETE_ADMIN", user_id, "admin", {}, request.client.host)
    return {"ok": True}

@api.post("/superadmin/admins/{user_id}/force-logout")
async def superadmin_force_logout(user_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE admin_sessions SET revoked=TRUE,revoked_at=NOW() WHERE admin_id=$1", user_id)
        await audit(conn, admin["id"], "FORCE_LOGOUT", user_id, "admin", {}, request.client.host)
    return {"ok": True}

@api.post("/superadmin/admins/{user_id}/reset-password")
async def superadmin_reset_admin_password(user_id: str, body: ResetAdminPasswordIn, request: Request, admin: dict = Depends(require_superadmin)):
    if user_id == admin["id"]: raise HTTPException(status_code=400, detail="Use change-password for your own account")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role,full_name FROM users WHERE id=$1", user_id)
        if not target: raise HTTPException(status_code=404, detail="Admin not found")
        if target["role"] == "superadmin": raise HTTPException(status_code=403, detail="Cannot reset superadmin password")
        hashed = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
        await conn.execute("UPDATE users SET password_hash=$1 WHERE id=$2", hashed, user_id)
        await conn.execute("UPDATE admin_sessions SET revoked=TRUE,revoked_at=NOW() WHERE admin_id=$1", user_id)
        await audit(conn, admin["id"], "RESET_ADMIN_PASSWORD", user_id, "admin", {"name": target["full_name"]}, request.client.host)
    return {"ok": True}

# ── Superadmin: Sessions ─────────────────────────────────────
@api.get("/superadmin/sessions")
async def superadmin_sessions(admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT s.*,u.full_name,u.email,u.role FROM admin_sessions s JOIN users u ON u.id=s.admin_id WHERE s.revoked=FALSE AND s.expires_at>NOW() ORDER BY s.created_at DESC")
    return [{**dict(r), "created_at": iso(r["created_at"]), "expires_at": iso(r["expires_at"])} for r in rows]

@api.post("/superadmin/sessions/{session_id}/revoke")
async def superadmin_revoke_session(session_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE admin_sessions SET revoked=TRUE,revoked_at=NOW() WHERE id=$1", session_id)
        await audit(conn, admin["id"], "REVOKE_SESSION", session_id, "session", {}, request.client.host)
    return {"ok": True}

# ── Superadmin: Wallet controls ──────────────────────────────
@api.post("/superadmin/freeze-wallet/{user_id}")
async def superadmin_freeze_wallet(user_id: str, body: FreezeWalletIn, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE wallets SET is_frozen=TRUE,frozen_reason=$1,frozen_at=NOW() WHERE user_id=$2", body.reason, user_id)
        await audit(conn, admin["id"], "FREEZE_WALLET", user_id, "wallet", {"reason": body.reason}, request.client.host)
    return {"ok": True}

@api.post("/superadmin/unfreeze-wallet/{user_id}")
async def superadmin_unfreeze_wallet(user_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE wallets SET is_frozen=FALSE,frozen_reason=NULL,frozen_at=NULL WHERE user_id=$1", user_id)
        await audit(conn, admin["id"], "UNFREEZE_WALLET", user_id, "wallet", {}, request.client.host)
    return {"ok": True}

@api.post("/superadmin/transfer-funds")
async def superadmin_transfer_funds(body: TransferFundsIn, request: Request, admin: dict = Depends(require_superadmin)):
    if body.from_user_id == body.to_user_id: raise HTTPException(status_code=400, detail="Cannot transfer to same account")
    async with pool.acquire() as conn:
        async with conn.transaction():
            sender_w = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE", body.from_user_id)
            if not sender_w: raise HTTPException(status_code=404, detail="Sender wallet not found")
            if float(sender_w["balance"]) < body.amount: raise HTTPException(status_code=400, detail="Insufficient balance")
            await conn.execute("UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", body.amount, body.from_user_id)
            await conn.execute("UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", body.amount, body.to_user_id)
            ref = gen_ref()
            txn_id = str(uuid.uuid4())
            await conn.execute("INSERT INTO transactions (id,reference,type,status,amount,sender_id,receiver_id,note) VALUES ($1,$2,'payment','completed',$3,$4,$5,$6)",
                txn_id, ref, body.amount, body.from_user_id, body.to_user_id, body.note or "Admin fund transfer")
            await audit(conn, admin["id"], "TRANSFER_FUNDS", txn_id, "transaction", {"from": body.from_user_id, "to": body.to_user_id, "amount": body.amount}, request.client.host)
    return {"ok": True, "reference": ref}

@api.post("/superadmin/adjust-balance")
async def superadmin_adjust_balance(body: AdjustBalanceIn, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        async with conn.transaction():
            wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE", body.user_id)
            if not wallet: raise HTTPException(status_code=404, detail="Wallet not found")
            new_balance = float(wallet["balance"]) + body.amount
            if new_balance < 0: raise HTTPException(status_code=400, detail="Balance cannot go below zero")
            await conn.execute("UPDATE wallets SET balance=$1 WHERE user_id=$2", new_balance, body.user_id)
            ref = gen_ref()
            await conn.execute("INSERT INTO transactions (id,reference,type,status,amount,sender_id,receiver_id,note) VALUES ($1,$2,$3,'completed',$4,NULL,$5,$6)",
                str(uuid.uuid4()), ref, "topup" if body.amount > 0 else "withdrawal", abs(body.amount), body.user_id, body.note or f"Admin adjustment {body.amount:+.2f}")
            await audit(conn, admin["id"], "ADJUST_BALANCE", body.user_id, "wallet", {"amount": body.amount, "new_balance": new_balance}, request.client.host)
    return {"ok": True, "new_balance": new_balance}

@api.get("/superadmin/wallet/{user_id}")
async def superadmin_get_wallet(user_id: str, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        wallet = await conn.fetchrow("SELECT * FROM wallets WHERE user_id=$1", user_id)
        user = await conn.fetchrow("SELECT id,full_name,phone_number,role FROM users WHERE id=$1", user_id)
        txns = await conn.fetch("SELECT * FROM transactions WHERE sender_id=$1 OR receiver_id=$1 ORDER BY created_at DESC LIMIT 20", user_id)
    if not wallet or not user: raise HTTPException(status_code=404, detail="Not found")
    return {
        "user": dict(user),
        "wallet": {**dict(wallet), "balance": float(wallet["balance"]), "created_at": iso(wallet["created_at"])},
        "recent_transactions": [{**dict(t), "amount": float(t["amount"]), "created_at": iso(t["created_at"])} for t in txns]
    }

@api.delete("/superadmin/users/{user_id}")
async def superadmin_delete_user(user_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role,full_name FROM users WHERE id=$1", user_id)
        if not target: raise HTTPException(status_code=404, detail="User not found")
        if target["role"] in ADMIN_ROLES: raise HTTPException(status_code=403, detail="Cannot delete admin accounts here")
        async with conn.transaction():
            await conn.execute("DELETE FROM ratings WHERE driver_user_id=$1 OR passenger_user_id=$1", user_id)
            await conn.execute("DELETE FROM withdrawal_requests WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM payout_accounts WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM kyc_documents WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM flagged_accounts WHERE user_id=$1", user_id)
            await conn.execute("UPDATE transactions SET sender_id=NULL WHERE sender_id=$1", user_id)
            await conn.execute("UPDATE transactions SET receiver_id=NULL WHERE receiver_id=$1", user_id)
            await conn.execute("DELETE FROM owner_drivers WHERE driver_user_id=$1", user_id)
            await conn.execute("DELETE FROM drivers WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM wallets WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM users WHERE id=$1", user_id)
            await audit(conn, admin["id"], "DELETE_USER", user_id, "user", {"name": target["full_name"]}, request.client.host)
    return {"ok": True}

# ── Owner app ────────────────────────────────────────────────
@api.get("/owner/dashboard")
async def owner_dashboard(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        drivers = await conn.fetch(
            "SELECT od.driver_user_id,u.full_name,u.phone_number,d.qr_code,d.vehicle_plate,d.total_earnings,d.rating_avg,d.rating_count,d.is_verified FROM owner_drivers od JOIN users u ON u.id=od.driver_user_id JOIN drivers d ON d.user_id=od.driver_user_id WHERE od.owner_id=$1",
            owner["id"]
        )
        driver_ids = [d["driver_user_id"] for d in drivers]
        total_earnings = 0; today_revenue = 0
        if driver_ids:
            total_earnings = await conn.fetchval("SELECT COALESCE(SUM(total_earnings),0) FROM drivers WHERE user_id=ANY($1::text[])", driver_ids)
            today_revenue = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE receiver_id=ANY($1::text[]) AND type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE", driver_ids)
    return {
        "total_earnings": float(total_earnings or 0), "today_revenue": float(today_revenue or 0),
        "driver_count": len(drivers),
        "drivers": [{"user_id": d["driver_user_id"], "full_name": d["full_name"], "phone_number": d["phone_number"],
                     "qr_code": d["qr_code"], "vehicle_plate": d["vehicle_plate"], "total_earnings": float(d["total_earnings"] or 0),
                     "rating_avg": float(d["rating_avg"] or 0), "rating_count": d["rating_count"] or 0, "is_verified": d["is_verified"]} for d in drivers]
    }

@api.post("/owner/drivers/link")
async def owner_link_driver(body: LinkDriverIn, user: dict = Depends(require_owner)):
    code = body.driver_code.strip().upper()
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        drv = await conn.fetchrow("SELECT d.user_id,u.full_name,u.phone_number,d.vehicle_plate,d.qr_code FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.qr_code=$1 OR d.user_id=$1", code)
        if not drv: raise HTTPException(status_code=404, detail="Driver not found")
        existing = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], drv["user_id"])
        if existing: raise HTTPException(status_code=400, detail="Driver already linked")
        await conn.execute("INSERT INTO owner_drivers (id,owner_id,driver_user_id) VALUES ($1,$2,$3)", str(uuid.uuid4()), owner["id"], drv["user_id"])
    return {"ok": True, "driver": dict(drv)}

@api.delete("/owner/drivers/{driver_user_id}")
async def owner_unlink_driver(driver_user_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        await conn.execute("DELETE FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], driver_user_id)
    return {"ok": True}

@api.get("/owner/drivers/{driver_user_id}/earnings")
async def owner_driver_earnings(driver_user_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], driver_user_id)
        if not link: raise HTTPException(status_code=403, detail="Driver not in fleet")
        driver = await conn.fetchrow("SELECT d.*,u.full_name,u.phone_number FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.user_id=$1", driver_user_id)
        if not driver: raise HTTPException(status_code=404, detail="Driver not found")
        today_trips = await conn.fetch("SELECT t.reference,t.amount,t.driver_net,t.created_at,su.full_name as passenger_name FROM transactions t LEFT JOIN users su ON su.id=t.sender_id WHERE t.receiver_id=$1 AND t.type='payment' AND DATE(t.created_at)=CURRENT_DATE ORDER BY t.created_at DESC", driver_user_id)
        all_trips = await conn.fetch("SELECT t.reference,t.amount,t.driver_net,t.created_at,su.full_name as passenger_name FROM transactions t LEFT JOIN users su ON su.id=t.sender_id WHERE t.receiver_id=$1 AND t.type='payment' ORDER BY t.created_at DESC LIMIT 50", driver_user_id)
        today_total = sum(float(t["driver_net"] or t["amount"] or 0) for t in today_trips)
    return {
        "driver": {"user_id": driver["user_id"], "full_name": driver["full_name"], "phone_number": driver["phone_number"],
                   "vehicle_plate": driver["vehicle_plate"], "total_earnings": float(driver["total_earnings"] or 0),
                   "qr_code": driver["qr_code"], "rating_avg": float(driver["rating_avg"] or 0), "rating_count": driver["rating_count"] or 0},
        "today_total": today_total, "today_trip_count": len(today_trips),
        "today_trips": [{"reference": t["reference"], "amount": float(t["amount"]), "driver_net": float(t["driver_net"] or t["amount"]), "passenger": t["passenger_name"] or "Passenger", "created_at": iso(t["created_at"])} for t in today_trips],
        "all_trips": [{"reference": t["reference"], "amount": float(t["amount"]), "driver_net": float(t["driver_net"] or t["amount"]), "passenger": t["passenger_name"] or "Passenger", "created_at": iso(t["created_at"])} for t in all_trips],
    }

@api.get("/owner/transactions")
async def owner_transactions(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        driver_ids_rows = await conn.fetch("SELECT driver_user_id FROM owner_drivers WHERE owner_id=$1", owner["id"])
        ids = [d["driver_user_id"] for d in driver_ids_rows]
        if not ids: return []
        rows = await conn.fetch(
            "SELECT t.*,u.full_name as driver_name,d.vehicle_plate,su.full_name as passenger_name FROM transactions t JOIN drivers d ON d.user_id=t.receiver_id JOIN users u ON u.id=t.receiver_id LEFT JOIN users su ON su.id=t.sender_id WHERE t.receiver_id=ANY($1::text[]) AND t.type='payment' ORDER BY t.created_at DESC LIMIT 100",
            ids
        )
    return [{"id": r["id"], "reference": r["reference"], "driver_name": r["driver_name"], "vehicle_plate": r["vehicle_plate"],
             "passenger": r["passenger_name"] or "Passenger", "gross_amount": float(r["amount"] or 0),
             "driver_net": float(r["driver_net"] or r["amount"] or 0), "platform_fee": float(r["platform_fee"] or 0),
             "created_at": iso(r["created_at"])} for r in rows]

@api.post("/owner/toggle-driver-mode")
async def owner_toggle_driver_mode(body: dict, user: dict = Depends(require_owner)):
    active = body.get("active", False)
    async with pool.acquire() as conn:
        if active:
            kyc = await conn.fetchrow("SELECT status FROM kyc_documents WHERE user_id=$1", user["id"])
            if not kyc or kyc["status"] != "approved":
                raise HTTPException(status_code=403, detail="KYC approval required to activate driver mode")
            existing_driver = await conn.fetchrow("SELECT id FROM drivers WHERE user_id=$1", user["id"])
            if not existing_driver:
                await conn.execute("INSERT INTO drivers (id,user_id,qr_code,vehicle_plate,is_verified) VALUES ($1,$2,$3,$4,TRUE)",
                    str(uuid.uuid4()), user["id"], generate_qr_code(), "")
        await conn.execute("UPDATE wallets SET driver_mode_active=$1 WHERE user_id=$2", active, user["id"])
    return {"ok": True, "driver_mode_active": active}


# ════════════════════════════════════════════════════════════════
# NEW FEATURES — All 10 sections
# ════════════════════════════════════════════════════════════════


# ── New DB Tables (add to CREATE_TABLES_SQL manually or run separately) ──
NEW_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_by TEXT REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    target TEXT DEFAULT 'all',
    target_role TEXT,
    target_user_id TEXT REFERENCES users(id),
    sent_by TEXT REFERENCES users(id),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    read_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY,
    transaction_id TEXT REFERENCES transactions(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    resolved_by TEXT REFERENCES users(id),
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blacklist (
    id TEXT PRIMARY KEY,
    phone_number TEXT,
    reason TEXT NOT NULL,
    added_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_alerts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'warning',
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

# Auto-create new tables on startup
async def create_new_tables():
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute(NEW_TABLES_SQL)
                await conn.execute(DRIVER_ROUTES_TABLE)
                # Seed default config if empty
                count = await conn.fetchval("SELECT COUNT(*) FROM system_config")
                if count == 0:
                    defaults = [
                        ("platform_fee_percent", "3.0", "Platform fee percentage on transfers"),
                        ("min_transfer_amount", "1.0", "Minimum transfer amount in ZAR"),
                        ("max_transfer_amount", "10000.0", "Maximum single transfer amount in ZAR"),
                        ("min_withdrawal_amount", "50.0", "Minimum withdrawal amount in ZAR"),
                        ("max_withdrawal_amount", "50000.0", "Maximum withdrawal amount in ZAR"),
                        ("withdrawal_daily_limit", "100000.0", "Maximum daily withdrawal total per user"),
                        ("topup_max_amount", "10000.0", "Maximum single top-up amount in ZAR"),
                        ("kyc_required_for_payments", "true", "Require KYC approval before driver can receive payments"),
                        ("maintenance_mode", "false", "Put app in maintenance mode"),
                        ("app_version_android", "1.0.0", "Minimum required Android app version"),
                        ("app_version_ios", "1.0.0", "Minimum required iOS app version"),
                        ("support_whatsapp", "27832789333", "Support WhatsApp number"),
                        ("support_email", "support@tagnride.app", "Support email address"),
                    ]
                    for key, value, desc in defaults:
                        await conn.execute(
                            "INSERT INTO system_config (key,value,description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                            key, value, desc
                        )
        except Exception as e:
            print("New tables error:", e)

# ── Models for new features ──────────────────────────────────
class SendNotificationIn(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    message: str = Field(min_length=5, max_length=500)
    type: str = Field(default="info")
    target: str = Field(default="all")
    target_role: Optional[str] = None
    target_user_id: Optional[str] = None

class UpdateConfigIn(BaseModel):
    value: str = Field(min_length=1, max_length=200)

class DisputeIn(BaseModel):
    transaction_id: str
    reason: str = Field(min_length=10, max_length=500)

class ResolveDisputeIn(BaseModel):
    resolution: str = Field(min_length=5, max_length=500)

class BlacklistIn(BaseModel):
    phone_number: str = Field(min_length=7, max_length=20)
    reason: str = Field(min_length=5, max_length=200)

# ── 1. COMPLIANCE & RISK ─────────────────────────────────────
@api.get("/admin/compliance/alerts")
async def compliance_alerts(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        # Velocity checks — users with more than 10 transactions in last hour
        velocity = await conn.fetch("""
            SELECT u.full_name, u.phone_number, u.id as user_id,
                   COUNT(t.id) as txn_count, SUM(t.amount) as total_amount
            FROM transactions t
            JOIN users u ON u.id = t.sender_id
            WHERE t.created_at > NOW() - INTERVAL '1 hour'
            AND t.type = 'payment'
            GROUP BY u.id, u.full_name, u.phone_number
            HAVING COUNT(t.id) > 5
            ORDER BY txn_count DESC
        """)
        # Large transactions in last 24h
        large_txns = await conn.fetch("""
            SELECT t.*, su.full_name as sender_name, ru.full_name as receiver_name
            FROM transactions t
            LEFT JOIN users su ON su.id = t.sender_id
            LEFT JOIN users ru ON ru.id = t.receiver_id
            WHERE t.amount > 5000 AND t.created_at > NOW() - INTERVAL '24 hours'
            ORDER BY t.amount DESC LIMIT 20
        """)
        # Round amount alerts (possible structuring)
        round_amounts = await conn.fetch("""
            SELECT t.*, su.full_name as sender_name
            FROM transactions t
            LEFT JOIN users su ON su.id = t.sender_id
            WHERE t.amount % 1000 = 0 AND t.amount >= 1000
            AND t.created_at > NOW() - INTERVAL '24 hours'
            ORDER BY t.created_at DESC LIMIT 10
        """)
        # Blacklisted users trying to transact
        blacklist_count = await conn.fetchval("SELECT COUNT(*) FROM blacklist")
        flagged_count = await conn.fetchval("SELECT COUNT(*) FROM flagged_accounts WHERE status='open'")
    return {
        "velocity_alerts": [{**dict(r), "total_amount": float(r["total_amount"] or 0)} for r in velocity],
        "large_transactions": [{**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])} for r in large_txns],
        "round_amount_alerts": [{**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])} for r in round_amounts],
        "blacklist_count": blacklist_count,
        "flagged_count": flagged_count,
    }

@api.get("/admin/blacklist")
async def get_blacklist(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT b.*,u.full_name as added_by_name FROM blacklist b LEFT JOIN users u ON u.id=b.added_by ORDER BY b.created_at DESC")
    return [{**dict(r), "created_at": iso(r["created_at"])} for r in rows]

@api.post("/admin/blacklist")
async def add_to_blacklist(body: BlacklistIn, request: Request, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO blacklist (id,phone_number,reason,added_by) VALUES ($1,$2,$3,$4)",
            str(uuid.uuid4()), body.phone_number, body.reason, admin["id"]
        )
        await audit(conn, admin["id"], "BLACKLIST_ADD", None, "blacklist", {"phone": body.phone_number}, request.client.host)
    return {"ok": True}

@api.delete("/admin/blacklist/{blacklist_id}")
async def remove_from_blacklist(blacklist_id: str, request: Request, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM blacklist WHERE id=$1", blacklist_id)
        await audit(conn, admin["id"], "BLACKLIST_REMOVE", blacklist_id, "blacklist", {}, request.client.host)
    return {"ok": True}

# ── 2. FINANCIAL REPORTING ───────────────────────────────────
@api.get("/admin/reports/financial")
async def financial_report(
    period: str = "monthly",
    admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "view_analytics"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        # P&L
        total_revenue = await conn.fetchval("SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed'")
        this_month_revenue = await conn.fetchval("SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())")
        last_month_revenue = await conn.fetchval("SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW()-INTERVAL '1 month')")
        # Monthly breakdown
        monthly = await conn.fetch("""
            SELECT DATE_TRUNC('month',created_at) as month,
                   SUM(amount) as gross_volume,
                   SUM(platform_fee) as fee_revenue,
                   COUNT(*) as txn_count,
                   SUM(driver_net) as driver_payouts
            FROM transactions WHERE type='payment' AND status='completed'
            GROUP BY DATE_TRUNC('month',created_at)
            ORDER BY month DESC LIMIT 12
        """)
        # Total wallets
        total_wallet_balance = await conn.fetchval("SELECT COALESCE(SUM(balance),0) FROM wallets")
        total_withdrawn = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='approved'")
        # Top earning drivers
        top_drivers = await conn.fetch("""
            SELECT u.full_name, u.phone_number, d.total_earnings,
                   COUNT(t.id) as trip_count
            FROM drivers d
            JOIN users u ON u.id=d.user_id
            LEFT JOIN transactions t ON t.receiver_id=d.user_id AND t.type='payment'
            GROUP BY u.full_name, u.phone_number, d.total_earnings
            ORDER BY d.total_earnings DESC LIMIT 10
        """)
        # Daily revenue last 30 days
        daily_fees = await conn.fetch("""
            SELECT DATE(created_at) as date, SUM(platform_fee) as fee_revenue, SUM(amount) as gross_volume
            FROM transactions WHERE type='payment' AND status='completed'
            AND created_at >= NOW()-INTERVAL '30 days'
            GROUP BY DATE(created_at) ORDER BY date ASC
        """)
    return {
        "summary": {
            "total_platform_revenue": float(total_revenue),
            "this_month_revenue": float(this_month_revenue),
            "last_month_revenue": float(last_month_revenue),
            "total_wallet_balance": float(total_wallet_balance),
            "total_withdrawn": float(total_withdrawn),
        },
        "monthly_breakdown": [{
            "month": str(r["month"])[:7],
            "gross_volume": float(r["gross_volume"] or 0),
            "fee_revenue": float(r["fee_revenue"] or 0),
            "txn_count": r["txn_count"],
            "driver_payouts": float(r["driver_payouts"] or 0),
        } for r in monthly],
        "top_drivers": [{
            "full_name": r["full_name"], "phone_number": r["phone_number"],
            "total_earnings": float(r["total_earnings"] or 0), "trip_count": r["trip_count"]
        } for r in top_drivers],
        "daily_fees": [{"date": str(r["date"]), "fee_revenue": float(r["fee_revenue"] or 0), "gross_volume": float(r["gross_volume"] or 0)} for r in daily_fees],
    }

@api.get("/admin/reports/reconciliation")
async def reconciliation_report(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_analytics"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        total_topups = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='topup' AND status='completed'")
        total_payments = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed'")
        total_withdrawals_approved = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='approved'")
        total_wallet_balance = await conn.fetchval("SELECT COALESCE(SUM(balance),0) FROM wallets")
        total_fees = await conn.fetchval("SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed'")
        pending_withdrawals = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='pending'")
    return {
        "total_topups": float(total_topups),
        "total_payments": float(total_payments),
        "total_withdrawals_approved": float(total_withdrawals_approved),
        "total_wallet_balance": float(total_wallet_balance),
        "total_platform_fees": float(total_fees),
        "pending_withdrawals": float(pending_withdrawals),
        "expected_balance": float(total_topups) - float(total_withdrawals_approved),
        "variance": float(total_wallet_balance) - (float(total_topups) - float(total_withdrawals_approved)),
    }

@api.get("/admin/export/financial-report")
async def export_financial_report(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "export_data"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT DATE_TRUNC('month',created_at) as month,
                   SUM(amount) as gross_volume, SUM(platform_fee) as fee_revenue,
                   COUNT(*) as txn_count, SUM(driver_net) as driver_payouts
            FROM transactions WHERE type='payment' AND status='completed'
            GROUP BY DATE_TRUNC('month',created_at) ORDER BY month DESC
        """)
        await audit(conn, admin["id"], "EXPORT_FINANCIAL_REPORT", None, None, {}, request.client.host)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Month","Gross Volume","Fee Revenue","Transactions","Driver Payouts"])
    for r in rows:
        writer.writerow([str(r["month"])[:7], float(r["gross_volume"] or 0), float(r["fee_revenue"] or 0), r["txn_count"], float(r["driver_payouts"] or 0)])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=financial-report.csv"})

# ── 3. DISPUTES ──────────────────────────────────────────────
@api.get("/admin/disputes")
async def admin_disputes(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT d.*,u.full_name as user_name,u.phone_number,
                   t.reference,t.amount,t.type as txn_type,
                   rb.full_name as resolved_by_name
            FROM disputes d
            JOIN users u ON u.id=d.user_id
            LEFT JOIN transactions t ON t.id=d.transaction_id
            LEFT JOIN users rb ON rb.id=d.resolved_by
            ORDER BY d.created_at DESC
        """)
    return [{**dict(r), "amount": float(r["amount"] or 0), "created_at": iso(r["created_at"]), "resolved_at": iso(r["resolved_at"]) if r["resolved_at"] else None} for r in rows]

@api.post("/admin/disputes/{dispute_id}/resolve")
async def resolve_dispute(dispute_id: str, body: ResolveDisputeIn, request: Request, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE disputes SET status='resolved',resolved_by=$1,resolution=$2,resolved_at=NOW() WHERE id=$3",
            admin["id"], body.resolution, dispute_id
        )
        await audit(conn, admin["id"], "RESOLVE_DISPUTE", dispute_id, "dispute", {"resolution": body.resolution}, request.client.host)
    return {"ok": True}

@api.post("/wallet/dispute")
async def submit_dispute(body: DisputeIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        txn = await conn.fetchrow("SELECT id FROM transactions WHERE id=$1 AND (sender_id=$2 OR receiver_id=$2)", body.transaction_id, user["id"])
        if not txn:
            raise HTTPException(status_code=404, detail="Transaction not found")
        existing = await conn.fetchrow("SELECT id FROM disputes WHERE transaction_id=$1 AND user_id=$2 AND status='open'", body.transaction_id, user["id"])
        if existing:
            raise HTTPException(status_code=400, detail="Dispute already open for this transaction")
        await conn.execute(
            "INSERT INTO disputes (id,transaction_id,user_id,reason) VALUES ($1,$2,$3,$4)",
            str(uuid.uuid4()), body.transaction_id, user["id"], body.reason
        )
    return {"ok": True}

# ── 4. NOTIFICATIONS ─────────────────────────────────────────
@api.post("/admin/notifications/send")
async def send_notification(body: SendNotificationIn, request: Request, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        notif_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO notifications (id,title,message,type,target,target_role,target_user_id,sent_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            notif_id, body.title, body.message, body.type, body.target, body.target_role, body.target_user_id, admin["id"]
        )
        await audit(conn, admin["id"], "SEND_NOTIFICATION", notif_id, "notification", {"title": body.title, "target": body.target}, request.client.host)
    return {"ok": True, "id": notif_id}

@api.get("/admin/notifications")
async def list_notifications(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT n.*,u.full_name as sent_by_name FROM notifications n LEFT JOIN users u ON u.id=n.sent_by ORDER BY n.sent_at DESC LIMIT 100")
    return [{**dict(r), "sent_at": iso(r["sent_at"])} for r in rows]

@api.get("/notifications")
async def get_user_notifications(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM notifications
            WHERE target='all'
            OR (target='role' AND target_role=$1)
            OR (target='user' AND target_user_id=$2)
            ORDER BY sent_at DESC LIMIT 20
        """, user["role"], user["id"])
    return [{**dict(r), "sent_at": iso(r["sent_at"])} for r in rows]

# ── 5. SYSTEM HEALTH ─────────────────────────────────────────
@api.get("/admin/system/health")
async def system_health(admin: dict = Depends(require_admin)):
    import time
    start = time.time()
    async with pool.acquire() as conn:
        db_ok = await conn.fetchval("SELECT 1")
        total_users = await conn.fetchval("SELECT COUNT(*) FROM users")
        total_txns = await conn.fetchval("SELECT COUNT(*) FROM transactions")
        failed_txns_today = await conn.fetchval("SELECT COUNT(*) FROM transactions WHERE status='failed' AND DATE(created_at)=CURRENT_DATE")
        pending_kyc = await conn.fetchval("SELECT COUNT(*) FROM kyc_documents WHERE status='pending'")
        pending_withdrawals = await conn.fetchval("SELECT COUNT(*) FROM withdrawal_requests WHERE status='pending'")
        active_sessions = await conn.fetchval("SELECT COUNT(*) FROM admin_sessions WHERE revoked=FALSE AND expires_at>NOW()")
        open_disputes = await conn.fetchval("SELECT COUNT(*) FROM disputes WHERE status='open'")
        blacklist_count = await conn.fetchval("SELECT COUNT(*) FROM blacklist")
        db_latency = round((time.time() - start) * 1000, 2)
    return {
        "status": "healthy",
        "db_connected": bool(db_ok),
        "db_latency_ms": db_latency,
        "stats": {
            "total_users": total_users,
            "total_transactions": total_txns,
            "failed_transactions_today": failed_txns_today,
            "pending_kyc": pending_kyc,
            "pending_withdrawals": pending_withdrawals,
            "active_admin_sessions": active_sessions,
            "open_disputes": open_disputes,
            "blacklisted_numbers": blacklist_count,
        }
    }

# ── 6. SETTINGS & CONFIGURATION ─────────────────────────────
@api.get("/admin/config")
async def get_config(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM system_config ORDER BY key ASC")
    return [{**dict(r), "updated_at": iso(r["updated_at"])} for r in rows]

@api.patch("/admin/config/{key}")
async def update_config(key: str, body: UpdateConfigIn, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT key FROM system_config WHERE key=$1", key)
        if not existing:
            raise HTTPException(status_code=404, detail="Config key not found")
        await conn.execute(
            "UPDATE system_config SET value=$1,updated_by=$2,updated_at=NOW() WHERE key=$3",
            body.value, admin["id"], key
        )
        await audit(conn, admin["id"], "UPDATE_CONFIG", key, "config", {"key": key, "value": body.value}, request.client.host)
    return {"ok": True}

# ── 7. DRIVER PERFORMANCE ───────────────────────────────────
@api.get("/admin/drivers/{user_id}/performance")
async def driver_performance(user_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        driver = await conn.fetchrow("SELECT d.*,u.full_name,u.phone_number FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.user_id=$1", user_id)
        if not driver:
            raise HTTPException(status_code=404, detail="Driver not found")
        daily = await conn.fetch("""
            SELECT DATE(created_at) as date, COUNT(*) as trips, SUM(driver_net) as earnings
            FROM transactions WHERE receiver_id=$1 AND type='payment' AND status='completed'
            AND created_at >= NOW()-INTERVAL '30 days'
            GROUP BY DATE(created_at) ORDER BY date ASC
        """, user_id)
        monthly = await conn.fetch("""
            SELECT DATE_TRUNC('month',created_at) as month, COUNT(*) as trips, SUM(driver_net) as earnings
            FROM transactions WHERE receiver_id=$1 AND type='payment' AND status='completed'
            GROUP BY DATE_TRUNC('month',created_at) ORDER BY month DESC LIMIT 6
        """, user_id)
        peak_hours = await conn.fetch("""
            SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as trips
            FROM transactions WHERE receiver_id=$1 AND type='payment'
            GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY trips DESC
        """, user_id)
        ratings = await conn.fetch("SELECT stars, COUNT(*) as count FROM ratings WHERE driver_user_id=$1 GROUP BY stars ORDER BY stars DESC", user_id)
    return {
        "driver": {"user_id": driver["user_id"], "full_name": driver["full_name"],
                   "phone_number": driver["phone_number"], "total_earnings": float(driver["total_earnings"] or 0),
                   "rating_avg": float(driver["rating_avg"] or 0), "rating_count": driver["rating_count"] or 0},
        "daily": [{"date": str(r["date"]), "trips": r["trips"], "earnings": float(r["earnings"] or 0)} for r in daily],
        "monthly": [{"month": str(r["month"])[:7], "trips": r["trips"], "earnings": float(r["earnings"] or 0)} for r in monthly],
        "peak_hours": [{"hour": int(r["hour"]), "trips": r["trips"]} for r in peak_hours],
        "ratings_breakdown": [{"stars": r["stars"], "count": r["count"]} for r in ratings],
    }

# ── 8. PASSENGER ANALYTICS ──────────────────────────────────
@api.get("/admin/passengers/analytics")
async def passenger_analytics(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_analytics"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        top_spenders = await conn.fetch("""
            SELECT u.full_name, u.phone_number, u.id,
                   COUNT(t.id) as txn_count,
                   SUM(t.amount) as total_spent,
                   MAX(t.created_at) as last_active,
                   AVG(t.amount) as avg_spend
            FROM transactions t
            JOIN users u ON u.id=t.sender_id
            WHERE t.type='payment' AND t.status='completed'
            GROUP BY u.id, u.full_name, u.phone_number
            ORDER BY total_spent DESC LIMIT 20
        """)
        inactive = await conn.fetch("""
            SELECT u.full_name, u.phone_number, u.created_at,
                   MAX(t.created_at) as last_transaction
            FROM users u
            LEFT JOIN transactions t ON t.sender_id=u.id
            WHERE u.role='passenger'
            GROUP BY u.id, u.full_name, u.phone_number, u.created_at
            HAVING MAX(t.created_at) < NOW()-INTERVAL '30 days' OR MAX(t.created_at) IS NULL
            ORDER BY last_transaction DESC NULLS LAST LIMIT 20
        """)
        topup_patterns = await conn.fetch("""
            SELECT DATE_TRUNC('week',created_at) as week, COUNT(*) as topups, SUM(amount) as total
            FROM transactions WHERE type='topup' AND status='completed'
            AND created_at >= NOW()-INTERVAL '12 weeks'
            GROUP BY DATE_TRUNC('week',created_at) ORDER BY week ASC
        """)
    return {
        "top_spenders": [{
            "full_name": r["full_name"], "phone_number": r["phone_number"], "id": r["id"],
            "txn_count": r["txn_count"], "total_spent": float(r["total_spent"] or 0),
            "avg_spend": float(r["avg_spend"] or 0), "last_active": iso(r["last_active"])
        } for r in top_spenders],
        "inactive_passengers": [{
            "full_name": r["full_name"], "phone_number": r["phone_number"],
            "created_at": iso(r["created_at"]), "last_transaction": iso(r["last_transaction"]) if r["last_transaction"] else None
        } for r in inactive],
        "topup_patterns": [{"week": str(r["week"])[:10], "topups": r["topups"], "total": float(r["total"] or 0)} for r in topup_patterns],
    }

# ── 9. FLEET OWNER REPORTS ───────────────────────────────────
@api.get("/admin/fleet/reports")
async def fleet_reports(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        owners = await conn.fetch("""
            SELECT fo.*, u.full_name, u.phone_number,
                   COUNT(od.id) as driver_count
            FROM fleet_owners fo
            JOIN users u ON u.id=fo.user_id
            LEFT JOIN owner_drivers od ON od.owner_id=fo.id
            GROUP BY fo.id, u.full_name, u.phone_number
            ORDER BY driver_count DESC
        """)
        fleet_earnings = await conn.fetch("""
            SELECT fo.id as owner_id, u.full_name as owner_name,
                   SUM(d.total_earnings) as fleet_total_earnings,
                   COUNT(DISTINCT od.driver_user_id) as driver_count
            FROM fleet_owners fo
            JOIN users u ON u.id=fo.user_id
            JOIN owner_drivers od ON od.owner_id=fo.id
            JOIN drivers d ON d.user_id=od.driver_user_id
            GROUP BY fo.id, u.full_name
            ORDER BY fleet_total_earnings DESC
        """)
    return {
        "owners": [{**dict(r), "created_at": iso(r["created_at"])} for r in owners],
        "fleet_earnings": [{
            "owner_id": r["owner_id"], "owner_name": r["owner_name"],
            "fleet_total_earnings": float(r["fleet_total_earnings"] or 0),
            "driver_count": r["driver_count"]
        } for r in fleet_earnings],
    }

# ── 10. ONBOARDING PIPELINE ──────────────────────────────────
@api.get("/admin/onboarding/pipeline")
async def onboarding_pipeline(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        pending_drivers = await conn.fetch("""
            SELECT d.user_id, d.vehicle_plate, d.created_at,
                   u.full_name, u.phone_number,
                   k.status as kyc_status, k.submitted_at as kyc_submitted
            FROM drivers d
            JOIN users u ON u.id=d.user_id
            LEFT JOIN kyc_documents k ON k.user_id=d.user_id
            WHERE d.is_verified=FALSE
            ORDER BY d.created_at ASC
        """)
        kyc_pending = await conn.fetch("""
            SELECT k.*, u.full_name, u.phone_number
            FROM kyc_documents k
            JOIN users u ON u.id=k.user_id
            WHERE k.status='pending'
            ORDER BY k.submitted_at ASC
        """)
        recent_signups = await conn.fetch("""
            SELECT u.id, u.full_name, u.phone_number, u.role, u.created_at,
                   w.balance
            FROM users u
            LEFT JOIN wallets w ON w.user_id=u.id
            WHERE u.role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo')
            AND u.created_at >= NOW()-INTERVAL '7 days'
            ORDER BY u.created_at DESC
        """)
        # Conversion funnel
        total_registered = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role='driver'")
        kyc_submitted_count = await conn.fetchval("SELECT COUNT(*) FROM kyc_documents")
        kyc_approved_count = await conn.fetchval("SELECT COUNT(*) FROM kyc_documents WHERE status='approved'")
        verified_count = await conn.fetchval("SELECT COUNT(*) FROM drivers WHERE is_verified=TRUE")
    return {
        "pending_verification": [{
            "user_id": r["user_id"], "full_name": r["full_name"], "phone_number": r["phone_number"],
            "vehicle_plate": r["vehicle_plate"], "kyc_status": r["kyc_status"] or "not_submitted",
            "kyc_submitted": iso(r["kyc_submitted"]) if r["kyc_submitted"] else None,
            "registered": iso(r["created_at"])
        } for r in pending_drivers],
        "kyc_pending": [{
            "user_id": r["user_id"], "full_name": r["full_name"], "phone_number": r["phone_number"],
            "submitted_at": iso(r["submitted_at"])
        } for r in kyc_pending],
        "recent_signups": [{
            "id": r["id"], "full_name": r["full_name"], "phone_number": r["phone_number"],
            "role": r["role"], "balance": float(r["balance"] or 0), "created_at": iso(r["created_at"])
        } for r in recent_signups],
        "funnel": {
            "total_drivers_registered": total_registered,
            "kyc_submitted": kyc_submitted_count,
            "kyc_approved": kyc_approved_count,
            "fully_verified": verified_count,
        }
    }

# ════════════════════════════════════════════════════════════════
# DRIVER ROUTES — Trip tracking system
# ════════════════════════════════════════════════════════════════

DRIVER_ROUTES_TABLE = """
CREATE TABLE IF NOT EXISTS driver_routes (
    id TEXT PRIMARY KEY,
    driver_user_id TEXT REFERENCES users(id),
    fare NUMERIC DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    total_collected NUMERIC DEFAULT 0,
    passenger_count INTEGER DEFAULT 0,
    cash_count INTEGER DEFAULT 0,
    app_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
);
"""

class RouteStartIn(BaseModel):
    fare: float = Field(default=0, ge=0)

class RouteCashIn(BaseModel):
    delta: int

@api.post("/driver/route/start")
async def start_route(body: RouteStartIn, user: dict = Depends(get_current_user)):
    if user["role"] not in ("driver", "owner"):
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        # End any existing active route first
        await conn.execute(
            """UPDATE driver_routes SET status='ended', ended_at=NOW()
               WHERE driver_user_id=$1 AND status='active'""",
            user["id"]
        )
        route_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO driver_routes (id, driver_user_id, fare) VALUES ($1, $2, $3)",
            route_id, user["id"], body.fare
        )
    return {"ok": True, "route_id": route_id}

@api.post("/driver/route/end")
async def end_route(user: dict = Depends(get_current_user)):
    if user["role"] not in ("driver", "owner"):
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        route = await conn.fetchrow(
            "SELECT * FROM driver_routes WHERE driver_user_id=$1 AND status='active'",
            user["id"]
        )
        if not route:
            raise HTTPException(status_code=404, detail="No active route")
        payments = await conn.fetch(
            """SELECT amount, driver_net, created_at FROM transactions
               WHERE receiver_id=$1 AND type='payment'
               AND created_at >= $2 AND status='completed'
               ORDER BY created_at DESC""",
            user["id"], route["started_at"]
        )
        total_collected = sum(float(p["driver_net"]) for p in payments)
        app_count = len(payments)
        cash_count = route["cash_count"] or 0
        await conn.execute(
            """UPDATE driver_routes
               SET status='ended', ended_at=NOW(),
                   total_collected=$1, app_count=$2,
                   passenger_count=$3
               WHERE id=$4""",
            total_collected, app_count, app_count + cash_count, route["id"]
        )
        duration_mins = int((datetime.now(timezone.utc) - route["started_at"]).total_seconds() / 60)
        return {
            "ok": True,
            "summary": {
                "duration_mins": duration_mins,
                "total_collected": total_collected,
                "app_count": app_count,
                "cash_count": cash_count,
                "total_passengers": app_count + cash_count,
                "fare": float(route["fare"] or 0),
            }
        }

@api.get("/driver/route/current")
async def current_route(user: dict = Depends(get_current_user)):
    if user["role"] not in ("driver", "owner"):
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        route = await conn.fetchrow(
            "SELECT * FROM driver_routes WHERE driver_user_id=$1 AND status='active'",
            user["id"]
        )
        today_total = await conn.fetchval(
            """SELECT COALESCE(SUM(driver_net), 0) FROM transactions
               WHERE receiver_id=$1 AND type='payment'
               AND status='completed' AND DATE(created_at)=CURRENT_DATE""",
            user["id"]
        )
        today_count = await conn.fetchval(
            """SELECT COUNT(*) FROM transactions
               WHERE receiver_id=$1 AND type='payment'
               AND status='completed' AND DATE(created_at)=CURRENT_DATE""",
            user["id"]
        )
        if not route:
            last_route = await conn.fetchrow(
                """SELECT * FROM driver_routes
                   WHERE driver_user_id=$1 AND status='ended'
                   ORDER BY ended_at DESC LIMIT 1""",
                user["id"]
            )
            return {
                "active": False,
                "last_route": {
                    "total_collected": float(last_route["total_collected"] or 0),
                    "app_count": last_route["app_count"] or 0,
                    "cash_count": last_route["cash_count"] or 0,
                    "total_passengers": (last_route["app_count"] or 0) + (last_route["cash_count"] or 0),
                    "duration_mins": int((last_route["ended_at"] - last_route["started_at"]).total_seconds() / 60) if last_route["ended_at"] else 0,
                    "fare": float(last_route["fare"] or 0),
                } if last_route else None,
                "today_total": float(today_total or 0),
                "today_count": int(today_count or 0),
            }
        payments = await conn.fetch(
            """SELECT id, amount, driver_net, created_at FROM transactions
               WHERE receiver_id=$1 AND type='payment'
               AND created_at >= $2 AND status='completed'
               ORDER BY created_at DESC""",
            user["id"], route["started_at"]
        )
        duration_mins = int((datetime.now(timezone.utc) - route["started_at"]).total_seconds() / 60)
        fare = float(route["fare"] or 0)
        return {
            "active": True,
            "route_id": route["id"],
            "fare": fare,
            "started_at": iso(route["started_at"]),
            "duration_mins": duration_mins,
            "cash_count": route["cash_count"] or 0,
            "app_count": len(payments),
            "total_passengers": len(payments) + (route["cash_count"] or 0),
            "total_collected": sum(float(p["driver_net"]) for p in payments),
            "payments": [{
                "id": p["id"],
                "amount": float(p["amount"]),
                "driver_net": float(p["driver_net"]),
                "created_at": iso(p["created_at"]),
                "underpaid": fare > 0 and float(p["amount"]) < fare,
            } for p in payments],
            "today_total": float(today_total or 0),
            "today_count": int(today_count or 0),
        }

@api.patch("/driver/route/cash")
async def update_cash_count(body: RouteCashIn, user: dict = Depends(get_current_user)):
    if user["role"] not in ("driver", "owner"):
        raise HTTPException(status_code=403, detail="Drivers only")
    if body.delta not in (1, -1):
        raise HTTPException(status_code=400, detail="Delta must be +1 or -1")
    async with pool.acquire() as conn:
        route = await conn.fetchrow(
            "SELECT * FROM driver_routes WHERE driver_user_id=$1 AND status='active'",
            user["id"]
        )
        if not route:
            raise HTTPException(status_code=404, detail="No active route")
        new_count = max(0, (route["cash_count"] or 0) + body.delta)
        await conn.execute(
            "UPDATE driver_routes SET cash_count=$1 WHERE id=$2",
            new_count, route["id"]
        )
    return {"ok": True, "cash_count": new_count}

@api.get("/driver/route/history")
async def route_history(user: dict = Depends(get_current_user)):
    if user["role"] not in ("driver", "owner"):
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        routes = await conn.fetch(
            """SELECT * FROM driver_routes
               WHERE driver_user_id=$1 AND status='ended'
               ORDER BY started_at DESC LIMIT 20""",
            user["id"]
        )
    return [{
        "id": r["id"],
        "fare": float(r["fare"] or 0),
        "started_at": iso(r["started_at"]),
        "ended_at": iso(r["ended_at"]),
        "duration_mins": int((r["ended_at"] - r["started_at"]).total_seconds() / 60) if r["ended_at"] else 0,
        "total_collected": float(r["total_collected"] or 0),
        "app_count": r["app_count"] or 0,
        "cash_count": r["cash_count"] or 0,
        "total_passengers": (r["app_count"] or 0) + (r["cash_count"] or 0),
    } for r in routes]

@api.get("/admin/drivers/on-duty")
async def drivers_on_duty(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        routes = await conn.fetch(
            """SELECT dr.*, u.full_name, u.phone_number, d.vehicle_plate
               FROM driver_routes dr
               JOIN users u ON u.id=dr.driver_user_id
               LEFT JOIN drivers d ON d.user_id=dr.driver_user_id
               WHERE dr.status='active'
               ORDER BY dr.started_at ASC"""
        )
    return [{
        "route_id": r["id"],
        "driver_name": r["full_name"],
        "phone_number": r["phone_number"],
        "vehicle_plate": r["vehicle_plate"],
        "fare": float(r["fare"] or 0),
        "started_at": iso(r["started_at"]),
        "duration_mins": int((datetime.now(timezone.utc) - r["started_at"]).total_seconds() / 60),
        "cash_count": r["cash_count"] or 0,
        "app_count": r["app_count"] or 0,
        "total_passengers": (r["app_count"] or 0) + (r["cash_count"] or 0),
    } for r in routes]

# ── Notification delete endpoints ─────────────────────────────
@api.delete("/notifications/{notif_id}")
async def delete_notification(notif_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM notifications WHERE id=$1 AND target_user_id=$2",
            notif_id, user["id"]
        )
    return {"ok": True}

@api.delete("/notifications")
async def clear_all_notifications(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM notifications WHERE target_user_id=$1",
            user["id"]
        )
    return {"ok": True}

# ── Must be last line ─────────────────────────────────────────
app.include_router(api)
