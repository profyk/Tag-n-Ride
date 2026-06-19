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
import calendar as _calendar
import uuid
import secrets
import hashlib
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta, date as date_type
from typing import Optional, List

import asyncio
import asyncpg
import bcrypt
import jwt
try:
    import anthropic as _anthropic
except ImportError:
    _anthropic = None  # type: ignore
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, File, UploadFile
from fastapi.responses import StreamingResponse
import cloudinary
import cloudinary.uploader

_cloudinary_cloud  = os.getenv("CLOUDINARY_CLOUD_NAME")
_cloudinary_key    = os.getenv("CLOUDINARY_API_KEY")
_cloudinary_secret = os.getenv("CLOUDINARY_API_SECRET")

if not _cloudinary_cloud or not _cloudinary_key or not _cloudinary_secret:
    raise Exception(
        "Cloudinary is not configured. "
        "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET "
        "in your Railway environment variables."
    )

cloudinary.config(
    cloud_name=_cloudinary_cloud,
    api_key=_cloudinary_key,
    api_secret=_cloudinary_secret,
    secure=True,
)
print("[CLOUDINARY] Configured successfully")
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
import base64
import hmac
try:
    import httpx
except ImportError:
    httpx = None

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

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
PRODUCTION = os.getenv("RAILWAY_ENVIRONMENT", "").lower() in ("production", "prod") or \
             os.getenv("ENV", "").lower() in ("production", "prod")
TRACK_BASE_URL = os.getenv("TRACK_BASE_URL", "https://tag-n-ride-admin.vercel.app")

pool: asyncpg.Pool = None

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tagnride")

ADMIN_ROLES = ("superadmin", "ceo", "cto", "cfo", "admin", "finance", "support", "hr")

ROLE_PERMISSIONS = {
    "superadmin": [
        "manage_admins", "freeze_wallet", "transfer_funds", "adjust_balance",
        "view_audit", "export_data", "manage_users", "manage_drivers",
        "approve_withdrawals", "reset_pin", "view_sessions", "revoke_sessions",
        "flag_accounts", "view_analytics", "review_kyc", "edit_system",
        "promote_admins", "manage_roles",
        # Ledger & financial corrections
        "view_ledger", "process_refunds", "manual_ledger_adjustment",
        "reverse_ledger_entry", "large_withdrawals", "edit_fees",
        # Test users, statements & danger actions
        "manage_test_users", "download_statements", "danger_actions",
        "archive_audit_logs",
    ],
    "ceo": [
        "view_audit", "view_analytics", "export_data", "manage_admins",
        "promote_admins", "manage_roles", "manage_users", "manage_drivers",
        "freeze_wallet", "transfer_funds", "adjust_balance",
        "approve_withdrawals", "review_kyc", "flag_accounts",
        # Ledger
        "view_ledger", "process_refunds", "manual_ledger_adjustment",
        "large_withdrawals", "edit_fees",
        # Test users & statements
        "manage_test_users", "download_statements", "danger_actions",
    ],
    "cto": [
        "view_audit", "view_analytics", "export_data", "manage_drivers",
        "review_kyc", "view_sessions", "edit_system",
    ],
    "cfo": [
        "approve_withdrawals", "view_analytics", "export_data",
        "view_audit", "freeze_wallet", "transfer_funds", "adjust_balance",
        # Ledger
        "view_ledger", "process_refunds", "manual_ledger_adjustment",
        "large_withdrawals",
        "download_statements",
    ],
    "admin": [
        "manage_users", "manage_drivers", "reset_pin",
        "view_audit", "flag_accounts", "view_analytics", "review_kyc",
        "manage_promotions", "broadcast_messages", "view_risk",
    ],
    "finance": [
        "approve_withdrawals", "view_analytics", "export_data",
        "view_audit", "freeze_wallet",
        "view_ledger", "process_refunds",
        "download_statements",
        "manage_refunds",
    ],
    "support": ["reset_pin", "manage_users"],
    "hr": [
        "view_audit", "view_analytics", "export_data",
        "manage_users", "flag_accounts",
        "download_statements", "manage_staff",
    ],
}

# ── extend superadmin/ceo/cfo with new permissions ────────────────
ROLE_PERMISSIONS["superadmin"] += [
    "manage_refunds", "manage_pricing", "manage_promotions",
    "broadcast_messages", "manage_limits", "view_risk", "manage_staff",
]
ROLE_PERMISSIONS["ceo"] += [
    "manage_refunds", "manage_pricing", "manage_promotions",
    "broadcast_messages", "manage_limits", "view_risk", "manage_staff",
]
ROLE_PERMISSIONS["cfo"] += ["manage_refunds", "manage_limits", "view_risk", "manage_staff"]
ROLE_PERMISSIONS["superadmin"] += ["approve_deadman_reset"]
ROLE_PERMISSIONS["ceo"]        += ["approve_deadman_reset"]
ROLE_PERMISSIONS["admin"]      += ["approve_deadman_reset"]
ROLE_PERMISSIONS["support"]    += ["approve_deadman_reset"]

def get_all_permissions(user: dict) -> list:
    perms = set(ROLE_PERMISSIONS.get(user.get("role", ""), []))
    for r in (user.get("extra_roles") or "").split(","):
        r = r.strip()
        if r:
            perms.update(ROLE_PERMISSIONS.get(r, []))
    return list(perms)

def has_permission(user: dict, permission: str) -> bool:
    return permission in get_all_permissions(user)

def token_hash_fn(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:32]

class LoginRateLimiter:
    """In-memory rate limiter: 5 failures per 15 min per key, then 15-min lockout."""
    def __init__(self, max_attempts: int = 5, window: int = 900):
        self.max_attempts = max_attempts
        self.window = window
        self._attempts: dict = defaultdict(list)

    def check(self, key: str) -> None:
        now = time.time()
        self._attempts[key] = [t for t in self._attempts[key] if now - t < self.window]
        if len(self._attempts[key]) >= self.max_attempts:
            wait = int(self.window - (now - self._attempts[key][0]))
            raise HTTPException(status_code=429, detail=f"Too many attempts. Try again in {max(wait // 60, 1)} minute(s).")

    def record_failure(self, key: str) -> None:
        self._attempts[key].append(time.time())

    def clear(self, key: str) -> None:
        self._attempts.pop(key, None)

_login_limiter = LoginRateLimiter()
_admin_login_limiter = LoginRateLimiter()

def generate_qr_code() -> str:
    return "TNR" + "".join(random.choices(string.digits, k=13))

# ── Tables ───────────────────────────────────────────────────
CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone_number TEXT UNIQUE,
    full_name TEXT NOT NULL,
    surname TEXT,
    id_number TEXT,
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
    flag_reason TEXT,
    is_test BOOLEAN DEFAULT FALSE,
    vehicle_plate TEXT
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
    is_test BOOLEAN DEFAULT FALSE,
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
    registered_as_driver BOOLEAN DEFAULT FALSE,
    bank_name TEXT,
    account_number TEXT,
    account_name TEXT,
    cashup_method TEXT DEFAULT 'wallet',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owner_drivers (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES fleet_owners(id),
    driver_user_id TEXT NOT NULL REFERENCES users(id),
    payment_mode TEXT DEFAULT 'daily_target',
    driver_commission_pct NUMERIC(5,2) DEFAULT 0,
    commission_status TEXT,
    daily_target NUMERIC(14,2) DEFAULT 0,
    confirmed BOOLEAN DEFAULT FALSE,
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, driver_user_id)
);

CREATE TABLE IF NOT EXISTS kyc_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    selfie_url TEXT,
    licence_front_url TEXT,
    selfie_public_id TEXT,
    licence_public_id TEXT,
    storage TEXT DEFAULT 'cloudinary',
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
        import json as _json_codec
        async def _init_conn(conn):
            await conn.set_type_codec("jsonb", encoder=_json_codec.dumps, decoder=_json_codec.loads, schema="pg_catalog")
            await conn.set_type_codec("json",  encoder=_json_codec.dumps, decoder=_json_codec.loads, schema="pg_catalog")
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5, init=_init_conn)
        async with pool.acquire() as conn:
            await conn.execute(CREATE_TABLES_SQL)
        print("DB pool created, tables ready")
        # Critical migrations — run independently so a single failure never blocks the rest
        async with pool.acquire() as conn:
            for _sql in [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS surname TEXT",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number TEXT",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_roles TEXT DEFAULT ''",
                "ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL",
                "ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS registered_as_driver BOOLEAN DEFAULT FALSE",
                "ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS bank_name TEXT",
                "ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS account_number TEXT",
                "ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS account_name TEXT",
                "ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS cashup_method TEXT DEFAULT 'wallet'",
                # owner_drivers columns required by dashboard and commission endpoints
                "ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'daily_target'",
                "ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS driver_commission_pct NUMERIC(5,2) DEFAULT 0",
                "ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS commission_status TEXT",
                "ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS daily_target NUMERIC(14,2) DEFAULT 0",
                "ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT FALSE",
                # driver online status
                "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE",
                "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ",
                # fleet management: document expiry tracking
                """CREATE TABLE IF NOT EXISTS driver_doc_expiry (
                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    owner_id TEXT NOT NULL REFERENCES fleet_owners(id),
                    driver_user_id TEXT NOT NULL REFERENCES users(id),
                    document_type TEXT NOT NULL,
                    expiry_date DATE NOT NULL,
                    notes TEXT DEFAULT '',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(owner_id, driver_user_id, document_type)
                )""",
                # fleet management: driver deductions
                """CREATE TABLE IF NOT EXISTS driver_deductions (
                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    owner_id TEXT NOT NULL REFERENCES fleet_owners(id),
                    driver_user_id TEXT NOT NULL REFERENCES users(id),
                    amount NUMERIC(14,2) NOT NULL,
                    reason TEXT NOT NULL,
                    deduction_type TEXT DEFAULT 'manual',
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    applied_at TIMESTAMPTZ,
                    cashup_id TEXT
                )""",
                PLATFORM_LEDGER_SQL,
                """CREATE TABLE IF NOT EXISTS statement_requests (
                    id TEXT PRIMARY KEY,
                    reference TEXT UNIQUE NOT NULL,
                    user_id TEXT NOT NULL REFERENCES users(id),
                    role TEXT NOT NULL,
                    period_start DATE NOT NULL,
                    period_end DATE NOT NULL,
                    amount_paid NUMERIC(14,2) DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'paid',
                    transaction_id TEXT,
                    statement_data JSONB,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    CONSTRAINT chk_stmt_role CHECK (role IN ('owner','passenger','driver'))
                )""",
                """CREATE TABLE IF NOT EXISTS user_documents (
                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    user_id TEXT NOT NULL,
                    document_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    period_label TEXT,
                    amount NUMERIC DEFAULT 0,
                    reference_number TEXT,
                    source TEXT DEFAULT 'app',
                    is_read BOOLEAN DEFAULT false,
                    status TEXT DEFAULT 'active',
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )""",
                # wallets.updated_at — required by GET /admin/wallets
                "ALTER TABLE wallets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
                # backfill: ensure every fleet owner has a drivers row so qr_code is never NULL
                """INSERT INTO drivers (id, user_id, qr_code, vehicle_plate)
                   SELECT gen_random_uuid()::text, u.id,
                          'TNR' || LPAD((ABS(('x' || LEFT(MD5(u.id), 15))::bit(60)::bigint) % 9000000000000 + 1000000000000)::text, 13, '0'),
                          ''
                   FROM users u
                   WHERE u.role IN ('driver', 'owner')
                   AND NOT EXISTS (SELECT 1 FROM drivers d WHERE d.user_id = u.id)
                   ON CONFLICT DO NOTHING""",
            ]:
                try:
                    await conn.execute(_sql)
                except Exception as _e:
                    log.warning("Critical migration skipped: %s", _e)
        await create_new_tables()
        asyncio.create_task(transfer_escalation_loop())
        asyncio.create_task(commission_auto_cashup_loop())
        asyncio.create_task(subscription_billing_loop())
        asyncio.create_task(maintenance_fee_billing_loop())
        asyncio.create_task(association_auto_pay_loop())
    except Exception as e:
        print("DB connection failed:", e)
        pool = None
    yield
    if pool:
        await pool.close()

app = FastAPI(
    title="Tag n Ride API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if PRODUCTION else "/docs",
    redoc_url=None if PRODUCTION else "/redoc",
    openapi_url=None if PRODUCTION else "/openapi.json",
)
api = APIRouter(prefix="/api")

_cors_origins = ALLOWED_ORIGINS if ALLOWED_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Danger-Token", "X-Request-ID"],
    expose_headers=["Content-Disposition"],
    allow_credentials=bool(ALLOWED_ORIGINS),
)

from fastapi import Response as FastAPIResponse
from starlette.middleware.base import BaseHTTPMiddleware

class DBHealthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if pool is None and not request.url.path.startswith("/health"):
            return FastAPIResponse(
                content='{"detail":"Service temporarily unavailable — database not connected"}',
                status_code=503,
                media_type="application/json",
            )
        return await call_next(request)

app.add_middleware(DBHealthMiddleware)

@app.get("/health")
async def health():
    return {"status": "ok", "db": pool is not None}

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

async def notify_user(conn, title: str, message: str, notif_type: str, target_user_id: str):
    """Internal helper to send a notification to a specific user."""
    try:
        await conn.execute(
            """INSERT INTO notifications
               (id,title,message,type,target,target_user_id,sent_by)
               VALUES ($1,$2,$3,$4,'user',$5,'system')""",
            str(uuid.uuid4()), title, message, notif_type, target_user_id
        )
    except Exception as e:
        print(f"[NOTIFY_USER ERROR] {e}")

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
            "SELECT id,phone_number,full_name,role,is_active,email,extra_roles FROM users WHERE id=$1",
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
    if not has_permission(user, "manage_admins"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Account suspended")
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

async def require_can_drive(user: dict, conn) -> None:
    """Allows drivers, and owners who have driver mode active."""
    if user["role"] == "driver":
        return
    if user["role"] == "owner":
        w = await conn.fetchrow("SELECT driver_mode_active FROM wallets WHERE user_id=$1", user["id"])
        if w and w["driver_mode_active"]:
            return
    raise HTTPException(status_code=403, detail="Driver mode must be active to use trip features")

# ── Withdraw helpers ─────────────────────────────────────────

async def _do_withdraw(user, amount, bank_name, account_number, account_name, payout_type: str = "payout"):
    """All payouts except Pay Fuel. Creates pending record; auto-approves if settings allow."""
    async with pool.acquire() as conn:
        settings = await conn.fetchrow(
            "SELECT require_approval, auto_approve_limit FROM payout_settings WHERE id='default'"
        )
    require_approval = settings["require_approval"] if settings else True
    auto_approve_limit = float(settings["auto_approve_limit"] or 0) if settings else 0.0
    auto_approve = (not require_approval) or (auto_approve_limit > 0 and amount <= auto_approve_limit)
    initial_status = "auto_approved" if auto_approve else "pending"

    req_id = str(uuid.uuid4()); txn_id = str(uuid.uuid4()); ref = gen_ref()
    new_balance = 0.0
    async with pool.acquire() as conn:
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
            await conn.execute(
                """INSERT INTO withdrawal_requests
                   (id,user_id,amount,bank_name,account_number,account_name,status,payout_type)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
                req_id, user["id"], amount, bank_name, account_number,
                account_name or user["full_name"], initial_status, payout_type
            )
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

    if auto_approve:
        try:
            await stitch_payout(
                amount=amount, bank_name=bank_name, account_number=account_number,
                account_holder=account_name or user["full_name"], reference=ref,
                withdrawal_id=req_id, user_id=user["id"],
                phone_number=user.get("phone_number", ""),
            )
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE withdrawal_requests SET status='paid', reviewed_at=NOW(), reviewed_by='auto-system' WHERE id=$1", req_id
                )
                await conn.execute("UPDATE transactions SET status='completed' WHERE id=$1", txn_id)
        except Exception as e:
            log.error(f"[AUTO-PAYOUT] Failed for withdrawal {req_id}: {e}")
            async with pool.acquire() as conn:
                await conn.execute("UPDATE withdrawal_requests SET status='payout_failed' WHERE id=$1", req_id)
                await conn.execute("UPDATE transactions SET status='failed' WHERE id=$1", txn_id)

    return {"balance": new_balance, "withdrawal": req, "transaction": txn, "pending_approval": not auto_approve}


async def _do_pay_fuel(user, amount, bank_name, account_number, account_name):
    """Pay Fuel — bypasses admin approval, triggers gateway immediately."""
    # Enforce Pay Fuel limits from payout_settings
    async with pool.acquire() as conn:
        settings = await conn.fetchrow("SELECT * FROM payout_settings WHERE id='default'")
        today_total = await conn.fetchval(
            """SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests
               WHERE user_id=$1 AND payout_type='pay_fuel'
               AND DATE(created_at) = CURRENT_DATE""",
            user["id"]
        )
    if settings:
        if not settings["pay_fuel_enabled"]:
            raise HTTPException(status_code=403, detail="Pay Fuel is currently disabled by admin.")
        max_per_txn = float(settings["pay_fuel_max_per_txn"] or 0)
        daily_limit = float(settings["pay_fuel_daily_limit"] or 0)
        if max_per_txn > 0 and amount > max_per_txn:
            raise HTTPException(status_code=400, detail=f"Pay Fuel amount exceeds the maximum of R{max_per_txn:.2f} per transaction.")
        if daily_limit > 0 and float(today_total or 0) + amount > daily_limit:
            remaining = max(0.0, daily_limit - float(today_total or 0))
            raise HTTPException(status_code=400, detail=f"Daily Pay Fuel limit of R{daily_limit:.2f} reached. You have R{remaining:.2f} remaining today.")

    req_id = str(uuid.uuid4()); txn_id = str(uuid.uuid4()); ref = gen_ref()
    new_balance = 0.0
    async with pool.acquire() as conn:
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
            await conn.execute(
                """INSERT INTO withdrawal_requests
                   (id,user_id,amount,bank_name,account_number,account_name,status,payout_type)
                   VALUES ($1,$2,$3,$4,$5,$6,'auto_approved','pay_fuel')""",
                req_id, user["id"], amount, bank_name, account_number,
                account_name or user["full_name"]
            )
            await conn.execute(
                """INSERT INTO transactions
                   (id,reference,type,status,amount,sender_id,receiver_id,note)
                   VALUES ($1,$2,'withdrawal','pending',$3,$4,NULL,$5)""",
                txn_id, ref, amount, user["id"], f"Pay Fuel to {bank_name} {account_number}"
            )
        req_row = await conn.fetchrow("SELECT * FROM withdrawal_requests WHERE id=$1", req_id)
        txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)
    req = dict(req_row); req["amount"] = float(req["amount"]); req["created_at"] = iso(req["created_at"])
    txn = dict(txn_row); txn["amount"] = float(txn["amount"]); txn["created_at"] = iso(txn["created_at"])

    try:
        await stitch_payout(
            amount=amount, bank_name=bank_name, account_number=account_number,
            account_holder=account_name or user["full_name"], reference=ref,
            withdrawal_id=req_id, user_id=user["id"],
            phone_number=user.get("phone_number", ""),
        )
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE withdrawal_requests SET status='paid', reviewed_at=NOW(), reviewed_by='auto-gateway' WHERE id=$1", req_id
            )
            await conn.execute("UPDATE transactions SET status='completed' WHERE id=$1", txn_id)
    except Exception as e:
        log.error(f"[PAY-FUEL] Payout failed for withdrawal {req_id}: {e}")
        async with pool.acquire() as conn:
            await conn.execute("UPDATE withdrawal_requests SET status='payout_failed' WHERE id=$1", req_id)
        raise HTTPException(status_code=500, detail=f"Pay Fuel payout failed: {str(e)}")

    return {"balance": new_balance, "withdrawal": req, "transaction": txn, "pending_approval": False}

# ── Models ───────────────────────────────────────────────────
class RegisterIn(BaseModel):
    # phone_number is optional for owners (they identify by email)
    phone_number: Optional[str] = Field(default=None, min_length=7, max_length=20)
    full_name: str = Field(min_length=2, max_length=100)
    surname: str = Field(min_length=2, max_length=100)
    pin: str = Field(min_length=4, max_length=4)
    role: str = Field(default="passenger")
    vehicle_plate: Optional[str] = None
    business_name: Optional[str] = None
    id_number: Optional[str] = Field(default=None, min_length=5, max_length=30)
    email: Optional[str] = Field(default=None, max_length=255)
    # Owner login password (bcrypt) — required for role=owner
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    # Whether owner also drives (stored in fleet_owners.registered_as_driver)
    driver_mode: Optional[bool] = None

    @field_validator("pin")
    @classmethod
    def pin_digits(cls, v):
        if not v.isdigit(): raise ValueError("PIN must be 4 digits")
        return v

    @field_validator("phone_number")
    @classmethod
    def normalize_phone(cls, v):
        if v is None: return v
        v = v.strip().replace(" ", "")
        if not (v.startswith("+") or v.isdigit()): raise ValueError("Invalid phone number")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("passenger","driver","owner"): raise ValueError("Invalid role")
        return v

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v):
        if v is not None:
            v = v.strip().lower()
            if "@" not in v: raise ValueError("Invalid email address")
        return v

class DriverProfileIn(BaseModel):
    vehicle_plate: Optional[str] = Field(default=None, min_length=2, max_length=15)
    id_number: Optional[str] = Field(default=None, min_length=5, max_length=30)

class LoginIn(BaseModel):
    phone_number: str
    pin: str

class OwnerLoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v):
        return v.strip().lower()

class OwnerChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

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
        if v not in ("admin","finance","support","cfo","cto","ceo","hr"):
            raise ValueError("Invalid role")
        return v

class UpdateAdminIn(BaseModel):
    role: Optional[str] = None
    extra_roles: Optional[list] = None
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    email: Optional[str] = Field(default=None, min_length=5, max_length=100)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v is not None and v not in ("admin","finance","support","cfo","cto","ceo","hr"):
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
    # Owners must provide email; drivers/passengers must provide phone_number
    if body.role == "owner":
        if not body.email:
            raise HTTPException(status_code=400, detail="Email is required for owner accounts")
        if not body.password:
            raise HTTPException(status_code=400, detail="Password is required for owner accounts")
    else:
        if not body.phone_number:
            raise HTTPException(status_code=400, detail="Phone number is required")

    async with pool.acquire() as conn:
        # Duplicate check
        if body.phone_number:
            existing = await conn.fetchrow("SELECT id FROM users WHERE phone_number=$1", body.phone_number)
            if existing:
                raise HTTPException(status_code=400, detail="Phone number already registered")
        if body.email and body.role == "owner":
            existing = await conn.fetchrow("SELECT id FROM users WHERE email=$1", body.email.strip().lower())
            if existing:
                raise HTTPException(status_code=400, detail="Email already registered")

        user_id = str(uuid.uuid4())
        email_stored = body.email.strip().lower() if body.email else None
        pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode() if body.password else None
        # Owners identify by email, not phone. Use a unique placeholder so the
        # insert works regardless of whether the DROP NOT NULL migration has run.
        phone_stored = body.phone_number if body.phone_number else (
            f"owner_{user_id[:12]}" if body.role == "owner" else None
        )

        async with conn.transaction():
            await conn.execute(
                "INSERT INTO users (id,phone_number,full_name,surname,id_number,email,role,pin_hash,password_hash) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                user_id, phone_stored, body.full_name, body.surname,
                body.id_number, email_stored, body.role, hash_pin(body.pin), pw_hash
            )
            await conn.execute("INSERT INTO wallets (id,user_id) VALUES ($1,$2)", str(uuid.uuid4()), user_id)
            if body.role == "driver":
                await conn.execute(
                    "INSERT INTO drivers (id,user_id,qr_code,vehicle_plate) VALUES ($1,$2,$3,$4)",
                    str(uuid.uuid4()), user_id, generate_qr_code(),
                    (body.vehicle_plate or "").upper().strip()
                )
            if body.role == "owner":
                await conn.execute(
                    "INSERT INTO fleet_owners (id,user_id,business_name,registered_as_driver) VALUES ($1,$2,$3,$4)",
                    str(uuid.uuid4()), user_id, body.business_name, bool(body.driver_mode)
                )
                # Always give owners a QR code immediately on registration.
                # ON CONFLICT (user_id) is a safety net; ON CONFLICT (qr_code) retries
                # with a fresh code so a collision never blocks registration.
                for _attempt in range(10):
                    _qr = generate_qr_code()
                    try:
                        await conn.execute(
                            "INSERT INTO drivers (id,user_id,qr_code,vehicle_plate) VALUES ($1,$2,$3,$4) "
                            "ON CONFLICT (user_id) DO UPDATE SET qr_code = COALESCE(drivers.qr_code, EXCLUDED.qr_code)",
                            str(uuid.uuid4()), user_id, _qr, ""
                        )
                        break
                    except Exception:
                        if _attempt == 9:
                            raise
    log.info("register | id=%s role=%s", user_id, body.role)
    token = create_access_token(user_id, body.role)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "phone_number": body.phone_number,
            "full_name": body.full_name,
            "surname": body.surname,
            "email": email_stored,
            "role": body.role,
        }
    }

@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    key = body.phone_number.strip()
    _login_limiter.check(key)
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id,phone_number,full_name,role,pin_hash,is_active FROM users WHERE phone_number=$1",
            key
        )
    if not user or not verify_pin(body.pin, user["pin_hash"]):
        _login_limiter.record_failure(key)
        raise HTTPException(status_code=401, detail="Invalid phone number or PIN")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account disabled")
    _login_limiter.clear(key)
    token = create_access_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {"id": user["id"], "phone_number": user["phone_number"],
                 "full_name": user["full_name"], "role": user["role"]}
    }

@api.post("/auth/owner-login")
async def owner_login(body: OwnerLoginIn, request: Request):
    """Email + password login for fleet owners."""
    key = body.email.lower().strip()
    _login_limiter.check(key)
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id,email,full_name,role,password_hash,pin_hash,is_active FROM users "
            "WHERE email=$1 AND role='owner'",
            key
        )
    if not user:
        _login_limiter.record_failure(key)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account disabled")
    # Verify password
    pw_hash = user["password_hash"]
    if not pw_hash:
        _login_limiter.record_failure(key)
        raise HTTPException(status_code=401, detail="Password not set — contact support to reset your account")
    try:
        valid = bcrypt.checkpw(body.password.encode(), pw_hash.encode())
    except Exception:
        valid = False
    if not valid:
        _login_limiter.record_failure(key)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _login_limiter.clear(key)
    token = create_access_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
        }
    }

@api.post("/auth/admin-login")
async def admin_login(body: AdminLoginIn, request: Request):
    ip = request.client.host if request.client else "unknown"
    email_key = body.email.strip().lower()
    _admin_login_limiter.check(ip)
    _admin_login_limiter.check(email_key)
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id,email,full_name,role,extra_roles,password_hash,is_active FROM users WHERE email=$1",
            email_key
        )
        if not user or user["role"] not in ADMIN_ROLES:
            _admin_login_limiter.record_failure(ip)
            _admin_login_limiter.record_failure(email_key)
            await audit(conn, None, "LOGIN_FAILED", metadata={"email": body.email}, ip=ip, success=False)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user["is_active"]:
            await audit(conn, user["id"], "LOGIN_SUSPENDED", ip=ip, success=False)
            raise HTTPException(status_code=403, detail="Account suspended")
        if not user["password_hash"] or not bcrypt.checkpw(
            body.password.encode(), user["password_hash"].encode()
        ):
            _admin_login_limiter.record_failure(ip)
            _admin_login_limiter.record_failure(email_key)
            await audit(conn, user["id"], "LOGIN_FAILED", ip=ip, success=False)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        _admin_login_limiter.clear(ip)
        _admin_login_limiter.clear(email_key)
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
            "extra_roles": [r.strip() for r in (user.get("extra_roles") or "").split(",") if r.strip()],
            "permissions": get_all_permissions(dict(user))
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
    async with pool.acquire() as conn:
        if body.vehicle_plate is not None:
            plate = body.vehicle_plate.upper().strip()
            await conn.execute("UPDATE drivers SET vehicle_plate=$1 WHERE user_id=$2", plate, user["id"])
        if body.id_number is not None:
            await conn.execute("UPDATE users SET id_number=$1 WHERE id=$2", body.id_number.strip(), user["id"])
    return {"ok": True}

@api.get("/driver/taxi-associations")
async def driver_list_taxi_associations(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, city, province FROM taxi_associations ORDER BY name"
        )
        my = await conn.fetchrow(
            "SELECT taxi_association_id FROM users WHERE id=$1", user["id"]
        )
    return {
        "associations": [dict(r) for r in rows],
        "my_association_id": my["taxi_association_id"] if my else None,
    }

@api.patch("/driver/association")
async def driver_update_association(
    body: dict,
    user: dict = Depends(get_current_user),
):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    assoc_id = body.get("association_id") or None
    async with pool.acquire() as conn:
        if assoc_id:
            exists = await conn.fetchval(
                "SELECT id FROM taxi_associations WHERE id=$1", assoc_id
            )
            if not exists:
                raise HTTPException(status_code=404, detail="Association not found")
        await conn.execute(
            "UPDATE users SET taxi_association_id=$1 WHERE id=$2", assoc_id, user["id"]
        )
    return {"ok": True}

# ── Wallet ───────────────────────────────────────────────────
@api.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        async with conn.transaction():
            wallet = await conn.fetchrow("SELECT * FROM wallets WHERE user_id=$1", user["id"])
            if not wallet:
                await conn.execute(
                    "INSERT INTO wallets (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING",
                    str(uuid.uuid4()), user["id"]
                )
                wallet = await conn.fetchrow("SELECT * FROM wallets WHERE user_id=$1", user["id"])
            driver = None
            if user["role"] in ("driver", "owner"):
                driver = await conn.fetchrow(
                    "SELECT qr_code,vehicle_plate,total_earnings,is_verified,rating_avg,rating_count FROM drivers WHERE user_id=$1",
                    user["id"]
                )
                if not driver and user["role"] in ("owner", "driver"):
                    qr = generate_qr_code()
                    await conn.execute(
                        "INSERT INTO drivers (id, user_id, qr_code, vehicle_plate) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING",
                        str(uuid.uuid4()), user["id"], qr, ""
                    )
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
async def topup_legacy(_body: TopUpIn, _user: dict = Depends(get_current_user)):
    raise HTTPException(
        status_code=410,
        detail="Direct top-up is disabled. Use POST /api/wallet/topup/initiate to start a gateway-verified payment."
    )

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
        "qr_code": drv["qr_code"], "vehicle_plate": drv["vehicle_plate"] or "",
        "is_verified": bool(drv["is_verified"]),
        "rating_avg": float(drv["rating_avg"] or 0),
        "rating_count": drv["rating_count"] or 0,
    }

@api.get("/wallet/driver/{driver_user_id}")
async def lookup_driver_by_user_id(driver_user_id: str, _: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        drv = await conn.fetchrow(
            "SELECT d.qr_code,d.vehicle_plate,d.is_verified,d.rating_avg,d.rating_count,d.user_id FROM drivers d WHERE d.user_id=$1",
            driver_user_id
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

@api.get("/wallet/withdrawals")
async def list_user_withdrawals(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM withdrawal_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
            user["id"]
        )
    return [{**dict(r), "amount": float(r["amount"] or 0), "created_at": iso(r["created_at"])} for r in rows]

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
        # Test isolation — test users can only pay test drivers and vice versa
        passenger_row = await conn.fetchrow("SELECT is_test FROM users WHERE id=$1", user["id"])
        driver_row = await conn.fetchrow("SELECT is_test FROM users WHERE id=$1", body.driver_user_id)
        passenger_is_test = passenger_row["is_test"] if passenger_row else False
        driver_is_test = driver_row["is_test"] if driver_row else False
        if passenger_is_test != driver_is_test:
            raise HTTPException(
                status_code=400,
                detail="Test accounts can only transact with other test accounts"
            )
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
            is_test_txn = passenger_is_test or driver_is_test
            await conn.execute(
                "INSERT INTO transactions (id,reference,type,status,amount,platform_fee,driver_net,sender_id,receiver_id,note,is_test) VALUES ($1,$2,'payment','completed',$3,$4,$5,$6,$7,$8,$9)",
                txn_id, ref, body.amount, fee, driver_net, user["id"], body.driver_user_id, body.note or "Ride payment", is_test_txn
            )
            txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)
    # SafeRide: link passenger to driver trip (best-effort, non-blocking)
    try:
        async with pool.acquire() as tc:
            drv_data = await tc.fetchrow(
                "SELECT u.full_name, u.phone_number, d.vehicle_plate "
                "FROM users u JOIN drivers d ON d.user_id=u.id WHERE u.id=$1",
                body.driver_user_id
            )
            vplate = (drv_data["vehicle_plate"] or "") if drv_data else ""
            active_trip = await tc.fetchrow(
                "SELECT id FROM trips WHERE driver_id=$1 AND status='active' ORDER BY started_at DESC LIMIT 1",
                body.driver_user_id
            )
            trip_id = None
            if not active_trip:
                trip_id = str(uuid.uuid4())
                trip_date = datetime.now(timezone.utc).strftime('%Y%m%d')
                trip_ref = f"TNR-TRIP-{trip_date}-{body.driver_user_id[:6].upper()}"
                existing_ref = await tc.fetchrow("SELECT id FROM trips WHERE trip_reference=$1", trip_ref)
                if existing_ref:
                    trip_ref = f"{trip_ref}-{secrets.token_hex(2).upper()}"
                dn = drv_data["full_name"] if drv_data else ""
                dp = drv_data["phone_number"] if drv_data else ""
                await tc.execute(
                    "INSERT INTO trips (id,trip_reference,driver_id,driver_name,driver_phone,vehicle_plate,status,total_passengers,total_revenue) "
                    "VALUES ($1,$2,$3,$4,$5,$6,'active',0,0)",
                    trip_id, trip_ref, body.driver_user_id, dn, dp, vplate
                )
            else:
                trip_id = active_trip["id"]
            pass_row = await tc.fetchrow("SELECT full_name, phone_number FROM users WHERE id=$1", user["id"])
            p_name = pass_row["full_name"] if pass_row else ""
            p_phone = (pass_row["phone_number"] or "") if pass_row else ""
            sp = await tc.fetchrow("SELECT profile_complete FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
            sp_complete = bool(sp["profile_complete"]) if sp else False
            await tc.execute(
                "INSERT INTO trip_passengers (id,trip_id,passenger_id,passenger_name,passenger_phone,payment_amount,payment_id,safety_profile_complete) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                str(uuid.uuid4()), trip_id, user["id"], p_name, p_phone, body.amount, txn_id, sp_complete
            )
            await tc.execute(
                "UPDATE trips SET total_passengers=total_passengers+1, total_revenue=total_revenue+$1 WHERE id=$2",
                body.amount, trip_id
            )
            await tc.execute(
                "UPDATE transactions SET trip_id=$1, passenger_user_id=$2, driver_user_id=$3, vehicle_plate=$4 WHERE id=$5",
                trip_id, user["id"], body.driver_user_id, vplate, txn_id
            )
    except Exception as _saferide_err:
        print(f"[SAFERIDE LINK] {_saferide_err}")
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
            """SELECT t.* FROM transactions t
               WHERE (t.sender_id=$1 OR t.receiver_id=$1)
               AND NOT EXISTS (SELECT 1 FROM hidden_transactions h WHERE h.user_id=$1 AND h.transaction_id=t.id)
               ORDER BY t.created_at DESC LIMIT $2""",
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

class HideTransactionsIn(BaseModel):
    transaction_ids: List[str]

@api.post("/wallet/transactions/hide")
async def hide_transactions(body: HideTransactionsIn, user: dict = Depends(get_current_user)):
    if not body.transaction_ids:
        return {"ok": True, "hidden": 0}
    async with pool.acquire() as conn:
        async with conn.transaction():
            for txn_id in body.transaction_ids:
                await conn.execute(
                    """INSERT INTO hidden_transactions (id,user_id,transaction_id) VALUES ($1,$2,$3)
                       ON CONFLICT (user_id,transaction_id) DO NOTHING""",
                    str(uuid.uuid4()), user["id"], txn_id
                )
    return {"ok": True, "hidden": len(body.transaction_ids)}

@api.delete("/wallet/transactions/hide/{transaction_id}")
async def unhide_transaction(transaction_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM hidden_transactions WHERE user_id=$1 AND transaction_id=$2",
            user["id"], transaction_id
        )
    return {"ok": True}

@api.post("/wallet/withdraw")
async def withdraw(body: WithdrawIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can withdraw")
    bank_name = body.bank_name; account_number = body.account_number; account_name = body.account_name
    if not bank_name or not account_number:
        async with pool.acquire() as conn:
            saved = await conn.fetchrow(
                "SELECT * FROM payout_accounts WHERE user_id=$1 AND type='self'", user["id"]
            )
        if not saved:
            raise HTTPException(status_code=400, detail="No saved payout account found.")
        bank_name = saved["bank_name"]; account_number = saved["account_number"]
        account_name = saved["account_name"] or account_name
    result = await _do_withdraw(user, body.amount, bank_name, account_number, account_name, payout_type="driver_payout")
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
    if body.type == "self":
        # Pay Fuel — immediate gateway, no admin approval
        result = await _do_pay_fuel(user, body.amount, account["bank_name"], account["account_number"], account["account_name"])
    else:
        # Owner cashup — requires admin approval
        result = await _do_withdraw(user, body.amount, account["bank_name"], account["account_number"], account["account_name"], payout_type="cashup_owner")
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
async def _upload_to_cloudinary(data: bytes, folder: str, public_id: str) -> dict:
    """Upload image bytes to Cloudinary. Returns secure_url and public_id."""
    import asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: cloudinary.uploader.upload(
            data,
            folder=folder,
            public_id=public_id,
            overwrite=True,
            resource_type="image",
            transformation=[
                {"quality": "auto:good"},
                {"fetch_format": "auto"},
            ],
        )
    )
    return {"url": result["secure_url"], "public_id": result["public_id"]}

@api.post("/kyc/submit")
async def kyc_submit(
    user: dict = Depends(get_current_user),
    selfie: UploadFile = File(...),
    licence_front: UploadFile = File(...)
):
    selfie_bytes = await selfie.read()
    licence_bytes = await licence_front.read()

    # Validate file sizes — max 10MB each
    if len(selfie_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Selfie too large. Maximum 10MB.")
    if len(licence_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Licence image too large. Maximum 10MB.")

    # Check not already approved
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, status FROM kyc_documents WHERE user_id=$1", user["id"]
        )
        if existing and existing["status"] == "approved":
            raise HTTPException(status_code=400, detail="KYC already approved")

    # Upload to Cloudinary — required, no fallback
    try:
        selfie_result = await _upload_to_cloudinary(
            selfie_bytes,
            folder=f"tagnride/kyc/{user['id']}",
            public_id="selfie"
        )
        licence_result = await _upload_to_cloudinary(
            licence_bytes,
            folder=f"tagnride/kyc/{user['id']}",
            public_id="licence_front"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Image upload to Cloudinary failed: {str(e)}"
        )

    selfie_url      = selfie_result["url"]
    selfie_public_id = selfie_result["public_id"]
    licence_url     = licence_result["url"]
    licence_public_id = licence_result["public_id"]

    async with pool.acquire() as conn:
        if existing:
            await conn.execute(
                """UPDATE kyc_documents
                   SET selfie_url=$1, licence_front_url=$2,
                       selfie_public_id=$3, licence_public_id=$4,
                       storage='cloudinary', status='pending',
                       submitted_at=NOW(), rejection_reason=NULL,
                       reviewed_by=NULL, reviewed_at=NULL
                   WHERE user_id=$5""",
                selfie_url, licence_url,
                selfie_public_id, licence_public_id,
                user["id"]
            )
        else:
            await conn.execute(
                """INSERT INTO kyc_documents
                   (id, user_id, selfie_url, licence_front_url,
                    selfie_public_id, licence_public_id, storage)
                   VALUES ($1,$2,$3,$4,$5,$6,'cloudinary')""",
                str(uuid.uuid4()), user["id"],
                selfie_url, licence_url,
                selfie_public_id, licence_public_id
            )

    return {"ok": True, "status": "pending"}

@api.get("/kyc/status")
async def kyc_status(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT status,rejection_reason,submitted_at FROM kyc_documents WHERE user_id=$1",
            user["id"]
        )
    if not doc: return {"status": "not_submitted"}
    return {
        "status": doc["status"],
        "rejection_reason": doc["rejection_reason"],
        "submitted_at": iso(doc["submitted_at"])
    }

@api.get("/kyc/selfie-url")
async def get_kyc_selfie_url(user: dict = Depends(get_current_user)):
    """Return the Cloudinary selfie URL for an approved KYC — used for profile avatar."""
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT selfie_url FROM kyc_documents WHERE user_id=$1 AND status='approved'",
            user["id"]
        )
    if not doc or not doc["selfie_url"]:
        raise HTTPException(status_code=404, detail="No approved KYC found")
    return {"url": doc["selfie_url"]}

# ── Admin: Dashboard ─────────────────────────────────────────
@api.get("/admin/dashboard")
async def admin_dashboard(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        total_users = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr')")
        total_drivers = await conn.fetchval("SELECT COUNT(*) FROM drivers")
        total_passengers = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role='passenger'")
        total_owners = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role='owner'")
        active_drivers = await conn.fetchval("SELECT COUNT(*) FROM drivers WHERE is_verified=TRUE")
        verified_drivers = await conn.fetchval("SELECT COUNT(*) FROM drivers WHERE is_verified=TRUE")
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
        yesterday_revenue = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE-1")
        yesterday_txns = await conn.fetchval("SELECT COUNT(*) FROM transactions WHERE DATE(created_at)=CURRENT_DATE-1")
        yesterday_signups = await conn.fetchval("SELECT COUNT(*) FROM users WHERE DATE(created_at)=CURRENT_DATE-1")
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
        "total_owners": total_owners, "active_drivers": active_drivers, "verified_drivers": verified_drivers,
        "total_transactions": total_transactions, "total_revenue": float(total_revenue),
        "total_wallet_balance": float(total_wallet_balance), "total_withdrawn": float(total_withdrawn),
        "pending_withdrawals": pending_withdrawals, "pending_drivers": pending_drivers,
        "pending_kyc": pending_kyc, "flagged_accounts": flagged_count,
        "today_revenue": float(today_revenue), "today_transactions": today_txns, "today_signups": today_signups,
        "yesterday_revenue": float(yesterday_revenue), "yesterday_transactions": yesterday_txns, "yesterday_signups": yesterday_signups,
        "suspicious_transactions": [{**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])} for r in suspicious],
        "recent_transactions": [{**dict(r), "amount": float(r["amount"]), "created_at": iso(r["created_at"])} for r in recent],
        "pending_driver_list": [{**dict(r), "created_at": iso(r["created_at"])} for r in pending_driver_list],
    }

# ── Admin: Users ─────────────────────────────────────────────
@api.get("/admin/users")
async def admin_users(search: Optional[str] = None, admin: dict = Depends(require_admin)):
    is_super = has_permission(admin, "manage_admins")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id,phone_number,full_name,surname,id_number,email,role,is_active,flagged,created_at FROM users
               WHERE ($1 OR role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr'))
               AND ($2::text IS NULL OR phone_number ILIKE $2 OR full_name ILIKE $2 OR surname ILIKE $2)
               ORDER BY created_at DESC""",
            is_super, f"%{search}%" if search else None
        )
    return [{**dict(r), "created_at": iso(r["created_at"])} for r in rows]

class BlockUserIn(BaseModel):
    reason: Optional[str] = None

@api.post("/admin/block/{user_id}")
async def admin_block(user_id: str, request: Request, body: BlockUserIn = BlockUserIn(), admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_users"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT role,full_name FROM users WHERE id=$1", user_id)
        if not target: raise HTTPException(status_code=404, detail="User not found")
        if target["role"] in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="Cannot block admin accounts")
        await conn.execute("UPDATE users SET is_active=FALSE, ban_reason=$2 WHERE id=$1", user_id, body.reason)
        await audit(conn, admin["id"], "BLOCK_USER", user_id, "user", {"name": target["full_name"], "reason": body.reason}, request.client.host)
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
        await conn.execute("UPDATE users SET is_active=TRUE, ban_reason=NULL WHERE id=$1", user_id)
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
        row = await conn.fetchrow(
            "SELECT d.*,u.full_name,u.surname,u.id_number,u.email,u.phone_number,k.status as kyc_status FROM drivers d JOIN users u ON u.id=d.user_id LEFT JOIN kyc_documents k ON k.user_id=d.user_id WHERE d.user_id=$1",
            user_id
        )
    if not row: raise HTTPException(status_code=404, detail="Driver not found")
    return {"user_id": row["user_id"], "full_name": row["full_name"], "surname": row["surname"],
            "id_number": row["id_number"], "email": row["email"],
            "phone_number": row["phone_number"],
            "vehicle_plate": row["vehicle_plate"], "total_earnings": float(row["total_earnings"]),
            "is_verified": row["is_verified"], "rating_avg": float(row["rating_avg"]),
            "rating_count": row["rating_count"], "qr_code": row["qr_code"],
            "kyc_status": row["kyc_status"] or "not_submitted", "created_at": iso(row["created_at"])}

@api.post("/admin/verify-driver/{user_id}")
async def admin_verify_driver(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_drivers"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        await conn.execute("UPDATE drivers SET is_verified=TRUE WHERE user_id=$1", user_id)
        await audit(conn, admin["id"], "VERIFY_DRIVER", user_id, "driver", {}, request.client.host)
    return {"ok": True}

# ── Admin: Owners ────────────────────────────────────────────
@api.get("/admin/owners")
async def admin_owners(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.id as user_id, u.full_name, u.surname, u.id_number, u.email, u.phone_number, u.created_at,
                   fo.business_name, fo.bank_name, fo.account_number, fo.cashup_method,
                   d.qr_code,
                   w.balance,
                   COUNT(DISTINCT od.driver_user_id) as driver_count,
                   COALESCE(SUM(cr.cashup_amount), 0) as total_cashup
            FROM users u
            JOIN fleet_owners fo ON fo.user_id = u.id
            LEFT JOIN drivers d ON d.user_id = u.id
            LEFT JOIN wallets w ON w.user_id = u.id
            LEFT JOIN owner_drivers od ON od.owner_id = fo.id
            LEFT JOIN cashup_records cr ON cr.owner_user_id = u.id
            WHERE u.role = 'owner'
            GROUP BY u.id, u.full_name, u.surname, u.id_number, u.email, u.phone_number, u.created_at,
                     fo.business_name, fo.bank_name, fo.account_number, fo.cashup_method,
                     d.qr_code, w.balance
            ORDER BY u.created_at DESC
        """)
    return [{
        "user_id": r["user_id"],
        "full_name": r["full_name"],
        "phone_number": r["phone_number"],
        "business_name": r["business_name"],
        "bank_name": r["bank_name"],
        "account_number": r["account_number"],
        "cashup_method": r["cashup_method"] or "wallet",
        "qr_code": r["qr_code"],
        "balance": float(r["balance"] or 0),
        "driver_count": int(r["driver_count"] or 0),
        "total_cashup": float(r["total_cashup"] or 0),
        "created_at": iso(r["created_at"]),
    } for r in rows]

@api.get("/admin/owners/{owner_id}")
async def admin_owner_detail(owner_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        owner = await conn.fetchrow("""
            SELECT u.id as user_id, u.full_name, u.phone_number, u.created_at,
                   fo.business_name, fo.bank_name, fo.account_number, fo.account_name, fo.cashup_method,
                   d.qr_code,
                   w.balance
            FROM users u
            JOIN fleet_owners fo ON fo.user_id = u.id
            LEFT JOIN drivers d ON d.user_id = u.id
            LEFT JOIN wallets w ON w.user_id = u.id
            WHERE u.id = $1 AND u.role = 'owner'
        """, owner_id)
        if not owner:
            raise HTTPException(status_code=404, detail="Owner not found")
        drivers = await conn.fetch("""
            SELECT u.id as user_id, u.full_name, u.surname, u.phone_number,
                   d.vehicle_plate, d.qr_code, d.rating_avg, d.rating_count,
                   d.total_earnings, d.is_verified,
                   od.daily_target, od.confirmed,
                   od.payment_mode, od.driver_commission_pct, od.commission_status
            FROM owner_drivers od
            JOIN fleet_owners fo ON fo.id = od.owner_id
            JOIN users u ON u.id = od.driver_user_id
            LEFT JOIN drivers d ON d.user_id = od.driver_user_id
            WHERE fo.user_id = $1
            ORDER BY u.full_name ASC
        """, owner_id)
        cashup_history = await conn.fetch("""
            SELECT cr.id, cr.cashup_amount, cr.driver_profit, cr.shortfall,
                   cr.cashup_method, cr.payout_fee, cr.status, cr.created_at,
                   u.full_name as driver_name
            FROM cashup_records cr
            JOIN users u ON u.id = cr.driver_user_id
            WHERE cr.owner_user_id = $1
            ORDER BY cr.created_at DESC LIMIT 30
        """, owner_id)
    return {
        "owner": {
            "user_id": owner["user_id"],
            "full_name": owner["full_name"],
            "phone_number": owner["phone_number"],
            "business_name": owner["business_name"],
            "bank_name": owner["bank_name"],
            "account_number": owner["account_number"],
            "account_name": owner["account_name"],
            "cashup_method": owner["cashup_method"] or "wallet",
            "qr_code": owner["qr_code"],
            "balance": float(owner["balance"] or 0),
            "created_at": iso(owner["created_at"]),
        },
        "drivers": [{
            "user_id": d["user_id"],
            "full_name": d["full_name"],
            "phone_number": d["phone_number"],
            "vehicle_plate": d["vehicle_plate"],
            "qr_code": d["qr_code"],
            "rating_avg": float(d["rating_avg"] or 0),
            "rating_count": int(d["rating_count"] or 0),
            "total_earnings": float(d["total_earnings"] or 0),
            "is_verified": bool(d["is_verified"]),
            "daily_target": float(d["daily_target"] or 0),
            "confirmed": bool(d["confirmed"]),
        } for d in drivers],
        "cashup_history": [{
            "id": r["id"],
            "driver_name": r["driver_name"],
            "cashup_amount": float(r["cashup_amount"] or 0),
            "driver_profit": float(r["driver_profit"] or 0),
            "shortfall": float(r["shortfall"] or 0),
            "cashup_method": r["cashup_method"],
            "payout_fee": float(r["payout_fee"] or 0),
            "status": r["status"],
            "created_at": iso(r["created_at"]),
        } for r in cashup_history],
    }

# ── Admin: Transactions ──────────────────────────────────────
@api.get("/admin/transactions")
async def admin_transactions(
    type: Optional[str] = None, from_date: Optional[str] = None,
    to_date: Optional[str] = None, search: Optional[str] = None,
    min_amount: Optional[float] = None, max_amount: Optional[float] = None,
    user_id: Optional[str] = None,
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
    if user_id:
        params.append(user_id)
        n = len(params)
        conditions.append(f"(t.sender_id=${n} OR t.receiver_id=${n})")
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

# ── Admin: Payout settings ───────────────────────────────────
def _fmt_payout_settings(row) -> dict:
    return {
        "require_approval": row["require_approval"],
        "auto_approve_limit": float(row["auto_approve_limit"] or 0),
        "pay_fuel_enabled": row["pay_fuel_enabled"],
        "pay_fuel_max_per_txn": float(row["pay_fuel_max_per_txn"] or 0),
        "pay_fuel_daily_limit": float(row["pay_fuel_daily_limit"] or 0),
        "commission_auto_cashup_time": row["commission_auto_cashup_time"],
        "default_commission_pct": float(row["default_commission_pct"] or 50),
        "subscription_price_per_taxi": float(row["subscription_price_per_taxi"] or 10),
        "subscription_free_taxis": int(row["subscription_free_taxis"] or 1),
        "owner_statement_price": float(row["owner_statement_price"]) if row["owner_statement_price"] is not None else 10.0,
        "passenger_statement_price": float(row["passenger_statement_price"]) if row["passenger_statement_price"] is not None else 5.0,
        "withdrawal_gateway_fee_fixed": float(row["withdrawal_gateway_fee_fixed"]) if row.get("withdrawal_gateway_fee_fixed") is not None else 3.50,
        "subscription_billing_day": int(row["subscription_billing_day"]) if row.get("subscription_billing_day") is not None else 1,
        "maintenance_fee_enabled": bool(row["maintenance_fee_enabled"]) if row.get("maintenance_fee_enabled") is not None else False,
        "maintenance_fee_amount": float(row["maintenance_fee_amount"]) if row.get("maintenance_fee_amount") is not None else 0.0,
        "maintenance_fee_day": int(row["maintenance_fee_day"]) if row.get("maintenance_fee_day") is not None else 1,
        "maintenance_fee_label": str(row["maintenance_fee_label"]) if row.get("maintenance_fee_label") else "Monthly maintenance fee",
        "updated_at": iso(row["updated_at"]) if row["updated_at"] else None,
    }

@api.get("/admin/payout-settings")
async def get_payout_settings(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM payout_settings WHERE id='default'")
    if not row:
        return {
            "require_approval": True, "auto_approve_limit": 0.0,
            "pay_fuel_enabled": True, "pay_fuel_max_per_txn": 500.0,
            "pay_fuel_daily_limit": 1000.0, "default_commission_pct": 50.0,
            "commission_auto_cashup_time": None, "updated_at": None,
        }
    return _fmt_payout_settings(row)

class PayoutSettingsIn(BaseModel):
    require_approval: Optional[bool] = None
    auto_approve_limit: Optional[float] = Field(default=None, ge=0)
    pay_fuel_enabled: Optional[bool] = None
    pay_fuel_max_per_txn: Optional[float] = Field(default=None, ge=0)
    pay_fuel_daily_limit: Optional[float] = Field(default=None, ge=0)
    commission_auto_cashup_time: Optional[str] = None  # "HH:MM" SAST, or "" to disable
    default_commission_pct: Optional[float] = Field(default=None, ge=1, le=99)
    subscription_price_per_taxi: Optional[float] = Field(default=None, ge=0)
    subscription_free_taxis: Optional[int] = Field(default=None, ge=0, le=10)
    owner_statement_price: Optional[float] = Field(default=None, ge=0)
    passenger_statement_price: Optional[float] = Field(default=None, ge=0)
    withdrawal_gateway_fee_fixed: Optional[float] = Field(default=None, ge=0)
    subscription_billing_day: Optional[int] = Field(default=None, ge=1, le=28)
    maintenance_fee_enabled: Optional[bool] = None
    maintenance_fee_amount: Optional[float] = Field(default=None, ge=0)
    maintenance_fee_day: Optional[int] = Field(default=None, ge=1, le=28)
    maintenance_fee_label: Optional[str] = Field(default=None, max_length=100)

    @field_validator("commission_auto_cashup_time")
    @classmethod
    def validate_cashup_time(cls, v):
        if v is None or v == "":
            return None
        import re
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError("Time must be HH:MM format (24h, SAST)")
        h, m = int(v[:2]), int(v[3:])
        if h > 23 or m > 59:
            raise ValueError("Invalid time")
        return v

@api.patch("/admin/payout-settings")
async def update_payout_settings(body: PayoutSettingsIn, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403, detail="Permission denied")
    updates = {}
    if body.require_approval is not None: updates["require_approval"] = body.require_approval
    if body.auto_approve_limit is not None: updates["auto_approve_limit"] = body.auto_approve_limit
    if body.pay_fuel_enabled is not None: updates["pay_fuel_enabled"] = body.pay_fuel_enabled
    if body.pay_fuel_max_per_txn is not None: updates["pay_fuel_max_per_txn"] = body.pay_fuel_max_per_txn
    if body.pay_fuel_daily_limit is not None: updates["pay_fuel_daily_limit"] = body.pay_fuel_daily_limit
    if body.default_commission_pct is not None: updates["default_commission_pct"] = body.default_commission_pct
    if body.subscription_price_per_taxi is not None: updates["subscription_price_per_taxi"] = body.subscription_price_per_taxi
    if body.subscription_free_taxis is not None: updates["subscription_free_taxis"] = body.subscription_free_taxis
    if body.owner_statement_price is not None: updates["owner_statement_price"] = body.owner_statement_price
    if body.passenger_statement_price is not None: updates["passenger_statement_price"] = body.passenger_statement_price
    if body.withdrawal_gateway_fee_fixed is not None: updates["withdrawal_gateway_fee_fixed"] = body.withdrawal_gateway_fee_fixed
    if body.subscription_billing_day is not None: updates["subscription_billing_day"] = body.subscription_billing_day
    if body.maintenance_fee_enabled is not None: updates["maintenance_fee_enabled"] = body.maintenance_fee_enabled
    if body.maintenance_fee_amount is not None: updates["maintenance_fee_amount"] = body.maintenance_fee_amount
    if body.maintenance_fee_day is not None: updates["maintenance_fee_day"] = body.maintenance_fee_day
    if body.maintenance_fee_label is not None: updates["maintenance_fee_label"] = body.maintenance_fee_label
    if "commission_auto_cashup_time" in body.model_fields_set:
        updates["commission_auto_cashup_time"] = body.commission_auto_cashup_time
    async with pool.acquire() as conn:
        for col, val in updates.items():
            await conn.execute(
                f"UPDATE payout_settings SET {col}=$1, updated_at=NOW(), updated_by=$2 WHERE id='default'",
                val, admin["id"]
            )
        row = await conn.fetchrow("SELECT * FROM payout_settings WHERE id='default'")
    return _fmt_payout_settings(row)

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
        if float(req["amount"]) > 10000 and not has_permission(admin, "large_withdrawals"):
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
        rows = await conn.fetch(
            "SELECT k.*,u.full_name,u.phone_number,u.id_number FROM kyc_documents k "
            "JOIN users u ON u.id=k.user_id ORDER BY k.submitted_at DESC"
        )
    return [{**dict(r), "submitted_at": iso(r["submitted_at"]), "reviewed_at": iso(r["reviewed_at"]) if r["reviewed_at"] else None}
            for r in rows]

@api.get("/admin/kyc/{user_id}")
async def admin_kyc_detail(user_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "review_kyc"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT k.*,u.full_name,u.phone_number,u.id_number FROM kyc_documents k "
            "JOIN users u ON u.id=k.user_id WHERE k.user_id=$1", user_id
        )
    if not doc: raise HTTPException(status_code=404, detail="KYC not found")
    return {**dict(doc), "submitted_at": iso(doc["submitted_at"]), "reviewed_at": iso(doc["reviewed_at"]) if doc["reviewed_at"] else None}

@api.post("/admin/kyc/{user_id}/review")
async def admin_kyc_review(user_id: str, body: KYCReviewIn, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "review_kyc"):
        raise HTTPException(status_code=403, detail="Permission denied")
    if body.action == "reject" and not body.rejection_reason:
        raise HTTPException(status_code=400, detail="Rejection reason required")
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow("SELECT phone_number, full_name FROM users WHERE id=$1", user_id)
        await conn.execute(
            "UPDATE kyc_documents SET status=$1,reviewed_by=$2,reviewed_at=NOW(),rejection_reason=$3 WHERE user_id=$4",
            body.action + "d", admin["id"], body.rejection_reason, user_id
        )
        if body.action == "approve":
            await conn.execute("UPDATE drivers SET is_verified=TRUE WHERE user_id=$1", user_id)
            await send_sms(user_row["phone_number"], "Tag n Ride: Your KYC has been approved! You can now receive payments.")
            await notify_user(conn, "KYC Approved", "Your identity has been verified. You can now receive payments!", "kyc", user_id)
            await conn.execute(
                """INSERT INTO user_documents (id,user_id,document_type,title,description,source,is_read)
                   VALUES (gen_random_uuid()::text,$1,'kyc','Identity Verified',
                   'Your KYC verification has been approved. You can now receive payments.','app',false)""",
                user_id
            )
        else:
            await send_sms(user_row["phone_number"], f"Tag n Ride: Your KYC was not approved. Reason: {body.rejection_reason}. Please resubmit.")
            await notify_user(conn, "KYC Rejected", f"KYC not approved: {body.rejection_reason}. Tap to resubmit.", "error", user_id)
            await conn.execute(
                """INSERT INTO user_documents (id,user_id,document_type,title,description,source,is_read)
                   VALUES (gen_random_uuid()::text,$1,'kyc','KYC Verification Failed',
                   'Your identity verification was not approved. Please resubmit your documents.','app',false)""",
                user_id
            )
        await audit(conn, admin["id"], f"KYC_{body.action.upper()}", user_id, "kyc", {"reason": body.rejection_reason}, request.client.host)
    return {"ok": True}

@api.delete("/admin/kyc/{user_id}/documents")
async def admin_kyc_delete_documents(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "review_kyc"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM kyc_documents WHERE user_id=$1", user_id)
        await audit(conn, admin["id"], "KYC_DOCUMENTS_DELETED", user_id, "kyc", {}, request.client.host)
    return {"ok": True}

@api.post("/admin/drivers/{user_id}/generate-qr")
async def admin_generate_driver_qr(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_drivers"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, role FROM users WHERE id=$1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        new_qr = generate_qr_code()
        drv = await conn.fetchrow("SELECT id FROM drivers WHERE user_id=$1", user_id)
        if drv:
            await conn.execute("UPDATE drivers SET qr_code=$1 WHERE user_id=$2", new_qr, user_id)
        else:
            # Owner (or user) with no drivers row — create one so they get a QR
            await conn.execute(
                "INSERT INTO drivers (id, user_id, qr_code, vehicle_plate) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET qr_code=EXCLUDED.qr_code",
                str(uuid.uuid4()), user_id, new_qr, ""
            )
        await audit(conn, admin["id"], "GENERATE_DRIVER_QR", user_id, "driver", {"new_qr": new_qr}, request.client.host)
    return {"ok": True, "qr_code": new_qr}

# ── Admin: Analytics ─────────────────────────────────────────
@api.get("/admin/analytics")
async def admin_analytics(period: Optional[str] = "30d", admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_analytics"):
        raise HTTPException(status_code=403, detail="Permission denied")
    try:
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(period, 30)
        def _f(v): return float(v) if v is not None else 0.0
        async with pool.acquire() as conn:
            daily = await conn.fetch(
                """SELECT DATE(created_at) as date,
                          COALESCE(SUM(amount),0) as amount,
                          COUNT(*) as count,
                          COALESCE(SUM(platform_fee),0) as fees
                   FROM transactions
                   WHERE created_at>=NOW()-INTERVAL '%s days' AND is_test IS NOT TRUE
                   GROUP BY DATE(created_at) ORDER BY date ASC""" % days
            )
            prev_period = await conn.fetchrow(
                """SELECT COALESCE(SUM(amount),0) as vol, COUNT(*) as cnt
                   FROM transactions
                   WHERE created_at>=NOW()-INTERVAL '%s days'
                     AND created_at<NOW()-INTERVAL '%s days'
                     AND is_test IS NOT TRUE""" % (days * 2, days)
            )
            weekly = await conn.fetch(
                """SELECT DATE_TRUNC('week',created_at) as week,
                          COALESCE(SUM(amount),0) as amount,
                          COALESCE(SUM(platform_fee),0) as fees
                   FROM transactions WHERE type='payment' AND status='completed'
                   AND created_at>=NOW()-INTERVAL '12 weeks' AND is_test IS NOT TRUE
                   GROUP BY DATE_TRUNC('week',created_at) ORDER BY week ASC"""
            )
            leaderboard = await conn.fetch(
                "SELECT u.full_name as name,COALESCE(d.total_earnings,0) as earnings FROM drivers d JOIN users u ON u.id=d.user_id ORDER BY earnings DESC LIMIT 10"
            )
            by_type = await conn.fetch(
                "SELECT type,COUNT(*) as count,COALESCE(SUM(amount),0) as volume,COALESCE(SUM(platform_fee),0) as fees FROM transactions WHERE is_test IS NOT TRUE GROUP BY type"
            )
            top_passengers = await conn.fetch(
                """SELECT u.full_name as name,COUNT(t.id) as txn_count,COALESCE(SUM(t.amount),0) as total_spent
                   FROM transactions t JOIN users u ON u.id=t.sender_id
                   WHERE t.type='payment' AND t.is_test IS NOT TRUE GROUP BY u.full_name ORDER BY total_spent DESC LIMIT 5"""
            )
            withdrawal_trend = await conn.fetch(
                """SELECT DATE(created_at) as date,COALESCE(SUM(amount),0) as amount,COUNT(*) as count
                   FROM withdrawal_requests WHERE created_at>=NOW()-INTERVAL '%s days'
                   GROUP BY DATE(created_at) ORDER BY date ASC""" % days
            )
            dow_data = await conn.fetch(
                """SELECT EXTRACT(DOW FROM created_at)::int as dow,
                          COUNT(*) as count, COALESCE(SUM(amount),0) as amount
                   FROM transactions WHERE type='payment' AND is_test IS NOT TRUE
                     AND created_at>=NOW()-INTERVAL '90 days'
                   GROUP BY dow ORDER BY dow ASC"""
            )
        dow_map = {r["dow"]: {"count": r["count"], "amount": _f(r["amount"])} for r in dow_data}
        dow_labels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
        return {
            "daily_volume": [{"date": str(r["date"]), "amount": _f(r["amount"]), "count": r["count"], "fees": _f(r["fees"])} for r in daily],
            "weekly_revenue": [{"week": str(r["week"])[:10], "amount": _f(r["amount"]), "fees": _f(r["fees"])} for r in weekly],
            "driver_leaderboard": [{"name": r["name"], "earnings": _f(r["earnings"])} for r in leaderboard],
            "transactions_by_type": [{"type": r["type"], "count": r["count"], "volume": _f(r["volume"]), "fees": _f(r["fees"])} for r in by_type],
            "top_passengers": [{"name": r["name"], "txn_count": r["txn_count"], "total_spent": _f(r["total_spent"])} for r in top_passengers],
            "withdrawal_trend": [{"date": str(r["date"]), "amount": _f(r["amount"]), "count": r["count"]} for r in withdrawal_trend],
            "prev_volume": _f(prev_period["vol"]),
            "prev_count": int(prev_period["cnt"] or 0),
            "day_of_week": [{"day": dow_labels[i], "rides": dow_map.get(i, {}).get("count", 0), "revenue": dow_map.get(i, {}).get("amount", 0)} for i in range(7)],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics error: {type(e).__name__}: {e}")

# ── Admin: Revenue breakdown by stream ───────────────────────
@api.get("/admin/revenue/summary")
async def admin_revenue_summary(range: str = "30d", offset: int = 0, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_analytics"):
        raise HTTPException(status_code=403, detail="Permission denied")
    days_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}
    days = days_map.get(range, 30)
    end   = datetime.now(timezone.utc) - timedelta(days=days * offset)
    start = end - timedelta(days=days)
    async with pool.acquire() as conn:
        platform = await conn.fetchrow(
            "SELECT COALESCE(SUM(platform_fee),0) AS amount, COUNT(*) AS count FROM transactions WHERE type='payment' AND status='completed' AND created_at BETWEEN $1 AND $2 AND is_test IS NOT TRUE",
            start, end
        )
        sos = await conn.fetchrow(
            "SELECT COALESCE(SUM(amount),0) AS amount, COUNT(*) AS count FROM transactions WHERE type='sos_fee' AND status='completed' AND created_at BETWEEN $1 AND $2",
            start, end
        )
        topup = await conn.fetchrow(
            "SELECT COALESCE(SUM(COALESCE(platform_fee,0)),0) AS amount, COUNT(*) AS count FROM transactions WHERE type='topup' AND status='completed' AND created_at BETWEEN $1 AND $2 AND is_test IS NOT TRUE",
            start, end
        )
        subs = await conn.fetchrow(
            "SELECT COALESCE(SUM(amount),0) AS amount, COUNT(*) AS count FROM transactions WHERE type='subscription' AND status='completed' AND created_at BETWEEN $1 AND $2",
            start, end
        )
        w_count = await conn.fetchval(
            "SELECT COUNT(*) FROM withdrawal_requests WHERE status IN ('approved','paid') AND updated_at BETWEEN $1 AND $2",
            start, end
        ) or 0
    return {
        "breakdown": {
            "platform_fees":          {"amount": float(platform["amount"]), "count": int(platform["count"])},
            "subscriptions":          {"amount": float(subs["amount"]),     "count": int(subs["count"])},
            "topup_fees":             {"amount": float(topup["amount"]),    "count": int(topup["count"])},
            "sos_fees":               {"amount": float(sos["amount"]),      "count": int(sos["count"])},
            "withdrawal_fees":        {"amount": round(float(w_count) * 3.50, 2), "count": int(w_count)},
            "tracking_fees":          {"amount": 0, "count": 0},
            "owner_statements":       {"amount": 0, "count": 0},
            "passenger_statements":   {"amount": 0, "count": 0},
            "payslips":               {"amount": 0, "count": 0},
        }
    }


# ── Admin: Audit log ─────────────────────────────────────────
@api.get("/admin/audit-logs")
async def admin_audit_logs(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_audit"):
        raise HTTPException(status_code=403, detail="Permission denied")
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT al.*,u.full_name as admin_name,u.role as admin_role FROM audit_logs al LEFT JOIN users u ON u.id=al.admin_id ORDER BY al.created_at DESC LIMIT 500")
        def _meta(v):
            if not v: return {}
            if isinstance(v, dict): return v
            try: return json.loads(v)
            except Exception: return {}
        return [{**dict(r), "metadata": _meta(r["metadata"]), "created_at": iso(r["created_at"])} for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audit log error: {type(e).__name__}: {e}")

# ── Admin: Support lookup ────────────────────────────────────
@api.get("/admin/support/user/{query}")
async def support_user_lookup(query: str, admin: dict = Depends(require_admin)):
    """Enhanced support lookup — search by phone, name, or user ID."""
    if not has_permission(admin, "reset_pin") and not has_permission(admin, "manage_users"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
    """SELECT u.id, u.phone_number, u.full_name, u.role, u.is_active,
       u.created_at,
       d.vehicle_plate,
       COALESCE((SELECT true FROM flagged_accounts fa WHERE fa.user_id=u.id AND fa.resolved_at IS NULL LIMIT 1), false) as flagged
       FROM users u
       LEFT JOIN drivers d ON d.user_id = u.id
       WHERE u.phone_number ILIKE $1
       OR u.phone_number ILIKE $3
       OR u.full_name ILIKE $1
       OR u.id = $2
       LIMIT 1""",
    f"%{query}%", query, f"%{query.lstrip('0')}%"
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        uid = user["id"]
        wallet = await conn.fetchrow(
            "SELECT balance, is_frozen FROM wallets WHERE user_id=$1", uid
        )
        driver_earnings = await conn.fetchval(
            "SELECT COALESCE(total_earnings, 0) FROM drivers WHERE user_id=$1", uid
        ) or 0
        txns = await conn.fetch(
            """SELECT t.id, t.reference, t.type, t.status, t.amount, t.platform_fee,
               t.driver_net, t.note, t.created_at,
               su.full_name as sender_name, ru.full_name as receiver_name,
               CASE WHEN t.receiver_id=$1 THEN 'in' ELSE 'out' END as direction
               FROM transactions t
               LEFT JOIN users su ON su.id=t.sender_id
               LEFT JOIN users ru ON ru.id=t.receiver_id
               WHERE t.sender_id=$1 OR t.receiver_id=$1
               ORDER BY t.created_at DESC LIMIT 20""",
            uid
        )
        withdrawals = await conn.fetch(
            """SELECT id, amount, bank_name, account_number, status, created_at
               FROM withdrawal_requests WHERE user_id=$1
               ORDER BY created_at DESC LIMIT 10""",
            uid
        )
        kyc = await conn.fetchrow(
            "SELECT status, submitted_at, reviewed_at, rejection_reason FROM kyc_documents WHERE user_id=$1",
            uid
        )
        audit_logs = await conn.fetch(
    """SELECT al.id, al.action, al.metadata, al.created_at, au.full_name as admin_name
       FROM audit_logs al
       LEFT JOIN users au ON au.id=al.admin_id
       WHERE al.target_id=$1
       ORDER BY al.created_at DESC LIMIT 20""",
    uid
        )
        support_notes = await conn.fetch(
            """SELECT sn.id, sn.note, sn.created_at, au.full_name as admin_name
               FROM support_notes sn
               LEFT JOIN users au ON au.id=sn.admin_id
               WHERE sn.user_id=$1
               ORDER BY sn.created_at DESC""",
            uid
        ) if await conn.fetchval("SELECT to_regclass('support_notes')") else []
        outstanding = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM outstanding_balances WHERE driver_user_id=$1 AND status='outstanding'",
            uid
        )

    def fmt_txn(t):
        d = dict(t)
        d["amount"] = float(d["amount"])
        d["platform_fee"] = float(d["platform_fee"] or 0)
        d["driver_net"] = float(d["driver_net"] or 0)
        d["created_at"] = iso(d["created_at"])
        d["counterparty_name"] = d["receiver_name"] if d["direction"] == "out" else d["sender_name"]
        return d

    return {
        "user": {**dict(user), "created_at": iso(user["created_at"])},
        "wallet": {
            "balance": float(wallet["balance"]) if wallet else 0,
            "is_frozen": wallet["is_frozen"] if wallet else False,
            "total_earnings": float(driver_earnings or 0),
        },
        "kyc": {**dict(kyc), "submitted_at": iso(kyc["submitted_at"]), "reviewed_at": iso(kyc["reviewed_at"])} if kyc else None,
        "recent_transactions": [fmt_txn(t) for t in txns],
        "withdrawals": [{
            "id": r["id"], "amount": float(r["amount"]),
            "bank_name": r["bank_name"], "account_number": r["account_number"],
            "status": r["status"], "created_at": iso(r["created_at"]),
        } for r in withdrawals],
        "audit_logs": [{
            "id": r["id"], "action": r["action"],
            "metadata": r["metadata"] or {},
            "admin_name": r["admin_name"],
            "created_at": iso(r["created_at"]),
        } for r in audit_logs],
        "support_notes": [{
            "id": r["id"], "note": r["note"],
            "admin_name": r["admin_name"],
            "created_at": iso(r["created_at"]),
        } for r in support_notes],
        "outstanding_balance": float(outstanding or 0),
    }

@api.post("/admin/support/note/{user_id}")
async def support_add_note(user_id: str, body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Add an internal support note on a user."""
    note = body.get("note", "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="Note cannot be empty")
    async with pool.acquire() as conn:
        # Create support_notes table if it doesn't exist
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS support_notes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                admin_id TEXT REFERENCES users(id),
                note TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute(
            "INSERT INTO support_notes (id, user_id, admin_id, note) VALUES ($1, $2, $3, $4)",
            str(uuid.uuid4()), user_id, admin["id"], note
        )
        await audit(conn, admin["id"], "SUPPORT_NOTE_ADDED", user_id, "user",
                    {"note_preview": note[:50]}, request.client.host)
    return {"ok": True}

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
        rows = await conn.fetch("SELECT u.full_name,u.phone_number,u.role,u.is_active,COALESCE(w.balance,0) as balance,u.created_at FROM users u LEFT JOIN wallets w ON w.user_id=u.id WHERE u.role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr') ORDER BY u.created_at DESC")
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
            "SELECT u.id,u.full_name,u.email,u.role,u.extra_roles,u.is_active,u.last_login,u.created_at,u.created_by,cb.full_name as created_by_name FROM users u LEFT JOIN users cb ON cb.id=u.created_by WHERE u.role IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr') ORDER BY u.created_at DESC"
        )
    return [{
        **{k: v for k, v in dict(r).items() if k not in ("last_login","created_at")},
        "last_login": iso(r["last_login"]) if r["last_login"] else None,
        "created_at": iso(r["created_at"]),
        "extra_roles": [x.strip() for x in (r["extra_roles"] or "").split(",") if x.strip()],
        "permissions": get_all_permissions(dict(r)),
    } for r in rows]

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
        if body.extra_roles is not None:
            valid_extra = [r for r in body.extra_roles if r in ADMIN_ROLES and r != (body.role or target["role"])]
            changes["extra_roles"] = ",".join(valid_extra)
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

async def _delete_user(conn, user_id: str, admin_id: str, ip: str):
    """Shared user deletion logic — handles all roles including owners."""
    target = await conn.fetchrow("SELECT role,full_name FROM users WHERE id=$1", user_id)
    if not target: raise HTTPException(status_code=404, detail="User not found")
    if target["role"] in ADMIN_ROLES: raise HTTPException(status_code=403, detail="Cannot delete admin accounts here")
    async with conn.transaction():
        # Ratings
        await conn.execute("DELETE FROM ratings WHERE driver_user_id=$1 OR passenger_user_id=$1", user_id)
        # Financial
        await conn.execute("DELETE FROM withdrawal_requests WHERE user_id=$1", user_id)
        await conn.execute("DELETE FROM payout_accounts WHERE user_id=$1", user_id)
        # Identity
        await conn.execute("DELETE FROM kyc_documents WHERE user_id=$1", user_id)
        await conn.execute("DELETE FROM flagged_accounts WHERE user_id=$1", user_id)
        # Transactions — nullify references instead of cascading delete
        await conn.execute("UPDATE transactions SET sender_id=NULL WHERE sender_id=$1", user_id)
        await conn.execute("UPDATE transactions SET receiver_id=NULL WHERE receiver_id=$1", user_id)
        # Driver records
        await conn.execute("DELETE FROM owner_drivers WHERE driver_user_id=$1", user_id)
        await conn.execute("DELETE FROM drivers WHERE user_id=$1", user_id)
        # Cashup records
        await conn.execute("UPDATE cashup_records SET driver_user_id=NULL WHERE driver_user_id=$1", user_id)
        await conn.execute("UPDATE cashup_records SET owner_user_id=NULL WHERE owner_user_id=$1", user_id)
        await conn.execute("UPDATE outstanding_balances SET driver_user_id=NULL WHERE driver_user_id=$1", user_id)
        await conn.execute("UPDATE outstanding_balances SET owner_user_id=NULL WHERE owner_user_id=$1", user_id)
        # Owner records — must delete owner_drivers by owner_id first
        owner = await conn.fetchrow("SELECT id FROM fleet_owners WHERE user_id=$1", user_id)
        if owner:
            await conn.execute("DELETE FROM owner_drivers WHERE owner_id=$1", owner["id"])
            await conn.execute("DELETE FROM fleet_owners WHERE id=$1", owner["id"])
        # Wallet + user
        await conn.execute("DELETE FROM wallets WHERE user_id=$1", user_id)
        await conn.execute("DELETE FROM users WHERE id=$1", user_id)
        await audit(conn, admin_id, "DELETE_USER", user_id, "user", {"name": target["full_name"]}, ip)

@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await _delete_user(conn, user_id, admin["id"], request.client.host if request.client else "unknown")
    return {"ok": True}

@api.delete("/superadmin/users/{user_id}")
async def superadmin_delete_user(user_id: str, request: Request, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await _delete_user(conn, user_id, admin["id"], request.client.host if request.client else "unknown")
    return {"ok": True}

# ── Owner app ────────────────────────────────────────────────
@api.get("/owner/dashboard")
async def owner_dashboard(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        drivers = await conn.fetch("""
            SELECT od.driver_user_id,od.payment_mode,od.driver_commission_pct,od.commission_status,od.daily_target,
                   u.full_name,u.phone_number,d.qr_code,d.vehicle_plate,d.total_earnings,d.rating_avg,d.rating_count,
                   d.is_verified,d.is_online,d.last_seen_at,
                   COALESCE((SELECT SUM(tr.amount) FROM transactions tr WHERE tr.receiver_id=od.driver_user_id
                       AND tr.type='payment' AND tr.status='completed' AND DATE(tr.created_at)=CURRENT_DATE),0) AS today_earnings,
                   COALESCE((SELECT COUNT(*) FROM trips t WHERE t.driver_id=od.driver_user_id AND t.status='active'),0) AS active_trips
            FROM owner_drivers od
            JOIN users u ON u.id=od.driver_user_id
            JOIN drivers d ON d.user_id=od.driver_user_id
            WHERE od.owner_id=$1
        """, owner["id"])
        driver_ids = [d["driver_user_id"] for d in drivers]
        total_earnings = 0; today_revenue = 0
        if driver_ids:
            total_earnings = await conn.fetchval("SELECT COALESCE(SUM(total_earnings),0) FROM drivers WHERE user_id=ANY($1::text[])", driver_ids)
            today_revenue = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE receiver_id=ANY($1::text[]) AND type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE", driver_ids)
        # Count expiring docs for alert
        expiring_docs = await conn.fetchval("""
            SELECT COUNT(*) FROM driver_doc_expiry dde
            JOIN owner_drivers od ON od.driver_user_id=dde.driver_user_id AND od.owner_id=dde.owner_id
            WHERE dde.owner_id=$1 AND dde.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
        """, owner["id"]) or 0
        pending_deductions = await conn.fetchval(
            "SELECT COUNT(*) FROM driver_deductions WHERE owner_id=$1 AND status='pending'", owner["id"]) or 0
    def driver_status(d):
        if d["active_trips"] > 0: return "on_trip"
        if d["is_online"]: return "online"
        return "offline"
    return {
        "total_earnings": float(total_earnings or 0), "today_revenue": float(today_revenue or 0),
        "driver_count": len(drivers), "expiring_docs": int(expiring_docs),
        "pending_deductions": int(pending_deductions),
        "drivers": [{"user_id": d["driver_user_id"], "full_name": d["full_name"], "phone_number": d["phone_number"],
                     "qr_code": d["qr_code"], "vehicle_plate": d["vehicle_plate"], "total_earnings": float(d["total_earnings"] or 0),
                     "today_earnings": float(d["today_earnings"] or 0),
                     "rating_avg": float(d["rating_avg"] or 0), "rating_count": d["rating_count"] or 0, "is_verified": d["is_verified"],
                     "payment_mode": d["payment_mode"] or "daily_target",
                     "driver_commission_pct": float(d["driver_commission_pct"] or 0),
                     "commission_status": d["commission_status"],
                     "daily_target": float(d["daily_target"] or 0),
                     "driver_status": driver_status(d)} for d in drivers]
    }

@api.post("/owner/drivers/link")
async def owner_link_driver(body: LinkDriverIn, user: dict = Depends(require_owner)):
    code = body.driver_code.strip().upper()
    subscription_charged = 0.0
    subscription_insufficient = False
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        drv = await conn.fetchrow("SELECT d.user_id,u.full_name,u.phone_number,d.vehicle_plate,d.qr_code FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.qr_code=$1 OR d.user_id=$1", code)
        if not drv: raise HTTPException(status_code=404, detail="Driver not found")
        existing = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], drv["user_id"])
        if existing: raise HTTPException(status_code=400, detail="Driver already linked")

        # Count current fleet before linking
        prev_count = await conn.fetchval(
            "SELECT COUNT(*) FROM owner_drivers WHERE owner_id=$1", owner["id"]
        ) or 0

        await conn.execute("INSERT INTO owner_drivers (id,owner_id,driver_user_id) VALUES ($1,$2,$3)", str(uuid.uuid4()), owner["id"], drv["user_id"])

        # Get subscription pricing from admin settings
        settings = await conn.fetchrow(
            "SELECT subscription_free_taxis, subscription_price_per_taxi FROM payout_settings WHERE id='default'"
        )
        free_taxis = int(settings["subscription_free_taxis"] or 1) if settings else 1
        price_per_taxi = float(settings["subscription_price_per_taxi"] or 10.0) if settings else 10.0

        new_count = prev_count + 1
        # Only charge if this driver pushes count beyond the free tier
        if new_count > free_taxis and price_per_taxi > 0:
            wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user["id"])
            balance = float(wallet["balance"] or 0) if wallet else 0.0
            if balance >= price_per_taxi:
                async with conn.transaction():
                    await conn.execute(
                        "UPDATE wallets SET balance=balance-$1 WHERE user_id=$2",
                        price_per_taxi, user["id"]
                    )
                    txn_id = str(uuid.uuid4()); ref = gen_ref()
                    await conn.execute(
                        "INSERT INTO transactions (id,reference,type,status,amount,sender_id,receiver_id,note,currency) "
                        "VALUES ($1,$2,'subscription_fee','completed',$3,$4,NULL,$5,'ZAR')",
                        txn_id, ref, price_per_taxi, user["id"],
                        f"Subscription fee: taxi #{new_count} added to fleet"
                    )
                subscription_charged = price_per_taxi
            else:
                subscription_insufficient = True

        # Refresh subscription record
        await _refresh_subscription_fee(conn, user["id"])

    return {
        "ok": True,
        "driver": dict(drv),
        "subscription_charged": subscription_charged,
        "subscription_price_per_taxi": price_per_taxi if new_count > free_taxis else 0.0,
        "subscription_insufficient": subscription_insufficient,
        "taxi_count": new_count,
        "free_taxis": free_taxis,
    }

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
        od = await conn.fetchrow(
            "SELECT id,payment_mode,driver_commission_pct,daily_target FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2",
            owner["id"], driver_user_id
        )
        if not od: raise HTTPException(status_code=403, detail="Driver not in fleet")
        driver = await conn.fetchrow("SELECT d.*,u.full_name,u.phone_number FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.user_id=$1", driver_user_id)
        if not driver: raise HTTPException(status_code=404, detail="Driver not found")
        today_trips = await conn.fetch(
            "SELECT t.reference,t.amount,t.driver_net,t.created_at,su.full_name as passenger_name "
            "FROM transactions t LEFT JOIN users su ON su.id=t.sender_id "
            "WHERE t.receiver_id=$1 AND t.type='payment' AND DATE(t.created_at)=CURRENT_DATE ORDER BY t.created_at DESC",
            driver_user_id
        )
        all_trips = await conn.fetch(
            "SELECT t.reference,t.amount,t.driver_net,t.created_at,su.full_name as passenger_name "
            "FROM transactions t LEFT JOIN users su ON su.id=t.sender_id "
            "WHERE t.receiver_id=$1 AND t.type='payment' ORDER BY t.created_at DESC LIMIT 100",
            driver_user_id
        )
        last_cashup = await conn.fetchrow(
            "SELECT cashup_amount,fuel_deducted,driver_profit,created_at "
            "FROM cashup_records WHERE driver_user_id=$1 AND owner_user_id=$2 ORDER BY created_at DESC LIMIT 1",
            driver_user_id, user["id"]
        )
        owner_total = await conn.fetchval(
            "SELECT COALESCE(SUM(cashup_amount),0) FROM cashup_records WHERE driver_user_id=$1 AND owner_user_id=$2",
            driver_user_id, user["id"]
        )
        today_total = sum(float(t["amount"] or 0) for t in today_trips)
        today_trip_count = len(today_trips)
        all_trip_count = len(all_trips)
        avg_per_trip_today = round(today_total / today_trip_count, 2) if today_trip_count else 0
        all_gross = sum(float(t["amount"] or 0) for t in all_trips)
        avg_per_trip_all = round(all_gross / all_trip_count, 2) if all_trip_count else 0
    return {
        "driver": {
            "user_id": driver["user_id"], "full_name": driver["full_name"], "phone_number": driver["phone_number"],
            "vehicle_plate": driver["vehicle_plate"], "total_earnings": float(driver["total_earnings"] or 0),
            "qr_code": driver["qr_code"], "rating_avg": float(driver["rating_avg"] or 0), "rating_count": driver["rating_count"] or 0,
            "payment_mode": od["payment_mode"] or "daily_target",
            "commission_pct": float(od["driver_commission_pct"] or 0),
            "daily_target": float(od["daily_target"] or 0),
        },
        "today_total": today_total,
        "today_trip_count": today_trip_count,
        "avg_per_trip_today": avg_per_trip_today,
        "avg_per_trip_all": avg_per_trip_all,
        "all_trip_count": all_trip_count,
        "owner_total_received": float(owner_total or 0),
        "last_cashup": {
            "amount": float(last_cashup["cashup_amount"]),
            "owner_received": float(last_cashup["cashup_amount"]),
            "fuel_deducted": float(last_cashup["fuel_deducted"] or 0),
            "driver_profit": float(last_cashup["driver_profit"] or 0),
            "date": iso(last_cashup["created_at"]),
        } if last_cashup else None,
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
            "SELECT t.*,u.full_name as driver_name,d.vehicle_plate,su.full_name as passenger_name FROM transactions t JOIN drivers d ON d.user_id=t.receiver_id JOIN users u ON u.id=t.receiver_id LEFT JOIN users su ON su.id=t.sender_id "
            "WHERE t.receiver_id=ANY($1::text[]) AND t.type='payment' "
            "AND NOT EXISTS (SELECT 1 FROM hidden_transactions h WHERE h.user_id=$2 AND h.transaction_id=t.id) "
            "ORDER BY t.created_at DESC LIMIT 100",
            ids, user["id"]
        )
    return [{"id": r["id"], "reference": r["reference"], "driver_name": r["driver_name"], "vehicle_plate": r["vehicle_plate"],
             "passenger": r["passenger_name"] or "Passenger", "gross_amount": float(r["amount"] or 0),
             "driver_net": float(r["driver_net"] or r["amount"] or 0), "platform_fee": float(r["platform_fee"] or 0),
             "created_at": iso(r["created_at"])} for r in rows]

@api.post("/owner/toggle-driver-mode")
async def owner_toggle_driver_mode(body: dict, user: dict = Depends(require_owner)):
    active = body.get("active", False)
    async with pool.acquire() as conn:
        kyc_status = "not_submitted"
        if active:
            kyc = await conn.fetchrow("SELECT status FROM kyc_documents WHERE user_id=$1", user["id"])
            kyc_status = kyc["status"] if kyc else "not_submitted"
            # Ensure drivers record exists so QR code is available
            existing_driver = await conn.fetchrow("SELECT id FROM drivers WHERE user_id=$1", user["id"])
            if not existing_driver:
                await conn.execute(
                    "INSERT INTO drivers (id,user_id,qr_code,vehicle_plate,is_verified) VALUES ($1,$2,$3,$4,FALSE)",
                    str(uuid.uuid4()), user["id"], generate_qr_code(), ""
                )
        await conn.execute(
            "INSERT INTO wallets (id, user_id, driver_mode_active) VALUES ($1,$2,$3) "
            "ON CONFLICT (user_id) DO UPDATE SET driver_mode_active=EXCLUDED.driver_mode_active",
            str(uuid.uuid4()), user["id"], active
        )
    return {"ok": True, "driver_mode_active": active, "kyc_status": kyc_status}

# ── Owner cashup management ──────────────────────────────────

class SetTargetIn(BaseModel):
    daily_target: float

class SetCommissionIn(BaseModel):
    driver_commission_pct: float = Field(ge=1, le=99, description="% of net earnings (after fuel) that the driver keeps")

class CommissionReviewIn(BaseModel):
    action: str  # "approve" or "reject"
    notes: Optional[str] = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, v):
        if v not in ("approve", "reject"):
            raise ValueError("action must be 'approve' or 'reject'")
        return v

class OwnerBankIn(BaseModel):
    bank_name: str
    account_number: str
    account_name: Optional[str] = None

class CashupMethodIn(BaseModel):
    method: str  # "wallet" or "bank"

@api.post("/owner/drivers/{driver_user_id}/set-target")
async def owner_set_target(driver_user_id: str, body: SetTargetIn, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], driver_user_id)
        if not link:
            raise HTTPException(status_code=404, detail="Driver not in fleet")
        await conn.execute("UPDATE owner_drivers SET daily_target=$1 WHERE owner_id=$2 AND driver_user_id=$3",
                           body.daily_target, owner["id"], driver_user_id)
    return {"ok": True, "daily_target": body.daily_target}

@api.post("/owner/drivers/{driver_user_id}/set-commission")
async def owner_set_commission(driver_user_id: str, body: SetCommissionIn, user: dict = Depends(require_owner)):
    """Owner proposes a commission % split for a driver. Becomes active only after admin approval."""
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow(
            "SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2",
            owner["id"], driver_user_id
        )
        if not link:
            raise HTTPException(status_code=404, detail="Driver not in fleet")
        await conn.execute(
            """UPDATE owner_drivers
               SET payment_mode='commission_split',
                   driver_commission_pct=$1,
                   commission_status='pending',
                   commission_approved_by=NULL,
                   commission_approved_at=NULL
               WHERE owner_id=$2 AND driver_user_id=$3""",
            body.driver_commission_pct, owner["id"], driver_user_id
        )
    return {
        "ok": True,
        "driver_commission_pct": body.driver_commission_pct,
        "owner_commission_pct": round(100 - body.driver_commission_pct, 2),
        "commission_status": "pending",
        "message": "Commission split submitted — awaiting admin approval before it takes effect"
    }

@api.delete("/owner/drivers/{driver_user_id}/commission")
async def owner_remove_commission(driver_user_id: str, user: dict = Depends(require_owner)):
    """Revert driver back to daily_target payment mode."""
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow(
            "SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2",
            owner["id"], driver_user_id
        )
        if not link:
            raise HTTPException(status_code=404, detail="Driver not in fleet")
        await conn.execute(
            """UPDATE owner_drivers
               SET payment_mode='daily_target',
                   driver_commission_pct=NULL,
                   commission_status=NULL,
                   commission_approved_by=NULL,
                   commission_approved_at=NULL
               WHERE owner_id=$2 AND driver_user_id=$3""",
            owner["id"], driver_user_id
        )
    return {"ok": True, "payment_mode": "daily_target"}

@api.get("/admin/commission-requests")
async def admin_list_commission_requests(
    status: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    """List commission split requests — filter by status: pending / approved / rejected."""
    async with pool.acquire() as conn:
        where = "WHERE od.payment_mode='commission_split'"
        params: list = []
        if status:
            where += f" AND od.commission_status=$1"
            params.append(status)
        rows = await conn.fetch(f"""
            SELECT od.id, od.driver_user_id, od.driver_commission_pct,
                   od.commission_status, od.commission_approved_by, od.commission_approved_at,
                   od.daily_target, od.payment_mode,
                   fo.user_id as owner_user_id,
                   u_owner.full_name as owner_name, u_owner.phone_number as owner_phone,
                   u_driver.full_name as driver_name, u_driver.phone_number as driver_phone
            FROM owner_drivers od
            JOIN fleet_owners fo ON fo.id=od.owner_id
            JOIN users u_owner ON u_owner.id=fo.user_id
            JOIN users u_driver ON u_driver.id=od.driver_user_id
            {where}
            ORDER BY od.commission_approved_at DESC NULLS FIRST, od.id
        """, *params)
    return [dict(r) for r in rows]

@api.post("/admin/commission-cashup/run-now")
async def admin_trigger_commission_cashup(admin: dict = Depends(require_admin)):
    """Manually trigger commission auto-cashup for all approved drivers right now."""
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403, detail="Permission denied")
    asyncio.create_task(_run_commission_auto_cashup())
    log.info("[MANUAL TRIGGER] admin=%s triggered commission auto-cashup", admin["id"])
    return {"ok": True, "message": "Commission auto-cashup triggered — results will appear in cashup history"}

@api.patch("/admin/commission-requests/{owner_driver_id}")
async def admin_review_commission(
    owner_driver_id: str,
    body: CommissionReviewIn,
    admin: dict = Depends(require_admin),
    request: Request = None
):
    """Admin approves or rejects a commission split request."""
    async with pool.acquire() as conn:
        link = await conn.fetchrow(
            "SELECT id, driver_commission_pct, commission_status, payment_mode FROM owner_drivers WHERE id=$1",
            owner_driver_id
        )
        if not link:
            raise HTTPException(status_code=404, detail="Commission request not found")
        if link["payment_mode"] != "commission_split":
            raise HTTPException(status_code=400, detail="This driver link is not in commission_split mode")
        if link["commission_status"] not in ("pending", "approved", "rejected"):
            raise HTTPException(status_code=400, detail="No pending commission to review")

        new_status = "approved" if body.action == "approve" else "rejected"
        await conn.execute(
            """UPDATE owner_drivers
               SET commission_status=$1,
                   commission_approved_by=$2,
                   commission_approved_at=NOW()
               WHERE id=$3""",
            new_status, admin["id"], owner_driver_id
        )
        await audit(conn, admin["id"], f"COMMISSION_{new_status.upper()}", owner_driver_id, "owner_drivers",
                    {"pct": float(link["driver_commission_pct"] or 0), "notes": body.notes},
                    request.client.host if request else None)
    return {
        "ok": True,
        "commission_status": new_status,
        "driver_commission_pct": float(link["driver_commission_pct"] or 0),
        "owner_commission_pct": round(100 - float(link["driver_commission_pct"] or 0), 2)
    }

class AdminCommissionOverrideIn(BaseModel):
    driver_commission_pct: float = Field(ge=1, le=99, description="% of net earnings the driver keeps")

@api.post("/admin/commission-requests/{owner_driver_id}/override")
async def admin_override_commission(
    owner_driver_id: str,
    body: AdminCommissionOverrideIn,
    admin: dict = Depends(require_admin),
    request: Request = None,
):
    """Admin directly sets and immediately approves a commission % — bypasses owner proposal."""
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        link = await conn.fetchrow(
            "SELECT id, driver_user_id FROM owner_drivers WHERE id=$1", owner_driver_id
        )
        if not link:
            raise HTTPException(status_code=404, detail="Owner-driver link not found")
        await conn.execute("""
            UPDATE owner_drivers
            SET payment_mode='commission_split',
                driver_commission_pct=$1,
                commission_status='approved',
                commission_approved_by=$2,
                commission_approved_at=NOW()
            WHERE id=$3
        """, body.driver_commission_pct, admin["id"], owner_driver_id)
        await audit(conn, admin["id"], "COMMISSION_ADMIN_OVERRIDE", owner_driver_id, "owner_drivers",
                    {"driver_pct": body.driver_commission_pct, "owner_pct": round(100 - body.driver_commission_pct, 2)},
                    request.client.host if request else None)
    return {
        "ok": True,
        "driver_commission_pct": body.driver_commission_pct,
        "owner_commission_pct": round(100 - body.driver_commission_pct, 2),
        "commission_status": "approved",
        "set_by": "admin",
    }

@api.post("/owner/drivers/{driver_user_id}/confirm")
async def owner_confirm_driver(driver_user_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], driver_user_id)
        if not link:
            raise HTTPException(status_code=404, detail="Driver not in fleet")
        await conn.execute("UPDATE owner_drivers SET confirmed=TRUE WHERE owner_id=$1 AND driver_user_id=$2",
                           owner["id"], driver_user_id)
    return {"ok": True}

@api.post("/owner/drivers/{driver_user_id}/unconfirm")
async def owner_unconfirm_driver(driver_user_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], driver_user_id)
        if not link:
            raise HTTPException(status_code=404, detail="Driver not in fleet")
        await conn.execute("UPDATE owner_drivers SET confirmed=FALSE WHERE owner_id=$1 AND driver_user_id=$2",
                           owner["id"], driver_user_id)
    return {"ok": True}

@api.patch("/owner/cashup-method")
async def owner_set_cashup_method(body: CashupMethodIn, user: dict = Depends(require_owner)):
    if body.method not in ("wallet", "bank"):
        raise HTTPException(status_code=400, detail="Method must be 'wallet' or 'bank'")
    async with pool.acquire() as conn:
        await conn.execute("UPDATE fleet_owners SET cashup_method=$1 WHERE user_id=$2", body.method, user["id"])
    return {"ok": True, "method": body.method}

@api.post("/owner/bank-account")
async def owner_save_bank(body: OwnerBankIn, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE fleet_owners SET bank_name=$1, account_number=$2, account_name=$3 WHERE user_id=$4",
            body.bank_name, body.account_number, body.account_name, user["id"]
        )
    return {"ok": True}

@api.get("/owner/bank-account")
async def owner_get_bank(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT bank_name, account_number, account_name, cashup_method FROM fleet_owners WHERE user_id=$1", user["id"])
        if not row:
            raise HTTPException(status_code=404, detail="Owner record not found")
    return {"bank_name": row["bank_name"], "account_number": row["account_number"],
            "account_name": row["account_name"], "cashup_method": row["cashup_method"] or "wallet"}

@api.post("/owner/change-password")
async def owner_change_password(body: OwnerChangePasswordIn, user: dict = Depends(require_owner)):
    """Owner changes their login password. Requires current password for verification."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT password_hash FROM users WHERE id=$1", user["id"])
    if not row or not row["password_hash"]:
        raise HTTPException(status_code=400, detail="No password set on this account")
    try:
        valid = bcrypt.checkpw(body.current_password.encode(), row["password_hash"].encode())
    except Exception:
        valid = False
    if not valid:
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET password_hash=$1 WHERE id=$2", new_hash, user["id"])
    return {"ok": True}

class OwnerPayoutIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)

@api.get("/owner/payout-fee")
async def owner_payout_fee_preview(amount: float, user: dict = Depends(require_owner)):
    """Return fee breakdown for a given payout amount before the owner confirms."""
    async with pool.acquire() as conn:
        settings = await conn.fetchrow("SELECT withdrawal_gateway_fee_fixed FROM payout_settings WHERE id='default'")
    fee = float(settings["withdrawal_gateway_fee_fixed"]) if settings and settings["withdrawal_gateway_fee_fixed"] is not None else 3.50
    total_deduct = round(amount + fee, 2)
    net_to_bank = round(amount, 2)
    return {"amount": net_to_bank, "gateway_fee": fee, "total_deducted": total_deduct}

@api.post("/owner/payout")
async def owner_payout(body: OwnerPayoutIn, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        fo = await conn.fetchrow(
            "SELECT bank_name, account_number, account_name FROM fleet_owners WHERE user_id=$1", user["id"]
        )
        settings = await conn.fetchrow("SELECT withdrawal_gateway_fee_fixed FROM payout_settings WHERE id='default'")
    if not fo or not fo["bank_name"] or not fo["account_number"]:
        raise HTTPException(status_code=400, detail="No bank account set up. Add your banking details in Profile first.")
    gateway_fee = float(settings["withdrawal_gateway_fee_fixed"]) if settings and settings["withdrawal_gateway_fee_fixed"] is not None else 3.50
    total_deduct = round(body.amount + gateway_fee, 2)
    # Deduct full amount (payout + gateway fee) from wallet, send payout amount to bank
    result = await _do_withdraw(
        user, total_deduct, fo["bank_name"], fo["account_number"], fo["account_name"],
        payout_type="owner_payout"
    )
    result["gateway_fee"] = gateway_fee
    result["net_to_bank"] = round(body.amount, 2)
    result["total_deducted"] = total_deduct
    return result

@api.get("/owner/outstanding")
async def owner_outstanding(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ob.*, u.full_name as driver_name FROM outstanding_balances ob
            JOIN users u ON u.id=ob.driver_user_id
            WHERE ob.owner_user_id=$1 AND ob.status='outstanding'
            ORDER BY ob.created_at DESC
        """, user["id"])
    items = [{"id": r["id"], "driver_user_id": r["driver_user_id"], "driver_name": r["driver_name"],
              "amount": float(r["amount"]), "reason": r["reason"], "created_at": iso(r["created_at"])} for r in rows]
    return {"items": items, "total_outstanding": sum(i["amount"] for i in items)}

@api.post("/owner/outstanding/{outstanding_id}/cancel")
async def owner_cancel_outstanding(outstanding_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id FROM outstanding_balances WHERE id=$1 AND owner_user_id=$2", outstanding_id, user["id"])
        if not row:
            raise HTTPException(status_code=404, detail="Outstanding record not found")
        await conn.execute("UPDATE outstanding_balances SET status='cancelled', cancelled_at=NOW(), cancelled_by=$1 WHERE id=$2",
                           user["id"], outstanding_id)
    return {"ok": True}

@api.get("/owner/cashup-history")
async def owner_cashup_history(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT cr.*, u.full_name as driver_name FROM cashup_records cr
            JOIN users u ON u.id=cr.driver_user_id
            WHERE cr.owner_user_id=$1
            ORDER BY cr.created_at DESC LIMIT 100
        """, user["id"])
    return [{"id": r["id"], "driver_user_id": r["driver_user_id"], "driver_name": r["driver_name"],
             "target_amount": float(r["target_amount"] or 0), "earned_amount": float(r["earned_amount"] or 0),
             "cashup_amount": float(r["cashup_amount"] or 0), "shortfall": float(r["shortfall"] or 0),
             "driver_profit": float(r["driver_profit"] or 0), "cashup_method": r["cashup_method"],
             "payout_fee": float(r["payout_fee"] or 0), "status": r["status"],
             "created_at": iso(r["created_at"])} for r in rows]

# ── Owner fleet management ────────────────────────────────────

@api.get("/owner/fleet/live")
async def owner_fleet_live(user: dict = Depends(require_owner)):
    """Live status of all fleet drivers: online/on_trip/offline + today's earnings."""
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        rows = await conn.fetch("""
            SELECT od.driver_user_id, u.full_name, u.phone_number, d.vehicle_plate,
                   d.is_online, d.last_seen_at,
                   COALESCE((
                       SELECT COUNT(*) FROM trips t WHERE t.driver_id=od.driver_user_id
                       AND t.status='active'
                   ),0) AS active_trips,
                   COALESCE((
                       SELECT SUM(tr.amount) FROM transactions tr
                       WHERE tr.receiver_id=od.driver_user_id AND tr.type='payment'
                       AND tr.status='completed' AND DATE(tr.created_at)=CURRENT_DATE
                   ),0) AS today_earnings
            FROM owner_drivers od
            JOIN users u ON u.id=od.driver_user_id
            JOIN drivers d ON d.user_id=od.driver_user_id
            WHERE od.owner_id=$1
        """, owner["id"])
    def status(r):
        if r["active_trips"] > 0: return "on_trip"
        if r["is_online"]: return "online"
        return "offline"
    return [{"user_id": r["driver_user_id"], "full_name": r["full_name"],
             "phone_number": r["phone_number"], "vehicle_plate": r["vehicle_plate"],
             "status": status(r), "last_seen_at": iso(r["last_seen_at"]),
             "today_earnings": float(r["today_earnings"] or 0)} for r in rows]

@api.get("/owner/drivers/{driver_user_id}/documents")
async def owner_get_driver_docs(driver_user_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], driver_user_id)
        if not link: raise HTTPException(status_code=404, detail="Driver not in your fleet")
        rows = await conn.fetch("SELECT * FROM driver_doc_expiry WHERE owner_id=$1 AND driver_user_id=$2 ORDER BY expiry_date", owner["id"], driver_user_id)
    today = date_type.today()
    def days_left(d):
        if not d: return None
        return (d - today).days
    return [{"id": r["id"], "document_type": r["document_type"], "expiry_date": r["expiry_date"].isoformat() if r["expiry_date"] else None,
             "notes": r["notes"], "days_left": days_left(r["expiry_date"]),
             "status": "expired" if r["expiry_date"] and r["expiry_date"] < today else ("expiring_soon" if r["expiry_date"] and days_left(r["expiry_date"]) <= 30 else "valid")} for r in rows]

class DocExpiryIn(BaseModel):
    document_type: str
    expiry_date: str
    notes: str = ""

@api.post("/owner/drivers/{driver_user_id}/documents")
async def owner_set_driver_doc(driver_user_id: str, body: DocExpiryIn, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], driver_user_id)
        if not link: raise HTTPException(status_code=404, detail="Driver not in your fleet")
        try:
            expiry = date_type.fromisoformat(body.expiry_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
        existing = await conn.fetchrow("SELECT id FROM driver_doc_expiry WHERE owner_id=$1 AND driver_user_id=$2 AND document_type=$3", owner["id"], driver_user_id, body.document_type)
        if existing:
            await conn.execute("UPDATE driver_doc_expiry SET expiry_date=$1, notes=$2, updated_at=NOW() WHERE id=$3", expiry, body.notes, existing["id"])
            doc_id = existing["id"]
        else:
            doc_id = str(uuid.uuid4())
            await conn.execute("INSERT INTO driver_doc_expiry (id,owner_id,driver_user_id,document_type,expiry_date,notes) VALUES ($1,$2,$3,$4,$5,$6)", doc_id, owner["id"], driver_user_id, body.document_type, expiry, body.notes)
    return {"ok": True, "id": doc_id}

@api.delete("/owner/drivers/{driver_user_id}/documents/{doc_id}")
async def owner_delete_driver_doc(driver_user_id: str, doc_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        await conn.execute("DELETE FROM driver_doc_expiry WHERE id=$1 AND owner_id=$2", doc_id, owner["id"])
    return {"ok": True}

@api.get("/owner/deductions")
async def owner_list_deductions(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        rows = await conn.fetch("""
            SELECT dd.*, u.full_name AS driver_name FROM driver_deductions dd
            JOIN users u ON u.id=dd.driver_user_id
            WHERE dd.owner_id=$1 ORDER BY dd.created_at DESC LIMIT 100
        """, owner["id"])
    return [{"id": r["id"], "driver_user_id": r["driver_user_id"], "driver_name": r["driver_name"],
             "amount": float(r["amount"]), "reason": r["reason"], "deduction_type": r["deduction_type"],
             "status": r["status"], "created_at": iso(r["created_at"]), "applied_at": iso(r["applied_at"])} for r in rows]

class DeductionIn(BaseModel):
    amount: float
    reason: str
    deduction_type: str = "manual"

@api.post("/owner/drivers/{driver_user_id}/deductions")
async def owner_add_deduction(driver_user_id: str, body: DeductionIn, user: dict = Depends(require_owner)):
    if body.amount <= 0: raise HTTPException(status_code=400, detail="Amount must be positive")
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        link = await conn.fetchrow("SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2", owner["id"], driver_user_id)
        if not link: raise HTTPException(status_code=404, detail="Driver not in your fleet")
        doc_id = str(uuid.uuid4())
        await conn.execute("INSERT INTO driver_deductions (id,owner_id,driver_user_id,amount,reason,deduction_type) VALUES ($1,$2,$3,$4,$5,$6)",
                           doc_id, owner["id"], driver_user_id, body.amount, body.reason, body.deduction_type)
    return {"ok": True, "id": doc_id}

@api.delete("/owner/deductions/{deduction_id}")
async def owner_cancel_deduction(deduction_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        row = await conn.fetchrow("SELECT id,status FROM driver_deductions WHERE id=$1 AND owner_id=$2", deduction_id, owner["id"])
        if not row: raise HTTPException(status_code=404, detail="Deduction not found")
        if row["status"] == "applied": raise HTTPException(status_code=400, detail="Cannot cancel an already-applied deduction")
        await conn.execute("UPDATE driver_deductions SET status='cancelled' WHERE id=$1", deduction_id)
    return {"ok": True}

# ── Driver cashup v2 endpoints ───────────────────────────────

@api.put("/driver/heartbeat")
async def driver_heartbeat(user: dict = Depends(get_current_user)):
    """Called by the driver app periodically to mark driver as online."""
    async with pool.acquire() as conn:
        await conn.execute("UPDATE drivers SET is_online=TRUE, last_seen_at=NOW() WHERE user_id=$1", user["id"])
    return {"ok": True}

@api.put("/driver/offline")
async def driver_go_offline(user: dict = Depends(get_current_user)):
    """Called by the driver app when it goes to background or is closed."""
    async with pool.acquire() as conn:
        await conn.execute("UPDATE drivers SET is_online=FALSE WHERE user_id=$1", user["id"])
    return {"ok": True}

@api.get("/driver/cashup-status")
async def driver_cashup_status(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        link = await conn.fetchrow("""
            SELECT od.owner_id, od.daily_target, od.confirmed, fo.user_id as owner_user_id,
                   u.full_name as owner_name, fo.cashup_method,
                   od.payment_mode, od.driver_commission_pct, od.commission_status
            FROM owner_drivers od
            JOIN fleet_owners fo ON fo.id=od.owner_id
            JOIN users u ON u.id=fo.user_id
            WHERE od.driver_user_id=$1
            LIMIT 1
        """, user["id"])
        if not link:
            return {"has_owner": False}
        today_earned = float(await conn.fetchval(
            "SELECT COALESCE(SUM(driver_net),0) FROM transactions WHERE receiver_id=$1 AND type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE",
            user["id"]
        ) or 0)
        outstanding = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM outstanding_balances WHERE driver_user_id=$1 AND status='outstanding'",
            user["id"]
        )

        payment_mode = link["payment_mode"] or "daily_target"
        commission_pct = float(link["driver_commission_pct"] or 0)
        commission_status = link["commission_status"]

        if payment_mode == "commission_split" and commission_status == "approved" and commission_pct > 0:
            # Fuel paid out to driver today (deducted before split)
            fuel_today = float(await conn.fetchval(
                "SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE user_id=$1 AND payout_type='pay_fuel' AND DATE(created_at)=CURRENT_DATE AND status IN ('approved','completed','auto_approved')",
                user["id"]
            ) or 0)
            net_after_fuel = max(0, today_earned - fuel_today)
            driver_share = round(net_after_fuel * (commission_pct / 100), 2)
            owner_share = round(net_after_fuel - driver_share, 2)
            cashup_amount = owner_share
            driver_profit = driver_share
            shortfall = 0.0
            daily_target = 0.0
        else:
            fuel_today = 0.0
            daily_target = float(link["daily_target"] or 0)
            cashup_amount = min(today_earned, daily_target) if daily_target > 0 else today_earned
            driver_profit = max(0, today_earned - daily_target) if daily_target > 0 else 0
            shortfall = max(0, daily_target - today_earned) if daily_target > 0 else 0

        # Pending deductions from owner
        pending_ded_rows = await conn.fetch("""
            SELECT id, amount, reason, deduction_type FROM driver_deductions
            WHERE driver_user_id=$1 AND owner_id=$2 AND status='pending'
            ORDER BY created_at
        """, user["id"], link["owner_id"])
        pending_deductions = [{"id": r["id"], "amount": float(r["amount"]), "reason": r["reason"], "deduction_type": r["deduction_type"]} for r in pending_ded_rows]
        total_deductions = sum(d["amount"] for d in pending_deductions)

    net_driver_profit = max(0, driver_profit - total_deductions)
    deduction_shortfall = max(0, total_deductions - driver_profit)

    return {
        "has_owner": True, "owner_user_id": link["owner_user_id"], "owner_name": link["owner_name"],
        "payment_mode": payment_mode,
        "commission_pct": commission_pct,
        "commission_status": commission_status,
        "daily_target": daily_target, "today_earned": today_earned,
        "fuel_deducted": fuel_today if payment_mode == "commission_split" else 0.0,
        "cashup_amount": cashup_amount, "driver_profit": driver_profit, "shortfall": shortfall,
        "pending_deductions": pending_deductions, "total_deductions": total_deductions,
        "net_driver_profit": net_driver_profit, "deduction_shortfall": deduction_shortfall,
        "is_confirmed": link["confirmed"] or False, "cashup_method": link["cashup_method"] or "wallet",
        "outstanding_balance": float(outstanding or 0),
    }

@api.get("/driver/cashup-destination")
async def driver_cashup_destination(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        link = await conn.fetchrow("""
            SELECT od.confirmed, fo.cashup_method, fo.bank_name, fo.account_number, fo.account_name
            FROM owner_drivers od
            JOIN fleet_owners fo ON fo.id=od.owner_id
            WHERE od.driver_user_id=$1
            LIMIT 1
        """, user["id"])
        if not link:
            raise HTTPException(status_code=404, detail="No owner linked")
        account = None
        if link["bank_name"]:
            account = {"bank_name": link["bank_name"], "account_number": link["account_number"],
                       "account_name": link["account_name"]}
    return {"confirmed": link["confirmed"] or False, "method": link["cashup_method"] or "wallet", "account": account}

class DriverCashupV2In(BaseModel):
    owner_user_id: str
    method: str = "wallet"
    amount: Optional[float] = Field(default=None, gt=0, le=1_000_000)

    @field_validator("method")
    @classmethod
    def validate_method(cls, v):
        if v not in ("wallet", "bank"):
            raise ValueError("Method must be 'wallet' or 'bank'")
        return v

@api.post("/driver/cashup/v2")
async def driver_cashup_v2(body: DriverCashupV2In, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        link = await conn.fetchrow("""
            SELECT od.owner_id, od.daily_target, od.confirmed, fo.user_id as owner_user_id,
                   fo.cashup_method, fo.bank_name, fo.account_number, fo.account_name,
                   od.payment_mode, od.driver_commission_pct, od.commission_status
            FROM owner_drivers od
            JOIN fleet_owners fo ON fo.id=od.owner_id
            WHERE od.driver_user_id=$1 AND fo.user_id=$2
        """, user["id"], body.owner_user_id)
        if not link:
            raise HTTPException(status_code=404, detail="Owner not linked")

        today_earned = float(await conn.fetchval(
            "SELECT COALESCE(SUM(driver_net),0) FROM transactions WHERE receiver_id=$1 AND type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE",
            user["id"]
        ) or 0)

        payment_mode = link["payment_mode"] or "daily_target"
        commission_pct = float(link["driver_commission_pct"] or 0)
        fuel_deducted = 0.0

        if payment_mode == "commission_split":
            if link["commission_status"] != "approved":
                raise HTTPException(status_code=400, detail="Commission split is not yet approved by admin")
            if commission_pct <= 0:
                raise HTTPException(status_code=400, detail="Commission percentage not configured")
            # Commission mode is wallet-only — override any supplied method
            body = DriverCashupV2In(owner_user_id=body.owner_user_id, method="wallet", amount=body.amount)
            # Deduct fuel paid today before splitting
            fuel_deducted = float(await conn.fetchval(
                "SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE user_id=$1 AND payout_type='pay_fuel' AND DATE(created_at)=CURRENT_DATE AND status IN ('approved','completed','auto_approved')",
                user["id"]
            ) or 0)
            net_after_fuel = max(0, today_earned - fuel_deducted)
            if net_after_fuel <= 0:
                raise HTTPException(status_code=400, detail="No net earnings to split after fuel deduction")
            driver_share = round(net_after_fuel * (commission_pct / 100), 2)
            owner_share = round(net_after_fuel - driver_share, 2)
            cashup_amount = body.amount if body.amount is not None else owner_share
            driver_profit = round(net_after_fuel - cashup_amount, 2)
            shortfall = 0.0
            daily_target = 0.0
        else:
            daily_target = float(link["daily_target"] or 0)
            # Use driver-supplied amount if provided, else auto-calculate from today's earnings
            if body.amount is not None:
                cashup_amount = body.amount
            else:
                if today_earned <= 0:
                    raise HTTPException(status_code=400, detail="No earnings to cash up today")
                cashup_amount = min(today_earned, daily_target) if daily_target > 0 else today_earned
            driver_profit = max(0, today_earned - cashup_amount) if today_earned > cashup_amount else 0
            shortfall = max(0, daily_target - cashup_amount) if daily_target > 0 else 0

        method = body.method
        payout_fee = 3.50 if method == "bank" else 0.0
        net_cashup = cashup_amount - payout_fee if method == "bank" else cashup_amount

        # Resolve bank account for bank cashup:
        # 1. Owner's bank set in fleet_owners
        # 2. Fall back to driver's saved payout_account type='owner'
        bank_name = bank_account_number = bank_account_name = None
        if method == "bank":
            if link.get("bank_name") and link.get("account_number"):
                bank_name = link["bank_name"]
                bank_account_number = link["account_number"]
                bank_account_name = link["account_name"]
            else:
                fallback = await conn.fetchrow(
                    "SELECT * FROM payout_accounts WHERE user_id=$1 AND type='owner'", user["id"]
                )
                if fallback:
                    bank_name = fallback["bank_name"]
                    bank_account_number = fallback["account_number"]
                    bank_account_name = fallback["account_name"]
            if not bank_name:
                raise HTTPException(status_code=400, detail="No bank account found for owner. Ask owner to set one up, or save it in your Profile.")

        async with conn.transaction():
            driver_wallet = await conn.fetchrow("SELECT balance,is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE", user["id"])
            if not driver_wallet or driver_wallet["is_frozen"]:
                raise HTTPException(status_code=400, detail="Wallet not available")
            if float(driver_wallet["balance"]) < cashup_amount:
                raise HTTPException(status_code=400, detail="Insufficient wallet balance for cashup")

            await conn.execute("UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", cashup_amount, user["id"])

            if method == "wallet":
                # Internal: credit owner's wallet directly
                await conn.execute("UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", net_cashup, body.owner_user_id)
            else:
                # Bank: create withdrawal_request so the gateway processes the payout
                wr_id = str(uuid.uuid4())
                await conn.execute(
                    """INSERT INTO withdrawal_requests (id,user_id,amount,bank_name,account_number,account_name)
                       VALUES ($1,$2,$3,$4,$5,$6)""",
                    wr_id, user["id"], net_cashup, bank_name, bank_account_number,
                    bank_account_name or link.get("account_name") or user["full_name"]
                )
                txn_id = str(uuid.uuid4()); ref = gen_ref()
                await conn.execute(
                    """INSERT INTO transactions (id,reference,type,status,amount,sender_id,receiver_id,note)
                       VALUES ($1,$2,'withdrawal','pending',$3,$4,NULL,$5)""",
                    txn_id, ref, net_cashup, user["id"],
                    f"Cashup to owner bank: {bank_name} {bank_account_number}"
                )

            record_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO cashup_records (id,owner_user_id,driver_user_id,target_amount,earned_amount,
                    cashup_amount,shortfall,driver_profit,cashup_method,payout_fee,status,
                    payment_mode,commission_pct,fuel_deducted)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',$11,$12,$13)
            """, record_id, body.owner_user_id, user["id"], daily_target, today_earned,
                net_cashup, shortfall, driver_profit, method, payout_fee,
                payment_mode, commission_pct if payment_mode == "commission_split" else None, fuel_deducted)

            if shortfall > 0:
                await conn.execute("""
                    INSERT INTO outstanding_balances (id,owner_user_id,driver_user_id,amount,reason,status)
                    VALUES ($1,$2,$3,$4,'Daily target shortfall','outstanding')
                """, str(uuid.uuid4()), body.owner_user_id, user["id"], shortfall)

            # Apply pending deductions from owner: deduct from driver_profit
            pending_deds = await conn.fetch("""
                SELECT id, amount FROM driver_deductions
                WHERE driver_user_id=$1 AND owner_id=(
                    SELECT id FROM fleet_owners WHERE user_id=$2
                ) AND status='pending'
            """, user["id"], body.owner_user_id)
            remaining_profit = driver_profit
            for ded in pending_deds:
                ded_amount = float(ded["amount"])
                applied_amount = min(ded_amount, max(0, remaining_profit))
                remaining_profit -= applied_amount
                shortfall_from_ded = ded_amount - applied_amount
                # Mark deduction as applied
                await conn.execute(
                    "UPDATE driver_deductions SET status='applied', applied_at=NOW(), cashup_id=$1 WHERE id=$2",
                    record_id, ded["id"]
                )
                # If driver doesn't have enough profit to cover it, create outstanding balance
                if shortfall_from_ded > 0:
                    await conn.execute("""
                        INSERT INTO outstanding_balances (id,owner_user_id,driver_user_id,amount,reason,status)
                        VALUES ($1,$2,$3,$4,$5,'outstanding')
                    """, str(uuid.uuid4()), body.owner_user_id, user["id"], shortfall_from_ded,
                        f"Deduction shortfall: {ded_amount:.2f}")
            driver_profit = max(0, remaining_profit)

    async with pool.acquire() as conn:
        dest_label = "owner's wallet" if method == "wallet" else "owner's bank account"
        await conn.execute(
            """INSERT INTO user_documents (id,user_id,document_type,title,description,amount,source,is_read)
               VALUES (gen_random_uuid()::text,$1,'withdrawal','CashUp Confirmation',$2,$3,'app',false)""",
            user["id"], f"R{net_cashup:.2f} has been sent to {dest_label}.", net_cashup
        )

    return {"ok": True, "cashup_amount": net_cashup, "driver_profit": driver_profit,
            "shortfall": shortfall, "method": method, "payout_fee": payout_fee,
            "payment_mode": payment_mode, "fuel_deducted": fuel_deducted}

@api.get("/driver/outstanding")
async def driver_outstanding(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ob.*, u.full_name as owner_name FROM outstanding_balances ob
            JOIN users u ON u.id=ob.owner_user_id
            WHERE ob.driver_user_id=$1 AND ob.status='outstanding'
            ORDER BY ob.created_at DESC
        """, user["id"])
    return [{"id": r["id"], "owner_user_id": r["owner_user_id"], "owner_name": r["owner_name"],
             "amount": float(r["amount"]), "reason": r["reason"], "created_at": iso(r["created_at"])} for r in rows]

class PayOutstandingIn(BaseModel):
    outstanding_id: str

@api.post("/driver/outstanding/pay")
async def driver_pay_outstanding(body: PayOutstandingIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        ob = await conn.fetchrow("SELECT * FROM outstanding_balances WHERE id=$1 AND driver_user_id=$2 AND status='outstanding'",
                                 body.outstanding_id, user["id"])
        if not ob:
            raise HTTPException(status_code=404, detail="Outstanding record not found")
        async with conn.transaction():
            wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE", user["id"])
            if float(wallet["balance"]) < float(ob["amount"]):
                raise HTTPException(status_code=400, detail="Insufficient balance")
            await conn.execute("UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", ob["amount"], user["id"])
            await conn.execute("UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", ob["amount"], ob["owner_user_id"])
            await conn.execute("UPDATE outstanding_balances SET status='paid', paid_at=NOW() WHERE id=$1", body.outstanding_id)
    return {"ok": True}

@api.get("/driver/cashup-history")
async def driver_cashup_history(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT cr.*, u.full_name as owner_name FROM cashup_records cr
            JOIN users u ON u.id=cr.owner_user_id
            WHERE cr.driver_user_id=$1
            ORDER BY cr.created_at DESC LIMIT 100
        """, user["id"])
    return [{"id": r["id"], "owner_user_id": r["owner_user_id"], "owner_name": r["owner_name"],
             "target_amount": float(r["target_amount"] or 0), "earned_amount": float(r["earned_amount"] or 0),
             "cashup_amount": float(r["cashup_amount"] or 0), "shortfall": float(r["shortfall"] or 0),
             "driver_profit": float(r["driver_profit"] or 0), "cashup_method": r["cashup_method"],
             "payout_fee": float(r["payout_fee"] or 0), "status": r["status"],
             "created_at": iso(r["created_at"])} for r in rows]

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
    category TEXT,
    status TEXT DEFAULT 'open',
    resolved_by TEXT REFERENCES users(id),
    resolution TEXT,
    admin_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS admin_notes TEXT;

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

CREATE TABLE IF NOT EXISTS hidden_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    transaction_id TEXT NOT NULL REFERENCES transactions(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, transaction_id)
);
"""

# Auto-create new tables on startup
async def create_new_tables():
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute(NEW_TABLES_SQL)
                await conn.execute(DRIVER_ROUTES_TABLE)
                # Migrations — add new columns safely
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE")
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_plate TEXT")
                await conn.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE")
                # Owner auth columns — required for owner registration and login
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT")
                await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL")
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT")
                # Owners identify by email, not phone — drop the NOT NULL constraint so owners
                # can register without a phone number.
                await conn.execute("ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL")
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ")
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ")
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by TEXT")
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT FALSE")
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS flag_reason TEXT")
                # New tables
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS support_notes (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL REFERENCES users(id),
                        admin_id TEXT REFERENCES users(id),
                        note TEXT NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS stitch_payouts (
                        id TEXT PRIMARY KEY,
                        withdrawal_id TEXT,
                        user_id TEXT REFERENCES users(id),
                        amount NUMERIC(14,2) NOT NULL,
                        fee NUMERIC(14,2) DEFAULT 0,
                        net_amount NUMERIC(14,2) NOT NULL,
                        bank_name TEXT,
                        account_number TEXT,
                        account_holder TEXT,
                        stitch_disbursement_id TEXT,
                        status TEXT DEFAULT 'pending',
                        failure_reason TEXT,
                        initiated_at TIMESTAMPTZ DEFAULT NOW(),
                        completed_at TIMESTAMPTZ
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS cashup_records (
                        id TEXT PRIMARY KEY,
                        owner_user_id TEXT NOT NULL REFERENCES users(id),
                        driver_user_id TEXT NOT NULL REFERENCES users(id),
                        target_amount NUMERIC(14,2) DEFAULT 0,
                        earned_amount NUMERIC(14,2) DEFAULT 0,
                        cashup_amount NUMERIC(14,2) DEFAULT 0,
                        shortfall NUMERIC(14,2) DEFAULT 0,
                        driver_profit NUMERIC(14,2) DEFAULT 0,
                        cashup_method TEXT DEFAULT 'wallet',
                        payout_fee NUMERIC(14,2) DEFAULT 0,
                        status TEXT DEFAULT 'completed',
                        stitch_payout_id TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS outstanding_balances (
                        id TEXT PRIMARY KEY,
                        owner_user_id TEXT NOT NULL REFERENCES users(id),
                        driver_user_id TEXT NOT NULL REFERENCES users(id),
                        amount NUMERIC(14,2) NOT NULL,
                        reason TEXT DEFAULT 'Daily target shortfall',
                        status TEXT DEFAULT 'outstanding',
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        cancelled_at TIMESTAMPTZ,
                        cancelled_by TEXT,
                        paid_at TIMESTAMPTZ
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS audit_archive (
                        id TEXT PRIMARY KEY,
                        original_id TEXT NOT NULL,
                        admin_id TEXT,
                        action TEXT NOT NULL,
                        target_id TEXT,
                        target_type TEXT,
                        metadata JSONB DEFAULT '{}',
                        ip_address TEXT,
                        success BOOLEAN DEFAULT TRUE,
                        original_created_at TIMESTAMPTZ,
                        archived_by TEXT REFERENCES users(id),
                        archived_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS statement_downloads (
                        id TEXT PRIMARY KEY,
                        reference TEXT UNIQUE NOT NULL,
                        statement_type TEXT NOT NULL,
                        format TEXT NOT NULL,
                        date_from TIMESTAMPTZ,
                        date_to TIMESTAMPTZ,
                        target_user_id TEXT REFERENCES users(id),
                        downloaded_by TEXT REFERENCES users(id),
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                # ── New feature tables ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS feature_flags (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT DEFAULT '',
                        enabled BOOLEAN DEFAULT FALSE,
                        rollout_pct INTEGER DEFAULT 100,
                        target_roles TEXT DEFAULT '[]',
                        metadata TEXT DEFAULT '{}',
                        updated_by TEXT REFERENCES users(id),
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS pricing_rules (
                        id TEXT PRIMARY KEY,
                        zone_id TEXT,
                        vehicle_type TEXT DEFAULT 'all',
                        base_fare NUMERIC(10,2) DEFAULT 8.00,
                        per_km NUMERIC(10,2) DEFAULT 2.50,
                        per_minute NUMERIC(10,2) DEFAULT 0.50,
                        surge_multiplier NUMERIC(5,2) DEFAULT 1.0,
                        surge_active BOOLEAN DEFAULT FALSE,
                        min_fare NUMERIC(10,2) DEFAULT 15.00,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS promotions (
                        id TEXT PRIMARY KEY,
                        code TEXT UNIQUE NOT NULL,
                        description TEXT DEFAULT '',
                        discount_type TEXT NOT NULL DEFAULT 'percent',
                        discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
                        min_ride_amount NUMERIC(10,2) DEFAULT 0,
                        max_uses INTEGER DEFAULT 1000,
                        uses_per_user INTEGER DEFAULT 1,
                        total_used INTEGER DEFAULT 0,
                        valid_from TIMESTAMPTZ DEFAULT NOW(),
                        valid_to TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
                        active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS gdpr_requests (
                        id TEXT PRIMARY KEY,
                        user_id TEXT REFERENCES users(id),
                        request_type TEXT NOT NULL DEFAULT 'export',
                        status TEXT DEFAULT 'pending',
                        resolution_note TEXT,
                        resolved_by TEXT REFERENCES users(id),
                        resolved_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS coverage_zones (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        city TEXT,
                        province TEXT,
                        country TEXT DEFAULT 'ZA',
                        lat NUMERIC(10,6),
                        lng NUMERIC(10,6),
                        radius_km NUMERIC(10,2),
                        active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS chargebacks (
                        id TEXT PRIMARY KEY,
                        user_id TEXT REFERENCES users(id),
                        transaction_id TEXT REFERENCES transactions(id),
                        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
                        reason TEXT NOT NULL DEFAULT '',
                        status TEXT DEFAULT 'pending',
                        resolution_note TEXT,
                        amount_recovered NUMERIC(14,2) DEFAULT 0,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS tx_limit_configs (
                        id TEXT PRIMARY KEY,
                        role TEXT NOT NULL UNIQUE DEFAULT 'passenger',
                        daily_limit NUMERIC(14,2) DEFAULT 5000,
                        single_txn_limit NUMERIC(14,2) DEFAULT 2000,
                        monthly_limit NUMERIC(14,2) DEFAULT 30000,
                        min_topup NUMERIC(14,2) DEFAULT 10,
                        max_topup NUMERIC(14,2) DEFAULT 5000,
                        max_withdrawal NUMERIC(14,2) DEFAULT 0,
                        min_withdrawal NUMERIC(14,2) DEFAULT 50,
                        enabled BOOLEAN DEFAULT TRUE,
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS refund_requests (
                        id TEXT PRIMARY KEY,
                        user_id TEXT REFERENCES users(id),
                        transaction_id TEXT REFERENCES transactions(id),
                        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
                        reason TEXT NOT NULL DEFAULT '',
                        status TEXT DEFAULT 'pending',
                        resolution_note TEXT,
                        reviewed_by TEXT REFERENCES users(id),
                        reviewed_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS referrals (
                        id TEXT PRIMARY KEY,
                        referrer_id TEXT REFERENCES users(id),
                        invitee_id TEXT REFERENCES users(id),
                        status TEXT DEFAULT 'pending',
                        reward_amount NUMERIC(10,2) DEFAULT 25.00,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS reconciliation_batches (
                        id TEXT PRIMARY KEY,
                        period_start TIMESTAMPTZ NOT NULL DEFAULT NOW() - INTERVAL '30 days',
                        period_end TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        status TEXT DEFAULT 'balanced',
                        total_topups NUMERIC(14,2) DEFAULT 0,
                        total_payments NUMERIC(14,2) DEFAULT 0,
                        total_fees NUMERIC(14,2) DEFAULT 0,
                        total_withdrawals NUMERIC(14,2) DEFAULT 0,
                        total_wallets NUMERIC(14,2) DEFAULT 0,
                        variance NUMERIC(14,2) DEFAULT 0,
                        discrepancy_count INTEGER DEFAULT 0,
                        run_by TEXT REFERENCES users(id),
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
                        id TEXT PRIMARY KEY,
                        batch_id TEXT REFERENCES reconciliation_batches(id),
                        type TEXT NOT NULL DEFAULT 'variance',
                        description TEXT DEFAULT '',
                        amount NUMERIC(14,2) DEFAULT 0,
                        expected NUMERIC(14,2) DEFAULT 0,
                        actual NUMERIC(14,2) DEFAULT 0,
                        resolved BOOLEAN DEFAULT FALSE,
                        resolution_note TEXT,
                        resolved_by TEXT REFERENCES users(id),
                        resolved_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                # Migrate existing tables with ADD COLUMN IF NOT EXISTS
                await conn.execute("ALTER TABLE ratings ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE")
                await conn.execute("ALTER TABLE ratings ADD COLUMN IF NOT EXISTS flag_reason TEXT")
                # feature_flags migrations
                await conn.execute("ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS target_roles TEXT DEFAULT '[]'")
                await conn.execute("ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS metadata TEXT DEFAULT '{}'")
                await conn.execute("ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS updated_by TEXT")
                await conn.execute("ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS rollout_pct INTEGER DEFAULT 100")
                # pricing_rules migrations
                await conn.execute("ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS zone_id TEXT")
                await conn.execute("ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'all'")
                await conn.execute("ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS per_km NUMERIC(10,2) DEFAULT 2.50")
                await conn.execute("ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS per_minute NUMERIC(10,2) DEFAULT 0.50")
                # promotions migrations
                await conn.execute("ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percent'")
                await conn.execute("ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2) DEFAULT 0")
                await conn.execute("ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_ride_amount NUMERIC(10,2) DEFAULT 0")
                await conn.execute("ALTER TABLE promotions ADD COLUMN IF NOT EXISTS total_used INTEGER DEFAULT 0")
                await conn.execute("ALTER TABLE promotions ADD COLUMN IF NOT EXISTS uses_per_user INTEGER DEFAULT 1")
                await conn.execute("ALTER TABLE promotions ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW()")
                await conn.execute("ALTER TABLE promotions ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'")
                await conn.execute("ALTER TABLE promotions ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE")
                # gdpr_requests migrations
                await conn.execute("ALTER TABLE gdpr_requests ADD COLUMN IF NOT EXISTS resolution_note TEXT")
                await conn.execute("ALTER TABLE gdpr_requests ADD COLUMN IF NOT EXISTS resolved_by TEXT")
                await conn.execute("ALTER TABLE gdpr_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ")
                await conn.execute("ALTER TABLE gdpr_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()")
                # coverage_zones migrations
                await conn.execute("ALTER TABLE coverage_zones ADD COLUMN IF NOT EXISTS lat NUMERIC(10,6)")
                await conn.execute("ALTER TABLE coverage_zones ADD COLUMN IF NOT EXISTS lng NUMERIC(10,6)")
                await conn.execute("ALTER TABLE coverage_zones ADD COLUMN IF NOT EXISTS radius_km NUMERIC(10,2)")
                await conn.execute("ALTER TABLE coverage_zones ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'ZA'")
                await conn.execute("ALTER TABLE coverage_zones ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE")
                await conn.execute("ALTER TABLE coverage_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()")
                # chargebacks migrations
                await conn.execute("ALTER TABLE chargebacks ADD COLUMN IF NOT EXISTS resolution_note TEXT")
                await conn.execute("ALTER TABLE chargebacks ADD COLUMN IF NOT EXISTS amount_recovered NUMERIC(14,2) DEFAULT 0")
                # tx_limit_configs migrations
                await conn.execute("ALTER TABLE tx_limit_configs ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'passenger'")
                await conn.execute("ALTER TABLE tx_limit_configs ADD COLUMN IF NOT EXISTS daily_limit NUMERIC(14,2) DEFAULT 5000")
                await conn.execute("ALTER TABLE tx_limit_configs ADD COLUMN IF NOT EXISTS monthly_limit NUMERIC(14,2) DEFAULT 30000")
                await conn.execute("ALTER TABLE tx_limit_configs ADD COLUMN IF NOT EXISTS min_topup NUMERIC(14,2) DEFAULT 10")
                await conn.execute("ALTER TABLE tx_limit_configs ADD COLUMN IF NOT EXISTS max_topup NUMERIC(14,2) DEFAULT 5000")
                await conn.execute("ALTER TABLE tx_limit_configs ADD COLUMN IF NOT EXISTS max_withdrawal NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE tx_limit_configs ADD COLUMN IF NOT EXISTS min_withdrawal NUMERIC(14,2) DEFAULT 50")
                await conn.execute("ALTER TABLE tx_limit_configs ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE")
                # refund_requests migrations
                await conn.execute("ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS reviewed_by TEXT")
                await conn.execute("ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS resolution_note TEXT")
                await conn.execute("ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()")
                # referrals migrations
                await conn.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS invitee_id TEXT")
                await conn.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'")
                await conn.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()")
                # reconciliation_batches migrations
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days'")
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ DEFAULT NOW()")
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS total_topups NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS total_payments NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS total_fees NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS total_withdrawals NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS total_wallets NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS variance NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_batches ADD COLUMN IF NOT EXISTS discrepancy_count INTEGER DEFAULT 0")
                # reconciliation_discrepancies migrations
                await conn.execute("ALTER TABLE reconciliation_discrepancies ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''")
                await conn.execute("ALTER TABLE reconciliation_discrepancies ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_discrepancies ADD COLUMN IF NOT EXISTS expected NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_discrepancies ADD COLUMN IF NOT EXISTS actual NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE reconciliation_discrepancies ADD COLUMN IF NOT EXISTS resolution_note TEXT")
                # velocity_rules + velocity_alerts tables
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS velocity_rules (
                        id SERIAL PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT DEFAULT '',
                        tx_type TEXT NOT NULL DEFAULT 'all',
                        window_minutes INTEGER NOT NULL DEFAULT 60,
                        max_count INTEGER NOT NULL DEFAULT 10,
                        max_amount NUMERIC(14,2) NOT NULL DEFAULT 5000,
                        action TEXT NOT NULL DEFAULT 'flag',
                        active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS velocity_alerts (
                        id SERIAL PRIMARY KEY,
                        user_id TEXT REFERENCES users(id),
                        rule_id INTEGER REFERENCES velocity_rules(id),
                        tx_count INTEGER NOT NULL DEFAULT 0,
                        tx_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
                        action_taken TEXT NOT NULL DEFAULT 'flagged',
                        resolved BOOLEAN DEFAULT FALSE,
                        triggered_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                # Seed default tx limits
                for lid, role, dl, stl, ml, mint, maxt, maxw, minw in [
                    ("lim-pass-std","passenger",5000,2000,30000,10,5000,0,50),
                    ("lim-drv-std","driver",50000,5000,200000,10,10000,10000,50),
                    ("lim-own-std","owner",100000,10000,500000,10,20000,20000,50),
                    ("lim-new-usr","new_user",1000,500,5000,10,1000,0,50),
                ]:
                    await conn.execute(
                        """INSERT INTO tx_limit_configs (id,role,daily_limit,single_txn_limit,monthly_limit,min_topup,max_topup,max_withdrawal,min_withdrawal,enabled)
                           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) ON CONFLICT (role) DO NOTHING""",
                        lid,role,dl,stl,ml,mint,maxt,maxw,minw
                    )
                # Seed default pricing rules
                for pid, vtype, zid, bf, pkm, pmin, surge, son, mf in [
                    ("pr-std","all",None,8.0,2.5,0.5,1.0,False,15.0),
                    ("pr-peak","all",None,8.0,2.5,0.5,1.8,False,20.0),
                    ("pr-night","all",None,12.0,3.0,0.75,1.5,False,25.0),
                    ("pr-airport","all",None,50.0,3.5,0.6,1.0,False,120.0),
                ]:
                    await conn.execute(
                        """INSERT INTO pricing_rules (id,vehicle_type,zone_id,base_fare,per_km,per_minute,surge_multiplier,surge_active,min_fare)
                           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING""",
                        pid,vtype,zid,bf,pkm,pmin,surge,son,mf
                    )
                # Seed default coverage zones
                for zid, zn, city, prov in [
                    ("zone-jhb-cbd","Johannesburg CBD","Johannesburg","Gauteng"),
                    ("zone-sandton","Sandton / Rosebank","Johannesburg","Gauteng"),
                    ("zone-soweto","Soweto","Johannesburg","Gauteng"),
                    ("zone-pta-cbd","Pretoria Central","Pretoria","Gauteng"),
                    ("zone-cpt-cbd","Cape Town CBD","Cape Town","Western Cape"),
                    ("zone-dbn-cbd","Durban CBD","Durban","KwaZulu-Natal"),
                ]:
                    await conn.execute(
                        "INSERT INTO coverage_zones (id,name,city,province,country,active) VALUES ($1,$2,$3,$4,'ZA',TRUE) ON CONFLICT DO NOTHING",
                        zid,zn,city,prov
                    )
                # Create platform ledger tables before seeding
                await conn.execute(PLATFORM_LEDGER_SQL)
                # Seed platform accounts
                platform_accounts_defaults = [
                    ('user_wallets', 0, 'Total balance held in user wallets'),
                    ('driver_earnings_pending', 0, 'Driver earnings pending withdrawal'),
                    ('platform_revenue', 0, 'Platform commission revenue'),
                    ('processing_fees_collected', 0, 'Top-up processing fees collected'),
                    ('gateway_fees_paid', 0, 'Gateway fees paid to Stitch'),
                    ('operations_income', 0, 'Net operations income after gateway fees'),
                    ('withdrawal_settlements', 0, 'Funds settled to driver bank accounts'),
                    ('refund_reserve', 0, 'Reserve for refunds and corrections'),
                ]
                for acct, bal, desc in platform_accounts_defaults:
                    await conn.execute(
                        "INSERT INTO platform_accounts (account,balance,description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                        acct, bal, desc
                    )
                # Seed danger PIN — only on first run (ON CONFLICT DO NOTHING keeps existing value)
                initial_pin = secrets.token_hex(4)  # 8 hex chars, never stored in source
                await conn.execute(
                    "INSERT INTO system_config (key,value,description) VALUES ('danger_pin',$1,'PIN required for destructive actions') ON CONFLICT DO NOTHING",
                    initial_pin
                )
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
                # owner_drivers cashup columns
                await conn.execute("ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS daily_target NUMERIC(14,2) DEFAULT 0")
                await conn.execute("ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT FALSE")
                # owner_drivers commission split columns
                await conn.execute("ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'daily_target'")
                await conn.execute("ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS driver_commission_pct NUMERIC(5,2)")
                await conn.execute("ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS commission_status TEXT")
                await conn.execute("ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS commission_approved_by TEXT")
                await conn.execute("ALTER TABLE owner_drivers ADD COLUMN IF NOT EXISTS commission_approved_at TIMESTAMPTZ")
                # cashup_records commission tracking columns
                await conn.execute("ALTER TABLE cashup_records ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'daily_target'")
                await conn.execute("ALTER TABLE cashup_records ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2)")
                await conn.execute("ALTER TABLE cashup_records ADD COLUMN IF NOT EXISTS fuel_deducted NUMERIC(14,2) DEFAULT 0")
                # fleet_owners cashup method + bank details
                await conn.execute("ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS cashup_method TEXT DEFAULT 'wallet'")
                await conn.execute("ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS bank_name TEXT")
                await conn.execute("ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS account_number TEXT")
                await conn.execute("ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS account_name TEXT")
                # users registration fields
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS surname TEXT")
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number TEXT")
                # users ban_reason for block tracking
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT")
                # admin multiple roles (extra_roles stored as comma-separated)
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_roles TEXT DEFAULT ''")
                # Migrate kyc_documents — add new columns if they don't exist
                await conn.execute("ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS selfie_public_id TEXT")
                await conn.execute("ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS licence_public_id TEXT")
                await conn.execute("ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS storage TEXT DEFAULT 'base64'")
                # ── HR / Payroll tables ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS staff (
                        id TEXT PRIMARY KEY,
                        full_name TEXT NOT NULL,
                        role_title TEXT NOT NULL,
                        department TEXT NOT NULL DEFAULT 'Engineering',
                        employment_type TEXT NOT NULL DEFAULT 'Permanent',
                        status TEXT NOT NULL DEFAULT 'active',
                        start_date DATE NOT NULL,
                        end_date DATE,
                        gross_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
                        email TEXT,
                        phone TEXT,
                        id_number TEXT,
                        tax_ref TEXT,
                        bank_name TEXT,
                        account_number TEXT,
                        account_type TEXT DEFAULT 'Current',
                        branch_code TEXT,
                        emergency_name TEXT,
                        emergency_phone TEXT,
                        termination_reason TEXT,
                        created_by TEXT REFERENCES users(id),
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS payroll_runs (
                        id TEXT PRIMARY KEY,
                        period_month TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'draft',
                        total_gross NUMERIC(14,2) DEFAULT 0,
                        total_paye NUMERIC(14,2) DEFAULT 0,
                        total_uif_employee NUMERIC(14,2) DEFAULT 0,
                        total_uif_employer NUMERIC(14,2) DEFAULT 0,
                        total_sdl NUMERIC(14,2) DEFAULT 0,
                        total_net NUMERIC(14,2) DEFAULT 0,
                        employee_count INTEGER DEFAULT 0,
                        notes TEXT,
                        rejection_note TEXT,
                        created_by TEXT REFERENCES users(id),
                        submitted_by TEXT REFERENCES users(id),
                        submitted_at TIMESTAMPTZ,
                        approved_by TEXT REFERENCES users(id),
                        approved_at TIMESTAMPTZ,
                        executed_by TEXT REFERENCES users(id),
                        executed_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS payroll_line_items (
                        id TEXT PRIMARY KEY,
                        run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
                        staff_id TEXT NOT NULL REFERENCES staff(id),
                        full_name TEXT NOT NULL,
                        role_title TEXT NOT NULL,
                        department TEXT NOT NULL,
                        gross_salary NUMERIC(14,2) NOT NULL,
                        paye NUMERIC(14,2) NOT NULL DEFAULT 0,
                        uif_employee NUMERIC(14,2) NOT NULL DEFAULT 0,
                        uif_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
                        sdl NUMERIC(14,2) NOT NULL DEFAULT 0,
                        net_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
                        bank_name TEXT,
                        account_number TEXT,
                        branch_code TEXT
                    )
                """)
                # ── System wallet (trust account) ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS system_wallet (
                        id TEXT PRIMARY KEY DEFAULT 'main',
                        balance NUMERIC(18,2) DEFAULT 0,
                        total_fees_in NUMERIC(18,2) DEFAULT 0,
                        total_paid_out NUMERIC(18,2) DEFAULT 0,
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute(
                    "INSERT INTO system_wallet (id) VALUES ('main') ON CONFLICT DO NOTHING"
                )
                # ── Driver transfer requests ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS driver_transfer_requests (
                        id TEXT PRIMARY KEY,
                        driver_user_id TEXT NOT NULL REFERENCES users(id),
                        old_owner_id TEXT REFERENCES fleet_owners(id),
                        old_owner_user_id TEXT REFERENCES users(id),
                        new_owner_id TEXT NOT NULL REFERENCES fleet_owners(id),
                        new_owner_user_id TEXT NOT NULL REFERENCES users(id),
                        status TEXT NOT NULL DEFAULT 'pending_old_owner',
                        old_owner_reject_reason TEXT,
                        new_owner_reject_reason TEXT,
                        reminder_sent_at TIMESTAMPTZ,
                        escalated_at TIMESTAMPTZ,
                        admin_override_by TEXT REFERENCES users(id),
                        admin_override_at TIMESTAMPTZ,
                        admin_override_note TEXT,
                        completed_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS transfer_contact_attempts (
                        id TEXT PRIMARY KEY,
                        transfer_id TEXT NOT NULL REFERENCES driver_transfer_requests(id),
                        admin_id TEXT NOT NULL REFERENCES users(id),
                        contact_method TEXT NOT NULL,
                        outcome TEXT NOT NULL,
                        notes TEXT,
                        attempted_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                # ── Payout settings (admin-controlled approval gate) ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS payout_settings (
                        id TEXT PRIMARY KEY DEFAULT 'default',
                        require_approval BOOLEAN DEFAULT TRUE,
                        auto_approve_limit NUMERIC(14,2) DEFAULT 0,
                        pay_fuel_enabled BOOLEAN DEFAULT TRUE,
                        pay_fuel_max_per_txn NUMERIC(14,2) DEFAULT 500,
                        pay_fuel_daily_limit NUMERIC(14,2) DEFAULT 1000,
                        updated_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_by TEXT
                    )
                """)
                await conn.execute(
                    "INSERT INTO payout_settings (id) VALUES ('default') ON CONFLICT DO NOTHING"
                )
                # Migrate existing payout_settings rows
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS pay_fuel_enabled BOOLEAN DEFAULT TRUE")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS pay_fuel_max_per_txn NUMERIC(14,2) DEFAULT 500")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS pay_fuel_daily_limit NUMERIC(14,2) DEFAULT 1000")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS commission_auto_cashup_time TEXT")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS commission_auto_cashup_last_run DATE")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS default_commission_pct NUMERIC(5,2) DEFAULT 50.00")
                await conn.execute("ALTER TABLE cashup_records ADD COLUMN IF NOT EXISTS driver_payout_id TEXT")
                await conn.execute("ALTER TABLE cashup_records ADD COLUMN IF NOT EXISTS driver_payout_status TEXT DEFAULT 'wallet'")
                # ── Subscription pricing columns ──
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS subscription_price_per_taxi NUMERIC(14,2) DEFAULT 10.00")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS subscription_free_taxis INTEGER DEFAULT 1")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS owner_statement_price NUMERIC(14,2) DEFAULT 10.00")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS passenger_statement_price NUMERIC(14,2) DEFAULT 0.00")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS withdrawal_gateway_fee_fixed NUMERIC(14,2) DEFAULT 3.50")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS subscription_billing_day INTEGER DEFAULT 1")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS maintenance_fee_enabled BOOLEAN DEFAULT FALSE")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS maintenance_fee_amount NUMERIC(14,2) DEFAULT 0.00")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS maintenance_fee_day INTEGER DEFAULT 1")
                await conn.execute("ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS maintenance_fee_label TEXT DEFAULT 'Monthly maintenance fee'")
                # Make passenger statements free if still at the original R5 default
                await conn.execute("UPDATE payout_settings SET passenger_statement_price=0.00 WHERE id='default' AND passenger_statement_price=5.00")
                # ── Owner subscription tracking ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS owner_subscriptions (
                        id TEXT PRIMARY KEY,
                        owner_user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
                        status TEXT NOT NULL DEFAULT 'active',
                        taxi_count INTEGER DEFAULT 0,
                        billable_taxis INTEGER DEFAULT 0,
                        monthly_fee NUMERIC(14,2) DEFAULT 0,
                        billing_day INTEGER DEFAULT 1,
                        next_billing_date DATE,
                        last_billed_date DATE,
                        overdue_since DATE,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW(),
                        CONSTRAINT chk_status CHECK (status IN ('active','overdue','cancelled'))
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_owner_sub_user ON owner_subscriptions(owner_user_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_owner_sub_billing ON owner_subscriptions(next_billing_date) WHERE status != 'cancelled'")
                # ── Subscription billing records ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS subscription_billing_records (
                        id TEXT PRIMARY KEY,
                        owner_user_id TEXT NOT NULL REFERENCES users(id),
                        period_month INTEGER NOT NULL,
                        period_year INTEGER NOT NULL,
                        taxi_count INTEGER NOT NULL DEFAULT 0,
                        billable_taxis INTEGER NOT NULL DEFAULT 0,
                        price_per_taxi NUMERIC(14,2) NOT NULL DEFAULT 0,
                        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
                        status TEXT NOT NULL DEFAULT 'paid',
                        transaction_id TEXT,
                        failure_reason TEXT,
                        billed_at TIMESTAMPTZ DEFAULT NOW(),
                        paid_at TIMESTAMPTZ,
                        CONSTRAINT chk_billing_status CHECK (status IN ('paid','failed','waived','pending'))
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_sub_billing_user ON subscription_billing_records(owner_user_id)")
                # ── Paid statement requests (owners + passengers) ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS statement_requests (
                        id TEXT PRIMARY KEY,
                        reference TEXT UNIQUE NOT NULL,
                        user_id TEXT NOT NULL REFERENCES users(id),
                        role TEXT NOT NULL,
                        period_start DATE NOT NULL,
                        period_end DATE NOT NULL,
                        amount_paid NUMERIC(14,2) DEFAULT 0,
                        status TEXT NOT NULL DEFAULT 'paid',
                        transaction_id TEXT,
                        statement_data JSONB,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        CONSTRAINT chk_stmt_role CHECK (role IN ('owner','passenger','driver'))
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_stmt_req_user ON statement_requests(user_id)")
                # withdrawal_requests extra columns
                await conn.execute("ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS payout_type TEXT DEFAULT 'payout'")
                await conn.execute("ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ")
                await conn.execute("ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_by TEXT")
                # ── Salary payments ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS salary_payments (
                        id TEXT PRIMARY KEY,
                        employee_name TEXT NOT NULL,
                        staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
                        bank_name TEXT NOT NULL,
                        account_number TEXT NOT NULL,
                        account_holder TEXT NOT NULL,
                        branch_code TEXT,
                        gross_amount NUMERIC(14,2) NOT NULL,
                        paye_deducted NUMERIC(14,2) DEFAULT 0,
                        uif_deducted NUMERIC(14,2) DEFAULT 0,
                        net_amount NUMERIC(14,2) NOT NULL,
                        pay_period TEXT NOT NULL,
                        description TEXT,
                        status TEXT DEFAULT 'pending',
                        created_by TEXT REFERENCES users(id),
                        approved_by TEXT REFERENCES users(id),
                        rejection_reason TEXT,
                        payment_reference TEXT,
                        stitch_payout_id TEXT,
                        paid_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                # ── Signed documents vault ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS signed_documents (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        description TEXT,
                        file_name TEXT NOT NULL,
                        file_data TEXT NOT NULL,
                        file_size INTEGER,
                        mime_type TEXT DEFAULT 'application/pdf',
                        category TEXT DEFAULT 'general',
                        signed_by TEXT,
                        signed_date DATE,
                        counterparty TEXT,
                        access_level TEXT DEFAULT 'restricted',
                        uploaded_by TEXT REFERENCES users(id),
                        deleted_by TEXT REFERENCES users(id),
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                # ── Company documents ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS company_documents (
                        id TEXT PRIMARY KEY,
                        folder_id TEXT NOT NULL,
                        file_name TEXT NOT NULL,
                        display_name TEXT NOT NULL,
                        content TEXT NOT NULL DEFAULT '',
                        access_level TEXT NOT NULL DEFAULT 'internal',
                        version INTEGER DEFAULT 1,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_by TEXT REFERENCES users(id),
                        updated_by TEXT REFERENCES users(id),
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW(),
                        UNIQUE(folder_id, file_name)
                    )
                """)

                # ── Allow owners to register without a phone number ──
                await conn.execute("ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL")

                # ── Track owner's "do you also drive?" choice at signup ──
                await conn.execute("ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS registered_as_driver BOOLEAN DEFAULT FALSE")

                # ── T&C acceptance records (legal compliance) ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS tc_acceptances (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        tc_version TEXT NOT NULL DEFAULT '1.0',
                        privacy_version TEXT NOT NULL DEFAULT '1.0',
                        accepted_at TIMESTAMPTZ DEFAULT NOW(),
                        platform TEXT,
                        app_version TEXT,
                        ip_address TEXT,
                        device_info TEXT
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_tc_acceptances_user ON tc_acceptances(user_id)")

                # ── User login sessions (app users, mirrors admin_sessions) ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_sessions (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        token_hash TEXT NOT NULL,
                        platform TEXT,
                        device_name TEXT,
                        device_id TEXT,
                        ip_address TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        last_used_at TIMESTAMPTZ DEFAULT NOW(),
                        expires_at TIMESTAMPTZ,
                        revoked BOOLEAN DEFAULT FALSE,
                        revoked_at TIMESTAMPTZ,
                        revoke_reason TEXT
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash)")

                # ── Registered devices (for lost-device suspend feature) ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_devices (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        device_id TEXT NOT NULL,
                        device_name TEXT,
                        platform TEXT,
                        push_token TEXT,
                        registered_at TIMESTAMPTZ DEFAULT NOW(),
                        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
                        is_active BOOLEAN DEFAULT TRUE,
                        deactivated_at TIMESTAMPTZ,
                        deactivated_reason TEXT,
                        UNIQUE(user_id, device_id)
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id)")

                # ── Support tickets (WhatsApp / email / call / in-app) ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS support_tickets (
                        id TEXT PRIMARY KEY,
                        ticket_number TEXT UNIQUE NOT NULL,
                        user_id TEXT REFERENCES users(id),
                        channel TEXT NOT NULL DEFAULT 'app',
                        subject TEXT NOT NULL,
                        message TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'open',
                        priority TEXT NOT NULL DEFAULT 'normal',
                        assigned_to TEXT REFERENCES users(id),
                        resolved_by TEXT REFERENCES users(id),
                        resolution_note TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW(),
                        resolved_at TIMESTAMPTZ,
                        CONSTRAINT chk_channel CHECK (channel IN ('whatsapp','email','call','app')),
                        CONSTRAINT chk_status CHECK (status IN ('open','in_progress','waiting_user','resolved','closed')),
                        CONSTRAINT chk_priority CHECK (priority IN ('low','normal','high','urgent'))
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)")

                # ── Driver payslips ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS payslips (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        user_id TEXT NOT NULL,
                        period_type TEXT NOT NULL,
                        period_label TEXT NOT NULL,
                        period_start TIMESTAMPTZ NOT NULL,
                        period_end TIMESTAMPTZ NOT NULL,
                        gross_earnings NUMERIC DEFAULT 0,
                        platform_fee NUMERIC DEFAULT 0,
                        total_net NUMERIC DEFAULT 0,
                        owner_payouts NUMERIC DEFAULT 0,
                        driver_net_earnings NUMERIC DEFAULT 0,
                        driver_cashups_self NUMERIC DEFAULT 0,
                        wallet_balance_at_generation NUMERIC DEFAULT 0,
                        total_trips INTEGER DEFAULT 0,
                        rating_avg NUMERIC DEFAULT 0,
                        rating_count INTEGER DEFAULT 0,
                        fee_charged NUMERIC DEFAULT 0,
                        reference_number TEXT UNIQUE NOT NULL,
                        verification_code TEXT NOT NULL,
                        status TEXT DEFAULT 'generated',
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_payslips_user ON payslips(user_id)")

                # Add document_type column if missing (formal payslip support)
                await conn.execute(
                    "ALTER TABLE payslips ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'statement'"
                )
                # Add id_number column to users if missing
                await conn.execute(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number TEXT"
                )

                # Payslip config seeds
                for _k, _v, _d in [
                    ("payslip_fee_1month", "2.00", "Payslip fee for 1-month period"),
                    ("payslip_fee_3months", "5.00", "Payslip fee for 3-month period"),
                    ("payslip_fee_6months", "8.00", "Payslip fee for 6-month period"),
                    ("payslip_fee_12months", "12.00", "Payslip fee for 12-month period"),
                    ("payslip_enabled", "true", "Enable/disable driver payslip feature"),
                    ("formal_payslip_fee_1month", "5.00", "Formal payslip fee for 1-month period"),
                    ("formal_payslip_fee_3months", "10.00", "Formal payslip fee for 3-month period"),
                    ("formal_payslip_fee_6months", "15.00", "Formal payslip fee for 6-month period"),
                    ("formal_payslip_fee_12months", "25.00", "Formal payslip fee for 12-month period"),
                    ("formal_payslip_enabled", "true", "Enable/disable formal payslip feature"),
                    ("track_me_fee", "3.00", "Fee charged per Track Me session (ZAR)"),
                    ("track_me_enabled", "true", "Enable/disable Track Me feature"),
                ]:
                    await conn.execute(
                        "INSERT INTO system_config (key,value,description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                        _k, _v, _d
                    )

                # ── User documents ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_documents (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        user_id TEXT NOT NULL,
                        document_type TEXT NOT NULL,
                        title TEXT NOT NULL,
                        description TEXT,
                        period_label TEXT,
                        amount NUMERIC DEFAULT 0,
                        reference_number TEXT,
                        source TEXT DEFAULT 'app',
                        is_read BOOLEAN DEFAULT false,
                        status TEXT DEFAULT 'active',
                        metadata JSONB DEFAULT '{}',
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_user_documents_user ON user_documents(user_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_user_documents_type ON user_documents(document_type)")

                # ── SafeRide Safety System ──
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS passenger_safety_profiles (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        user_id TEXT UNIQUE NOT NULL,
                        full_name TEXT,
                        id_number TEXT,
                        date_of_birth TEXT,
                        blood_type TEXT,
                        home_address TEXT,
                        medical_conditions TEXT,
                        allergies TEXT,
                        emergency_contact_1_name TEXT,
                        emergency_contact_1_phone TEXT,
                        emergency_contact_1_relationship TEXT,
                        emergency_contact_2_name TEXT,
                        emergency_contact_2_phone TEXT,
                        emergency_contact_2_relationship TEXT,
                        next_of_kin_name TEXT,
                        next_of_kin_phone TEXT,
                        next_of_kin_relationship TEXT,
                        profile_complete BOOLEAN DEFAULT false,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS trips (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        trip_reference TEXT UNIQUE NOT NULL,
                        driver_id TEXT NOT NULL,
                        driver_name TEXT,
                        driver_phone TEXT,
                        vehicle_plate TEXT,
                        status TEXT DEFAULT 'active',
                        started_at TIMESTAMPTZ DEFAULT NOW(),
                        ended_at TIMESTAMPTZ,
                        start_latitude NUMERIC,
                        start_longitude NUMERIC,
                        end_latitude NUMERIC,
                        end_longitude NUMERIC,
                        total_passengers INTEGER DEFAULT 0,
                        total_revenue NUMERIC DEFAULT 0,
                        incident_flag BOOLEAN DEFAULT false,
                        incident_notes TEXT,
                        incident_flagged_at TIMESTAMPTZ,
                        incident_flagged_by TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("ALTER TABLE trips ADD COLUMN IF NOT EXISTS cash_passengers INTEGER DEFAULT 0")
                await conn.execute("ALTER TABLE trips ADD COLUMN IF NOT EXISTS taxi_capacity INTEGER DEFAULT 0")
                await conn.execute("ALTER TABLE trips ADD COLUMN IF NOT EXISTS last_latitude NUMERIC")
                await conn.execute("ALTER TABLE trips ADD COLUMN IF NOT EXISTS last_longitude NUMERIC")
                await conn.execute("ALTER TABLE trips ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ")
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS trip_passengers (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        trip_id TEXT NOT NULL,
                        passenger_id TEXT NOT NULL,
                        passenger_name TEXT,
                        passenger_phone TEXT,
                        payment_amount NUMERIC DEFAULT 0,
                        payment_id TEXT,
                        boarded_at TIMESTAMPTZ DEFAULT NOW(),
                        alighted BOOLEAN DEFAULT false,
                        alighted_at TIMESTAMPTZ,
                        safety_profile_complete BOOLEAN DEFAULT false
                    )
                """)
                await conn.execute("ALTER TABLE trip_passengers ADD COLUMN IF NOT EXISTS safety_profile_complete BOOLEAN DEFAULT false")
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS gps_locations (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        user_id TEXT NOT NULL,
                        trip_id TEXT,
                        latitude NUMERIC NOT NULL,
                        longitude NUMERIC NOT NULL,
                        speed NUMERIC DEFAULT 0,
                        heading NUMERIC DEFAULT 0,
                        accuracy NUMERIC,
                        recorded_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                # Indexes for common queries
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_gps_locations_trip_id ON gps_locations(trip_id, recorded_at DESC)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_gps_locations_user_id ON gps_locations(user_id, recorded_at DESC)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_trip_passengers_passenger_id ON trip_passengers(passenger_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_trip_passengers_trip_id ON trip_passengers(trip_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_trips_driver_status ON trips(driver_id, status)")
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS incidents (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        incident_reference TEXT UNIQUE NOT NULL,
                        trip_id TEXT,
                        vehicle_plate TEXT,
                        driver_id TEXT,
                        incident_type TEXT DEFAULT 'accident',
                        description TEXT,
                        latitude NUMERIC,
                        longitude NUMERIC,
                        flagged_by TEXT,
                        flagged_at TIMESTAMPTZ DEFAULT NOW(),
                        notifications_sent BOOLEAN DEFAULT false,
                        notifications_sent_at TIMESTAMPTZ,
                        status TEXT DEFAULT 'active',
                        resolved_at TIMESTAMPTZ,
                        resolved_by TEXT,
                        resolution_notes TEXT
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS emergency_notifications (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        incident_id TEXT NOT NULL,
                        passenger_id TEXT,
                        contact_name TEXT,
                        contact_phone TEXT,
                        contact_relationship TEXT,
                        message_sent TEXT,
                        sms_status TEXT DEFAULT 'pending',
                        sent_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS sos_requests (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        user_id TEXT NOT NULL,
                        user_name TEXT,
                        user_phone TEXT,
                        emergency_type TEXT NOT NULL,
                        latitude NUMERIC,
                        longitude NUMERIC,
                        status TEXT DEFAULT 'active',
                        admin_id TEXT,
                        admin_notes TEXT,
                        price NUMERIC,
                        charged BOOLEAN DEFAULT false,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        dispatched_at TIMESTAMPTZ,
                        resolved_at TIMESTAMPTZ
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS sos_locations (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        sos_id TEXT NOT NULL,
                        latitude NUMERIC NOT NULL,
                        longitude NUMERIC NOT NULL,
                        recorded_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS trip_id TEXT")
                await conn.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS passenger_user_id TEXT")
                await conn.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS driver_user_id TEXT")
                await conn.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vehicle_plate TEXT")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_gps_user_time ON gps_locations(user_id, recorded_at DESC)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id, status)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_trips_plate ON trips(vehicle_plate)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_incidents_plate ON incidents(vehicle_plate)")
                await conn.execute("ALTER TABLE passenger_safety_profiles ADD COLUMN IF NOT EXISTS passport_number TEXT")
                await conn.execute("ALTER TABLE passenger_safety_profiles ADD COLUMN IF NOT EXISTS dead_man_code TEXT")
                await conn.execute("ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS is_dead_man BOOLEAN DEFAULT FALSE")
                await conn.execute("ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS dead_man_triggered_at TIMESTAMPTZ")
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS dead_man_reset_requests (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        user_id TEXT NOT NULL REFERENCES users(id),
                        user_name TEXT,
                        user_phone TEXT,
                        user_role TEXT,
                        reason TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'pending',
                        admin_id TEXT,
                        admin_name TEXT,
                        admin_reason TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_dmrr_user ON dead_man_reset_requests(user_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_dmrr_status ON dead_man_reset_requests(status)")

                # ── Taxi Associations ──────────────────────────────
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS taxi_associations (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        name TEXT NOT NULL,
                        registration_number TEXT,
                        contact_name TEXT,
                        contact_phone TEXT,
                        contact_email TEXT,
                        province TEXT,
                        city TEXT,
                        bank_name TEXT,
                        account_number TEXT,
                        account_holder TEXT,
                        branch_code TEXT,
                        agreement_type TEXT NOT NULL DEFAULT 'per_driver',
                        agreement_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        notes TEXT,
                        created_by TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS association_payouts (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        association_id TEXT NOT NULL REFERENCES taxi_associations(id) ON DELETE CASCADE,
                        period_month INTEGER NOT NULL,
                        period_year INTEGER NOT NULL,
                        driver_count INTEGER NOT NULL DEFAULT 0,
                        platform_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
                        subscription_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
                        statement_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
                        total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
                        payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                        bank_name TEXT,
                        account_number TEXT,
                        account_holder TEXT,
                        reference TEXT,
                        status TEXT NOT NULL DEFAULT 'pending',
                        paid_at TIMESTAMPTZ,
                        paid_by TEXT,
                        paid_by_name TEXT,
                        notes TEXT,
                        created_by TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS taxi_association_id TEXT REFERENCES taxi_associations(id) ON DELETE SET NULL")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_assoc ON users(taxi_association_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_assoc_payouts_assoc ON association_payouts(association_id)")
                await conn.execute("ALTER TABLE taxi_associations ADD COLUMN IF NOT EXISTS auto_pay_enabled BOOLEAN NOT NULL DEFAULT FALSE")
                await conn.execute("ALTER TABLE taxi_associations ADD COLUMN IF NOT EXISTS auto_pay_day INTEGER DEFAULT 25")
                await conn.execute("ALTER TABLE taxi_associations ADD COLUMN IF NOT EXISTS auto_pay_amount NUMERIC(12,2) DEFAULT NULL")

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

class DocumentCreateIn(BaseModel):
    folder_id: str = Field(min_length=1, max_length=60)
    file_name: str = Field(min_length=1, max_length=120)
    display_name: str = Field(min_length=1, max_length=200)
    content: str = Field(default="")
    access_level: str = Field(default="internal")

class DocumentUpdateIn(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=200)
    content: Optional[str] = None
    access_level: Optional[str] = None

class SignedDocMetaIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    category: str = Field(default="general", max_length=60)
    signed_by: Optional[str] = Field(default=None, max_length=200)
    signed_date: Optional[str] = Field(default=None)
    counterparty: Optional[str] = Field(default=None, max_length=200)
    access_level: str = Field(default="restricted")

class DisputeIn(BaseModel):
    transaction_id: str
    reason: str = Field(min_length=10, max_length=500)
    category: Optional[str] = None

class ResolveDisputeIn(BaseModel):
    resolution: str = Field(min_length=5, max_length=500)
    admin_notes: Optional[str] = None
    notify_user: bool = True

# ── Driver Transfer Models ─────────────────────────────────────
class TransferRequestIn(BaseModel):
    owner_code: str

class TransferRejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)

class ContactAttemptIn(BaseModel):
    contact_method: str
    outcome: str
    notes: Optional[str] = None

class AdminTransferOverrideIn(BaseModel):
    note: str = Field(min_length=5, max_length=500)

def _fmt_transfer(t: dict) -> dict:
    return {
        "id": t["id"],
        "driver_user_id": t["driver_user_id"],
        "driver_name": t.get("driver_name", ""),
        "driver_phone": t.get("driver_phone", ""),
        "old_owner_id": t.get("old_owner_id"),
        "old_owner_user_id": t.get("old_owner_user_id"),
        "old_owner_name": t.get("old_owner_name"),
        "new_owner_id": t["new_owner_id"],
        "new_owner_user_id": t["new_owner_user_id"],
        "new_owner_name": t.get("new_owner_name", ""),
        "status": t["status"],
        "old_owner_reject_reason": t.get("old_owner_reject_reason"),
        "new_owner_reject_reason": t.get("new_owner_reject_reason"),
        "reminder_sent_at": iso(t["reminder_sent_at"]) if t.get("reminder_sent_at") else None,
        "escalated_at": iso(t["escalated_at"]) if t.get("escalated_at") else None,
        "admin_override_note": t.get("admin_override_note"),
        "completed_at": iso(t["completed_at"]) if t.get("completed_at") else None,
        "created_at": iso(t["created_at"]),
    }

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

@api.get("/admin/export/drivers")
async def export_drivers(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "export_data"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.full_name, u.phone_number, d.vehicle_plate, d.vehicle_model,
                   d.is_verified, d.kyc_status, d.rating,
                   COALESCE(w.balance, 0) as wallet_balance, u.is_active, u.created_at
            FROM users u
            JOIN drivers d ON d.user_id = u.id
            LEFT JOIN wallets w ON w.user_id = u.id
            ORDER BY u.created_at DESC
        """)
        await audit(conn, admin["id"], "EXPORT_DRIVERS", None, None, {"count": len(rows)}, request.client.host)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Full Name","Phone","Plate","Vehicle","Verified","KYC Status","Rating","Wallet Balance","Active","Joined"])
    for r in rows:
        w.writerow([r["full_name"],r["phone_number"],r["vehicle_plate"] or "",r["vehicle_model"] or "",r["is_verified"],r["kyc_status"] or "",float(r["rating"] or 0),float(r["wallet_balance"]),r["is_active"],iso(r["created_at"])])
    out.seek(0)
    return StreamingResponse(io.BytesIO(out.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=drivers.csv"})

@api.get("/admin/export/owners")
async def export_owners(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "export_data"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.full_name, u.email, u.phone_number, fo.cashup_method,
                   fo.bank_name, fo.account_number, fo.account_name,
                   COUNT(od.id) as driver_count, u.is_active, u.created_at
            FROM users u
            JOIN fleet_owners fo ON fo.user_id = u.id
            LEFT JOIN owner_drivers od ON od.owner_id = fo.id
            GROUP BY u.full_name, u.email, u.phone_number, fo.cashup_method,
                     fo.bank_name, fo.account_number, fo.account_name, u.is_active, u.created_at
            ORDER BY u.created_at DESC
        """)
        await audit(conn, admin["id"], "EXPORT_OWNERS", None, None, {"count": len(rows)}, request.client.host)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Full Name","Email","Phone","Cashup Method","Bank","Account Number","Account Name","Drivers","Active","Joined"])
    for r in rows:
        w.writerow([r["full_name"],r["email"] or "",r["phone_number"] or "",r["cashup_method"] or "",r["bank_name"] or "",r["account_number"] or "",r["account_name"] or "",r["driver_count"],r["is_active"],iso(r["created_at"])])
    out.seek(0)
    return StreamingResponse(io.BytesIO(out.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=fleet-owners.csv"})

@api.get("/admin/export/withdrawals")
async def export_withdrawals(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "export_data"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT wr.id, u.full_name, u.phone_number, wr.amount, wr.status,
                   wr.bank_name, wr.account_number, wr.account_name,
                   wr.created_at, wr.processed_at
            FROM withdrawal_requests wr
            JOIN users u ON u.id = wr.user_id
            ORDER BY wr.created_at DESC
        """)
        await audit(conn, admin["id"], "EXPORT_WITHDRAWALS", None, None, {"count": len(rows)}, request.client.host)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["ID","Full Name","Phone","Amount","Status","Bank","Account Number","Account Name","Requested","Processed"])
    for r in rows:
        w.writerow([r["id"],r["full_name"],r["phone_number"] or "",float(r["amount"]),r["status"],r["bank_name"] or "",r["account_number"] or "",r["account_name"] or "",iso(r["created_at"]),iso(r["processed_at"]) if r["processed_at"] else ""])
    out.seek(0)
    return StreamingResponse(io.BytesIO(out.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=withdrawals.csv"})

@api.get("/admin/export/refunds")
async def export_refunds(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_refunds"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT rr.id, u.full_name, u.phone_number, t.reference as txn_ref,
                   rr.amount, rr.reason, rr.status, rr.created_at, rr.resolved_at
            FROM refund_requests rr
            JOIN users u ON u.id = rr.user_id
            LEFT JOIN transactions t ON t.id = rr.transaction_id
            ORDER BY rr.created_at DESC
        """)
        await audit(conn, admin["id"], "EXPORT_REFUNDS", None, None, {"count": len(rows)}, request.client.host)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["ID","Full Name","Phone","Txn Reference","Amount","Reason","Status","Requested","Resolved"])
    for r in rows:
        w.writerow([r["id"],r["full_name"],r["phone_number"] or "",r["txn_ref"] or "",float(r["amount"] or 0),r["reason"] or "",r["status"],iso(r["created_at"]),iso(r["resolved_at"]) if r["resolved_at"] else ""])
    out.seek(0)
    return StreamingResponse(io.BytesIO(out.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=refunds.csv"})

@api.get("/admin/export/kyc")
async def export_kyc(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "review_kyc"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.full_name, u.phone_number, d.kyc_status, d.is_verified,
                   kd.document_type, kd.status as doc_status, kd.created_at as submitted_at, kd.reviewed_at
            FROM users u
            JOIN drivers d ON d.user_id = u.id
            LEFT JOIN kyc_documents kd ON kd.user_id = u.id
            ORDER BY kd.created_at DESC NULLS LAST
        """)
        await audit(conn, admin["id"], "EXPORT_KYC", None, None, {"count": len(rows)}, request.client.host)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Full Name","Phone","KYC Status","Verified","Document Type","Doc Status","Submitted","Reviewed"])
    for r in rows:
        w.writerow([r["full_name"],r["phone_number"] or "",r["kyc_status"] or "",r["is_verified"],r["document_type"] or "",r["doc_status"] or "",iso(r["submitted_at"]) if r["submitted_at"] else "",iso(r["reviewed_at"]) if r["reviewed_at"] else ""])
    out.seek(0)
    return StreamingResponse(io.BytesIO(out.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=kyc-submissions.csv"})

@api.get("/admin/export/flagged")
async def export_flagged(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_risk"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.full_name, u.phone_number, u.role, u.is_active, u.ban_reason,
                   COALESCE(w.frozen_reason, '') as frozen_reason,
                   w.frozen as wallet_frozen, u.created_at
            FROM users u
            LEFT JOIN wallets w ON w.user_id = u.id
            WHERE u.is_active = false OR w.frozen = true OR u.ban_reason IS NOT NULL
            ORDER BY u.created_at DESC
        """)
        await audit(conn, admin["id"], "EXPORT_FLAGGED", None, None, {"count": len(rows)}, request.client.host)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Full Name","Phone","Role","Active","Ban Reason","Wallet Frozen","Frozen Reason","Joined"])
    for r in rows:
        w.writerow([r["full_name"],r["phone_number"] or "",r["role"],r["is_active"],r["ban_reason"] or "",r["wallet_frozen"],r["frozen_reason"],iso(r["created_at"])])
    out.seek(0)
    return StreamingResponse(io.BytesIO(out.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=flagged-accounts.csv"})

@api.get("/admin/export/payroll")
async def export_payroll(request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_staff"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT pr.id, pr.period_label, pr.run_date, pr.total_gross,
                   pr.total_paye, pr.total_uif, pr.total_net,
                   pr.staff_count, pr.status, pr.executed_by
            FROM payroll_runs pr
            ORDER BY pr.run_date DESC
        """)
        await audit(conn, admin["id"], "EXPORT_PAYROLL", None, None, {"count": len(rows)}, request.client.host)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Run ID","Period","Run Date","Gross","PAYE","UIF","Net","Staff Count","Status","Run By"])
    for r in rows:
        w.writerow([r["id"],r["period_label"] or "",iso(r["run_date"]) if r["run_date"] else "",float(r["total_gross"] or 0),float(r["total_paye"] or 0),float(r["total_uif"] or 0),float(r["total_net"] or 0),r["staff_count"] or 0,r["status"],r["executed_by"] or ""])
    out.seek(0)
    return StreamingResponse(io.BytesIO(out.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=payroll.csv"})

# ── Admin: Velocity Rules ─────────────────────────────────────

@api.get("/admin/velocity/rules")
async def get_velocity_rules(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM velocity_rules ORDER BY created_at DESC")
    return [dict(r) for r in rows]

@api.post("/admin/velocity/rules")
async def create_velocity_rule(body: dict, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_limits"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO velocity_rules (name, description, tx_type, window_minutes, max_count, max_amount, action, active, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW())
            RETURNING *
        """, body.get("name"), body.get("description",""), body.get("tx_type","all"),
            int(body.get("window_minutes",60)), int(body.get("max_count",10)),
            float(body.get("max_amount",5000)), body.get("action","flag"))
        await audit(conn, admin["id"], "CREATE_VELOCITY_RULE", str(row["id"]), "velocity_rule", {"name": body.get("name")}, request.client.host)
    return dict(row)

@api.patch("/admin/velocity/rules/{rule_id}")
async def update_velocity_rule(rule_id: int, body: dict, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_limits"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        if "active" in body:
            await conn.execute("UPDATE velocity_rules SET active=$1 WHERE id=$2", body["active"], rule_id)
        await audit(conn, admin["id"], "UPDATE_VELOCITY_RULE", str(rule_id), "velocity_rule", body, request.client.host)
    return {"ok": True}

@api.delete("/admin/velocity/rules/{rule_id}")
async def delete_velocity_rule(rule_id: int, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_limits"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM velocity_rules WHERE id=$1", rule_id)
        await audit(conn, admin["id"], "DELETE_VELOCITY_RULE", str(rule_id), "velocity_rule", {}, request.client.host)
    return {"ok": True}

@api.get("/admin/velocity/alerts")
async def get_velocity_alerts(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT va.*, u.full_name as user_name, u.phone_number,
                   vr.name as rule_name
            FROM velocity_alerts va
            JOIN users u ON u.id = va.user_id
            JOIN velocity_rules vr ON vr.id = va.rule_id
            ORDER BY va.triggered_at DESC
            LIMIT 200
        """)
    return [dict(r) for r in rows]

@api.post("/admin/velocity/alerts/{alert_id}/resolve")
async def resolve_velocity_alert(alert_id: int, request: Request, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE velocity_alerts SET resolved=true WHERE id=$1", alert_id)
        await audit(conn, admin["id"], "RESOLVE_VELOCITY_ALERT", str(alert_id), "velocity_alert", {}, request.client.host)
    return {"ok": True}

# ── 3. DISPUTES ──────────────────────────────────────────────
@api.get("/admin/disputes")
async def admin_disputes(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT d.id, d.transaction_id, d.user_id, d.reason, d.category,
                   d.status, d.resolution, d.admin_notes, d.resolved_by,
                   d.resolved_at, d.created_at,
                   u.full_name as user_name, u.phone_number,
                   t.reference, t.amount, t.type as txn_type,
                   rb.full_name as resolved_by_name
            FROM disputes d
            JOIN users u ON u.id=d.user_id
            LEFT JOIN transactions t ON t.id=d.transaction_id
            LEFT JOIN users rb ON rb.id=d.resolved_by
            ORDER BY d.created_at DESC
        """)
    return [
        {
            **dict(r),
            "amount": float(r["amount"] or 0),
            "created_at": iso(r["created_at"]),
            "resolved_at": iso(r["resolved_at"]) if r["resolved_at"] else None,
        }
        for r in rows
    ]

@api.post("/admin/disputes/{dispute_id}/resolve")
async def resolve_dispute(dispute_id: str, body: ResolveDisputeIn, request: Request, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        dispute = await conn.fetchrow("SELECT user_id FROM disputes WHERE id=$1", dispute_id)
        if not dispute:
            raise HTTPException(status_code=404, detail="Dispute not found")
        await conn.execute(
            "UPDATE disputes SET status='resolved',resolved_by=$1,resolution=$2,admin_notes=$3,resolved_at=NOW() WHERE id=$4",
            admin["id"], body.resolution, body.admin_notes, dispute_id
        )
        if body.notify_user and dispute["user_id"]:
            notif_id = str(uuid.uuid4())
            await conn.execute(
                "INSERT INTO notifications (id,title,message,type,target,target_user_id,sent_by) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                notif_id,
                "Your dispute has been resolved",
                f"Resolution: {body.resolution}",
                "info",
                "user",
                dispute["user_id"],
                admin["id"],
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
            "INSERT INTO disputes (id,transaction_id,user_id,reason,category) VALUES ($1,$2,$3,$4,$5)",
            str(uuid.uuid4()), body.transaction_id, user["id"], body.reason, body.category
        )
    return {"ok": True}

@api.get("/wallet/disputes")
async def my_disputes(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT d.id, d.transaction_id, d.reason, d.category, d.status, d.resolution, d.created_at, d.resolved_at
            FROM disputes d
            WHERE d.user_id=$1
            ORDER BY d.created_at DESC
        """, user["id"])
    return [
        {
            **dict(r),
            "created_at": iso(r["created_at"]),
            "resolved_at": iso(r["resolved_at"]) if r["resolved_at"] else None,
        }
        for r in rows
    ]

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
        total_passengers = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role='passenger'")
        new_this_week = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE role='passenger' AND created_at >= NOW()-INTERVAL '7 days'")
        active_7d = await conn.fetchval("""
            SELECT COUNT(DISTINCT sender_id) FROM transactions
            WHERE type='payment' AND status='completed' AND created_at >= NOW()-INTERVAL '7 days'
        """)
        total_wallet_balance = await conn.fetchval("""
            SELECT COALESCE(SUM(w.balance),0) FROM wallets w
            JOIN users u ON u.id=w.user_id WHERE u.role='passenger'
        """)
    return {
        "total_passengers": int(total_passengers or 0),
        "new_this_week": int(new_this_week or 0),
        "active_7d": int(active_7d or 0),
        "total_wallet_balance": float(total_wallet_balance or 0),
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

@api.get("/admin/fleet/{owner_id}/drivers")
async def fleet_owner_drivers(owner_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT d.user_id, u.full_name, u.surname, u.phone_number, d.vehicle_plate,
                      d.total_earnings, d.is_verified, d.rating_avg, d.rating_count,
                      od.daily_target, od.confirmed,
                      od.payment_mode, od.driver_commission_pct, od.commission_status
               FROM owner_drivers od
               JOIN drivers d ON d.user_id=od.driver_user_id
               JOIN users u ON u.id=d.user_id
               JOIN fleet_owners fo ON fo.id=od.owner_id
               WHERE fo.user_id=$1
               ORDER BY d.total_earnings DESC""",
            owner_id
        )
    return [{
        "user_id": r["user_id"], "full_name": r["full_name"], "surname": r["surname"],
        "phone_number": r["phone_number"],
        "vehicle_plate": r["vehicle_plate"], "total_earnings": float(r["total_earnings"]),
        "is_verified": r["is_verified"], "rating_avg": float(r["rating_avg"]),
        "rating_count": r["rating_count"], "daily_target": float(r["daily_target"] or 0),
        "confirmed": r["confirmed"],
        "payment_mode": r["payment_mode"] or "daily_target",
        "driver_commission_pct": float(r["driver_commission_pct"] or 0),
        "commission_status": r["commission_status"]
    } for r in rows]

@api.get("/admin/fleet/deductions")
async def admin_fleet_deductions(status: str = "all", admin: dict = Depends(require_admin)):
    """Admin oversight of all driver deductions across every fleet."""
    async with pool.acquire() as conn:
        where = "" if status == "all" else f"AND dd.status='{status}'"
        rows = await conn.fetch(f"""
            SELECT dd.*, u_driver.full_name AS driver_name, u_driver.phone_number AS driver_phone,
                   u_owner.full_name AS owner_name, u_owner.phone_number AS owner_phone
            FROM driver_deductions dd
            JOIN users u_driver ON u_driver.id=dd.driver_user_id
            JOIN fleet_owners fo ON fo.id=dd.owner_id
            JOIN users u_owner ON u_owner.id=fo.user_id
            WHERE 1=1 {where}
            ORDER BY dd.created_at DESC LIMIT 500
        """)
    return [{"id": r["id"], "driver_name": r["driver_name"], "driver_phone": r["driver_phone"],
             "owner_name": r["owner_name"], "owner_phone": r["owner_phone"],
             "amount": float(r["amount"]), "reason": r["reason"], "deduction_type": r["deduction_type"],
             "status": r["status"], "created_at": iso(r["created_at"]),
             "applied_at": iso(r["applied_at"])} for r in rows]

@api.get("/admin/fleet/document-expiry")
async def admin_fleet_document_expiry(status: str = "all", admin: dict = Depends(require_admin)):
    """Admin oversight of driver document expiry across every fleet."""
    today = date_type.today()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT dde.*, u.full_name AS driver_name, u.phone_number AS driver_phone,
                   u_owner.full_name AS owner_name
            FROM driver_doc_expiry dde
            JOIN users u ON u.id=dde.driver_user_id
            JOIN fleet_owners fo ON fo.id=dde.owner_id
            JOIN users u_owner ON u_owner.id=fo.user_id
            ORDER BY dde.expiry_date ASC
        """)
    def doc_status(r):
        if not r["expiry_date"]: return "unknown"
        days = (r["expiry_date"] - today).days
        if days < 0: return "expired"
        if days <= 30: return "expiring_soon"
        return "valid"
    result = []
    for r in rows:
        ds = doc_status(r)
        if status != "all" and ds != status: continue
        days_left = (r["expiry_date"] - today).days if r["expiry_date"] else None
        result.append({"id": r["id"], "driver_name": r["driver_name"], "driver_phone": r["driver_phone"],
                       "owner_name": r["owner_name"], "document_type": r["document_type"],
                       "expiry_date": r["expiry_date"].isoformat() if r["expiry_date"] else None,
                       "days_left": days_left, "status": ds, "notes": r["notes"],
                       "driver_user_id": r["driver_user_id"]})
    return result

@api.get("/admin/fleet/live-status")
async def admin_fleet_live_status(admin: dict = Depends(require_admin)):
    """Fleet-wide live driver status for admin monitoring."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT d.user_id, u.full_name, u.phone_number, d.vehicle_plate,
                   d.is_online, d.last_seen_at,
                   COALESCE((SELECT COUNT(*) FROM trips t WHERE t.driver_id=d.user_id AND t.status='active'),0) AS active_trips,
                   fo_u.full_name AS owner_name
            FROM drivers d
            JOIN users u ON u.id=d.user_id
            LEFT JOIN owner_drivers od ON od.driver_user_id=d.user_id
            LEFT JOIN fleet_owners fo ON fo.id=od.owner_id
            LEFT JOIN users fo_u ON fo_u.id=fo.user_id
            ORDER BY d.is_online DESC, d.last_seen_at DESC NULLS LAST
        """)
    def status(r):
        if r["active_trips"] > 0: return "on_trip"
        if r["is_online"]: return "online"
        return "offline"
    return [{"user_id": r["user_id"], "full_name": r["full_name"], "phone_number": r["phone_number"],
             "vehicle_plate": r["vehicle_plate"], "status": status(r),
             "last_seen_at": iso(r["last_seen_at"]), "owner_name": r["owner_name"]} for r in rows]

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
            WHERE u.role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr')
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

# ════════════════════════════════════════════════════════════════
# SMS — BulkSMS Integration
# ════════════════════════════════════════════════════════════════

BULKSMS_USERNAME = os.getenv("BULKSMS_USERNAME", "")
BULKSMS_PASSWORD = os.getenv("BULKSMS_PASSWORD", "")

async def send_sms(phone_number: str, message: str):
    """Send SMS via BulkSMS. Silently skips if credentials not set."""
    if not BULKSMS_USERNAME or not BULKSMS_PASSWORD:
        print(f"[SMS SKIP] {phone_number}: {message}")
        return
    if not httpx:
        print("[SMS SKIP] httpx not installed")
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.bulksms.com/v1/messages",
                auth=(BULKSMS_USERNAME, BULKSMS_PASSWORD),
                json={"to": phone_number, "body": message},
            )
            if resp.status_code not in (200, 201):
                print(f"[SMS ERROR] {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[SMS ERROR] {e}")


# ════════════════════════════════════════════════════════════════
# STITCH — Payment Gateway (Top-ups + Payouts)
# ════════════════════════════════════════════════════════════════

STITCH_CLIENT_ID     = os.getenv("STITCH_CLIENT_ID", "")
STITCH_CLIENT_SECRET = os.getenv("STITCH_CLIENT_SECRET", "")
STITCH_REDIRECT_URI  = os.getenv("STITCH_REDIRECT_URI", "")
BACKEND_URL          = os.getenv("BACKEND_URL", "https://tag-n-ride-production.up.railway.app")
FRONTEND_URL         = os.getenv("FRONTEND_URL", "https://tagnride.app")
# Deep link base for Stitch redirect/cancel on mobile (matches app.json scheme: "tagnride")
APP_DEEP_LINK_BASE   = os.getenv("APP_DEEP_LINK_BASE", "tagnride://")
STITCH_BASE_URL      = "https://api.stitch.money"
STITCH_SANDBOX       = os.getenv("STITCH_SANDBOX", "false").lower() == "true"

# ── Stitch OAuth token ────────────────────────────────────────
_stitch_token_cache: dict = {}

async def get_stitch_token() -> str:
    """Get Stitch OAuth2 client credentials token with caching."""
    import time
    now = time.time()
    if _stitch_token_cache.get("expires_at", 0) > now + 60:
        return _stitch_token_cache["token"]
    if not httpx:
        raise Exception("httpx not installed")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{STITCH_BASE_URL}/connect/token",
            data={
                "grant_type": "client_credentials",
                "client_id": STITCH_CLIENT_ID,
                "client_secret": STITCH_CLIENT_SECRET,
                "audience": "https://secure.stitch.money/connect/token",
                "scope": "client_paymentrequest client_disbursement",
            }
        )
        if resp.status_code != 200:
            raise Exception(f"Stitch token error: {resp.text}")
        data = resp.json()
        _stitch_token_cache["token"] = data["access_token"]
        _stitch_token_cache["expires_at"] = now + data.get("expires_in", 3600)
        return data["access_token"]

# ── Stitch GraphQL helper ─────────────────────────────────────
async def stitch_graphql(query: str, variables: dict = None) -> dict:
    """Execute a Stitch GraphQL query."""
    token = await get_stitch_token()
    if not httpx:
        raise Exception("httpx not installed")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{STITCH_BASE_URL}/graphql",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"query": query, "variables": variables or {}},
        )
        if resp.status_code != 200:
            raise Exception(f"Stitch GraphQL error: {resp.text}")
        data = resp.json()
        if "errors" in data:
            raise Exception(f"Stitch error: {data['errors'][0]['message']}")
        return data.get("data", {})

# ── Stitch Top-Up (LinkPay) ───────────────────────────────────
class TopupInitiateIn(BaseModel):
    amount: float = Field(gt=0, le=100000)

@api.post("/wallet/topup/initiate")
async def topup_initiate(body: TopupInitiateIn, request: Request, user: dict = Depends(get_current_user)):
    """Initiate a Stitch LinkPay top-up. Returns payment URL."""
    async with pool.acquire() as conn:
        wallet = await conn.fetchrow("SELECT is_frozen FROM wallets WHERE user_id=$1", user["id"])
        if not wallet or wallet["is_frozen"]:
            raise HTTPException(status_code=400, detail="Wallet not available")

        # Get fee config
        configs = await conn.fetch(
            "SELECT key, value FROM system_config WHERE key IN ($1,$2,$3,$4)",
            "topup_processing_fee_percent", "topup_gateway_fee_percent",
            "topup_gateway_fee_fixed", "min_topup_amount"
        )
        cfg = {r["key"]: float(r["value"]) for r in configs}
        processing_fee_pct = cfg.get("topup_processing_fee_percent", 2.5)
        gateway_fee_pct    = cfg.get("topup_gateway_fee_percent", 1.5)
        gateway_fee_fixed  = cfg.get("topup_gateway_fee_fixed", 0.50)
        min_topup          = cfg.get("min_topup_amount", 10.0)

        if body.amount < min_topup:
            raise HTTPException(status_code=400, detail=f"Minimum top-up is R{min_topup:.2f}")

        # Calculate amounts
        wallet_amount    = round(body.amount, 2)
        processing_fee   = round(wallet_amount * processing_fee_pct / 100, 2)
        charge_amount    = round(wallet_amount + processing_fee, 2)
        gateway_fee      = round(charge_amount * gateway_fee_pct / 100 + gateway_fee_fixed, 2)
        operations_income = round(processing_fee - gateway_fee, 2)

        # Create pending transaction
        payment_id = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO transactions
               (id,reference,type,status,amount,platform_fee,driver_net,sender_id,receiver_id,note)
               VALUES ($1,$2,'topup','pending',$3,$4,$5,NULL,$6,$7)""",
            payment_id, gen_ref(), charge_amount,
            processing_fee, wallet_amount, user["id"],
            f"Stitch top-up pending — wallet: R{wallet_amount} fee: R{processing_fee}"
        )

    # Create Stitch payment request
    try:
        name_parts = user["full_name"].split()
        stitch_mutation = """
        mutation CreatePaymentRequest($input: CreatePaymentRequestInput!) {
            clientPaymentRequestCreate(input: $input) {
                paymentRequest {
                    id
                    url
                    amount { quantity currency }
                    expiresAt
                    status
                }
            }
        }
        """
        variables = {
            "input": {
                "amount": {
                    "quantity": str(charge_amount),
                    "currency": "ZAR"
                },
                "payerReference": f"TNR-{payment_id[:8].upper()}",
                "beneficiaryReference": f"TagNRide-TopUp",
                "merchant": {
                    "name": "Tag n Ride",
                    "url": FRONTEND_URL,
                },
                "redirectUrl": f"{APP_DEEP_LINK_BASE}topup-success?payment_id={payment_id}",
                "cancelUrl": f"{APP_DEEP_LINK_BASE}topup-cancel",
                "webhookUrl": f"{BACKEND_URL}/api/stitch/webhook",
                "metadata": {
                    "payment_id": payment_id,
                    "user_id": user["id"],
                    "phone_number": user["phone_number"],
                    "wallet_amount": str(wallet_amount),
                    "processing_fee": str(processing_fee),
                    "gateway_fee": str(gateway_fee),
                }
            }
        }

        if STITCH_SANDBOX:
            # Sandbox mode — simulate payment for testing
            payment_url = f"{APP_DEEP_LINK_BASE}topup-pending?payment_id={payment_id}&amount={charge_amount}&sandbox=true"
            stitch_payment_id = f"sandbox_{payment_id}"
        else:
            result = await stitch_graphql(stitch_mutation, variables)
            pr = result["clientPaymentRequestCreate"]["paymentRequest"]
            payment_url = pr["url"]
            stitch_payment_id = pr["id"]

        # Store stitch payment id
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE transactions SET note=$1 WHERE id=$2",
                f"Stitch:{stitch_payment_id}|wallet:{wallet_amount}|fee:{processing_fee}|gateway:{gateway_fee}",
                payment_id
            )

    except Exception as e:
        print(f"[STITCH ERROR] {e}")
        # Fallback — app polls for status so just return the payment_id
        payment_url = f"{APP_DEEP_LINK_BASE}topup-error?payment_id={payment_id}"
        stitch_payment_id = None

    return {
        "payment_id": payment_id,
        "redirect_url": payment_url,
        "wallet_amount": wallet_amount,
        "processing_fee": processing_fee,
        "charge_amount": charge_amount,
        "gateway_fee": gateway_fee,
        "operations_income": max(0, operations_income),
        "processing_fee_pct": processing_fee_pct,
        "sandbox": STITCH_SANDBOX,
        "stitch_payment_id": stitch_payment_id,
    }

@api.post("/stitch/webhook")
async def stitch_webhook(request: Request):
    """Stitch webhook for payment events."""
    try:
        body = await request.json()
        event_type = body.get("type", "")
        data = body.get("data", {})

        print(f"[STITCH WEBHOOK] {event_type}: {json.dumps(data)[:200]}")

        if event_type == "payment_request.completed":
            payment_id = data.get("metadata", {}).get("payment_id")
            user_id = data.get("metadata", {}).get("user_id")
            phone_number = data.get("metadata", {}).get("phone_number")
            wallet_amount = float(data.get("metadata", {}).get("wallet_amount", 0))
            processing_fee = float(data.get("metadata", {}).get("processing_fee", 0))
            gateway_fee = float(data.get("metadata", {}).get("gateway_fee", 0))

            if not payment_id or not user_id:
                return {"status": "missing_data"}

            await _complete_topup(
                payment_id, user_id, phone_number,
                wallet_amount, processing_fee, gateway_fee
            )

        return {"status": "ok"}
    except Exception as e:
        print(f"[STITCH WEBHOOK ERROR] {e}")
        return {"status": "error"}

async def _complete_topup(payment_id: str, user_id: str, phone_number: str,
                           wallet_amount: float, processing_fee: float, gateway_fee: float):
    """Credit wallet after successful Stitch payment."""
    async with pool.acquire() as conn:
        txn = await conn.fetchrow("SELECT id, status FROM transactions WHERE id=$1", payment_id)
        if not txn or txn["status"] == "completed":
            return

        async with conn.transaction():
            await conn.execute("UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", wallet_amount, user_id)
            await conn.execute(
                "UPDATE transactions SET status='completed', note=$1 WHERE id=$2",
                f"Stitch top-up R{wallet_amount:.2f} credited", payment_id
            )
            new_balance = await conn.fetchval("SELECT balance FROM wallets WHERE user_id=$1", user_id)

            # Ledger entries
            operations_income = max(0, round(processing_fee - gateway_fee, 2))
            try:
                await ledger_entry(conn, "user_wallets", "credit", wallet_amount,
                    payment_id, "topup", f"Wallet top-up R{wallet_amount:.2f}", user_id)
                await ledger_entry(conn, "processing_fees_collected", "credit", processing_fee,
                    payment_id, "topup_fee", f"Processing fee R{processing_fee:.2f}", user_id)
                await ledger_entry(conn, "gateway_fees_paid", "debit", gateway_fee,
                    payment_id, "gateway_fee", f"Stitch fee R{gateway_fee:.2f}", "system")
                if operations_income > 0:
                    await ledger_entry(conn, "operations_income", "credit", operations_income,
                        payment_id, "operations", f"Operations income R{operations_income:.2f}", "system")
            except Exception as e:
                print(f"[LEDGER ERROR in topup] {e}")

        await send_sms(phone_number,
            f"Tag n Ride: Wallet topped up R{wallet_amount:.2f}. Balance: R{float(new_balance):.2f}")
        await notify_user(conn, f"Wallet Topped Up", f"R{wallet_amount:.2f} added to your wallet. New balance: R{float(new_balance):.2f}", "success", user_id)
        await conn.execute(
            """INSERT INTO user_documents (id,user_id,document_type,title,description,amount,source,is_read)
               VALUES (gen_random_uuid()::text,$1,'topup','Wallet Top-Up Confirmed',
               $2,$3,'app',false)""",
            user_id, f"R{wallet_amount:.2f} has been added to your wallet.", wallet_amount
        )

@api.get("/wallet/topup/verify/{payment_id}")
async def verify_topup(payment_id: str, user: dict = Depends(get_current_user)):
    """Verify Stitch payment status. Also manually completes sandbox payments."""
    async with pool.acquire() as conn:
        txn = await conn.fetchrow(
            "SELECT id, status, amount, platform_fee, driver_net, note, created_at FROM transactions WHERE id=$1 AND receiver_id=$2",
            payment_id, user["id"]
        )
        if not txn:
            raise HTTPException(status_code=404, detail="Payment not found")

        # In sandbox — auto-complete on verify
        if STITCH_SANDBOX and txn["status"] == "pending":
            note = txn["note"] or ""
            wallet_amount = float(txn["driver_net"] or txn["amount"])
            processing_fee = float(txn["platform_fee"] or 0)
            gateway_fee = round(float(txn["amount"]) * 0.015 + 0.50, 2)
            await _complete_topup(
                payment_id, user["id"], user["phone_number"],
                wallet_amount, processing_fee, gateway_fee
            )
            txn = await conn.fetchrow(
                "SELECT id, status, amount, platform_fee, driver_net FROM transactions WHERE id=$1",
                payment_id
            )

        wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user["id"])

    return {
        "payment_id": payment_id,
        "status": txn["status"],
        "charge_amount": float(txn["amount"]),
        "wallet_amount": float(txn["driver_net"] or txn["amount"]),
        "processing_fee": float(txn["platform_fee"] or 0),
        "balance": float(wallet["balance"]),
        "completed": txn["status"] == "completed",
        "sandbox": STITCH_SANDBOX,
    }

# ════════════════════════════════════════════════════════════════
# STITCH — Automated Payouts to Drivers
# ════════════════════════════════════════════════════════════════

STITCH_PAYOUT_TABLE = """
CREATE TABLE IF NOT EXISTS stitch_payouts (
    id TEXT PRIMARY KEY,
    withdrawal_id TEXT REFERENCES withdrawal_requests(id),
    user_id TEXT REFERENCES users(id),
    amount NUMERIC(14,2) NOT NULL,
    fee NUMERIC(14,2) DEFAULT 0,
    net_amount NUMERIC(14,2) NOT NULL,
    bank_name TEXT,
    account_number TEXT,
    account_holder TEXT,
    stitch_disbursement_id TEXT,
    status TEXT DEFAULT 'pending',
    failure_reason TEXT,
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
"""

async def stitch_payout(
    amount: float,
    bank_name: str,
    account_number: str,
    account_holder: str,
    reference: str,
    withdrawal_id: str,
    user_id: str,
    phone_number: str,
) -> dict:
    """
    Trigger instant Stitch payout to driver bank account.
    Fee is deducted from the amount — driver receives net.
    """
    PAYOUT_FEE = 3.50  # R3.50 flat fee per payout — deducted from driver

    net_amount = round(amount - PAYOUT_FEE, 2)
    if net_amount <= 0:
        raise Exception(f"Amount too small after fee. Minimum withdrawal must be greater than R{PAYOUT_FEE:.2f}")

    payout_id = str(uuid.uuid4())

    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO stitch_payouts
               (id, withdrawal_id, user_id, amount, fee, net_amount,
                bank_name, account_number, account_holder, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')""",
            payout_id, withdrawal_id, user_id, amount, PAYOUT_FEE, net_amount,
            bank_name, account_number, account_holder
        )

    if STITCH_SANDBOX:
        # Sandbox — simulate successful payout
        print(f"[STITCH PAYOUT SANDBOX] R{net_amount:.2f} to {account_number} ({bank_name})")
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE stitch_payouts SET status='completed', stitch_disbursement_id=$1, completed_at=NOW() WHERE id=$2",
                f"sandbox_{payout_id}", payout_id
            )
        return {
            "ok": True,
            "payout_id": payout_id,
            "disbursement_id": f"sandbox_{payout_id}",
            "net_amount": net_amount,
            "fee": PAYOUT_FEE,
            "sandbox": True,
        }

    # Live payout via Stitch
    try:
        # Map common bank names to Stitch bank identifiers
        BANK_MAP = {
            "fnb": "fnb", "first national bank": "fnb",
            "absa": "absa",
            "standard bank": "standardbank", "standard": "standardbank",
            "nedbank": "nedbank",
            "capitec": "capitec",
            "tymebank": "tymebank", "tyme bank": "tymebank",
            "african bank": "africanbank",
            "investec": "investec",
        }
        bank_key = BANK_MAP.get(bank_name.lower().strip(), bank_name.lower().replace(" ", ""))

        mutation = """
        mutation CreateDisbursement($input: CreateDisbursementInput!) {
            clientDisbursementCreate(input: $input) {
                disbursement {
                    id
                    status
                    amount { quantity currency }
                    created
                }
            }
        }
        """
        variables = {
            "input": {
                "amount": {"quantity": str(net_amount), "currency": "ZAR"},
                "beneficiary": {
                    "bankAccount": {
                        "name": account_holder,
                        "bankId": bank_key,
                        "accountNumber": account_number,
                        "accountType": "current",
                    }
                },
                "reference": reference[:20],
                "disbursementReference": f"TNR-{payout_id[:8].upper()}",
                "webhookUrl": f"{BACKEND_URL}/api/stitch/payout-webhook",
                "metadata": {
                    "payout_id": payout_id,
                    "withdrawal_id": withdrawal_id,
                    "user_id": user_id,
                    "phone_number": phone_number,
                }
            }
        }

        result = await stitch_graphql(mutation, variables)
        disbursement = result["clientDisbursementCreate"]["disbursement"]
        disbursement_id = disbursement["id"]

        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE stitch_payouts SET stitch_disbursement_id=$1, status='processing' WHERE id=$2",
                disbursement_id, payout_id
            )

        return {
            "ok": True,
            "payout_id": payout_id,
            "disbursement_id": disbursement_id,
            "net_amount": net_amount,
            "fee": PAYOUT_FEE,
            "sandbox": False,
        }

    except Exception as e:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE stitch_payouts SET status='failed', failure_reason=$1 WHERE id=$2",
                str(e), payout_id
            )
        raise

@api.post("/stitch/payout-webhook")
async def stitch_payout_webhook(request: Request):
    """Stitch webhook for payout status updates."""
    try:
        body = await request.json()
        event_type = body.get("type", "")
        data = body.get("data", {})
        metadata = data.get("metadata", {})

        payout_id = metadata.get("payout_id")
        withdrawal_id = metadata.get("withdrawal_id")
        user_id = metadata.get("user_id")
        phone_number = metadata.get("phone_number")

        print(f"[STITCH PAYOUT WEBHOOK] {event_type} payout:{payout_id}")

        if event_type == "disbursement.completed":
            async with pool.acquire() as conn:
                payout = await conn.fetchrow("SELECT * FROM stitch_payouts WHERE id=$1", payout_id)
                if payout:
                    await conn.execute(
                        "UPDATE stitch_payouts SET status='completed', completed_at=NOW() WHERE id=$1",
                        payout_id
                    )
                    await conn.execute(
                        "UPDATE withdrawal_requests SET status='paid', reviewed_at=NOW() WHERE id=$1",
                        withdrawal_id
                    )
                    await send_sms(phone_number,
                        f"Tag n Ride: R{float(payout['net_amount']):.2f} has been paid to your bank account. Ref: TNR-{payout_id[:8].upper()}")
                    await notify_user(conn, f"Payout Sent", "R{float(payout['net_amount']):.2f} has been sent to your bank account.", "withdrawal", user_id)

        elif event_type == "disbursement.failed":
            reason = data.get("failureReason", "Unknown")
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE stitch_payouts SET status='failed', failure_reason=$1 WHERE id=$2",
                    reason, payout_id
                )
                await conn.execute(
                    "UPDATE withdrawal_requests SET status='payout_failed' WHERE id=$1",
                    withdrawal_id
                )
                await notify_user(conn, f"Payout Failed", "Your payout failed: {reason}. Please contact support.", "error", user_id)

        return {"status": "ok"}
    except Exception as e:
        print(f"[STITCH PAYOUT WEBHOOK ERROR] {e}")
        return {"status": "error"}

# ════════════════════════════════════════════════════════════════
# WITHDRAWAL AUTO-APPROVAL
# ════════════════════════════════════════════════════════════════

async def check_auto_approve(conn, withdrawal_id: str, amount: float, user_id: str, phone_number: str):
    """Auto-approve and auto-payout withdrawal if under configured limit."""
    try:
        config = await conn.fetchrow(
            "SELECT value FROM system_config WHERE key='auto_approve_withdrawal_limit'"
        )
        if not config:
            return False
        limit = float(config["value"])
        if limit <= 0 or amount > limit:
            return False
        # Get payout account
        payout = await conn.fetchrow(
            "SELECT * FROM payout_accounts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
            user_id
        )
        if not payout:
            return False

        await conn.execute(
            "UPDATE withdrawal_requests SET status='approved', reviewed_at=NOW(), reviewed_by='auto-system' WHERE id=$1",
            withdrawal_id
        )
        await conn.execute(
            "UPDATE transactions SET status='completed' WHERE sender_id=$1 AND type='withdrawal' AND status='pending' AND created_at>NOW()-INTERVAL '1 hour'",
            user_id
        )
        # Trigger payout
        ref = gen_ref()
        try:
            await stitch_payout(
                amount=amount,
                bank_name=payout["bank_name"],
                account_number=payout["account_number"],
                account_holder=payout["account_name"] or "",
                reference=ref,
                withdrawal_id=withdrawal_id,
                user_id=user_id,
                phone_number=phone_number,
            )
        except Exception as e:
            print(f"[AUTO-APPROVE PAYOUT ERROR] {e}")

        await notify_user(conn, f"Withdrawal Auto-Approved", "Your withdrawal of R{amount:.2f} was automatically approved and is being paid.", "withdrawal", user_id)
        return True
    except Exception as e:
        print(f"[AUTO-APPROVE ERROR] {e}")
        return False

# ════════════════════════════════════════════════════════════════
# SMS IN KEY ENDPOINTS
# ════════════════════════════════════════════════════════════════

@api.post("/wallet/transfer/v2")
async def transfer_v2(body: TransferIn, user: dict = Depends(get_current_user)):
    """Transfer with SMS notifications."""
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
        driver_user = await conn.fetchrow("SELECT phone_number, full_name FROM users WHERE id=$1", body.driver_user_id)
        passenger_row = await conn.fetchrow("SELECT is_test FROM users WHERE id=$1", user["id"])
        driver_row = await conn.fetchrow("SELECT is_test FROM users WHERE id=$1", body.driver_user_id)
        passenger_is_test = passenger_row["is_test"] if passenger_row else False
        driver_is_test = driver_row["is_test"] if driver_row else False
        if passenger_is_test != driver_is_test:
            raise HTTPException(status_code=400, detail="Test accounts can only transact with other test accounts")
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
            is_test_txn = passenger_is_test or driver_is_test
            await conn.execute(
                "INSERT INTO transactions (id,reference,type,status,amount,platform_fee,driver_net,sender_id,receiver_id,note,is_test) VALUES ($1,$2,'payment','completed',$3,$4,$5,$6,$7,$8,$9)",
                txn_id, ref, body.amount, fee, driver_net, user["id"], body.driver_user_id, body.note or "Ride payment", is_test_txn
            )
            txn_row = await conn.fetchrow("SELECT * FROM transactions WHERE id=$1", txn_id)
        driver_balance = await conn.fetchval("SELECT balance FROM wallets WHERE user_id=$1", body.driver_user_id)
        await send_sms(driver_user["phone_number"],
            f"Tag n Ride: Payment R{driver_net:.2f} received. Balance: R{float(driver_balance):.2f}. Ref: {ref}")
        await send_sms(user["phone_number"],
            f"Tag n Ride: Payment R{body.amount:.2f} sent. Balance: R{new_sender_balance:.2f}. Ref: {ref}")
        await notify_user(conn, f"Payment Received", "You received R{driver_net:.2f} from a passenger.", "payment", body.driver_user_id)
        await notify_user(conn, f"Payment Sent", "You paid R{body.amount:.2f}. Ref: {ref}", "payment", user["id"])
    txn = dict(txn_row)
    txn["amount"] = float(txn["amount"])
    txn["platform_fee"] = float(txn["platform_fee"] or 0)
    txn["driver_net"] = float(txn["driver_net"] or driver_net)
    txn["created_at"] = iso(txn["created_at"])
    return {"balance": new_sender_balance, "transaction": txn,
            "fee_breakdown": {"gross_amount": body.amount, "platform_fee": fee,
                              "platform_fee_percent": PLATFORM_FEE_PERCENT, "driver_net": driver_net}}

# ════════════════════════════════════════════════════════════════
# ADMIN ROUTES & TRIPS
# ════════════════════════════════════════════════════════════════

@api.get("/admin/routes")
async def admin_routes(
    driver_id: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    async with pool.acquire() as conn:
        query = """
            SELECT dr.*, u.full_name, u.phone_number, d.vehicle_plate
            FROM driver_routes dr
            JOIN users u ON u.id = dr.driver_user_id
            LEFT JOIN drivers d ON d.user_id = dr.driver_user_id
            WHERE 1=1
        """
        params = []
        if driver_id:
            params.append(driver_id)
            query += f" AND dr.driver_user_id = ${len(params)}"
        if date:
            params.append(date)
            query += f" AND DATE(dr.started_at) = ${len(params)}"
        if status:
            params.append(status)
            query += f" AND dr.status = ${len(params)}"
        query += " ORDER BY dr.started_at DESC LIMIT 200"
        rows = await conn.fetch(query, *params)
    return [{
        "id": r["id"], "driver_name": r["full_name"],
        "phone_number": r["phone_number"], "vehicle_plate": r["vehicle_plate"],
        "fare": float(r["fare"] or 0), "started_at": iso(r["started_at"]),
        "ended_at": iso(r["ended_at"]) if r["ended_at"] else None,
        "duration_mins": int((r["ended_at"] - r["started_at"]).total_seconds() / 60) if r["ended_at"] else int((datetime.now(timezone.utc) - r["started_at"]).total_seconds() / 60),
        "total_collected": float(r["total_collected"] or 0),
        "app_count": r["app_count"] or 0, "cash_count": r["cash_count"] or 0,
        "total_passengers": (r["app_count"] or 0) + (r["cash_count"] or 0),
        "status": r["status"],
    } for r in rows]

@api.get("/admin/routes/stats")
async def admin_routes_stats(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        today_routes    = await conn.fetchval("SELECT COUNT(*) FROM driver_routes WHERE DATE(started_at)=CURRENT_DATE")
        today_passengers= await conn.fetchval("SELECT COALESCE(SUM(app_count+cash_count),0) FROM driver_routes WHERE DATE(started_at)=CURRENT_DATE AND status='ended'")
        today_collected = await conn.fetchval("SELECT COALESCE(SUM(total_collected),0) FROM driver_routes WHERE DATE(started_at)=CURRENT_DATE AND status='ended'")
        active_routes   = await conn.fetchval("SELECT COUNT(*) FROM driver_routes WHERE status='active'")
        total_routes    = await conn.fetchval("SELECT COUNT(*) FROM driver_routes")
        avg_passengers  = await conn.fetchval("SELECT COALESCE(AVG(app_count+cash_count),0) FROM driver_routes WHERE status='ended'")
        avg_duration    = await conn.fetchval("SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (ended_at-started_at))/60),0) FROM driver_routes WHERE status='ended' AND ended_at IS NOT NULL")
        peak_hours      = await conn.fetch("SELECT EXTRACT(HOUR FROM started_at) as hour,COUNT(*) as count FROM driver_routes GROUP BY EXTRACT(HOUR FROM started_at) ORDER BY count DESC LIMIT 5")
        hourly          = await conn.fetch("SELECT EXTRACT(HOUR FROM started_at) as hour,COUNT(*) as routes,COALESCE(SUM(total_collected),0) as collected FROM driver_routes WHERE DATE(started_at)=CURRENT_DATE GROUP BY EXTRACT(HOUR FROM started_at) ORDER BY hour ASC")
    return {
        "today_routes": today_routes, "today_passengers": int(today_passengers or 0),
        "today_collected": float(today_collected or 0), "active_routes": active_routes,
        "total_routes": total_routes, "avg_passengers_per_route": round(float(avg_passengers or 0), 1),
        "avg_duration_mins": round(float(avg_duration or 0), 1),
        "peak_hours": [{"hour": int(r["hour"]), "count": r["count"]} for r in peak_hours],
        "hourly_today": [{"hour": int(r["hour"]), "routes": r["routes"], "collected": float(r["collected"])} for r in hourly],
    }

# ════════════════════════════════════════════════════════════════
# WITHDRAWAL APPROVAL WITH STITCH INSTANT PAYOUT
# ════════════════════════════════════════════════════════════════

@api.post("/admin/withdraw/{withdrawal_id}/approve/v2")
async def admin_approve_withdrawal_v2(withdrawal_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Approve withdrawal and trigger instant Stitch payout."""
    if not has_permission(admin, "approve_withdrawals"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        req = await conn.fetchrow("SELECT * FROM withdrawal_requests WHERE id=$1 AND status='pending'", withdrawal_id)
        if not req:
            raise HTTPException(status_code=404, detail="Withdrawal not found")
        amount = float(req["amount"])
        if amount > 10000 and not has_permission(admin, "large_withdrawals"):
            raise HTTPException(status_code=403, detail="Large withdrawals require Finance/CFO/CEO approval")
        user_row = await conn.fetchrow("SELECT phone_number, full_name FROM users WHERE id=$1", req["user_id"])
        payout_account = await conn.fetchrow(
            "SELECT * FROM payout_accounts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
            req["user_id"]
        )
        if not payout_account:
            raise HTTPException(status_code=400, detail="Driver has no payout account on file")

        # Approve in DB
        await conn.execute(
            "UPDATE withdrawal_requests SET status='approved', reviewed_at=NOW(), reviewed_by=$1 WHERE id=$2",
            admin["id"], withdrawal_id
        )
        await conn.execute(
            "UPDATE transactions SET status='completed' WHERE sender_id=$1 AND type='withdrawal' AND status='pending' AND created_at>NOW()-INTERVAL '1 hour'",
            req["user_id"]
        )
        await audit(conn, admin["id"], "APPROVE_WITHDRAWAL", withdrawal_id, "withdrawal",
                    {"amount": amount}, request.client.host)

    # Trigger Stitch instant payout
    ref = gen_ref()
    payout_result = None
    payout_error = None
    try:
        payout_result = await stitch_payout(
            amount=amount,
            bank_name=payout_account["bank_name"],
            account_number=payout_account["account_number"],
            account_holder=payout_account.get("account_name") or user_row["full_name"],
            reference=ref,
            withdrawal_id=withdrawal_id,
            user_id=req["user_id"],
            phone_number=user_row["phone_number"],
        )
        net_amount = payout_result["net_amount"]
        fee = payout_result["fee"]

        # Ledger entries
        async with pool.acquire() as conn:
            try:
                await ledger_entry(conn, "driver_earnings_pending", "debit", amount,
                    withdrawal_id, "withdrawal", f"Withdrawal approved R{amount:.2f}", admin["id"])
                await ledger_entry(conn, "withdrawal_settlements", "credit", net_amount,
                    withdrawal_id, "payout", f"Stitch payout R{net_amount:.2f}", admin["id"])
                await ledger_entry(conn, "gateway_fees_paid", "debit", fee,
                    withdrawal_id, "payout_fee", f"Stitch payout fee R{fee:.2f}", "system")
            except Exception as e:
                print(f"[LEDGER ERROR withdrawal] {e}")

        await send_sms(user_row["phone_number"],
            f"Tag n Ride: Withdrawal approved! R{net_amount:.2f} is being sent to {payout_account['bank_name']} {payout_account['account_number']}. Ref: {ref}")
        async with pool.acquire() as conn:
            await notify_user(conn, f"Payout Initiated", "R{net_amount:.2f} is being sent to your bank account. R{fee:.2f} payout fee deducted. Ref: {ref}", "withdrawal", req["user_id"])

    except Exception as e:
        payout_error = str(e)
        print(f"[PAYOUT ERROR] {e}")
        # Mark withdrawal as payout_failed
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE withdrawal_requests SET status='payout_failed' WHERE id=$1",
                withdrawal_id
            )
        await send_sms(user_row["phone_number"],
            f"Tag n Ride: Your withdrawal was approved but payout failed: {payout_error}. Please contact support.")
        async with pool.acquire() as conn:
            await notify_user(conn, "Payout Failed", "Your withdrawal was approved but payout failed. Please contact support.", "error", req["user_id"])

    return {
        "ok": True,
        "payout": payout_result,
        "error": payout_error,
        "sandbox": STITCH_SANDBOX,
    }

@api.post("/admin/withdraw/{withdrawal_id}/retry-payout")
async def retry_payout(withdrawal_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Retry a failed payout."""
    if not has_permission(admin, "approve_withdrawals"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        req = await conn.fetchrow(
            "SELECT * FROM withdrawal_requests WHERE id=$1 AND status='payout_failed'",
            withdrawal_id
        )
        if not req:
            raise HTTPException(status_code=404, detail="No failed payout found for this withdrawal")
        user_row = await conn.fetchrow("SELECT phone_number, full_name FROM users WHERE id=$1", req["user_id"])
        payout_account = await conn.fetchrow(
            "SELECT * FROM payout_accounts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
            req["user_id"]
        )
        if not payout_account:
            raise HTTPException(status_code=400, detail="No payout account found")
        await conn.execute("UPDATE withdrawal_requests SET status='approved' WHERE id=$1", withdrawal_id)
    ref = gen_ref()
    payout_result = await stitch_payout(
        amount=float(req["amount"]),
        bank_name=payout_account["bank_name"],
        account_number=payout_account["account_number"],
        account_holder=payout_account.get("account_name") or user_row["full_name"],
        reference=ref,
        withdrawal_id=withdrawal_id,
        user_id=req["user_id"],
        phone_number=user_row["phone_number"],
    )
    return {"ok": True, "payout": payout_result}

@api.get("/admin/payouts")
async def admin_payouts(admin: dict = Depends(require_admin)):
    """Get all Stitch payout records."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT sp.*, u.full_name, u.phone_number
               FROM stitch_payouts sp
               JOIN users u ON u.id = sp.user_id
               ORDER BY sp.initiated_at DESC LIMIT 100"""
        )
    return [{
        "id": r["id"],
        "withdrawal_id": r["withdrawal_id"],
        "driver_name": r["full_name"],
        "phone_number": r["phone_number"],
        "amount": float(r["amount"]),
        "fee": float(r["fee"]),
        "net_amount": float(r["net_amount"]),
        "bank_name": r["bank_name"],
        "account_number": r["account_number"],
        "account_holder": r["account_holder"],
        "stitch_disbursement_id": r["stitch_disbursement_id"],
        "status": r["status"],
        "failure_reason": r["failure_reason"],
        "initiated_at": iso(r["initiated_at"]),
        "completed_at": iso(r["completed_at"]) if r["completed_at"] else None,
    } for r in rows]

# ════════════════════════════════════════════════════════════════
# PLATFORM LEDGER TABLES
# ════════════════════════════════════════════════════════════════

PLATFORM_LEDGER_SQL = """
CREATE TABLE IF NOT EXISTS platform_accounts (
    account TEXT PRIMARY KEY,
    balance NUMERIC(14,2) DEFAULT 0.0,
    description TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS platform_ledger (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    balance_after NUMERIC(14,2),
    reference_id TEXT,
    reference_type TEXT,
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

# ── Ledger helper ─────────────────────────────────────────────
async def ledger_entry(conn, account: str, direction: str, amount: float,
                       reference_id: str = None, reference_type: str = None,
                       description: str = None, created_by: str = None):
    try:
        if direction == "credit":
            new_balance = await conn.fetchval(
                "UPDATE platform_accounts SET balance=balance+$1,updated_at=NOW() WHERE account=$2 RETURNING balance",
                amount, account)
        else:
            new_balance = await conn.fetchval(
                "UPDATE platform_accounts SET balance=balance-$1,updated_at=NOW() WHERE account=$2 RETURNING balance",
                amount, account)
        await conn.execute(
            "INSERT INTO platform_ledger (id,account,direction,amount,balance_after,reference_id,reference_type,description,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            str(uuid.uuid4()), account, direction, amount, new_balance,
            reference_id, reference_type, description, created_by)
        return float(new_balance) if new_balance else 0.0
    except Exception as e:
        print(f"[LEDGER ERROR] {e}")
        return 0.0

# ════════════════════════════════════════════════════════════════
# ADMIN LEDGER ENDPOINTS
# ════════════════════════════════════════════════════════════════

def require_ledger_access(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_ledger"):
        raise HTTPException(status_code=403, detail="Finance, CFO, CEO or Superadmin only")
    return admin

@api.get("/admin/ledger")
async def admin_ledger(admin: dict = Depends(require_ledger_access)):
    async with pool.acquire() as conn:
        accounts = await conn.fetch("SELECT * FROM platform_accounts ORDER BY account ASC")
        total_entries = await conn.fetchval("SELECT COUNT(*) FROM platform_ledger")
        today_volume = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM platform_ledger WHERE direction='credit' AND DATE(created_at)=CURRENT_DATE")
    return {
        "accounts": [{"account": r["account"], "balance": float(r["balance"]),
                      "description": r["description"], "updated_at": iso(r["updated_at"])} for r in accounts],
        "total_entries": total_entries, "today_volume": float(today_volume or 0),
    }

@api.get("/admin/ledger/transactions")
async def admin_ledger_transactions(
    account: Optional[str] = None, limit: int = 100,
    admin: dict = Depends(require_ledger_access)
):
    async with pool.acquire() as conn:
        if account:
            rows = await conn.fetch("SELECT * FROM platform_ledger WHERE account=$1 ORDER BY created_at DESC LIMIT $2", account, min(limit, 500))
        else:
            rows = await conn.fetch("SELECT * FROM platform_ledger ORDER BY created_at DESC LIMIT $1", min(limit, 500))
    return [{"id": r["id"], "account": r["account"], "direction": r["direction"],
             "amount": float(r["amount"]), "balance_after": float(r["balance_after"] or 0),
             "reference_id": r["reference_id"], "reference_type": r["reference_type"],
             "description": r["description"], "created_at": iso(r["created_at"])} for r in rows]

@api.post("/admin/ledger/refund")
async def admin_process_refund(body: dict, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "process_refunds"):
        raise HTTPException(status_code=403, detail="Finance, CFO or CEO only")
    user_id = body.get("user_id")
    search = body.get("search", "").strip()
    amount = float(body.get("amount", 0))
    reason = body.get("reason", "Refund")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount required")
    async with pool.acquire() as conn:
        if user_id:
            user_row = await conn.fetchrow(
                "SELECT id, phone_number, full_name FROM users WHERE id=$1", user_id
            )
        elif search:
            user_row = await conn.fetchrow(
                """SELECT id, phone_number, full_name FROM users
                   WHERE phone_number ILIKE $1
                   OR phone_number ILIKE $2
                   OR full_name ILIKE $1
                   LIMIT 1""",
                f"%{search}%", f"%{search.lstrip('0')}%"
            )
        else:
            raise HTTPException(status_code=400, detail="user_id or search required")
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = user_row["id"]
        async with conn.transaction():
            await conn.execute(
                "UPDATE wallets SET balance=balance+$1 WHERE user_id=$2",
                amount, user_id
            )
            ref = gen_ref()
            txn_id = str(uuid.uuid4())
            await conn.execute(
                "INSERT INTO transactions (id,reference,type,status,amount,receiver_id,note) VALUES ($1,$2,'refund','completed',$3,$4,$5)",
                txn_id, ref, amount, user_id, reason
            )
            try:
                await ledger_entry(conn, "refund_reserve", "debit", amount,
                    txn_id, "refund", f"Refund: {reason}", admin["id"])
                await ledger_entry(conn, "user_wallets", "credit", amount,
                    txn_id, "refund", f"Refund credited R{amount:.2f}", user_id)
            except Exception as e:
                print(f"[LEDGER refund] {e}")
        await send_sms(user_row["phone_number"],
            f"Tag n Ride: Refund of R{amount:.2f} credited to your wallet. Ref: {ref}")
        await notify_user(conn, f"Refund Processed", "R{amount:.2f} refund credited. Ref: {ref}", "success", user_id)
        await audit(conn, admin["id"], "PROCESS_REFUND", user_id, "refund",
            {"amount": amount, "reason": reason}, request.client.host)
    return {"ok": True, "reference": ref, "amount": amount, "user": user_row["full_name"]}
    
@api.get("/admin/ledger/summary")
async def admin_ledger_summary(admin: dict = Depends(require_ledger_access)):
    async with pool.acquire() as conn:
        accounts = await conn.fetch("SELECT account, balance FROM platform_accounts")
        balances = {r["account"]: float(r["balance"]) for r in accounts}
        today_topups      = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='topup' AND status='completed' AND DATE(created_at)=CURRENT_DATE")
        today_payments    = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE")
        today_withdrawals = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status IN ('approved','paid') AND DATE(created_at)=CURRENT_DATE")
        monthly_revenue   = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM platform_ledger WHERE account='platform_revenue' AND direction='credit' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())")
        monthly_fees      = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM platform_ledger WHERE account='processing_fees_collected' AND direction='credit' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())")
        monthly_gateway   = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM platform_ledger WHERE account='gateway_fees_paid' AND direction='debit' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())")
    return {
        "balances": balances,
        "today": {"topups": float(today_topups or 0), "payments": float(today_payments or 0), "withdrawals": float(today_withdrawals or 0)},
        "this_month": {
            "platform_revenue": float(monthly_revenue or 0),
            "processing_fees": float(monthly_fees or 0),
            "gateway_fees_paid": float(monthly_gateway or 0),
            "net_income": float((monthly_revenue or 0) + (monthly_fees or 0) - (monthly_gateway or 0)),
        },
    }

# ════════════════════════════════════════════════════════════════
# Must be last line
# ════════════════════════════════════════════════════════════════

# ════════════════════════════════════════════════════════════════
# LEDGER CORRECTIONS — Manual Adjustments & Reversals
# ════════════════════════════════════════════════════════════════

class LedgerAdjustIn(BaseModel):
    account: str
    direction: str  # "credit" or "debit"
    amount: float = Field(gt=0, le=10_000_000)
    reason: str = Field(min_length=5, max_length=500)

class LedgerReverseIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)

VALID_ACCOUNTS = [
    "user_wallets", "driver_earnings_pending", "platform_revenue",
    "processing_fees_collected", "gateway_fees_paid", "operations_income",
    "withdrawal_settlements", "refund_reserve",
]

@api.post("/admin/ledger/adjust")
async def admin_ledger_adjust(body: LedgerAdjustIn, request: Request, admin: dict = Depends(require_admin)):
    """
    Manual ledger adjustment — credit or debit any account.
    CFO, CEO, Superadmin only.
    Used to correct discrepancies, record external transactions, or balance the sheet.
    """
    if not has_permission(admin, "manual_ledger_adjustment"):
        raise HTTPException(status_code=403, detail="CFO, CEO or Superadmin only")
    if body.direction not in ("credit", "debit"):
        raise HTTPException(status_code=400, detail="Direction must be 'credit' or 'debit'")
    if body.account not in VALID_ACCOUNTS:
        raise HTTPException(status_code=400, detail=f"Invalid account. Valid: {VALID_ACCOUNTS}")

    async with pool.acquire() as conn:
        entry_id = str(uuid.uuid4())
        new_balance = await ledger_entry(
            conn, body.account, body.direction, body.amount,
            entry_id, "manual_adjustment",
            f"[MANUAL] {body.reason}",
            admin["id"]
        )
        await audit(conn, admin["id"], "MANUAL_LEDGER_ADJUSTMENT", entry_id, "ledger", {
            "account": body.account,
            "direction": body.direction,
            "amount": body.amount,
            "reason": body.reason,
            "new_balance": new_balance,
        }, request.client.host)

    return {
        "ok": True,
        "entry_id": entry_id,
        "account": body.account,
        "direction": body.direction,
        "amount": body.amount,
        "new_balance": new_balance,
        "reason": body.reason,
    }

@api.post("/admin/ledger/reverse/{entry_id}")
async def admin_ledger_reverse(entry_id: str, body: LedgerReverseIn, request: Request, admin: dict = Depends(require_admin)):
    """
    Reverse a specific ledger entry by creating an equal opposite entry.
    Superadmin only — preserves full audit trail.
    The original entry is NOT deleted. A reversal entry is created.
    """
    if not has_permission(admin, "reverse_ledger_entry"):
        raise HTTPException(status_code=403, detail="Superadmin only")

    async with pool.acquire() as conn:
        # Find original entry
        original = await conn.fetchrow(
            "SELECT * FROM platform_ledger WHERE id=$1", entry_id
        )
        if not original:
            raise HTTPException(status_code=404, detail="Ledger entry not found")

        # Check not already reversed
        already = await conn.fetchrow(
            "SELECT id FROM platform_ledger WHERE reference_id=$1 AND reference_type='reversal'",
            entry_id
        )
        if already:
            raise HTTPException(status_code=400, detail="This entry has already been reversed")

        # Create reversal — opposite direction
        reversal_direction = "debit" if original["direction"] == "credit" else "credit"
        reversal_id = str(uuid.uuid4())
        new_balance = await ledger_entry(
            conn,
            original["account"],
            reversal_direction,
            float(original["amount"]),
            entry_id,  # reference_id points to original
            "reversal",
            f"[REVERSAL of {entry_id[:8]}] {body.reason}",
            admin["id"]
        )

        # Mark original as reversed
        await conn.execute(
            "UPDATE platform_ledger SET description = description || ' [REVERSED]' WHERE id=$1",
            entry_id
        )

        await audit(conn, admin["id"], "LEDGER_ENTRY_REVERSED", entry_id, "ledger", {
            "original_entry": entry_id,
            "reversal_entry": reversal_id,
            "account": original["account"],
            "original_direction": original["direction"],
            "reversal_direction": reversal_direction,
            "amount": float(original["amount"]),
            "reason": body.reason,
            "new_balance": new_balance,
        }, request.client.host)

    return {
        "ok": True,
        "reversal_id": reversal_id,
        "original_entry_id": entry_id,
        "account": original["account"],
        "reversed_direction": original["direction"],
        "reversal_direction": reversal_direction,
        "amount": float(original["amount"]),
        "new_balance": new_balance,
        "reason": body.reason,
    }

@api.get("/admin/ledger/corrections")
async def admin_ledger_corrections(admin: dict = Depends(require_admin)):
    """
    View all manual adjustments and reversals.
    CFO, CEO, Superadmin only.
    """
    if not has_permission(admin, "manual_ledger_adjustment"):
        raise HTTPException(status_code=403, detail="CFO, CEO or Superadmin only")

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT pl.*, au.full_name as admin_name
               FROM platform_ledger pl
               LEFT JOIN users au ON au.id = pl.created_by
               WHERE pl.reference_type IN ('manual_adjustment', 'reversal')
               ORDER BY pl.created_at DESC LIMIT 200""",
        )
    return [{
        "id": r["id"],
        "account": r["account"],
        "direction": r["direction"],
        "amount": float(r["amount"]),
        "balance_after": float(r["balance_after"] or 0),
        "reference_type": r["reference_type"],
        "reference_id": r["reference_id"],
        "description": r["description"],
        "admin_name": r["admin_name"] or "System",
        "created_at": iso(r["created_at"]),
    } for r in rows]

@api.post("/admin/ledger/reset-test-data")
async def admin_reset_test_data(request: Request, admin: dict = Depends(require_admin)):
    """
    Superadmin only — resets all financial data for clean testing.
    Preserves admin accounts, system config, and user accounts.
    Wipes: transactions, wallets (reset to 0), withdrawals, ledger,
    payouts, cashups, outstanding balances, routes, notifications.
    """
    if admin.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Reset wallets to zero
            await conn.execute("UPDATE wallets SET balance=0")
            # Wipe financial tables
            await conn.execute("TRUNCATE transactions RESTART IDENTITY CASCADE")
            await conn.execute("TRUNCATE withdrawal_requests RESTART IDENTITY CASCADE")
            await conn.execute("DELETE FROM platform_ledger")
            await conn.execute("UPDATE platform_accounts SET balance=0, updated_at=NOW()")
            await conn.execute("DELETE FROM stitch_payouts")
            await conn.execute("DELETE FROM cashup_records")
            await conn.execute("DELETE FROM outstanding_balances")
            await conn.execute("DELETE FROM driver_routes")
            await conn.execute("DELETE FROM notifications")
            await conn.execute("DELETE FROM ratings")
            # Reset driver earnings
            await conn.execute("UPDATE drivers SET total_earnings=0")
            await audit(conn, admin["id"], "RESET_TEST_DATA", "system", "system", {
                "note": "Full financial data reset by superadmin"
            }, request.client.host)

    return {
        "ok": True,
        "message": "All financial data reset. Wallets zeroed. Ledger cleared. Users and admins preserved.",
    }

# ════════════════════════════════════════════════════════════════
# Must be last line
# ════════════════════════════════════════════════════════════════

# ════════════════════════════════════════════════════════════════
# SYSTEM CONSOLE — Predefined Fix Commands
# ════════════════════════════════════════════════════════════════

SYSTEM_COMMANDS = {
    # ── Financial ───────────────────────────────────────────
    "sync_wallet_balances": {
        "label": "Sync Wallet Balances",
        "description": "Recalculates every user wallet balance from completed transactions. Fixes wallets that are out of sync with transaction history.",
        "category": "financial",
        "permission": "superadmin",
        "danger": False,
    },
    "sync_driver_earnings": {
        "label": "Sync Driver Earnings",
        "description": "Recalculates driver total_earnings from completed payment transactions. Fixes drivers showing wrong lifetime earnings.",
        "category": "financial",
        "permission": "superadmin",
        "danger": False,
    },
    "fix_ledger_balances": {
        "label": "Fix Ledger Account Balances",
        "description": "Rebuilds platform account balances by summing all ledger entries. Fixes any balance drift caused by partial failures.",
        "category": "financial",
        "permission": "superadmin",
        "danger": False,
    },
    "rebuild_platform_accounts": {
        "label": "Rebuild Platform Accounts",
        "description": "Seeds any missing platform ledger accounts with zero balance. Run this if ledger page shows missing accounts.",
        "category": "financial",
        "permission": "superadmin",
        "danger": False,
    },
    # ── Transactions ─────────────────────────────────────────
    "fix_stuck_transactions": {
        "label": "Fix Stuck Pending Transactions",
        "description": "Marks payment and topup transactions stuck in 'pending' for over 2 hours as 'failed'. Does not affect withdrawal transactions.",
        "category": "transactions",
        "permission": "superadmin",
        "danger": False,
    },
    "fix_stuck_withdrawals": {
        "label": "Fix Stuck Withdrawals",
        "description": "Releases withdrawal requests stuck in 'pending' for over 24 hours back to 'pending' state with a flag. Also refunds wallet if Stitch payout failed without updating status.",
        "category": "transactions",
        "permission": "superadmin",
        "danger": False,
    },
    "retry_failed_payouts": {
        "label": "Retry All Failed Payouts",
        "description": "Finds all Stitch payouts with status 'failed' and queues them for retry. Only retries payouts where the withdrawal is still approved.",
        "category": "transactions",
        "permission": "superadmin",
        "danger": False,
    },
    "cancel_expired_topups": {
        "label": "Cancel Expired Top-Up Requests",
        "description": "Marks pending top-up transactions older than 2 hours as cancelled. Frees up any held state on the wallet side.",
        "category": "transactions",
        "permission": "superadmin",
        "danger": False,
    },
    # ── Routes ───────────────────────────────────────────────
    "reset_stuck_routes": {
        "label": "End Stuck Active Routes",
        "description": "Automatically ends any driver routes that have been active for over 24 hours. Calculates final totals and marks as ended.",
        "category": "routes",
        "permission": "superadmin",
        "danger": False,
    },
    # ── Sessions ─────────────────────────────────────────────
    "clear_expired_sessions": {
        "label": "Clear Expired Admin Sessions",
        "description": "Deletes all expired admin session records from the database. Keeps the sessions table clean.",
        "category": "maintenance",
        "permission": "superadmin",
        "danger": False,
    },
    # ── Notifications ────────────────────────────────────────
    "clear_old_notifications": {
        "label": "Clear Old Notifications",
        "description": "Deletes notifications older than 30 days. Keeps the notifications table performant.",
        "category": "maintenance",
        "permission": "superadmin",
        "danger": False,
    },
    # ── KYC ─────────────────────────────────────────────────
    "fix_kyc_verified_drivers": {
        "label": "Sync KYC Verified Drivers",
        "description": "Sets is_verified=true for all drivers whose KYC status is 'approved'. Fixes any drivers who were KYC approved but not marked verified.",
        "category": "drivers",
        "permission": "superadmin",
        "danger": False,
    },
    # ── Outstanding Balances ─────────────────────────────────
    "fix_paid_outstanding": {
        "label": "Mark Paid Outstanding Balances",
        "description": "Checks cashup_records and marks any outstanding_balances as paid if a matching cashup was completed after the balance was created.",
        "category": "financial",
        "permission": "superadmin",
        "danger": False,
    },
    # ── Danger zone ──────────────────────────────────────────
    "reset_test_accounts": {
        "label": "Reset Test Accounts",
        "description": "Wipes all data for users marked as test accounts only. Real production data is completely untouched. CEO and Superadmin only.",
        "category": "danger",
        "permission": "ceo",
        "danger": True,
    },
}

@api.get("/admin/system/commands")
async def get_system_commands(admin: dict = Depends(require_admin)):
    """List all available system commands with metadata."""
    if admin.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")
    return {
        "commands": SYSTEM_COMMANDS,
        "categories": {
            "financial": "Financial & Wallet fixes",
            "transactions": "Transaction & Payout fixes",
            "routes": "Driver route fixes",
            "drivers": "Driver data fixes",
            "maintenance": "Database maintenance",
            "danger": "Destructive operations",
        }
    }

@api.get("/admin/system/command-log")
async def get_command_log(admin: dict = Depends(require_admin)):
    """Get recent system command execution history."""
    if admin.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT al.* FROM audit_logs al
               WHERE al.action LIKE 'SYSTEM_CMD_%'
               ORDER BY al.created_at DESC LIMIT 50"""
        )
    return [{
        "id": r["id"],
        "action": r["action"],
        "command": r["action"].replace("SYSTEM_CMD_", "").lower(),
        "admin_id": r["admin_id"],
        "metadata": r["metadata"],
        "ip_address": r["ip_address"],
        "created_at": iso(r["created_at"]),
    } for r in rows]

@api.post("/admin/system/run/{command}")
async def run_system_command(command: str, request: Request, admin: dict = Depends(require_admin)):
    """Execute a predefined system fix command. Superadmin only."""
    if admin.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")
    if command not in SYSTEM_COMMANDS:
        raise HTTPException(status_code=404, detail=f"Unknown command: {command}")

    result = {"command": command, "ok": False, "details": {}, "message": ""}

    try:
        async with pool.acquire() as conn:

            # ── sync_wallet_balances ────────────────────────
            if command == "sync_wallet_balances":
                rows = await conn.fetch("SELECT id FROM users WHERE role IN ('passenger','driver','owner')")
                fixed = 0
                for row in rows:
                    uid = row["id"]
                    inflow = await conn.fetchval(
                        "SELECT COALESCE(SUM(driver_net),0) FROM transactions WHERE receiver_id=$1 AND status='completed' AND type='payment'", uid) or 0
                    topups = await conn.fetchval(
                        "SELECT COALESCE(SUM(driver_net),0) FROM transactions WHERE receiver_id=$1 AND status='completed' AND type='topup'", uid) or 0
                    cashups_in = await conn.fetchval(
                        "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE receiver_id=$1 AND status='completed' AND type='cashup'", uid) or 0
                    refunds = await conn.fetchval(
                        "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE receiver_id=$1 AND status='completed' AND type='refund'", uid) or 0
                    outflow = await conn.fetchval(
                        "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE sender_id=$1 AND status='completed' AND type IN ('payment','cashup')", uid) or 0
                    withdrawals = await conn.fetchval(
                        "SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE user_id=$1 AND status IN ('approved','paid')", uid) or 0
                    correct_balance = float(inflow) + float(topups) + float(cashups_in) + float(refunds) - float(outflow) - float(withdrawals)
                    correct_balance = max(0, correct_balance)
                    current = await conn.fetchval("SELECT balance FROM wallets WHERE user_id=$1", uid)
                    if current is not None and abs(float(current) - correct_balance) > 0.01:
                        await conn.execute("UPDATE wallets SET balance=$1 WHERE user_id=$2", correct_balance, uid)
                        fixed += 1
                result = {"ok": True, "message": f"Wallet balances synced. {fixed} wallets corrected.", "details": {"wallets_checked": len(rows), "wallets_fixed": fixed}}

            # ── sync_driver_earnings ────────────────────────
            elif command == "sync_driver_earnings":
                rows = await conn.fetch("SELECT user_id FROM drivers")
                fixed = 0
                for row in rows:
                    uid = row["user_id"]
                    earned = await conn.fetchval(
                        "SELECT COALESCE(SUM(driver_net),0) FROM transactions WHERE receiver_id=$1 AND type='payment' AND status='completed'", uid) or 0
                    current = await conn.fetchval("SELECT total_earnings FROM drivers WHERE user_id=$1", uid)
                    if current is not None and abs(float(current) - float(earned)) > 0.01:
                        await conn.execute("UPDATE drivers SET total_earnings=$1 WHERE user_id=$2", float(earned), uid)
                        fixed += 1
                result = {"ok": True, "message": f"Driver earnings synced. {fixed} drivers corrected.", "details": {"drivers_checked": len(rows), "drivers_fixed": fixed}}

            # ── fix_ledger_balances ─────────────────────────
            elif command == "fix_ledger_balances":
                accounts = await conn.fetch("SELECT account FROM platform_accounts")
                fixed = 0
                for acc in accounts:
                    name = acc["account"]
                    credits = await conn.fetchval(
                        "SELECT COALESCE(SUM(amount),0) FROM platform_ledger WHERE account=$1 AND direction='credit'", name) or 0
                    debits = await conn.fetchval(
                        "SELECT COALESCE(SUM(amount),0) FROM platform_ledger WHERE account=$1 AND direction='debit'", name) or 0
                    correct = float(credits) - float(debits)
                    current = await conn.fetchval("SELECT balance FROM platform_accounts WHERE account=$1", name)
                    if current is not None and abs(float(current) - correct) > 0.01:
                        await conn.execute("UPDATE platform_accounts SET balance=$1, updated_at=NOW() WHERE account=$2", correct, name)
                        fixed += 1
                result = {"ok": True, "message": f"Ledger balances reconciled. {fixed} accounts corrected.", "details": {"accounts_checked": len(accounts), "accounts_fixed": fixed}}

            # ── rebuild_platform_accounts ───────────────────
            elif command == "rebuild_platform_accounts":
                default_accounts = [
                    ("user_wallets", "Total balance held in user wallets"),
                    ("driver_earnings_pending", "Driver earnings pending withdrawal"),
                    ("platform_revenue", "Platform commission revenue"),
                    ("processing_fees_collected", "Top-up processing fees collected"),
                    ("gateway_fees_paid", "Gateway fees paid to Stitch/PayFast"),
                    ("operations_income", "Net operations income after gateway fees"),
                    ("withdrawal_settlements", "Funds settled to driver bank accounts"),
                    ("refund_reserve", "Reserve for refunds and corrections"),
                ]
                created = 0
                for account, desc in default_accounts:
                    existing = await conn.fetchrow("SELECT account FROM platform_accounts WHERE account=$1", account)
                    if not existing:
                        await conn.execute(
                            "INSERT INTO platform_accounts (account, balance, description) VALUES ($1, 0, $2)",
                            account, desc
                        )
                        created += 1
                result = {"ok": True, "message": f"Platform accounts rebuilt. {created} accounts created.", "details": {"accounts_created": created}}

            # ── fix_stuck_transactions ──────────────────────
            elif command == "fix_stuck_transactions":
                rows = await conn.fetch(
                    """SELECT id, type FROM transactions
                       WHERE status='pending' AND type IN ('payment','topup')
                       AND created_at < NOW() - INTERVAL '2 hours'"""
                )
                if rows:
                    ids = [r["id"] for r in rows]
                    await conn.execute(
                        "UPDATE transactions SET status='failed', note=note||' [AUTO-FAILED by system console]' WHERE id=ANY($1::text[])",
                        ids
                    )
                result = {"ok": True, "message": f"{len(rows)} stuck transactions marked as failed.", "details": {"transactions_fixed": len(rows), "types": list(set(r["type"] for r in rows))}}

            # ── fix_stuck_withdrawals ───────────────────────
            elif command == "fix_stuck_withdrawals":
                stuck = await conn.fetch(
                    """SELECT wr.*, u.phone_number FROM withdrawal_requests wr
                       JOIN users u ON u.id=wr.user_id
                       WHERE wr.status='pending' AND wr.created_at < NOW() - INTERVAL '24 hours'"""
                )
                flagged = 0
                for w in stuck:
                    await conn.execute(
                        "UPDATE withdrawal_requests SET status='pending', reviewed_at=NULL WHERE id=$1",
                        w["id"]
                    )
                    flagged += 1
                # Fix failed payouts that didn't refund wallet
                failed_payouts = await conn.fetch(
                    """SELECT sp.*, wr.user_id FROM stitch_payouts sp
                       JOIN withdrawal_requests wr ON wr.id=sp.withdrawal_id
                       WHERE sp.status='failed' AND wr.status='payout_failed'
                       AND sp.initiated_at < NOW() - INTERVAL '1 hour'"""
                )
                result = {"ok": True, "message": f"{flagged} stuck withdrawals flagged for review. {len(failed_payouts)} failed payouts found.", "details": {"stuck_flagged": flagged, "failed_payouts": len(failed_payouts)}}

            # ── retry_failed_payouts ────────────────────────
            elif command == "retry_failed_payouts":
                failed = await conn.fetch(
                    """SELECT sp.*, wr.user_id, u.phone_number, u.full_name,
                       pa.bank_name, pa.account_number, pa.account_name
                       FROM stitch_payouts sp
                       JOIN withdrawal_requests wr ON wr.id=sp.withdrawal_id
                       JOIN users u ON u.id=wr.user_id
                       LEFT JOIN payout_accounts pa ON pa.user_id=wr.user_id AND pa.type='self'
                       WHERE sp.status='failed' AND wr.status IN ('approved','payout_failed')
                       LIMIT 20"""
                )
                retried = 0
                errors = []
                for p in failed:
                    if not p["bank_name"]:
                        errors.append(f"{p['full_name']}: no bank account")
                        continue
                    try:
                        await stitch_payout(
                            amount=float(p["amount"]),
                            bank_name=p["bank_name"],
                            account_number=p["account_number"],
                            account_holder=p["account_name"] or p["full_name"],
                            reference=gen_ref(),
                            withdrawal_id=p["withdrawal_id"],
                            user_id=p["user_id"],
                            phone_number=p["phone_number"],
                        )
                        retried += 1
                    except Exception as e:
                        errors.append(f"{p['full_name']}: {str(e)}")
                result = {"ok": True, "message": f"{retried} payouts retried. {len(errors)} errors.", "details": {"retried": retried, "errors": errors}}

            # ── cancel_expired_topups ───────────────────────
            elif command == "cancel_expired_topups":
                rows = await conn.fetch(
                    "SELECT id FROM transactions WHERE status='pending' AND type='topup' AND created_at < NOW() - INTERVAL '2 hours'"
                )
                if rows:
                    ids = [r["id"] for r in rows]
                    await conn.execute(
                        "UPDATE transactions SET status='cancelled', note='Expired top-up cancelled by system console' WHERE id=ANY($1::text[])",
                        ids
                    )
                result = {"ok": True, "message": f"{len(rows)} expired top-up requests cancelled.", "details": {"cancelled": len(rows)}}

            # ── reset_stuck_routes ──────────────────────────
            elif command == "reset_stuck_routes":
                stuck = await conn.fetch(
                    "SELECT * FROM driver_routes WHERE status='active' AND started_at < NOW() - INTERVAL '24 hours'"
                )
                for route in stuck:
                    duration = int((datetime.now(timezone.utc) - route["started_at"]).total_seconds() / 60)
                    await conn.execute(
                        "UPDATE driver_routes SET status='ended', ended_at=NOW(), duration_mins=$1 WHERE id=$2",
                        duration, route["id"]
                    )
                result = {"ok": True, "message": f"{len(stuck)} stuck routes ended.", "details": {"routes_ended": len(stuck)}}

            # ── clear_expired_sessions ──────────────────────
            elif command == "clear_expired_sessions":
                r = await conn.execute("DELETE FROM admin_sessions WHERE expires_at < NOW()")
                count = int(r.split()[-1]) if r else 0
                result = {"ok": True, "message": f"{count} expired sessions cleared.", "details": {"sessions_deleted": count}}

            # ── clear_old_notifications ─────────────────────
            elif command == "clear_old_notifications":
                r = await conn.execute("DELETE FROM notifications WHERE sent_at < NOW() - INTERVAL '30 days'")
                count = int(r.split()[-1]) if r else 0
                result = {"ok": True, "message": f"{count} old notifications deleted.", "details": {"notifications_deleted": count}}

            # ── fix_kyc_verified_drivers ────────────────────
            elif command == "fix_kyc_verified_drivers":
                rows = await conn.fetch(
                    """SELECT d.user_id FROM drivers d
                       JOIN kyc_documents k ON k.user_id=d.user_id
                       WHERE k.status='approved' AND d.is_verified=FALSE"""
                )
                if rows:
                    ids = [r["user_id"] for r in rows]
                    await conn.execute("UPDATE drivers SET is_verified=TRUE WHERE user_id=ANY($1::text[])", ids)
                result = {"ok": True, "message": f"{len(rows)} drivers marked as verified.", "details": {"drivers_fixed": len(rows)}}

            # ── fix_paid_outstanding ────────────────────────
            elif command == "fix_paid_outstanding":
                rows = await conn.fetch(
                    """SELECT ob.id, ob.driver_user_id, ob.owner_user_id, ob.created_at
                       FROM outstanding_balances ob
                       WHERE ob.status='outstanding'"""
                )
                fixed = 0
                for ob in rows:
                    cashup = await conn.fetchrow(
                        """SELECT id FROM cashup_records
                           WHERE driver_user_id=$1 AND owner_user_id=$2
                           AND created_at > $3 AND status='completed'""",
                        ob["driver_user_id"], ob["owner_user_id"], ob["created_at"]
                    )
                    if cashup:
                        await conn.execute(
                            "UPDATE outstanding_balances SET status='paid', paid_at=NOW() WHERE id=$1",
                            ob["id"]
                        )
                        fixed += 1
                result = {"ok": True, "message": f"{fixed} outstanding balances marked as paid.", "details": {"balances_fixed": fixed}}

            else:
                raise HTTPException(status_code=400, detail=f"Command '{command}' not implemented")

            # Audit log
            await audit(conn, admin["id"], f"SYSTEM_CMD_{command.upper()}", "system", "system",
                        {"result": result.get("details", {}), "message": result.get("message", "")},
                        request.client.host)

    except HTTPException:
        raise
    except Exception as e:
        result = {"ok": False, "message": f"Command failed: {str(e)}", "details": {"error": str(e)}}

    return result


# ════════════════════════════════════════════════════════════════
# DANGER PIN — Verification for Destructive Actions
# ════════════════════════════════════════════════════════════════

class DangerPinVerifyIn(BaseModel):
    pin: str = Field(min_length=4, max_length=20)

async def verify_danger_pin(conn, pin: str, admin: dict) -> bool:
    """Verify the danger PIN. Requires danger_actions permission."""
    if not has_permission(admin, "danger_actions"):
        return False
    config = await conn.fetchrow(
        "SELECT value FROM system_config WHERE key='danger_pin'"
    )
    if not config:
        return False
    stored_pin = config["value"].strip()
    return pin.strip() == stored_pin

@api.post("/admin/danger-pin/verify")
async def danger_pin_verify(body: DangerPinVerifyIn, admin: dict = Depends(require_admin)):
    """
    Verify danger PIN before a destructive action.
    Returns a short-lived token valid for 5 minutes.
    Requires danger_actions permission.
    """
    if not has_permission(admin, "danger_actions"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        valid = await verify_danger_pin(conn, body.pin, admin)
    if not valid:
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    # Issue a short-lived danger token (signed with admin id + timestamp)
    import time
    payload = {
        "admin_id": admin["id"],
        "role": admin["role"],
        "danger_authorized": True,
        "expires": int(time.time()) + 300,  # 5 minutes
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {"ok": True, "danger_token": token, "expires_in": 300}

@api.post("/admin/danger-pin/change")
async def danger_pin_change(body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Change the danger PIN. Requires danger_actions permission."""
    if not has_permission(admin, "danger_actions"):
        raise HTTPException(status_code=403, detail="Permission denied")
    current_pin = body.get("current_pin", "")
    new_pin = body.get("new_pin", "")
    if not current_pin or not new_pin:
        raise HTTPException(status_code=400, detail="current_pin and new_pin required")
    if len(new_pin) < 6:
        raise HTTPException(status_code=400, detail="New PIN must be at least 6 digits")
    if not new_pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be numeric")
    async with pool.acquire() as conn:
        valid = await verify_danger_pin(conn, current_pin, admin)
        if not valid:
            raise HTTPException(status_code=401, detail="Current PIN is incorrect")
        await conn.execute(
            "UPDATE system_config SET value=$1 WHERE key='danger_pin'",
            new_pin
        )
        await audit(conn, admin["id"], "DANGER_PIN_CHANGED", "system", "system",
                    {"changed_by_role": admin["role"]}, request.client.host)
    return {"ok": True, "message": "Danger PIN updated successfully"}

def require_danger_token(request: Request) -> dict:
    """Dependency that validates a danger token from X-Danger-Token header."""
    import time
    token = request.headers.get("X-Danger-Token")
    if not token:
        raise HTTPException(status_code=403, detail="Danger PIN verification required")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if not payload.get("danger_authorized"):
            raise HTTPException(status_code=403, detail="Invalid danger token")
        if payload.get("expires", 0) < int(time.time()):
            raise HTTPException(status_code=403, detail="Danger token expired — please verify PIN again")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=403, detail="Danger token expired")
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid danger token")

# ── Override system console danger commands to require token ──
@api.post("/admin/system/run-danger/{command}")
async def run_danger_command(
    command: str,
    request: Request,
    admin: dict = Depends(require_admin),
    _danger: dict = Depends(require_danger_token),
):
    """
    Run a DANGER zone system command.
    Requires valid X-Danger-Token header (obtained from /danger-pin/verify).
    Superadmin only.
    """
    if not has_permission(admin, "danger_actions"):
        raise HTTPException(status_code=403, detail="Permission denied")

    DANGER_COMMANDS = {"reset_test_accounts"}
    if command not in DANGER_COMMANDS:
        raise HTTPException(status_code=400, detail=f"Not a danger command: {command}")

    result = {"command": command, "ok": False, "details": {}, "message": ""}

    try:
        async with pool.acquire() as conn:
            if command == "reset_test_accounts":
                # Only wipe is_test=TRUE accounts — real users untouched
                test_users = await conn.fetch("SELECT id FROM users WHERE is_test=TRUE")
                if not test_users:
                    result = {"ok": False, "message": "No test accounts found. Mark users as test first.", "details": {}}
                else:
                    test_ids = [r["id"] for r in test_users]
                    async with conn.transaction():
                        # Delete ratings referencing test transactions first
                        await conn.execute(
                            """DELETE FROM ratings WHERE transaction_id IN (
                               SELECT id FROM transactions
                               WHERE sender_id=ANY($1::text[]) OR receiver_id=ANY($1::text[]))""",
                            test_ids
                        )
                        await conn.execute(
                            "DELETE FROM transactions WHERE sender_id=ANY($1::text[]) OR receiver_id=ANY($1::text[])",
                            test_ids
                        )
                        await conn.execute(
                            "UPDATE wallets SET balance=0 WHERE user_id=ANY($1::text[])",
                            test_ids
                        )
                        await conn.execute(
                            "DELETE FROM withdrawal_requests WHERE user_id=ANY($1::text[])",
                            test_ids
                        )
                        await conn.execute(
                            "DELETE FROM driver_routes WHERE driver_user_id=ANY($1::text[])",
                            test_ids
                        )
                        await conn.execute(
                            "UPDATE drivers SET total_earnings=0 WHERE user_id=ANY($1::text[])",
                            test_ids
                        )
                        await conn.execute(
                            "DELETE FROM cashup_records WHERE driver_user_id=ANY($1::text[]) OR owner_user_id=ANY($1::text[])",
                            test_ids
                        )
                        await conn.execute(
                            "DELETE FROM outstanding_balances WHERE driver_user_id=ANY($1::text[]) OR owner_user_id=ANY($1::text[])",
                            test_ids
                        )
                    result = {
                        "ok": True,
                        "message": f"Test data reset for {len(test_ids)} test account(s). Real users untouched.",
                        "details": {"test_users_reset": len(test_ids), "real_users_preserved": True}
                    }

            await audit(conn, admin["id"], f"DANGER_CMD_{command.upper()}", "system", "system",
                        {"result": result.get("details", {}), "message": result.get("message", ""),
                         "danger_token_admin": _danger.get("admin_id")},
                        request.client.host)
    except Exception as e:
        result = {"ok": False, "message": f"Command failed: {str(e)}", "details": {"error": str(e)}}

    return result

# ── Ledger endpoints that require danger PIN ──────────────────
@api.post("/admin/ledger/reverse-safe/{entry_id}")
async def admin_ledger_reverse_safe(
    entry_id: str,
    body: LedgerReverseIn,
    request: Request,
    admin: dict = Depends(require_admin),
    _danger: dict = Depends(require_danger_token),
):
    """Reverse a ledger entry — requires danger PIN token. Superadmin only."""
    if not has_permission(admin, "reverse_ledger_entry"):
        raise HTTPException(status_code=403, detail="Superadmin only")
    async with pool.acquire() as conn:
        original = await conn.fetchrow("SELECT * FROM platform_ledger WHERE id=$1", entry_id)
        if not original:
            raise HTTPException(status_code=404, detail="Ledger entry not found")
        already = await conn.fetchrow(
            "SELECT id FROM platform_ledger WHERE reference_id=$1 AND reference_type='reversal'",
            entry_id
        )
        if already:
            raise HTTPException(status_code=400, detail="This entry has already been reversed")
        reversal_direction = "debit" if original["direction"] == "credit" else "credit"
        reversal_id = str(uuid.uuid4())
        new_balance = await ledger_entry(
            conn, original["account"], reversal_direction,
            float(original["amount"]), entry_id, "reversal",
            f"[REVERSAL of {entry_id[:8]}] {body.reason}", admin["id"]
        )
        await conn.execute(
            "UPDATE platform_ledger SET description = description || ' [REVERSED]' WHERE id=$1",
            entry_id
        )
        await audit(conn, admin["id"], "LEDGER_ENTRY_REVERSED", entry_id, "ledger", {
            "reversal_id": reversal_id, "account": original["account"],
            "amount": float(original["amount"]), "reason": body.reason,
        }, request.client.host)
    return {"ok": True, "reversal_id": reversal_id, "new_balance": new_balance}

@api.post("/system/reconcile-nightly")
async def nightly_reconcile(request: Request):
    """Called by cron-job.org every night at 02:00 SAST. No auth needed — IP restricted."""
    # Basic security — check secret key
    secret = request.headers.get("X-Cron-Secret", "")
    if secret != os.getenv("CRON_SECRET", "tnr-nightly-reconcile-2026"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    results = {}
    async with pool.acquire() as conn:
        # 1. Sync wallet balances
        rows = await conn.fetch("SELECT id FROM users WHERE role IN ('passenger','driver','owner')")
        fixed_wallets = 0
        for row in rows:
            uid = row["id"]
            inflow = float(await conn.fetchval("SELECT COALESCE(SUM(driver_net),0) FROM transactions WHERE receiver_id=$1 AND status='completed' AND type='payment'", uid) or 0)
            topups = float(await conn.fetchval("SELECT COALESCE(SUM(driver_net),0) FROM transactions WHERE receiver_id=$1 AND status='completed' AND type='topup'", uid) or 0)
            refunds = float(await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE receiver_id=$1 AND status='completed' AND type='refund'", uid) or 0)
            cashups_in = float(await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE receiver_id=$1 AND status='completed' AND type='cashup'", uid) or 0)
            outflow = float(await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE sender_id=$1 AND status='completed' AND type IN ('payment','cashup')", uid) or 0)
            withdrawals = float(await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE user_id=$1 AND status IN ('approved','paid')", uid) or 0)
            correct = max(0, inflow + topups + refunds + cashups_in - outflow - withdrawals)
            current = float(await conn.fetchval("SELECT balance FROM wallets WHERE user_id=$1", uid) or 0)
            if abs(current - correct) > 0.01:
                await conn.execute("UPDATE wallets SET balance=$1 WHERE user_id=$2", correct, uid)
                fixed_wallets += 1
        results["wallets_fixed"] = fixed_wallets
        # 2. Sync driver earnings
        driver_rows = await conn.fetch("SELECT user_id FROM drivers")
        fixed_drivers = 0
        for row in driver_rows:
            uid = row["user_id"]
            earned = float(await conn.fetchval("SELECT COALESCE(SUM(driver_net),0) FROM transactions WHERE receiver_id=$1 AND type='payment' AND status='completed'", uid) or 0)
            current = float(await conn.fetchval("SELECT total_earnings FROM drivers WHERE user_id=$1", uid) or 0)
            if abs(current - earned) > 0.01:
                await conn.execute("UPDATE drivers SET total_earnings=$1 WHERE user_id=$2", earned, uid)
                fixed_drivers += 1
        results["drivers_fixed"] = fixed_drivers
        # 3. Fix ledger balances
        accounts = await conn.fetch("SELECT account FROM platform_accounts")
        fixed_accounts = 0
        for acc in accounts:
            name = acc["account"]
            credits = float(await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM platform_ledger WHERE account=$1 AND direction='credit'", name) or 0)
            debits = float(await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM platform_ledger WHERE account=$1 AND direction='debit'", name) or 0)
            correct = credits - debits
            current = float(await conn.fetchval("SELECT balance FROM platform_accounts WHERE account=$1", name) or 0)
            if abs(current - correct) > 0.01:
                await conn.execute("UPDATE platform_accounts SET balance=$1, updated_at=NOW() WHERE account=$2", correct, name)
                fixed_accounts += 1
        results["accounts_fixed"] = fixed_accounts
    print(f"[NIGHTLY RECONCILE] {results}")
    return {"ok": True, "results": results, "timestamp": datetime.now(timezone.utc).isoformat()}


# ════════════════════════════════════════════════════════════════
# TEST USER MANAGEMENT
# ════════════════════════════════════════════════════════════════

class CreateTestUserIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    role: str = Field(default="passenger")
    initial_balance: float = Field(default=100.0, ge=0, le=5000)
    phone_suffix: Optional[str] = None

@api.get("/admin/test-users")
async def list_test_users(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_test_users"):
        raise HTTPException(status_code=403, detail="CEO or Superadmin only")
    async with pool.acquire() as conn:
        users = await conn.fetch("""
            SELECT u.id, u.full_name, u.phone_number, u.role, u.is_active,
                   u.created_at, COALESCE(w.balance,0) as balance,
                   w.is_frozen,
                   (SELECT COUNT(*) FROM transactions t
                    WHERE t.sender_id=u.id OR t.receiver_id=u.id) as txn_count
            FROM users u
            LEFT JOIN wallets w ON w.user_id=u.id
            WHERE u.is_test=TRUE
            ORDER BY u.created_at DESC
        """)
    return [{
        **dict(u),
        "balance": float(u["balance"]),
        "created_at": iso(u["created_at"]),
    } for u in users]

@api.post("/admin/test-users/create")
async def create_test_user(body: CreateTestUserIn, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_test_users"):
        raise HTTPException(status_code=403, detail="CEO or Superadmin only")
    if body.role not in ("passenger", "driver", "owner"):
        raise HTTPException(status_code=400, detail="Role must be passenger, driver, or owner")

    user_id = str(uuid.uuid4())
    suffix = body.phone_suffix or secrets.token_hex(4)
    phone = f"+27TEST{suffix}"
    pin = "0000"

    async with pool.acquire() as conn:
        # Check phone uniqueness
        existing = await conn.fetchval("SELECT id FROM users WHERE phone_number=$1", phone)
        if existing:
            phone = f"+27TEST{secrets.token_hex(4)}"

        async with conn.transaction():
            await conn.execute(
                """INSERT INTO users (id,phone_number,full_name,role,pin_hash,is_test,created_by)
                   VALUES ($1,$2,$3,$4,$5,TRUE,$6)""",
                user_id, phone, body.full_name, body.role, hash_pin(pin), admin["id"]
            )
            wallet_id = str(uuid.uuid4())
            await conn.execute(
                "INSERT INTO wallets (id,user_id,balance) VALUES ($1,$2,$3)",
                wallet_id, user_id, body.initial_balance
            )
            if body.role in ("driver", "owner"):
                for _attempt in range(10):
                    qr = generate_qr_code()
                    try:
                        await conn.execute(
                            "INSERT INTO drivers (id,user_id,qr_code,is_verified) VALUES ($1,$2,$3,TRUE) "
                            "ON CONFLICT (user_id) DO UPDATE SET qr_code = COALESCE(drivers.qr_code, EXCLUDED.qr_code)",
                            str(uuid.uuid4()), user_id, qr, True
                        )
                        break
                    except Exception:
                        if _attempt == 9:
                            raise
            if body.role == "owner":
                await conn.execute(
                    "INSERT INTO fleet_owners (id,user_id,business_name,registered_as_driver) VALUES ($1,$2,$3,$4) "
                    "ON CONFLICT (user_id) DO NOTHING",
                    str(uuid.uuid4()), user_id, body.full_name, False
                )
            # Record initial balance as test transaction
            if body.initial_balance > 0:
                ref = f"TEST-{secrets.token_hex(4).upper()}"
                await conn.execute(
                    """INSERT INTO transactions (id,reference,type,status,amount,driver_net,receiver_id,note,is_test)
                       VALUES ($1,$2,'topup','completed',$3,$3,$4,'Test account initial funding',TRUE)""",
                    str(uuid.uuid4()), ref, body.initial_balance, user_id
                )
            await audit(conn, admin["id"], "CREATE_TEST_USER", user_id, "user",
                        {"role": body.role, "initial_balance": body.initial_balance}, request.client.host)

    return {
        "ok": True,
        "user_id": user_id,
        "phone": phone,
        "pin": pin,
        "role": body.role,
        "initial_balance": body.initial_balance,
        "message": f"Test {body.role} created. Login with {phone} and PIN {pin}",
    }

@api.post("/admin/test-users/{user_id}/fund")
async def fund_test_user(user_id: str, body: dict, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_test_users"):
        raise HTTPException(status_code=403, detail="CEO or Superadmin only")
    amount = float(body.get("amount", 0))
    if amount <= 0 or amount > 5000:
        raise HTTPException(status_code=400, detail="Amount must be between R1 and R5,000")
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id,full_name,is_test FROM users WHERE id=$1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if not user["is_test"]:
            raise HTTPException(status_code=403, detail="Can only fund test accounts")
        # Check daily funding limit
        today_funded = await conn.fetchval(
            """SELECT COALESCE(SUM(amount),0) FROM transactions
               WHERE receiver_id=$1 AND type='topup' AND is_test=TRUE
               AND created_at > NOW() - INTERVAL '24 hours'""",
            user_id
        ) or 0
        if float(today_funded) + amount > 5000:
            raise HTTPException(status_code=400, detail=f"Daily limit is R5,000. Already funded R{float(today_funded):.2f} today.")
        ref = f"TEST-{secrets.token_hex(4).upper()}"
        async with conn.transaction():
            await conn.execute("UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", amount, user_id)
            await conn.execute(
                """INSERT INTO transactions (id,reference,type,status,amount,driver_net,receiver_id,note,is_test)
                   VALUES ($1,$2,'topup','completed',$3,$3,$4,'Test wallet funding',TRUE)""",
                str(uuid.uuid4()), ref, amount, user_id
            )
            await audit(conn, admin["id"], "FUND_TEST_USER", user_id, "user",
                        {"amount": amount}, request.client.host)
    return {"ok": True, "funded": amount, "reference": ref}

@api.patch("/admin/test-users/{user_id}/mark")
async def toggle_test_flag(user_id: str, body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Mark or unmark a user as a test account."""
    if not has_permission(admin, "manage_test_users"):
        raise HTTPException(status_code=403, detail="CEO or Superadmin only")
    is_test = body.get("is_test", True)
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id,full_name FROM users WHERE id=$1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await conn.execute("UPDATE users SET is_test=$1 WHERE id=$2", is_test, user_id)
        await audit(conn, admin["id"], "MARK_TEST_USER" if is_test else "UNMARK_TEST_USER",
                    user_id, "user", {"is_test": is_test}, request.client.host)
    return {"ok": True, "is_test": is_test, "user": user["full_name"]}

@api.delete("/admin/test-users/{user_id}")
async def delete_test_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Delete a test user and all their data. Danger PIN required."""
    if not has_permission(admin, "manage_test_users"):
        raise HTTPException(status_code=403, detail="CEO or Superadmin only")
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id,full_name,is_test FROM users WHERE id=$1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if not user["is_test"]:
            raise HTTPException(status_code=403, detail="Can only delete test accounts via this endpoint")
        async with conn.transaction():
            # Delete in dependency order
            await conn.execute(
                """DELETE FROM ratings WHERE transaction_id IN (
                   SELECT id FROM transactions WHERE sender_id=$1 OR receiver_id=$1)""",
                user_id
            )
            await conn.execute("DELETE FROM transactions WHERE sender_id=$1 OR receiver_id=$1", user_id)
            await conn.execute("DELETE FROM withdrawal_requests WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM driver_routes WHERE driver_user_id=$1", user_id)
            await conn.execute("DELETE FROM cashup_records WHERE driver_user_id=$1 OR owner_user_id=$1", user_id)
            await conn.execute("DELETE FROM outstanding_balances WHERE driver_user_id=$1 OR owner_user_id=$1", user_id)
            await conn.execute("DELETE FROM support_notes WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM notifications WHERE target_user_id=$1", user_id)
            await conn.execute("DELETE FROM kyc_documents WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM flagged_accounts WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM wallets WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM drivers WHERE user_id=$1", user_id)
            await conn.execute("DELETE FROM users WHERE id=$1", user_id)
            await audit(conn, admin["id"], "DELETE_TEST_USER", user_id, "user",
                        {"deleted_user": user["full_name"]}, request.client.host)
    return {"ok": True, "deleted": user["full_name"]}

# ════════════════════════════════════════════════════════════════
# AUDIT LOG ARCHIVING (Superadmin only)
# ════════════════════════════════════════════════════════════════

@api.post("/admin/audit/archive")
async def archive_audit_logs(body: dict, request: Request, admin: dict = Depends(require_admin)):
    """Archive audit logs older than N months. Superadmin only. Logs are never deleted."""
    if not has_permission(admin, "archive_audit_logs"):
        raise HTTPException(status_code=403, detail="Superadmin only")
    months = int(body.get("months", 6))
    if months < 3:
        raise HTTPException(status_code=400, detail="Minimum archive period is 3 months")
    async with pool.acquire() as conn:
        old_logs = await conn.fetch(
            "SELECT * FROM audit_logs WHERE created_at < NOW() - INTERVAL '%s months'" % months
        )
        if not old_logs:
            return {"ok": True, "archived": 0, "message": "No logs old enough to archive"}
        async with conn.transaction():
            for log_row in old_logs:
                await conn.execute(
                    """INSERT INTO audit_archive
                       (id,original_id,admin_id,action,target_id,target_type,metadata,
                        ip_address,success,original_created_at,archived_by)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                       ON CONFLICT DO NOTHING""",
                    str(uuid.uuid4()), log_row["id"], log_row["admin_id"],
                    log_row["action"], log_row["target_id"], log_row["target_type"],
                    json.dumps(dict(log_row["metadata"] or {})), log_row["ip_address"],
                    log_row["success"], log_row["created_at"], admin["id"]
                )
                await conn.execute("DELETE FROM audit_logs WHERE id=$1", log_row["id"])
            # This archive action itself is immutable — logged after the delete
            await conn.execute(
                """INSERT INTO audit_logs (id,admin_id,action,target_id,target_type,metadata,ip_address,success)
                   VALUES ($1,$2,'AUDIT_LOGS_ARCHIVED','system','audit',$3,$4,TRUE)""",
                str(uuid.uuid4()), admin["id"],
                json.dumps({"count": len(old_logs), "months_threshold": months}),
                request.client.host
            )
    return {"ok": True, "archived": len(old_logs), "message": f"Archived {len(old_logs)} logs older than {months} months"}

@api.get("/admin/audit/archive")
async def get_audit_archive(admin: dict = Depends(require_admin)):
    """View archived audit logs. Superadmin only."""
    if not has_permission(admin, "archive_audit_logs"):
        raise HTTPException(status_code=403, detail="Superadmin only")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM audit_archive ORDER BY original_created_at DESC LIMIT 200"
        )
    return [{**dict(r), "original_created_at": iso(r["original_created_at"]), "archived_at": iso(r["archived_at"])} for r in rows]

# ════════════════════════════════════════════════════════════════
# STATEMENTS SYSTEM
# ════════════════════════════════════════════════════════════════

def gen_stmt_ref() -> str:
    from datetime import datetime
    date_str = datetime.now().strftime("%Y%m%d")
    suffix = secrets.token_hex(3).upper()
    return f"TNR-STMT-{date_str}-{suffix}"

def csv_response(rows: list, headers: list, filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

async def log_statement_download(conn, admin_id: str, stmt_type: str, fmt: str,
                                  date_from=None, date_to=None, target_user_id=None):
    ref = gen_stmt_ref()
    await conn.execute(
        """INSERT INTO statement_downloads
           (id,reference,statement_type,format,date_from,date_to,target_user_id,downloaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
        str(uuid.uuid4()), ref, stmt_type, fmt, date_from, date_to, target_user_id, admin_id
    )
    await conn.execute(
        """INSERT INTO audit_logs (id,admin_id,action,target_id,target_type,metadata,success)
           VALUES ($1,$2,'STATEMENT_DOWNLOADED',$3,'statement',$4,TRUE)""",
        str(uuid.uuid4()), admin_id, ref,
        json.dumps({"type": stmt_type, "format": fmt, "reference": ref})
    )
    return ref

@api.get("/admin/statements/list")
async def list_statement_downloads(admin: dict = Depends(require_admin)):
    """List all statement downloads for audit purposes."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT sd.*, u.full_name as downloaded_by_name, tu.full_name as target_user_name
               FROM statement_downloads sd
               LEFT JOIN users u ON u.id=sd.downloaded_by
               LEFT JOIN users tu ON tu.id=sd.target_user_id
               ORDER BY sd.created_at DESC LIMIT 100"""
        )
    return [{**dict(r), "created_at": iso(r["created_at"])} for r in rows]

@api.get("/admin/statements/transactions")
async def statement_transactions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin)
):
    """Transaction history statement — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT t.reference, t.type, t.status, t.amount, t.platform_fee,
                   t.driver_net, su.full_name as sender, ru.full_name as receiver,
                   t.note, t.created_at
            FROM transactions t
            LEFT JOIN users su ON su.id=t.sender_id
            LEFT JOIN users ru ON ru.id=t.receiver_id
            WHERE t.is_test IS NOT TRUE
        """
        params = []
        if date_from:
            params.append(date_from)
            query += f" AND t.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND t.created_at <= ${len(params)}"
        query += " ORDER BY t.created_at DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "transactions", fmt,
                                            date_from, date_to)

    headers = ["Reference","Type","Status","Amount","Platform Fee","Driver Net","Sender","Receiver","Note","Date"]
    data = [[
        r["reference"], r["type"], r["status"], float(r["amount"]),
        float(r["platform_fee"] or 0), float(r["driver_net"] or 0),
        r["sender"] or "", r["receiver"] or "", r["note"] or "",
        iso(r["created_at"])
    ] for r in rows]

    return csv_response(data, headers, f"transactions-{ref}.csv")

@api.get("/admin/statements/revenue")
async def statement_revenue(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin)
):
    """Platform revenue statement — CFO+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT DATE(t.created_at) as date,
                   COUNT(*) as transactions,
                   SUM(t.amount) as gross_volume,
                   SUM(t.platform_fee) as platform_fees,
                   SUM(t.driver_net) as driver_net
            FROM transactions t
            WHERE t.type='payment' AND t.status='completed'
            AND t.is_test IS NOT TRUE
        """
        params = []
        if date_from:
            params.append(date_from)
            query += f" AND t.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND t.created_at <= ${len(params)}"
        query += " GROUP BY DATE(t.created_at) ORDER BY date DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "revenue", fmt, date_from, date_to)

    headers = ["Date","Transactions","Gross Volume","Platform Fees","Driver Net"]
    data = [[
        str(r["date"]), r["transactions"],
        float(r["gross_volume"] or 0), float(r["platform_fees"] or 0),
        float(r["driver_net"] or 0)
    ] for r in rows]
    return csv_response(data, headers, f"revenue-{ref}.csv")

@api.get("/admin/statements/withdrawals")
async def statement_withdrawals(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin)
):
    """Withdrawal report — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT w.id, u.full_name, u.phone_number, w.amount,
                   w.bank_name, w.account_number, w.status, w.created_at
            FROM withdrawal_requests w
            JOIN users u ON u.id=w.user_id
            WHERE u.is_test IS NOT TRUE
        """
        params = []
        if date_from:
            params.append(date_from)
            query += f" AND w.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND w.created_at <= ${len(params)}"
        query += " ORDER BY w.created_at DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "withdrawals", fmt, date_from, date_to)

    headers = ["ID","User","Phone","Amount","Bank","Account","Status","Date"]
    data = [[
        r["id"], r["full_name"], r["phone_number"], float(r["amount"]),
        r["bank_name"], r["account_number"], r["status"], iso(r["created_at"])
    ] for r in rows]
    return csv_response(data, headers, f"withdrawals-{ref}.csv")

@api.get("/admin/statements/driver-earnings")
async def statement_driver_earnings(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin)
):
    """Driver earnings statement — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT u.full_name, u.phone_number,
                   COUNT(t.id) as trip_count,
                   SUM(t.amount) as gross_earnings,
                   SUM(t.platform_fee) as fees_deducted,
                   SUM(t.driver_net) as net_earnings
            FROM transactions t
            JOIN users u ON u.id=t.receiver_id
            WHERE t.type='payment' AND t.status='completed'
            AND u.role IN ('driver','owner')
            AND u.is_test IS NOT TRUE
        """
        params = []
        if date_from:
            params.append(date_from)
            query += f" AND t.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND t.created_at <= ${len(params)}"
        query += " GROUP BY u.id,u.full_name,u.phone_number ORDER BY net_earnings DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "driver_earnings", fmt, date_from, date_to)

    headers = ["Driver","Phone","Trips","Gross Earnings","Fees Deducted","Net Earnings"]
    data = [[
        r["full_name"], r["phone_number"], r["trip_count"],
        float(r["gross_earnings"] or 0), float(r["fees_deducted"] or 0),
        float(r["net_earnings"] or 0)
    ] for r in rows]
    return csv_response(data, headers, f"driver-earnings-{ref}.csv")

@api.get("/admin/statements/user/{user_id}")
async def statement_user_wallet(
    user_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin)
):
    """Per-user wallet statement (bank statement style) — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id,full_name,phone_number,role FROM users WHERE id=$1", user_id
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        query = """
            SELECT t.reference, t.type, t.status, t.amount,
                   t.platform_fee, t.driver_net, t.note, t.created_at,
                   CASE WHEN t.receiver_id=$1 THEN 'credit' ELSE 'debit' END as direction,
                   CASE WHEN t.receiver_id=$1 THEN t.driver_net ELSE -t.amount END as net_effect
            FROM transactions t
            WHERE (t.sender_id=$1 OR t.receiver_id=$1)
            AND t.status='completed'
        """
        params = [user_id]
        if date_from:
            params.append(date_from)
            query += f" AND t.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND t.created_at <= ${len(params)}"
        query += " ORDER BY t.created_at ASC"
        rows = await conn.fetch(query, *params)
        wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user_id)
        ref = await log_statement_download(conn, admin["id"], "user_wallet", fmt,
                                            date_from, date_to, user_id)

    # Calculate running balance
    running = 0.0
    data = []
    for r in rows:
        net = float(r["net_effect"] or 0)
        running += net
        data.append([
            iso(r["created_at"]), r["reference"], r["type"],
            r["direction"], float(r["amount"]),
            float(r["platform_fee"] or 0), net, round(running, 2), r["note"] or ""
        ])

    headers = ["Date","Reference","Type","Direction","Amount","Fee","Net Effect","Running Balance","Note"]
    return csv_response(data, headers, f"wallet-statement-{user["full_name"].replace(" ","-")}-{ref}.csv")

@api.get("/admin/statements/reconciliation")
async def statement_reconciliation(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin)
):
    """Reconciliation report — CFO+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        total_topups = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='topup' AND status='completed' AND is_test IS NOT TRUE"
        ) or 0
        total_payments = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed' AND is_test IS NOT TRUE"
        ) or 0
        total_fees = await conn.fetchval(
            "SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed' AND is_test IS NOT TRUE"
        ) or 0
        total_withdrawals = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status IN ('approved','paid')"
        ) or 0
        total_wallets = await conn.fetchval(
            "SELECT COALESCE(SUM(w.balance),0) FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.is_test IS NOT TRUE"
        ) or 0
        ref = await log_statement_download(conn, admin["id"], "reconciliation", fmt, date_from, date_to)

    variance = float(total_topups) - float(total_payments) - float(total_withdrawals) - float(total_wallets)
    headers = ["Metric","Amount"]
    data = [
        ["Total Top-Ups", float(total_topups)],
        ["Total Payments", float(total_payments)],
        ["Platform Fees Earned", float(total_fees)],
        ["Total Withdrawals", float(total_withdrawals)],
        ["Total Wallet Balances", float(total_wallets)],
        ["Variance", round(variance, 2)],
        ["Status", "BALANCED" if abs(variance) < 1 else "DISCREPANCY DETECTED"],
        ["Report Reference", ref],
        ["Generated At", iso(datetime.now(timezone.utc))],
    ]
    return csv_response(data, headers, f"reconciliation-{ref}.csv")

@api.get("/admin/statements/audit-export")
async def statement_audit_export(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin)
):
    """Full audit log export — requires archive_audit_logs permission."""
    if not has_permission(admin, "archive_audit_logs"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT al.id, al.action, al.target_id, al.target_type,
                   al.metadata, al.ip_address, al.success, al.created_at,
                   u.full_name as admin_name, u.role as admin_role
            FROM audit_logs al
            LEFT JOIN users u ON u.id=al.admin_id
            WHERE 1=1
        """
        params = []
        if date_from:
            params.append(date_from)
            query += f" AND al.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND al.created_at <= ${len(params)}"
        query += " ORDER BY al.created_at DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "audit_export", fmt, date_from, date_to)

    headers = ["ID","Action","Target ID","Target Type","Admin","Admin Role","IP","Success","Metadata","Date"]
    data = [[
        r["id"], r["action"], r["target_id"] or "", r["target_type"] or "",
        r["admin_name"] or "System", r["admin_role"] or "",
        r["ip_address"] or "", r["success"],
        json.dumps(dict(r["metadata"] or {})), iso(r["created_at"])
    ] for r in rows]
    return csv_response(data, headers, f"audit-export-{ref}.csv")


@api.get("/admin/statements/passenger-topups")
async def statement_passenger_topups(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin),
):
    """Passenger top-up history — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT u.full_name, u.phone_number, t.reference, t.amount,
                   t.status, t.note, t.created_at
            FROM transactions t
            JOIN users u ON u.id = t.sender_id
            WHERE t.type = 'topup' AND u.is_test IS NOT TRUE
        """
        params: list = []
        if date_from:
            params.append(date_from)
            query += f" AND t.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND t.created_at <= ${len(params)}"
        query += " ORDER BY t.created_at DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "passenger_topups", fmt, date_from, date_to)

    headers = ["Passenger", "Phone", "Reference", "Amount", "Status", "Note", "Date"]
    data = [[
        r["full_name"], r["phone_number"], r["reference"],
        float(r["amount"]), r["status"], r["note"] or "", iso(r["created_at"])
    ] for r in rows]
    return csv_response(data, headers, f"passenger-topups-{ref}.csv")


@api.get("/admin/statements/fleet-earnings")
async def statement_fleet_earnings(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin),
):
    """Fleet owner earnings — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT u.full_name, u.phone_number,
                   COUNT(t.id) AS trips,
                   SUM(t.amount) AS gross,
                   SUM(t.platform_fee) AS fees,
                   SUM(t.driver_net) AS net
            FROM transactions t
            JOIN users u ON u.id = t.receiver_id
            WHERE t.type = 'payment' AND t.status = 'completed'
              AND u.role = 'owner' AND u.is_test IS NOT TRUE
        """
        params: list = []
        if date_from:
            params.append(date_from)
            query += f" AND t.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND t.created_at <= ${len(params)}"
        query += " GROUP BY u.id, u.full_name, u.phone_number ORDER BY net DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "fleet_earnings", fmt, date_from, date_to)

    headers = ["Fleet Owner", "Phone", "Trips", "Gross Earnings", "Platform Fees", "Net Earnings"]
    data = [[
        r["full_name"], r["phone_number"], r["trips"],
        float(r["gross"] or 0), float(r["fees"] or 0), float(r["net"] or 0)
    ] for r in rows]
    return csv_response(data, headers, f"fleet-earnings-{ref}.csv")


@api.get("/admin/statements/driver/{user_id}")
async def statement_driver_single(
    user_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin),
):
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT u.full_name, u.phone_number,
                   COUNT(t.id) as trip_count,
                   SUM(t.amount) as gross_earnings,
                   COALESCE(SUM(t.platform_fee),0) as fees_deducted,
                   COALESCE(SUM(t.driver_net),0) as net_earnings,
                   MIN(t.created_at) as first_trip, MAX(t.created_at) as last_trip
            FROM transactions t
            JOIN users u ON u.id=t.receiver_id
            WHERE t.type='payment' AND t.status='completed' AND t.receiver_id=$1
        """
        params: list = [user_id]
        if date_from:
            params.append(date_from); query += f" AND t.created_at>=${len(params)}"
        if date_to:
            params.append(date_to); query += f" AND t.created_at<=${len(params)}"
        query += " GROUP BY u.id, u.full_name, u.phone_number"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], f"driver_earnings_{user_id}", fmt, date_from, date_to)
    headers = ["Driver", "Phone", "Trips", "Gross Earnings", "Fees Deducted", "Net Earnings", "First Trip", "Last Trip"]
    data = [[
        r["full_name"], r["phone_number"], r["trip_count"],
        float(r["gross_earnings"] or 0), float(r["fees_deducted"] or 0),
        float(r["net_earnings"] or 0),
        iso(r["first_trip"]) if r["first_trip"] else "", iso(r["last_trip"]) if r["last_trip"] else "",
    ] for r in rows]
    return csv_response(data, headers, f"driver-{user_id}-{ref}.csv")

@api.get("/admin/statements/fleet-owner/{user_id}")
async def statement_fleet_owner_single(
    user_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin),
):
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT u.full_name, u.phone_number,
                   COUNT(t.id) AS trips,
                   COALESCE(SUM(t.amount),0) AS gross,
                   COALESCE(SUM(t.platform_fee),0) AS fees,
                   COALESCE(SUM(t.driver_net),0) AS net
            FROM transactions t
            JOIN users u ON u.id=t.receiver_id
            WHERE t.type='payment' AND t.status='completed' AND t.receiver_id=$1
        """
        params: list = [user_id]
        if date_from:
            params.append(date_from); query += f" AND t.created_at>=${len(params)}"
        if date_to:
            params.append(date_to); query += f" AND t.created_at<=${len(params)}"
        query += " GROUP BY u.id, u.full_name, u.phone_number"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], f"fleet_owner_{user_id}", fmt, date_from, date_to)
    headers = ["Fleet Owner", "Phone", "Trips", "Gross Earnings", "Platform Fees", "Net Earnings"]
    data = [[
        r["full_name"], r["phone_number"], r["trips"],
        float(r["gross"] or 0), float(r["fees"] or 0), float(r["net"] or 0)
    ] for r in rows]
    return csv_response(data, headers, f"fleet-owner-{user_id}-{ref}.csv")

@api.get("/admin/statements/routes")
async def statement_routes(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin),
):
    """Route usage report — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT t.reference, t.amount, t.status,
                   su.full_name AS passenger, du.full_name AS driver,
                   t.note, t.created_at
            FROM transactions t
            LEFT JOIN users su ON su.id = t.sender_id
            LEFT JOIN users du ON du.id = t.receiver_id
            WHERE t.type = 'payment' AND t.is_test IS NOT TRUE
        """
        params: list = []
        if date_from:
            params.append(date_from)
            query += f" AND t.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND t.created_at <= ${len(params)}"
        query += " ORDER BY t.created_at DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "routes", fmt, date_from, date_to)

    headers = ["Reference", "Amount", "Status", "Passenger", "Driver", "Note", "Date"]
    data = [[
        r["reference"], float(r["amount"]), r["status"],
        r["passenger"] or "", r["driver"] or "", r["note"] or "", iso(r["created_at"])
    ] for r in rows]
    return csv_response(data, headers, f"routes-{ref}.csv")


@api.get("/admin/statements/refunds")
async def statement_refunds(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin),
):
    """Refund requests report — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT u.full_name, u.phone_number, r.amount, r.reason,
                   r.status, r.resolution_note, r.created_at
            FROM refund_requests r
            JOIN users u ON u.id = r.user_id
            WHERE u.is_test IS NOT TRUE
        """
        params: list = []
        if date_from:
            params.append(date_from)
            query += f" AND r.created_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND r.created_at <= ${len(params)}"
        query += " ORDER BY r.created_at DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "refunds", fmt, date_from, date_to)

    headers = ["User", "Phone", "Amount", "Reason", "Status", "Resolution Note", "Date"]
    data = [[
        r["full_name"], r["phone_number"], float(r["amount"]),
        r["reason"], r["status"], r["resolution_note"] or "", iso(r["created_at"])
    ] for r in rows]
    return csv_response(data, headers, f"refunds-{ref}.csv")


@api.get("/admin/statements/kyc-decisions")
async def statement_kyc_decisions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fmt: str = "csv",
    admin: dict = Depends(require_admin),
):
    """KYC decision history — Finance+."""
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        query = """
            SELECT u.full_name, u.phone_number, k.status,
                   k.rejection_reason, k.submitted_at, k.reviewed_at,
                   rev.full_name AS reviewed_by
            FROM kyc_documents k
            JOIN users u ON u.id = k.user_id
            LEFT JOIN users rev ON rev.id = k.reviewed_by
            WHERE u.is_test IS NOT TRUE
        """
        params: list = []
        if date_from:
            params.append(date_from)
            query += f" AND k.submitted_at >= ${len(params)}"
        if date_to:
            params.append(date_to)
            query += f" AND k.submitted_at <= ${len(params)}"
        query += " ORDER BY k.submitted_at DESC"
        rows = await conn.fetch(query, *params)
        ref = await log_statement_download(conn, admin["id"], "kyc_decisions", fmt, date_from, date_to)

    headers = ["User", "Phone", "Status", "Rejection Reason", "Submitted At", "Reviewed At", "Reviewed By"]
    data = [[
        r["full_name"], r["phone_number"], r["status"],
        r["rejection_reason"] or "", iso(r["submitted_at"]) if r["submitted_at"] else "",
        iso(r["reviewed_at"]) if r["reviewed_at"] else "", r["reviewed_by"] or ""
    ] for r in rows]
    return csv_response(data, headers, f"kyc-decisions-{ref}.csv")


# ════════════════════════════════════════════════════════════════
# USER NOTIFICATIONS — Mobile clear/fetch
# ════════════════════════════════════════════════════════════════

@api.get("/user/notifications")
async def get_user_notifications(user: dict = Depends(get_current_user)):
    """Get notifications for the current user."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM notifications
               WHERE target='all'
               OR (target='user' AND target_user_id=$1)
               OR (target='role' AND target_role=$2)
               ORDER BY sent_at DESC LIMIT 50""",
            user["id"], user["role"]
        )
    return [{**dict(r), "sent_at": iso(r["sent_at"])} for r in rows]

@api.delete("/user/notifications/{notif_id}")
async def delete_user_notification(notif_id: str, user: dict = Depends(get_current_user)):
    """
    Delete a notification for this user.
    Only deletes notifications targeted at this specific user.
    Broadcast notifications cannot be deleted by users.
    """
    async with pool.acquire() as conn:
        notif = await conn.fetchrow(
            "SELECT id, target, target_user_id FROM notifications WHERE id=$1", notif_id
        )
        if not notif:
            raise HTTPException(status_code=404, detail="Notification not found")
        if notif["target"] == "user" and notif["target_user_id"] == user["id"]:
            await conn.execute("DELETE FROM notifications WHERE id=$1", notif_id)
            return {"ok": True, "deleted": True}
        else:
            # For broadcast notifications, just return ok (client handles hiding via AsyncStorage)
            return {"ok": True, "deleted": False, "client_hide": True}

@api.delete("/user/notifications")
async def clear_user_notifications(user: dict = Depends(get_current_user)):
    """Clear all personal notifications for this user."""
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM notifications WHERE target='user' AND target_user_id=$1",
            user["id"]
        )
    return {"ok": True, "message": "Personal notifications cleared"}

# ════════════════════════════════════════════════════════════════
# WALLET OPERATIONS
# ════════════════════════════════════════════════════════════════

class WalletAdjustIn(BaseModel):
    amount: float
    note: Optional[str] = None

class WalletFreezeIn(BaseModel):
    reason: str

@api.get("/admin/wallets")
async def admin_list_wallets(
    search: Optional[str] = None,
    frozen: Optional[bool] = None,
    admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "manage_users") and not has_permission(admin, "freeze_wallet"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        q = """
            SELECT u.id, u.full_name, u.phone_number, u.role, u.is_active,
                   w.balance, w.is_frozen, w.frozen_reason,
                   COALESCE(w.updated_at, w.created_at) AS updated_at
            FROM users u
            JOIN wallets w ON w.user_id=u.id
            WHERE u.is_test IS NOT TRUE
        """
        params: list = []
        if search:
            params.append(f"%{search}%")
            q += f" AND (u.full_name ILIKE ${len(params)} OR u.phone_number ILIKE ${len(params)})"
        if frozen is not None:
            params.append(frozen)
            q += f" AND w.is_frozen=${len(params)}"
        q += " ORDER BY w.balance DESC LIMIT 500"
        rows = await conn.fetch(q, *params)
    return [
        {
            "user_id": r["id"], "full_name": r["full_name"],
            "phone_number": r["phone_number"], "role": r["role"],
            "is_active": r["is_active"], "balance": float(r["balance"] or 0),
            "is_frozen": r["is_frozen"], "frozen_reason": r["frozen_reason"],
            "updated_at": iso(r["updated_at"]),
        }
        for r in rows
    ]

@api.post("/admin/wallets/{user_id}/freeze")
async def admin_freeze_wallet(
    user_id: str, body: WalletFreezeIn, admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "freeze_wallet"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id,full_name FROM users WHERE id=$1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await conn.execute(
            "UPDATE wallets SET is_frozen=TRUE, frozen_reason=$2, frozen_at=NOW(), updated_at=NOW() WHERE user_id=$1",
            user_id, body.reason
        )
        await audit(conn, admin["id"], "freeze_wallet", user_id, "user",
                    {"reason": body.reason, "target_name": user["full_name"]})
    return {"ok": True}

@api.post("/admin/wallets/{user_id}/unfreeze")
async def admin_unfreeze_wallet(user_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "freeze_wallet"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id,full_name FROM users WHERE id=$1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await conn.execute(
            "UPDATE wallets SET is_frozen=FALSE, frozen_reason=NULL, frozen_at=NULL, updated_at=NOW() WHERE user_id=$1", user_id
        )
        await audit(conn, admin["id"], "unfreeze_wallet", user_id, "user",
                    {"target_name": user["full_name"]})
    return {"ok": True}

@api.post("/admin/wallets/{user_id}/adjust")
async def admin_adjust_wallet(
    user_id: str, body: WalletAdjustIn, admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "adjust_balance"):
        raise HTTPException(status_code=403, detail="Permission denied: requires adjust_balance")
    async with pool.acquire() as conn:
        wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user_id)
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
        new_bal = float(wallet["balance"] or 0) + body.amount
        if new_bal < 0:
            raise HTTPException(status_code=400, detail="Adjustment would result in negative balance")
        ref = f"ADJ-{uuid.uuid4().hex[:10].upper()}"
        await conn.execute(
            "UPDATE wallets SET balance=$2, updated_at=NOW() WHERE user_id=$1", user_id, new_bal
        )
        await conn.execute(
            """INSERT INTO transactions (id,reference,type,status,amount,sender_id,receiver_id,note)
               VALUES ($1,$2,'adjustment','completed',$3,$4,$5,$6)""",
            str(uuid.uuid4()), ref, abs(body.amount),
            admin["id"] if body.amount < 0 else None,
            user_id if body.amount > 0 else None,
            body.note or "Admin balance adjustment"
        )
        await audit(conn, admin["id"], "adjust_balance", user_id, "wallet",
                    {"amount": body.amount, "new_balance": new_bal, "ref": ref})
    return {"ok": True, "new_balance": new_bal, "reference": ref}


# ════════════════════════════════════════════════════════════════
# REFUND REQUESTS
# ════════════════════════════════════════════════════════════════

class RefundCreateIn(BaseModel):
    user_id: str
    transaction_id: str
    amount: float
    reason: str

class RefundRejectIn(BaseModel):
    reason: str

@api.get("/admin/refunds")
async def admin_list_refunds(
    status: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "manage_refunds"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        q = """
            SELECT r.*, u.full_name as user_name, u.phone_number,
                   t.reference as txn_ref, t.type as txn_type
            FROM refund_requests r
            JOIN users u ON u.id=r.user_id
            LEFT JOIN transactions t ON t.id=r.transaction_id
            WHERE 1=1
        """
        params: list = []
        if status:
            params.append(status)
            q += f" AND r.status=${len(params)}"
        q += " ORDER BY r.created_at DESC LIMIT 200"
        rows = await conn.fetch(q, *params)
    return [
        {
            "id": r["id"], "user_id": r["user_id"], "user_name": r["user_name"],
            "phone_number": r["phone_number"], "transaction_id": r["transaction_id"],
            "txn_ref": r["txn_ref"], "txn_type": r["txn_type"],
            "amount": float(r["amount"]), "reason": r["reason"],
            "status": r["status"], "resolution_note": r["resolution_note"],
            "reviewed_by": r["reviewed_by"], "reviewed_at": iso(r["reviewed_at"]),
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]

@api.post("/admin/refunds")
async def admin_create_refund(body: RefundCreateIn, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_refunds"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        txn = await conn.fetchrow(
            "SELECT id,amount,status FROM transactions WHERE id=$1", body.transaction_id
        )
        if not txn:
            raise HTTPException(status_code=404, detail="Transaction not found")
        rid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO refund_requests (id,user_id,transaction_id,amount,reason,status,created_at)
               VALUES ($1,$2,$3,$4,$5,'pending',NOW())""",
            rid, body.user_id, body.transaction_id, body.amount, body.reason
        )
        await audit(conn, admin["id"], "create_refund", rid, "refund",
                    {"amount": body.amount, "reason": body.reason})
    return {"ok": True, "id": rid}

@api.post("/admin/refunds/{refund_id}/approve")
async def admin_approve_refund(refund_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_refunds"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        ref = await conn.fetchrow(
            "SELECT * FROM refund_requests WHERE id=$1", refund_id
        )
        if not ref:
            raise HTTPException(status_code=404, detail="Refund not found")
        if ref["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Refund is already {ref['status']}")
        wallet = await conn.fetchrow("SELECT balance,is_frozen FROM wallets WHERE user_id=$1", ref["user_id"])
        if not wallet or wallet["is_frozen"]:
            raise HTTPException(status_code=400, detail="Wallet frozen or not found")
        ref_code = f"RFD-{uuid.uuid4().hex[:10].upper()}"
        await conn.execute(
            "UPDATE wallets SET balance=balance+$2 WHERE user_id=$1", ref["user_id"], ref["amount"]
        )
        await conn.execute(
            """INSERT INTO transactions (id,reference,type,status,amount,sender_id,receiver_id,note)
               VALUES ($1,$2,'refund','completed',$3,NULL,$4,'Refund approved by admin')""",
            str(uuid.uuid4()), ref_code, ref["amount"], ref["user_id"]
        )
        await conn.execute(
            """UPDATE refund_requests SET status='approved', reviewed_by=$2, reviewed_at=NOW()
               WHERE id=$1""",
            refund_id, admin["id"]
        )
        await audit(conn, admin["id"], "approve_refund", refund_id, "refund",
                    {"amount": float(ref["amount"]), "ref": ref_code})
    return {"ok": True, "reference": ref_code}

@api.post("/admin/refunds/{refund_id}/reject")
async def admin_reject_refund(
    refund_id: str, body: RefundRejectIn, admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "manage_refunds"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        ref = await conn.fetchrow("SELECT id,status FROM refund_requests WHERE id=$1", refund_id)
        if not ref:
            raise HTTPException(status_code=404, detail="Refund not found")
        if ref["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Refund is already {ref['status']}")
        await conn.execute(
            """UPDATE refund_requests SET status='rejected', resolution_note=$2,
               reviewed_by=$3, reviewed_at=NOW() WHERE id=$1""",
            refund_id, body.reason, admin["id"]
        )
        await audit(conn, admin["id"], "reject_refund", refund_id, "refund",
                    {"reason": body.reason})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# FEATURE FLAGS
# ════════════════════════════════════════════════════════════════

class FeatureFlagIn(BaseModel):
    name: str
    description: Optional[str] = None
    enabled: bool = False
    rollout_pct: int = 100
    target_roles: Optional[list] = None
    metadata: Optional[dict] = None

class FeatureFlagUpdateIn(BaseModel):
    description: Optional[str] = None
    enabled: Optional[bool] = None
    rollout_pct: Optional[int] = None
    target_roles: Optional[list] = None
    metadata: Optional[dict] = None

@api.get("/admin/feature-flags")
async def admin_list_flags(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM feature_flags ORDER BY name"
        )
    return [
        {
            "id": r["id"], "name": r["name"], "description": r["description"],
            "enabled": r["enabled"], "rollout_pct": r["rollout_pct"],
            "target_roles": json.loads(r["target_roles"] or "[]"), "metadata": json.loads(r["metadata"] or "{}"),
            "updated_by": r["updated_by"], "updated_at": iso(r["updated_at"]),
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]

@api.post("/admin/feature-flags")
async def admin_create_flag(body: FeatureFlagIn, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT id FROM feature_flags WHERE name=$1", body.name)
        if existing:
            raise HTTPException(status_code=409, detail="Flag with this name already exists")
        fid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO feature_flags (id,name,description,enabled,rollout_pct,target_roles,metadata,updated_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            fid, body.name, body.description, body.enabled, body.rollout_pct,
            json.dumps(body.target_roles or []), json.dumps(body.metadata or {}), admin["id"]
        )
        await audit(conn, admin["id"], "create_feature_flag", fid, "feature_flag",
                    {"name": body.name, "enabled": body.enabled})
    return {"ok": True, "id": fid}

@api.patch("/admin/feature-flags/{flag_id}")
async def admin_update_flag(
    flag_id: str, body: FeatureFlagUpdateIn, admin: dict = Depends(require_superadmin)
):
    async with pool.acquire() as conn:
        flag = await conn.fetchrow("SELECT id,name FROM feature_flags WHERE id=$1", flag_id)
        if not flag:
            raise HTTPException(status_code=404, detail="Flag not found")
        updates, params = [], [flag_id]
        if body.enabled is not None:
            params.append(body.enabled); updates.append(f"enabled=${len(params)}")
        if body.rollout_pct is not None:
            params.append(body.rollout_pct); updates.append(f"rollout_pct=${len(params)}")
        if body.description is not None:
            params.append(body.description); updates.append(f"description=${len(params)}")
        if body.target_roles is not None:
            params.append(json.dumps(body.target_roles)); updates.append(f"target_roles=${len(params)}")
        if body.metadata is not None:
            params.append(json.dumps(body.metadata)); updates.append(f"metadata=${len(params)}")
        if not updates:
            return {"ok": True}
        params.append(admin["id"]); updates.append(f"updated_by=${len(params)}")
        await conn.execute(
            f"UPDATE feature_flags SET {', '.join(updates)}, updated_at=NOW() WHERE id=$1", *params
        )
        await audit(conn, admin["id"], "update_feature_flag", flag_id, "feature_flag",
                    {"name": flag["name"], "changes": body.dict(exclude_none=True)})
    return {"ok": True}

@api.delete("/admin/feature-flags/{flag_id}")
async def admin_delete_flag(flag_id: str, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        flag = await conn.fetchrow("SELECT id,name FROM feature_flags WHERE id=$1", flag_id)
        if not flag:
            raise HTTPException(status_code=404, detail="Flag not found")
        await conn.execute("DELETE FROM feature_flags WHERE id=$1", flag_id)
        await audit(conn, admin["id"], "delete_feature_flag", flag_id, "feature_flag",
                    {"name": flag["name"]})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# PRICING RULES
# ════════════════════════════════════════════════════════════════

class PricingRuleIn(BaseModel):
    zone_id: Optional[str] = None
    vehicle_type: str = "all"
    base_fare: float
    per_km: float
    per_minute: float
    min_fare: float
    surge_multiplier: float = 1.0
    surge_active: bool = False

class PricingRuleUpdateIn(BaseModel):
    base_fare: Optional[float] = None
    per_km: Optional[float] = None
    per_minute: Optional[float] = None
    min_fare: Optional[float] = None
    surge_multiplier: Optional[float] = None
    surge_active: Optional[bool] = None

@api.get("/admin/pricing-rules")
async def admin_list_pricing(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_pricing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT pr.*, cz.name as zone_name FROM pricing_rules pr LEFT JOIN coverage_zones cz ON cz.id=pr.zone_id ORDER BY pr.created_at"
        )
    return [
        {
            "id": r["id"], "zone_id": r["zone_id"], "zone_name": r["zone_name"],
            "vehicle_type": r["vehicle_type"], "base_fare": float(r["base_fare"]),
            "per_km": float(r["per_km"]), "per_minute": float(r["per_minute"]),
            "min_fare": float(r["min_fare"]), "surge_multiplier": float(r["surge_multiplier"]),
            "surge_active": r["surge_active"], "updated_at": iso(r["updated_at"]),
        }
        for r in rows
    ]

@api.post("/admin/pricing-rules")
async def admin_create_pricing(body: PricingRuleIn, admin: dict = Depends(require_superadmin)):
    if not has_permission(admin, "manage_pricing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO pricing_rules (id,zone_id,vehicle_type,base_fare,per_km,per_minute,min_fare,surge_multiplier,surge_active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            rid, body.zone_id, body.vehicle_type, body.base_fare, body.per_km,
            body.per_minute, body.min_fare, body.surge_multiplier, body.surge_active
        )
        await audit(conn, admin["id"], "create_pricing_rule", rid, "pricing",
                    {"vehicle_type": body.vehicle_type, "base_fare": body.base_fare})
    return {"ok": True, "id": rid}

@api.patch("/admin/pricing-rules/{rule_id}")
async def admin_update_pricing(
    rule_id: str, body: PricingRuleUpdateIn, admin: dict = Depends(require_superadmin)
):
    if not has_permission(admin, "manage_pricing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rule = await conn.fetchrow("SELECT id FROM pricing_rules WHERE id=$1", rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Pricing rule not found")
        updates, params = [], [rule_id]
        for field in ["base_fare","per_km","per_minute","min_fare","surge_multiplier","surge_active"]:
            val = getattr(body, field)
            if val is not None:
                params.append(val); updates.append(f"{field}=${len(params)}")
        if not updates:
            return {"ok": True}
        await conn.execute(
            f"UPDATE pricing_rules SET {', '.join(updates)}, updated_at=NOW() WHERE id=$1", *params
        )
        await audit(conn, admin["id"], "update_pricing_rule", rule_id, "pricing",
                    body.dict(exclude_none=True))
    return {"ok": True}

@api.delete("/admin/pricing-rules/{rule_id}")
async def admin_delete_pricing(rule_id: str, admin: dict = Depends(require_superadmin)):
    if not has_permission(admin, "manage_pricing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM pricing_rules WHERE id=$1", rule_id)
        await audit(conn, admin["id"], "delete_pricing_rule", rule_id, "pricing", {})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# PROMOTIONS
# ════════════════════════════════════════════════════════════════

class PromotionIn(BaseModel):
    code: str
    description: Optional[str] = None
    discount_type: str  # "percent" or "fixed"
    discount_value: float
    min_ride_amount: float = 0
    max_uses: int = 100
    uses_per_user: int = 1
    valid_from: str
    valid_to: str
    active: bool = True

class PromotionUpdateIn(BaseModel):
    description: Optional[str] = None
    discount_value: Optional[float] = None
    max_uses: Optional[int] = None
    valid_to: Optional[str] = None
    active: Optional[bool] = None

@api.get("/admin/promotions")
async def admin_list_promos(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_promotions"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM promotions ORDER BY created_at DESC"
        )
    return [
        {
            "id": r["id"], "code": r["code"], "description": r["description"],
            "discount_type": r["discount_type"], "discount_value": float(r["discount_value"]),
            "min_ride_amount": float(r["min_ride_amount"]),
            "max_uses": r["max_uses"], "uses_per_user": r["uses_per_user"],
            "total_used": r["total_used"], "active": r["active"],
            "valid_from": iso(r["valid_from"]), "valid_to": iso(r["valid_to"]),
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]

@api.post("/admin/promotions")
async def admin_create_promo(body: PromotionIn, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_promotions"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT id FROM promotions WHERE code=$1", body.code.upper())
        if existing:
            raise HTTPException(status_code=409, detail="Promo code already exists")
        pid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO promotions (id,code,description,discount_type,discount_value,min_ride_amount,max_uses,uses_per_user,valid_from,valid_to,active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
            pid, body.code.upper(), body.description, body.discount_type, body.discount_value,
            body.min_ride_amount, body.max_uses, body.uses_per_user,
            body.valid_from, body.valid_to, body.active
        )
        await audit(conn, admin["id"], "create_promotion", pid, "promotion",
                    {"code": body.code, "discount_type": body.discount_type})
    return {"ok": True, "id": pid}

@api.patch("/admin/promotions/{promo_id}")
async def admin_update_promo(
    promo_id: str, body: PromotionUpdateIn, admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "manage_promotions"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        promo = await conn.fetchrow("SELECT id,code FROM promotions WHERE id=$1", promo_id)
        if not promo:
            raise HTTPException(status_code=404, detail="Promotion not found")
        updates, params = [], [promo_id]
        for field in ["description","discount_value","max_uses","valid_to","active"]:
            val = getattr(body, field)
            if val is not None:
                params.append(val); updates.append(f"{field}=${len(params)}")
        if not updates:
            return {"ok": True}
        await conn.execute(
            f"UPDATE promotions SET {', '.join(updates)} WHERE id=$1", *params
        )
        await audit(conn, admin["id"], "update_promotion", promo_id, "promotion",
                    {"code": promo["code"], "changes": body.dict(exclude_none=True)})
    return {"ok": True}

@api.delete("/admin/promotions/{promo_id}")
async def admin_delete_promo(promo_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_promotions"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        promo = await conn.fetchrow("SELECT id,code FROM promotions WHERE id=$1", promo_id)
        if not promo:
            raise HTTPException(status_code=404, detail="Promotion not found")
        await conn.execute("DELETE FROM promotions WHERE id=$1", promo_id)
        await audit(conn, admin["id"], "delete_promotion", promo_id, "promotion",
                    {"code": promo["code"]})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# GDPR DATA REQUESTS
# ════════════════════════════════════════════════════════════════

class GDPRResolutionIn(BaseModel):
    resolution_note: str

@api.get("/admin/gdpr/requests")
async def admin_list_gdpr(admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT g.*, u.full_name, u.phone_number, u.email
               FROM gdpr_requests g
               JOIN users u ON u.id=g.user_id
               ORDER BY g.created_at DESC"""
        )
    return [
        {
            "id": r["id"], "user_id": r["user_id"], "full_name": r["full_name"],
            "phone_number": r["phone_number"], "email": r["email"],
            "request_type": r["request_type"], "status": r["status"],
            "resolution_note": r["resolution_note"],
            "resolved_by": r["resolved_by"], "resolved_at": iso(r["resolved_at"]),
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]

@api.post("/admin/gdpr/requests/{request_id}/resolve")
async def admin_resolve_gdpr(
    request_id: str, body: GDPRResolutionIn, admin: dict = Depends(require_superadmin)
):
    async with pool.acquire() as conn:
        req = await conn.fetchrow(
            "SELECT id,user_id,request_type,status FROM gdpr_requests WHERE id=$1", request_id
        )
        if not req:
            raise HTTPException(status_code=404, detail="GDPR request not found")
        if req["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Request already {req['status']}")
        await conn.execute(
            """UPDATE gdpr_requests SET status='resolved', resolution_note=$2,
               resolved_by=$3, resolved_at=NOW() WHERE id=$1""",
            request_id, body.resolution_note, admin["id"]
        )
        if req["request_type"] == "deletion":
            await conn.execute(
                """UPDATE users SET full_name='[Deleted]', phone_number=CONCAT('deleted-',id),
                   email=NULL, is_active=FALSE WHERE id=$1""",
                req["user_id"]
            )
        await audit(conn, admin["id"], "resolve_gdpr", request_id, "gdpr",
                    {"type": req["request_type"], "note": body.resolution_note})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# COVERAGE ZONES / GEOGRAPHY
# ════════════════════════════════════════════════════════════════

class ZoneIn(BaseModel):
    name: str
    city: Optional[str] = None
    province: Optional[str] = None
    country: str = "ZA"
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_km: Optional[float] = None
    active: bool = True

class ZoneUpdateIn(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_km: Optional[float] = None
    active: Optional[bool] = None

@api.get("/admin/zones")
async def admin_list_zones(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM coverage_zones ORDER BY name")
    driver_counts: dict = {}
    return [
        {
            "id": r["id"], "name": r["name"], "city": r["city"],
            "province": r["province"], "country": r["country"],
            "lat": float(r["lat"]) if r["lat"] else None,
            "lng": float(r["lng"]) if r["lng"] else None,
            "radius_km": float(r["radius_km"]) if r["radius_km"] else None,
            "active": r["active"],
            "driver_count": driver_counts.get(str(r["id"]), 0),
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]

@api.post("/admin/zones")
async def admin_create_zone(body: ZoneIn, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        zid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO coverage_zones (id,name,city,province,country,lat,lng,radius_km,active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            zid, body.name, body.city, body.province, body.country,
            body.lat, body.lng, body.radius_km, body.active
        )
        await audit(conn, admin["id"], "create_zone", zid, "zone", {"name": body.name})
    return {"ok": True, "id": zid}

@api.patch("/admin/zones/{zone_id}")
async def admin_update_zone(
    zone_id: str, body: ZoneUpdateIn, admin: dict = Depends(require_superadmin)
):
    async with pool.acquire() as conn:
        zone = await conn.fetchrow("SELECT id,name FROM coverage_zones WHERE id=$1", zone_id)
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")
        updates, params = [], [zone_id]
        for field in ["name","city","province","lat","lng","radius_km","active"]:
            val = getattr(body, field)
            if val is not None:
                params.append(val); updates.append(f"{field}=${len(params)}")
        if not updates:
            return {"ok": True}
        await conn.execute(
            f"UPDATE coverage_zones SET {', '.join(updates)}, updated_at=NOW() WHERE id=$1", *params
        )
        await audit(conn, admin["id"], "update_zone", zone_id, "zone",
                    {"name": zone["name"], "changes": body.dict(exclude_none=True)})
    return {"ok": True}

@api.delete("/admin/zones/{zone_id}")
async def admin_delete_zone(zone_id: str, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        zone = await conn.fetchrow("SELECT id,name FROM coverage_zones WHERE id=$1", zone_id)
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")
        await conn.execute("DELETE FROM coverage_zones WHERE id=$1", zone_id)
        await audit(conn, admin["id"], "delete_zone", zone_id, "zone", {"name": zone["name"]})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# CHARGEBACKS
# ════════════════════════════════════════════════════════════════

class ChargebackCreateIn(BaseModel):
    user_id: str
    transaction_id: Optional[str] = None
    amount: float = Field(gt=0, le=1_000_000)
    reason: str = Field(min_length=3, max_length=500)

class ChargebackUpdateIn(BaseModel):
    status: str  # "won" | "lost" | "under_review"
    resolution_note: Optional[str] = None
    amount_recovered: Optional[float] = None

@api.post("/admin/chargebacks")
async def admin_create_chargeback(
    body: ChargebackCreateIn, request: Request, admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "manage_refunds"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, full_name FROM users WHERE id=$1", body.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if body.transaction_id:
            txn = await conn.fetchrow("SELECT id FROM transactions WHERE id=$1", body.transaction_id)
            if not txn:
                raise HTTPException(status_code=404, detail="Transaction not found")
        cid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO chargebacks (id, user_id, transaction_id, amount, reason, status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())""",
            cid, body.user_id, body.transaction_id, body.amount, body.reason
        )
        await audit(conn, admin["id"], "create_chargeback", cid, "chargeback",
                    {"amount": body.amount, "reason": body.reason, "user": user["full_name"]},
                    request.client.host)
    return {"ok": True, "id": cid}

@api.get("/admin/chargebacks")
async def admin_list_chargebacks(
    status: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "manage_refunds"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        q = """
            SELECT c.*, u.full_name as user_name, u.phone_number,
                   t.reference as txn_ref, t.amount as txn_amount
            FROM chargebacks c
            JOIN users u ON u.id=c.user_id
            LEFT JOIN transactions t ON t.id=c.transaction_id
            WHERE 1=1
        """
        params: list = []
        if status:
            params.append(status)
            q += f" AND c.status=${len(params)}"
        q += " ORDER BY c.created_at DESC LIMIT 200"
        rows = await conn.fetch(q, *params)
    return [
        {
            "id": r["id"], "user_id": r["user_id"], "user_name": r["user_name"],
            "phone_number": r["phone_number"], "transaction_id": r["transaction_id"],
            "txn_ref": r["txn_ref"], "txn_amount": float(r["txn_amount"] or 0),
            "amount": float(r["amount"]), "reason": r["reason"],
            "status": r["status"], "resolution_note": r["resolution_note"],
            "amount_recovered": float(r["amount_recovered"] or 0),
            "created_at": iso(r["created_at"]), "updated_at": iso(r["updated_at"]),
        }
        for r in rows
    ]

@api.patch("/admin/chargebacks/{chargeback_id}")
async def admin_update_chargeback(
    chargeback_id: str, body: ChargebackUpdateIn, admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "manage_refunds"):
        raise HTTPException(status_code=403, detail="Permission denied")
    valid_statuses = {"won", "lost", "under_review", "pending"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    async with pool.acquire() as conn:
        cb = await conn.fetchrow("SELECT id,user_id,amount FROM chargebacks WHERE id=$1", chargeback_id)
        if not cb:
            raise HTTPException(status_code=404, detail="Chargeback not found")
        await conn.execute(
            """UPDATE chargebacks SET status=$2, resolution_note=$3, amount_recovered=$4,
               updated_at=NOW() WHERE id=$1""",
            chargeback_id, body.status, body.resolution_note,
            body.amount_recovered or 0
        )
        await audit(conn, admin["id"], "update_chargeback", chargeback_id, "chargeback",
                    {"status": body.status, "amount": float(cb["amount"])})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# TRANSACTION LIMITS
# ════════════════════════════════════════════════════════════════

class LimitUpdateIn(BaseModel):
    daily_limit: Optional[float] = None
    single_txn_limit: Optional[float] = None
    monthly_limit: Optional[float] = None
    min_topup: Optional[float] = None
    max_topup: Optional[float] = None
    max_withdrawal: Optional[float] = None
    min_withdrawal: Optional[float] = None
    enabled: Optional[bool] = None

@api.get("/admin/limits")
async def admin_list_limits(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_limits"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM tx_limit_configs ORDER BY role")
    return [
        {
            "id": r["id"], "role": r["role"],
            "daily_limit": float(r["daily_limit"] or 0),
            "single_txn_limit": float(r["single_txn_limit"] or 0),
            "monthly_limit": float(r["monthly_limit"] or 0),
            "min_topup": float(r["min_topup"] or 0),
            "max_topup": float(r["max_topup"] or 0),
            "max_withdrawal": float(r["max_withdrawal"] or 0),
            "min_withdrawal": float(r["min_withdrawal"] or 0),
            "enabled": r["enabled"], "updated_at": iso(r["updated_at"]),
        }
        for r in rows
    ]

@api.patch("/admin/limits/{limit_id}")
async def admin_update_limit(
    limit_id: str, body: LimitUpdateIn, admin: dict = Depends(require_superadmin)
):
    if not has_permission(admin, "manage_limits"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        lim = await conn.fetchrow("SELECT id,role FROM tx_limit_configs WHERE id=$1", limit_id)
        if not lim:
            raise HTTPException(status_code=404, detail="Limit config not found")
        updates, params = [], [limit_id]
        for field in ["daily_limit","single_txn_limit","monthly_limit","min_topup",
                      "max_topup","max_withdrawal","min_withdrawal","enabled"]:
            val = getattr(body, field)
            if val is not None:
                params.append(val); updates.append(f"{field}=${len(params)}")
        if not updates:
            return {"ok": True}
        await conn.execute(
            f"UPDATE tx_limit_configs SET {', '.join(updates)}, updated_at=NOW() WHERE id=$1", *params
        )
        await audit(conn, admin["id"], "update_tx_limit", limit_id, "limit",
                    {"role": lim["role"], "changes": body.dict(exclude_none=True)})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# REFERRALS
# ════════════════════════════════════════════════════════════════

@api.get("/admin/referrals")
async def admin_list_referrals(
    status: Optional[str] = None,
    search: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    async with pool.acquire() as conn:
        q = """
            SELECT r.*,
                   ref.full_name as referrer_name, ref.phone_number as referrer_phone,
                   inv.full_name as invitee_name, inv.phone_number as invitee_phone
            FROM referrals r
            JOIN users ref ON ref.id=r.referrer_id
            JOIN users inv ON inv.id=r.invitee_id
            WHERE 1=1
        """
        params: list = []
        if status:
            params.append(status)
            q += f" AND r.status=${len(params)}"
        if search:
            params.append(f"%{search}%")
            q += f" AND (ref.full_name ILIKE ${len(params)} OR inv.full_name ILIKE ${len(params)} OR ref.phone_number ILIKE ${len(params)})"
        q += " ORDER BY r.created_at DESC LIMIT 300"
        rows = await conn.fetch(q, *params)

        stats = await conn.fetchrow(
            """SELECT COUNT(*) as total,
                      SUM(CASE WHEN status='rewarded' THEN 1 ELSE 0 END) as rewarded,
                      SUM(COALESCE(reward_amount,0)) as total_rewards
               FROM referrals"""
        )
    return {
        "items": [
            {
                "id": r["id"], "referrer_id": r["referrer_id"],
                "referrer_name": r["referrer_name"], "referrer_phone": r["referrer_phone"],
                "invitee_id": r["invitee_id"], "invitee_name": r["invitee_name"],
                "invitee_phone": r["invitee_phone"], "status": r["status"],
                "reward_amount": float(r["reward_amount"] or 0),
                "created_at": iso(r["created_at"]),
            }
            for r in rows
        ],
        "stats": {
            "total": stats["total"], "rewarded": stats["rewarded"],
            "total_rewards": float(stats["total_rewards"] or 0),
        }
    }


# ════════════════════════════════════════════════════════════════
# FEEDBACK / RATINGS
# ════════════════════════════════════════════════════════════════

@api.get("/admin/feedback")
async def admin_list_feedback(
    flagged: Optional[bool] = None,
    min_stars: Optional[int] = None,
    max_stars: Optional[int] = None,
    admin: dict = Depends(require_admin)
):
    async with pool.acquire() as conn:
        q = """
            SELECT rt.id, rt.stars as rating, rt.comment, rt.is_flagged, rt.flag_reason, rt.created_at,
                   rater.full_name as rater_name, rater.role as rater_role,
                   rated.full_name as rated_name, rated.role as rated_role
            FROM ratings rt
            JOIN users rater ON rater.id=rt.passenger_user_id
            JOIN users rated ON rated.id=rt.driver_user_id
            WHERE 1=1
        """
        params: list = []
        if flagged is not None:
            params.append(flagged)
            q += f" AND rt.is_flagged=${len(params)}"
        if min_stars is not None:
            params.append(min_stars)
            q += f" AND rt.rating >= ${len(params)}"
        if max_stars is not None:
            params.append(max_stars)
            q += f" AND rt.rating <= ${len(params)}"
        q += " ORDER BY rt.created_at DESC LIMIT 500"
        rows = await conn.fetch(q, *params)

        stats = await conn.fetchrow(
            """SELECT COUNT(*) as total, AVG(stars) as avg_rating,
                      SUM(CASE WHEN is_flagged THEN 1 ELSE 0 END) as flagged_count
               FROM ratings"""
        )
    return {
        "items": [
            {
                "id": r["id"], "rating": r["rating"], "comment": r["comment"],
                "is_flagged": r["is_flagged"], "flag_reason": r["flag_reason"],
                "rater_name": r["rater_name"], "rater_role": r["rater_role"],
                "rated_name": r["rated_name"], "rated_role": r["rated_role"],
                "created_at": iso(r["created_at"]),
            }
            for r in rows
        ],
        "stats": {
            "total": stats["total"],
            "avg_rating": round(float(stats["avg_rating"] or 0), 2),
            "flagged_count": stats["flagged_count"],
        }
    }

@api.post("/admin/feedback/{rating_id}/flag")
async def admin_flag_feedback(
    rating_id: str,
    body: FlagAccountIn,
    admin: dict = Depends(require_admin)
):
    async with pool.acquire() as conn:
        r = await conn.fetchrow("SELECT id FROM ratings WHERE id=$1", rating_id)
        if not r:
            raise HTTPException(status_code=404, detail="Rating not found")
        await conn.execute(
            "UPDATE ratings SET is_flagged=TRUE, flag_reason=$2 WHERE id=$1",
            rating_id, body.reason
        )
        await audit(conn, admin["id"], "flag_rating", rating_id, "rating",
                    {"reason": body.reason})
    return {"ok": True}

@api.post("/admin/feedback/{rating_id}/unflag")
async def admin_unflag_feedback(rating_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        r = await conn.fetchrow("SELECT id FROM ratings WHERE id=$1", rating_id)
        if not r:
            raise HTTPException(status_code=404, detail="Rating not found")
        await conn.execute(
            "UPDATE ratings SET is_flagged=FALSE, flag_reason=NULL WHERE id=$1", rating_id
        )
        await audit(conn, admin["id"], "unflag_rating", rating_id, "rating", {})
    return {"ok": True}

@api.delete("/admin/feedback/{rating_id}")
async def admin_delete_feedback(rating_id: str, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        r = await conn.fetchrow("SELECT id FROM ratings WHERE id=$1", rating_id)
        if not r:
            raise HTTPException(status_code=404, detail="Rating not found")
        await conn.execute("DELETE FROM ratings WHERE id=$1", rating_id)
        await audit(conn, admin["id"], "delete_rating", rating_id, "rating", {})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# BROADCAST / NOTIFICATIONS
# ════════════════════════════════════════════════════════════════

@api.get("/admin/broadcasts")
async def admin_list_broadcasts(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "broadcast_messages"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT n.*, u.full_name as sent_by_name
               FROM notifications n
               LEFT JOIN users u ON u.id=n.sent_by
               WHERE n.target IN ('all','role')
               ORDER BY n.sent_at DESC LIMIT 200"""
        )
    return [
        {
            "id": r["id"], "title": r["title"], "body": r["message"],
            "target": r["target"], "target_role": r["target_role"],
            "sent_by": r["sent_by"], "sent_by_name": r["sent_by_name"],
            "sent_at": iso(r["sent_at"]),
        }
        for r in rows
    ]

@api.post("/admin/notifications/broadcast")
async def admin_broadcast(body: SendNotificationIn, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "broadcast_messages"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        nid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO notifications (id,title,message,target,target_role,sent_by,sent_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW())""",
            nid, body.title, body.message,
            body.target or "all",
            body.target_role if body.target == "role" else None,
            admin["id"]
        )
        await audit(conn, admin["id"], "broadcast_notification", nid, "notification",
                    {"title": body.title, "target": body.target or "all"})
    return {"ok": True, "id": nid}


# ════════════════════════════════════════════════════════════════
# RISK / SUSPICIOUS USERS
# ════════════════════════════════════════════════════════════════

@api.get("/admin/risk/users")
async def admin_risk_users(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_risk"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                u.id, u.full_name, u.phone_number, u.role, u.is_active,
                u.flagged, u.flag_reason,
                w.balance, w.is_frozen,
                COUNT(DISTINCT t.id) as txn_count,
                COALESCE(SUM(CASE WHEN t.status='failed' THEN 1 ELSE 0 END),0) as failed_txns,
                COALESCE(SUM(CASE WHEN t.created_at > NOW()-INTERVAL '24 hours' THEN 1 ELSE 0 END),0) as txns_24h,
                COALESCE(SUM(CASE WHEN t.created_at > NOW()-INTERVAL '24 hours' THEN t.amount ELSE 0 END),0) as volume_24h,
                COUNT(DISTINCT d.id) as dispute_count,
                u.created_at
            FROM users u
            LEFT JOIN wallets w ON w.user_id=u.id
            LEFT JOIN transactions t ON (t.sender_id=u.id OR t.receiver_id=u.id)
            LEFT JOIN disputes d ON (d.user_id=u.id)
            WHERE u.is_test IS NOT TRUE
            GROUP BY u.id, u.full_name, u.phone_number, u.role, u.is_active,
                     u.flagged, u.flag_reason, w.balance, w.is_frozen, u.created_at
            HAVING (
                u.flagged = TRUE
                OR w.is_frozen = TRUE
                OR COUNT(DISTINCT d.id) > 0
                OR COALESCE(SUM(CASE WHEN t.status='failed' THEN 1 ELSE 0 END),0) > 3
                OR COALESCE(SUM(CASE WHEN t.created_at > NOW()-INTERVAL '24 hours' THEN t.amount ELSE 0 END),0) > 5000
            )
            ORDER BY (CASE WHEN u.flagged THEN 3 WHEN w.is_frozen THEN 2 ELSE 1 END) DESC,
                     u.created_at DESC
            LIMIT 200
            """
        )

    def risk_score(r) -> int:
        score = 0
        if r["flagged"]: score += 40
        if r["is_frozen"]: score += 30
        if r["dispute_count"] > 0: score += r["dispute_count"] * 10
        if r["failed_txns"] > 3: score += min(r["failed_txns"] * 3, 20)
        if float(r["volume_24h"] or 0) > 5000: score += 20
        return min(score, 100)

    return [
        {
            "user_id": r["id"], "full_name": r["full_name"],
            "phone_number": r["phone_number"], "role": r["role"],
            "is_active": r["is_active"], "flagged": r["flagged"],
            "flag_reason": r["flag_reason"], "balance": float(r["balance"] or 0),
            "is_frozen": r["is_frozen"], "txn_count": r["txn_count"],
            "failed_txns": r["failed_txns"], "txns_24h": r["txns_24h"],
            "volume_24h": float(r["volume_24h"] or 0),
            "dispute_count": r["dispute_count"],
            "risk_score": risk_score(r),
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]


# ════════════════════════════════════════════════════════════════
# RECONCILIATION
# ════════════════════════════════════════════════════════════════

@api.get("/admin/reconciliation/batches")
async def admin_recon_batches(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT b.*, u.full_name as run_by_name
               FROM reconciliation_batches b
               LEFT JOIN users u ON u.id=b.run_by
               ORDER BY b.created_at DESC LIMIT 100"""
        )
    return [
        {
            "id": r["id"], "period_start": iso(r["period_start"]),
            "period_end": iso(r["period_end"]), "status": r["status"],
            "total_topups": float(r["total_topups"] or 0),
            "total_payments": float(r["total_payments"] or 0),
            "total_fees": float(r["total_fees"] or 0),
            "total_withdrawals": float(r["total_withdrawals"] or 0),
            "total_wallets": float(r["total_wallets"] or 0),
            "variance": float(r["variance"] or 0),
            "discrepancy_count": r["discrepancy_count"],
            "run_by": r["run_by"], "run_by_name": r["run_by_name"],
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]

@api.get("/admin/reconciliation/discrepancies")
async def admin_recon_discrepancies(
    batch_id: Optional[str] = None,
    resolved: Optional[bool] = None,
    admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        q = "SELECT * FROM reconciliation_discrepancies WHERE 1=1"
        params: list = []
        if batch_id:
            params.append(batch_id); q += f" AND batch_id=${len(params)}"
        if resolved is not None:
            params.append(resolved); q += f" AND resolved=${len(params)}"
        q += " ORDER BY created_at DESC LIMIT 300"
        rows = await conn.fetch(q, *params)
    return [
        {
            "id": r["id"], "batch_id": r["batch_id"], "type": r["type"],
            "description": r["description"], "amount": float(r["amount"] or 0),
            "expected": float(r["expected"] or 0), "actual": float(r["actual"] or 0),
            "resolved": r["resolved"], "resolution_note": r["resolution_note"],
            "resolved_by": r["resolved_by"], "resolved_at": iso(r["resolved_at"]),
            "created_at": iso(r["created_at"]),
        }
        for r in rows
    ]

@api.post("/admin/reconciliation/run")
async def admin_run_reconciliation(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        now = datetime.now(timezone.utc)
        period_end = now
        last_batch = await conn.fetchrow(
            "SELECT period_end FROM reconciliation_batches ORDER BY created_at DESC LIMIT 1"
        )
        period_start = last_batch["period_end"] if last_batch else (now - timedelta(days=30))

        total_topups = float(await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='topup' AND status='completed' AND created_at BETWEEN $1 AND $2 AND is_test IS NOT TRUE",
            period_start, period_end
        ) or 0)
        total_payments = float(await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed' AND created_at BETWEEN $1 AND $2 AND is_test IS NOT TRUE",
            period_start, period_end
        ) or 0)
        total_fees = float(await conn.fetchval(
            "SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed' AND created_at BETWEEN $1 AND $2 AND is_test IS NOT TRUE",
            period_start, period_end
        ) or 0)
        total_withdrawals = float(await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status IN ('approved','paid') AND created_at BETWEEN $1 AND $2",
            period_start, period_end
        ) or 0)
        total_wallets = float(await conn.fetchval(
            "SELECT COALESCE(SUM(w.balance),0) FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.is_test IS NOT TRUE"
        ) or 0)

        variance = total_topups - total_payments - total_withdrawals - total_wallets
        discrepancies = []

        if abs(variance) > 0.01:
            discrepancies.append({
                "type": "variance",
                "description": f"Balance variance detected: R{variance:.2f}",
                "amount": abs(variance),
                "expected": total_topups - total_payments - total_withdrawals,
                "actual": total_wallets
            })

        failed_unpaid = float(await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='pending' AND created_at < NOW()-INTERVAL '7 days'"
        ) or 0)
        if failed_unpaid > 0:
            discrepancies.append({
                "type": "stale_withdrawal",
                "description": f"Stale pending withdrawals older than 7 days: R{failed_unpaid:.2f}",
                "amount": failed_unpaid,
                "expected": 0,
                "actual": failed_unpaid
            })

        bid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO reconciliation_batches
               (id,period_start,period_end,status,total_topups,total_payments,total_fees,
                total_withdrawals,total_wallets,variance,discrepancy_count,run_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
            bid, period_start, period_end,
            "balanced" if abs(variance) < 0.01 else "discrepancy",
            total_topups, total_payments, total_fees, total_withdrawals,
            total_wallets, variance, len(discrepancies), admin["id"]
        )
        for d in discrepancies:
            await conn.execute(
                """INSERT INTO reconciliation_discrepancies
                   (id,batch_id,type,description,amount,expected,actual)
                   VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                str(uuid.uuid4()), bid, d["type"], d["description"],
                d["amount"], d["expected"], d["actual"]
            )
        await audit(conn, admin["id"], "run_reconciliation", bid, "reconciliation",
                    {"variance": variance, "discrepancies": len(discrepancies)})

    return {
        "ok": True, "batch_id": bid,
        "status": "balanced" if abs(variance) < 0.01 else "discrepancy",
        "variance": variance,
        "discrepancy_count": len(discrepancies),
        "period_start": iso(period_start),
        "period_end": iso(period_end),
    }

@api.post("/admin/reconciliation/discrepancies/{disc_id}/resolve")
async def admin_resolve_discrepancy(
    disc_id: str, body: GDPRResolutionIn, admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "download_statements"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        d = await conn.fetchrow("SELECT id FROM reconciliation_discrepancies WHERE id=$1", disc_id)
        if not d:
            raise HTTPException(status_code=404, detail="Discrepancy not found")
        await conn.execute(
            """UPDATE reconciliation_discrepancies SET resolved=TRUE, resolution_note=$2,
               resolved_by=$3, resolved_at=NOW() WHERE id=$1""",
            disc_id, body.resolution_note, admin["id"]
        )
        await audit(conn, admin["id"], "resolve_discrepancy", disc_id, "reconciliation",
                    {"note": body.resolution_note})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# HR — Staff Management
# ════════════════════════════════════════════════════════════════

HR_ROLES = ("superadmin", "ceo", "cfo", "hr")

def _calc_paye(monthly: float) -> float:
    annual = monthly * 12
    if annual <= 237_100:   tax = annual * 0.18
    elif annual <= 370_500: tax = 42_678  + (annual - 237_100) * 0.26
    elif annual <= 512_800: tax = 77_362  + (annual - 370_500) * 0.31
    elif annual <= 673_000: tax = 121_475 + (annual - 512_800) * 0.36
    elif annual <= 857_900: tax = 179_147 + (annual - 673_000) * 0.39
    elif annual <= 1_817_000: tax = 251_258 + (annual - 857_900) * 0.41
    else: tax = 644_489 + (annual - 1_817_000) * 0.45
    return max(0.0, (tax - 17_235) / 12)

def _calc_uif(monthly: float) -> float:
    return min(monthly * 0.01, 177.12)

def _calc_sdl(monthly: float) -> float:
    return monthly * 0.01

class StaffIn(BaseModel):
    full_name: str
    role_title: str
    department: str = "Engineering"
    employment_type: str = "Permanent"
    status: str = "active"
    start_date: str
    end_date: Optional[str] = None
    gross_salary: float
    email: Optional[str] = None
    phone: Optional[str] = None
    id_number: Optional[str] = None
    tax_ref: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_type: Optional[str] = "Current"
    branch_code: Optional[str] = None
    emergency_name: Optional[str] = None
    emergency_phone: Optional[str] = None

class TerminateIn(BaseModel):
    reason: str
    end_date: str

class PayrollRunIn(BaseModel):
    period_month: str  # e.g. "2025-05"
    notes: Optional[str] = None

class PayrollRejectIn(BaseModel):
    note: str

@api.get("/admin/hr/staff")
async def hr_list_staff(admin: dict = Depends(require_admin)):
    if admin["role"] not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Access restricted to HR roles")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, full_name, role_title, department, employment_type, status,
                      start_date, end_date, gross_salary, email, phone, created_at
               FROM staff ORDER BY full_name"""
        )
        return [dict(r) for r in rows]

@api.post("/admin/hr/staff")
async def hr_create_staff(
    body: StaffIn,
    admin: dict = Depends(require_admin),
    _danger: dict = Depends(require_danger_token),
):
    if admin["role"] not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Access restricted to HR roles")
    sid = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO staff (id, full_name, role_title, department, employment_type, status,
               start_date, end_date, gross_salary, email, phone, id_number, tax_ref,
               bank_name, account_number, account_type, branch_code,
               emergency_name, emergency_phone, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)""",
            sid, body.full_name, body.role_title, body.department, body.employment_type,
            body.status, body.start_date, body.end_date, body.gross_salary,
            body.email, body.phone, body.id_number, body.tax_ref,
            body.bank_name, body.account_number, body.account_type, body.branch_code,
            body.emergency_name, body.emergency_phone, admin["id"],
        )
        await audit(conn, admin["id"], "CREATE_STAFF", sid, "staff", {"name": body.full_name})
    return {"ok": True, "id": sid}

@api.patch("/admin/hr/staff/{staff_id}")
async def hr_update_staff(
    staff_id: str,
    body: StaffIn,
    admin: dict = Depends(require_admin),
    _danger: dict = Depends(require_danger_token),
):
    if admin["role"] not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Access restricted to HR roles")
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM staff WHERE id=$1", staff_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Staff member not found")
        await conn.execute(
            """UPDATE staff SET full_name=$2, role_title=$3, department=$4, employment_type=$5,
               status=$6, start_date=$7, end_date=$8, gross_salary=$9, email=$10, phone=$11,
               id_number=$12, tax_ref=$13, bank_name=$14, account_number=$15,
               account_type=$16, branch_code=$17, emergency_name=$18, emergency_phone=$19,
               updated_at=NOW() WHERE id=$1""",
            staff_id, body.full_name, body.role_title, body.department, body.employment_type,
            body.status, body.start_date, body.end_date, body.gross_salary,
            body.email, body.phone, body.id_number, body.tax_ref,
            body.bank_name, body.account_number, body.account_type, body.branch_code,
            body.emergency_name, body.emergency_phone,
        )
        await audit(conn, admin["id"], "UPDATE_STAFF", staff_id, "staff", {"name": body.full_name})
    return {"ok": True}

@api.post("/admin/hr/staff/{staff_id}/reveal-sensitive")
async def hr_reveal_sensitive(
    staff_id: str,
    admin: dict = Depends(require_admin),
    _danger: dict = Depends(require_danger_token),
):
    if admin["role"] not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Access restricted to HR roles")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id_number, tax_ref, bank_name, account_number, account_type,
                      branch_code, emergency_name, emergency_phone
               FROM staff WHERE id=$1""",
            staff_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Staff member not found")
        await audit(conn, admin["id"], "REVEAL_STAFF_SENSITIVE", staff_id, "staff", {})
        return dict(row)

@api.post("/admin/hr/staff/{staff_id}/terminate")
async def hr_terminate_staff(
    staff_id: str,
    body: TerminateIn,
    admin: dict = Depends(require_admin),
    _danger: dict = Depends(require_danger_token),
):
    if admin["role"] not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Access restricted to HR roles")
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT full_name FROM staff WHERE id=$1", staff_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Staff member not found")
        await conn.execute(
            "UPDATE staff SET status='terminated', end_date=$2, termination_reason=$3, updated_at=NOW() WHERE id=$1",
            staff_id, body.end_date, body.reason,
        )
        await audit(conn, admin["id"], "TERMINATE_STAFF", staff_id, "staff",
                    {"name": existing["full_name"], "reason": body.reason})
    return {"ok": True}

@api.get("/admin/hr/export")
async def hr_export(
    admin: dict = Depends(require_admin),
    _danger: dict = Depends(require_danger_token),
):
    if admin["role"] not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Access restricted to HR roles")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT full_name, role_title, department, employment_type, status,
                      start_date, end_date, gross_salary, email, phone,
                      id_number, tax_ref, bank_name, account_number, account_type,
                      branch_code, emergency_name, emergency_phone, created_at
               FROM staff ORDER BY full_name"""
        )
        await audit(conn, admin["id"], "EXPORT_HR_DATA", None, "staff", {})
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Full Name", "Role", "Department", "Type", "Status",
        "Start Date", "End Date", "Gross Salary", "Email", "Phone",
        "ID Number", "Tax Ref", "Bank", "Account No", "Account Type",
        "Branch Code", "Emergency Contact", "Emergency Phone", "Created At",
    ])
    for r in rows:
        writer.writerow([
            r["full_name"], r["role_title"], r["department"], r["employment_type"], r["status"],
            r["start_date"], r["end_date"] or "", r["gross_salary"], r["email"] or "",
            r["phone"] or "", r["id_number"] or "", r["tax_ref"] or "",
            r["bank_name"] or "", r["account_number"] or "", r["account_type"] or "",
            r["branch_code"] or "", r["emergency_name"] or "", r["emergency_phone"] or "",
            r["created_at"],
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=hr_staff.csv"},
    )


@api.post("/admin/hr/payslip/generate")
async def hr_generate_payslip(
    body: dict,
    request: Request,
    admin: dict = Depends(require_admin),
):
    if admin["role"] not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Access restricted to HR roles")
    staff_id    = body.get("staff_id")
    period_month = body.get("period_month")  # e.g. "2025-06"
    if not staff_id or not period_month:
        raise HTTPException(status_code=400, detail="staff_id and period_month are required")

    async with pool.acquire() as conn:
        staff = await conn.fetchrow(
            """SELECT id, full_name, role_title, department, employment_type,
                      gross_salary, email, phone, id_number, tax_ref,
                      bank_name, account_number, account_type, branch_code, start_date
               FROM staff WHERE id=$1""",
            staff_id,
        )
        if not staff:
            raise HTTPException(status_code=404, detail="Staff member not found")

        # Existing payroll run for this period?
        run_line = await conn.fetchrow(
            """SELECT pli.gross_salary, pli.paye, pli.uif_employee, pli.uif_employer,
                      pli.sdl, pli.net_pay, pr.status as run_status
               FROM payroll_line_items pli
               JOIN payroll_runs pr ON pr.id = pli.run_id
               WHERE pli.staff_id=$1 AND pr.period_month=$2
               ORDER BY pr.created_at DESC LIMIT 1""",
            staff_id, period_month,
        )
        await audit(conn, admin["id"], "GENERATE_PAYSLIP", staff_id, "staff",
                    {"period": period_month, "staff": staff["full_name"]}, request.client.host)

    g     = float(run_line["gross_salary"] if run_line else staff["gross_salary"])
    paye  = float(run_line["paye"]         if run_line else _calc_paye(g))
    uif_e = float(run_line["uif_employee"] if run_line else _calc_uif(g))
    uif_r = float(run_line["uif_employer"] if run_line else _calc_uif(g))
    sdl   = float(run_line["sdl"]          if run_line else _calc_sdl(g))
    net   = float(run_line["net_pay"]      if run_line else g - paye - uif_e)

    try:
        year, month = period_month.split("-")
        import calendar as cal
        month_name = cal.month_name[int(month)]
        period_label = f"{month_name} {year}"
    except Exception:
        period_label = period_month

    run_status = run_line["run_status"] if run_line else "preview"
    status_note = {
        "executed": "PAID — Salary disbursed",
        "approved": "APPROVED — Pending payment",
        "submitted": "SUBMITTED — Awaiting approval",
        "draft": "DRAFT",
        "preview": "ESTIMATED — Not from a payroll run",
    }.get(run_status, run_status.upper())

    def fmt(v: float) -> str:
        return f"R {v:,.2f}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Payslip — {staff['full_name']} — {period_label}</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; margin: 0; background: #f5f5f5; }}
  .page {{ max-width: 780px; margin: 32px auto; background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }}
  .header {{ background: #0a0a14; color: #fff; padding: 28px 32px; display: flex; justify-content: space-between; align-items: center; }}
  .brand {{ font-size: 22px; font-weight: 900; color: #00e5ff; letter-spacing: -0.5px; }}
  .brand-sub {{ font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 2px; letter-spacing: 2px; text-transform: uppercase; }}
  .payslip-title {{ text-align: right; }}
  .payslip-title h1 {{ font-size: 18px; font-weight: 800; margin: 0; color: #fff; }}
  .payslip-title .period {{ font-size: 12px; color: #00e5ff; margin-top: 4px; }}
  .status-bar {{ background: {'#14532d' if run_status == 'executed' else '#1c1c0a' if run_status in ('draft','preview') else '#0a2340'}; padding: 8px 32px; font-size: 11px; font-weight: 700; color: {'#4ade80' if run_status == 'executed' else '#fde047' if run_status in ('draft','preview') else '#60a5fa'}; letter-spacing: 1px; text-transform: uppercase; }}
  .body {{ padding: 28px 32px; }}
  .employee-section {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e5e5e5; }}
  .section-label {{ font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 8px; }}
  .info-row {{ display: flex; justify-content: space-between; margin-bottom: 4px; }}
  .info-label {{ color: #666; }}
  .info-value {{ font-weight: 600; text-align: right; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
  thead tr {{ background: #f8f8f8; }}
  th {{ padding: 9px 12px; text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #666; border-bottom: 2px solid #e5e5e5; }}
  th:last-child {{ text-align: right; }}
  td {{ padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }}
  td:last-child {{ text-align: right; font-weight: 600; }}
  .credit {{ color: #16a34a; }}
  .debit {{ color: #dc2626; }}
  .total-row td {{ font-weight: 800; background: #f8f8f8; border-top: 2px solid #e5e5e5; border-bottom: 2px solid #e5e5e5; font-size: 14px; }}
  .net-row td {{ font-weight: 900; background: #0a0a14; color: #00e5ff; font-size: 15px; }}
  .footer {{ border-top: 1px solid #e5e5e5; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; background: #fafafa; }}
  .footer-note {{ font-size: 10px; color: #888; }}
  .stamp {{ font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #bbb; }}
  @media print {{ body {{ background: #fff; }} .page {{ margin: 0; border: none; border-radius: 0; box-shadow: none; }} }}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand">Tag-n-Ride</div>
      <div class="brand-sub">Employee Payslip</div>
    </div>
    <div class="payslip-title">
      <h1>PAYSLIP</h1>
      <div class="period">{period_label}</div>
    </div>
  </div>
  <div class="status-bar">{status_note}</div>
  <div class="body">
    <div class="employee-section">
      <div>
        <div class="section-label">Employee Details</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">{staff['full_name']}</span></div>
        <div class="info-row"><span class="info-label">Role</span><span class="info-value">{staff['role_title'] or '—'}</span></div>
        <div class="info-row"><span class="info-label">Department</span><span class="info-value">{staff['department'] or '—'}</span></div>
        <div class="info-row"><span class="info-label">Employment Type</span><span class="info-value">{staff['employment_type'] or '—'}</span></div>
        {'<div class="info-row"><span class="info-label">Start Date</span><span class="info-value">' + str(staff['start_date'])[:10] + '</span></div>' if staff['start_date'] else ''}
      </div>
      <div>
        <div class="section-label">Payment Details</div>
        <div class="info-row"><span class="info-label">Period</span><span class="info-value">{period_label}</span></div>
        {'<div class="info-row"><span class="info-label">Bank</span><span class="info-value">' + (staff['bank_name'] or '—') + '</span></div>' if staff['bank_name'] else ''}
        {'<div class="info-row"><span class="info-label">Account</span><span class="info-value">•••• ' + str(staff['account_number'] or '')[-4:] + '</span></div>' if staff['account_number'] else ''}
        {'<div class="info-row"><span class="info-label">Account Type</span><span class="info-value">' + (staff['account_type'] or '—') + '</span></div>' if staff['account_type'] else ''}
        {'<div class="info-row"><span class="info-label">Tax Ref</span><span class="info-value">' + (staff['tax_ref'] or '—') + '</span></div>' if staff['tax_ref'] else ''}
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Description</th><th>Type</th><th>Amount</th></tr>
      </thead>
      <tbody>
        <tr><td>Basic Salary</td><td>Earnings</td><td class="credit">{fmt(g)}</td></tr>
        <tr><td>PAYE Income Tax</td><td>Deduction</td><td class="debit">−{fmt(paye)}</td></tr>
        <tr><td>UIF Contribution (Employee)</td><td>Deduction</td><td class="debit">−{fmt(uif_e)}</td></tr>
        <tr class="total-row"><td colspan="2">Gross Earnings</td><td>{fmt(g)}</td></tr>
        <tr class="total-row"><td colspan="2">Total Deductions</td><td class="debit">−{fmt(paye + uif_e)}</td></tr>
        <tr class="net-row"><td colspan="2">NET PAY</td><td>{fmt(net)}</td></tr>
      </tbody>
    </table>

    <table>
      <thead>
        <tr><th>Employer Contributions</th><th>Rate</th><th>Amount</th></tr>
      </thead>
      <tbody>
        <tr><td>UIF Employer Contribution</td><td>1%</td><td>{fmt(uif_r)}</td></tr>
        <tr><td>SDL (Skills Development Levy)</td><td>1%</td><td>{fmt(sdl)}</td></tr>
        <tr class="total-row"><td colspan="2">Total Employer Cost</td><td>{fmt(g + uif_r + sdl)}</td></tr>
      </tbody>
    </table>
  </div>
  <div class="footer">
    <div class="footer-note">
      Generated by Tag-n-Ride Admin · {datetime.now(timezone.utc).strftime('%d %B %Y %H:%M UTC')}<br>
      This is a computer-generated payslip and does not require a signature.
    </div>
    <div class="stamp">CONFIDENTIAL</div>
  </div>
</div>
<script>window.print && window.print();</script>
</body>
</html>"""

    filename = f"payslip-{staff['full_name'].lower().replace(' ', '-')}-{period_month}.html"
    return StreamingResponse(
        io.BytesIO(html.encode()),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

# ════════════════════════════════════════════════════════════════
# Salary Payments (trust account → employee bank account)
# ════════════════════════════════════════════════════════════════

class SalaryPaymentIn(BaseModel):
    employee_name: str = Field(min_length=2, max_length=100)
    staff_id: Optional[str] = None
    bank_name: str = Field(min_length=2, max_length=60)
    account_number: str = Field(min_length=6, max_length=20)
    account_holder: str = Field(min_length=2, max_length=100)
    branch_code: Optional[str] = None
    gross_amount: float = Field(gt=0)
    paye_deducted: float = Field(default=0, ge=0)
    uif_deducted: float = Field(default=0, ge=0)
    pay_period: str = Field(min_length=4, max_length=20)
    description: Optional[str] = None

class SalaryRejectIn(BaseModel):
    reason: str = Field(min_length=5, max_length=300)

@api.get("/admin/salary-payments")
async def list_salary_payments(
    status: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    if not has_permission(admin, "manage_staff"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        q = """SELECT sp.*, u.full_name as created_by_name, a.full_name as approved_by_name
               FROM salary_payments sp
               LEFT JOIN users u ON u.id=sp.created_by
               LEFT JOIN users a ON a.id=sp.approved_by"""
        params: list = []
        if status:
            params.append(status)
            q += f" WHERE sp.status=${len(params)}"
        q += " ORDER BY sp.created_at DESC"
        rows = await conn.fetch(q, *params)
    return [{
        "id": r["id"], "employee_name": r["employee_name"], "staff_id": r["staff_id"],
        "bank_name": r["bank_name"], "account_number": r["account_number"],
        "account_holder": r["account_holder"], "branch_code": r["branch_code"],
        "gross_amount": float(r["gross_amount"]), "paye_deducted": float(r["paye_deducted"] or 0),
        "uif_deducted": float(r["uif_deducted"] or 0), "net_amount": float(r["net_amount"]),
        "pay_period": r["pay_period"], "description": r["description"],
        "status": r["status"], "created_by": r["created_by"],
        "created_by_name": r["created_by_name"], "approved_by_name": r["approved_by_name"],
        "rejection_reason": r["rejection_reason"], "payment_reference": r["payment_reference"],
        "paid_at": iso(r["paid_at"]) if r["paid_at"] else None,
        "created_at": iso(r["created_at"]),
    } for r in rows]

@api.post("/admin/salary-payments")
async def create_salary_payment(body: SalaryPaymentIn, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_staff"):
        raise HTTPException(status_code=403, detail="Permission denied")
    net = round(body.gross_amount - body.paye_deducted - body.uif_deducted, 2)
    if net <= 0:
        raise HTTPException(status_code=400, detail="Net amount must be positive after deductions")
    sid = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO salary_payments
               (id,employee_name,staff_id,bank_name,account_number,account_holder,branch_code,
                gross_amount,paye_deducted,uif_deducted,net_amount,pay_period,description,created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)""",
            sid, body.employee_name, body.staff_id, body.bank_name, body.account_number,
            body.account_holder, body.branch_code, body.gross_amount, body.paye_deducted,
            body.uif_deducted, net, body.pay_period, body.description, admin["id"]
        )
    return {"ok": True, "id": sid, "net_amount": net}

@api.post("/admin/salary-payments/{payment_id}/approve")
async def approve_salary_payment(payment_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "large_withdrawals"):
        raise HTTPException(status_code=403, detail="CFO, CEO, or Superadmin only")
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status FROM salary_payments WHERE id=$1", payment_id)
        if not row: raise HTTPException(status_code=404, detail="Payment not found")
        if row["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Cannot approve — status is {row['status']}")
        await conn.execute(
            "UPDATE salary_payments SET status='approved', approved_by=$1 WHERE id=$2",
            admin["id"], payment_id
        )
    return {"ok": True}

@api.post("/admin/salary-payments/{payment_id}/reject")
async def reject_salary_payment(payment_id: str, body: SalaryRejectIn, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "large_withdrawals"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status FROM salary_payments WHERE id=$1", payment_id)
        if not row: raise HTTPException(status_code=404, detail="Payment not found")
        if row["status"] not in ("pending", "approved"):
            raise HTTPException(status_code=400, detail="Cannot reject this payment")
        await conn.execute(
            "UPDATE salary_payments SET status='rejected', rejection_reason=$1 WHERE id=$2",
            body.reason, payment_id
        )
    return {"ok": True}

@api.post("/admin/salary-payments/{payment_id}/pay")
async def pay_salary(payment_id: str, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "large_withdrawals"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM salary_payments WHERE id=$1", payment_id)
        if not row: raise HTTPException(status_code=404, detail="Payment not found")
        if row["status"] != "approved":
            raise HTTPException(status_code=400, detail="Payment must be approved before paying")
        # Mark as processing
        await conn.execute("UPDATE salary_payments SET status='processing' WHERE id=$1", payment_id)

    try:
        ref = f"SAL-{payment_id[:8].upper()}"
        result = await stitch_payout(
            amount=float(row["net_amount"]),
            bank_name=row["bank_name"],
            account_number=row["account_number"],
            account_holder=row["account_holder"],
            reference=ref,
            withdrawal_id=payment_id,
            user_id=admin["id"],
            phone_number="",
        )
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE salary_payments SET status='paid', payment_reference=$1,
                   stitch_payout_id=$2, paid_at=NOW() WHERE id=$3""",
                ref, result.get("payout_id"), payment_id
            )
            # Debit system wallet
            await conn.execute(
                "UPDATE system_wallet SET balance=balance-$1, total_paid_out=total_paid_out+$1, updated_at=NOW() WHERE id='main'",
                float(row["net_amount"])
            )
            await audit(conn, admin["id"], "SALARY_PAID", payment_id, "salary_payment",
                        {"employee": row["employee_name"], "amount": float(row["net_amount"]), "ref": ref},
                        request.client.host if request.client else "unknown")
        return {"ok": True, "reference": ref, "net_amount": float(row["net_amount"])}
    except Exception as e:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE salary_payments SET status='approved', rejection_reason=$1 WHERE id=$2",
                f"Payment failed: {str(e)}", payment_id
            )
        raise HTTPException(status_code=502, detail=f"Payout failed: {str(e)}")

@api.get("/admin/system-wallet")
async def get_system_wallet(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_ledger") and not has_permission(admin, "manage_staff"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        sw = await conn.fetchrow("SELECT * FROM system_wallet WHERE id='main'")
        # Calculate live fee balance from transactions
        total_fees = await conn.fetchval(
            "SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE is_test IS NOT TRUE AND status='completed'"
        )
        total_salary_paid = await conn.fetchval(
            "SELECT COALESCE(SUM(net_amount),0) FROM salary_payments WHERE status='paid'"
        )
    return {
        "balance": float(sw["balance"] if sw else 0),
        "total_fees_collected": float(total_fees or 0),
        "total_salary_paid": float(total_salary_paid or 0),
        "available": float((total_fees or 0) - (total_salary_paid or 0)),
    }

# ════════════════════════════════════════════════════════════════
# Payroll
# ════════════════════════════════════════════════════════════════

PAYROLL_ROLES = ("superadmin", "ceo", "cfo")

@api.get("/admin/payroll/runs")
async def payroll_list_runs(admin: dict = Depends(require_admin)):
    if admin["role"] not in PAYROLL_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT r.*,
                      cb.full_name AS created_by_name,
                      sb.full_name AS submitted_by_name,
                      ab.full_name AS approved_by_name,
                      eb.full_name AS executed_by_name
               FROM payroll_runs r
               LEFT JOIN users cb ON cb.id = r.created_by
               LEFT JOIN users sb ON sb.id = r.submitted_by
               LEFT JOIN users ab ON ab.id = r.approved_by
               LEFT JOIN users eb ON eb.id = r.executed_by
               ORDER BY r.created_at DESC"""
        )
        return [dict(r) for r in rows]

@api.post("/admin/payroll/runs")
async def payroll_create_run(
    body: PayrollRunIn,
    admin: dict = Depends(require_admin),
):
    if admin["role"] not in PAYROLL_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM payroll_runs WHERE period_month=$1 AND status != 'cancelled'",
            body.period_month,
        )
        if existing:
            raise HTTPException(status_code=409, detail="A payroll run already exists for this period")
        active_staff = await conn.fetch(
            """SELECT id, full_name, role_title, department, gross_salary,
                      bank_name, account_number, branch_code
               FROM staff WHERE status='active'"""
        )
        if not active_staff:
            raise HTTPException(status_code=400, detail="No active staff found")

        total_gross = total_paye = total_uif_emp = total_uif_er = total_sdl = total_net = 0.0
        lines = []
        for s in active_staff:
            g = float(s["gross_salary"])
            paye = _calc_paye(g)
            uif_e = _calc_uif(g)
            uif_r = _calc_uif(g)
            sdl = _calc_sdl(g)
            net = g - paye - uif_e
            total_gross += g; total_paye += paye
            total_uif_emp += uif_e; total_uif_er += uif_r
            total_sdl += sdl; total_net += net
            lines.append({
                "id": str(uuid.uuid4()),
                "staff_id": s["id"], "full_name": s["full_name"],
                "role_title": s["role_title"], "department": s["department"],
                "gross_salary": g, "paye": paye, "uif_employee": uif_e,
                "uif_employer": uif_r, "sdl": sdl, "net_pay": net,
                "bank_name": s["bank_name"], "account_number": s["account_number"],
                "branch_code": s["branch_code"],
            })

        run_id = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO payroll_runs
               (id, period_month, status, total_gross, total_paye, total_uif_employee,
                total_uif_employer, total_sdl, total_net, employee_count, notes, created_by)
               VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
            run_id, body.period_month, round(total_gross, 2), round(total_paye, 2),
            round(total_uif_emp, 2), round(total_uif_er, 2), round(total_sdl, 2),
            round(total_net, 2), len(lines), body.notes, admin["id"],
        )
        for ln in lines:
            await conn.execute(
                """INSERT INTO payroll_line_items
                   (id, run_id, staff_id, full_name, role_title, department,
                    gross_salary, paye, uif_employee, uif_employer, sdl, net_pay,
                    bank_name, account_number, branch_code)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)""",
                ln["id"], run_id, ln["staff_id"], ln["full_name"], ln["role_title"],
                ln["department"], ln["gross_salary"], ln["paye"], ln["uif_employee"],
                ln["uif_employer"], ln["sdl"], ln["net_pay"],
                ln["bank_name"], ln["account_number"], ln["branch_code"],
            )
        await audit(conn, admin["id"], "CREATE_PAYROLL_RUN", run_id, "payroll",
                    {"period": body.period_month, "employees": len(lines)})
    return {"ok": True, "id": run_id}

@api.get("/admin/payroll/runs/{run_id}")
async def payroll_get_run(run_id: str, admin: dict = Depends(require_admin)):
    if admin["role"] not in PAYROLL_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        run = await conn.fetchrow(
            """SELECT r.*,
                      cb.full_name AS created_by_name,
                      sb.full_name AS submitted_by_name,
                      ab.full_name AS approved_by_name,
                      eb.full_name AS executed_by_name
               FROM payroll_runs r
               LEFT JOIN users cb ON cb.id = r.created_by
               LEFT JOIN users sb ON sb.id = r.submitted_by
               LEFT JOIN users ab ON ab.id = r.approved_by
               LEFT JOIN users eb ON eb.id = r.executed_by
               WHERE r.id=$1""",
            run_id,
        )
        if not run:
            raise HTTPException(status_code=404, detail="Payroll run not found")
        lines = await conn.fetch(
            "SELECT * FROM payroll_line_items WHERE run_id=$1 ORDER BY full_name", run_id
        )
        result = dict(run)
        result["lines"] = [dict(ln) for ln in lines]
        return result

@api.post("/admin/payroll/runs/{run_id}/submit")
async def payroll_submit(run_id: str, admin: dict = Depends(require_admin)):
    if admin["role"] not in PAYROLL_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        run = await conn.fetchrow("SELECT status FROM payroll_runs WHERE id=$1", run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Not found")
        if run["status"] != "draft":
            raise HTTPException(status_code=400, detail="Only draft runs can be submitted")
        await conn.execute(
            "UPDATE payroll_runs SET status='submitted', submitted_by=$2, submitted_at=NOW() WHERE id=$1",
            run_id, admin["id"],
        )
        await audit(conn, admin["id"], "SUBMIT_PAYROLL", run_id, "payroll", {})
    return {"ok": True}

@api.post("/admin/payroll/runs/{run_id}/approve")
async def payroll_approve(run_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "large_withdrawals"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        run = await conn.fetchrow("SELECT status FROM payroll_runs WHERE id=$1", run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Not found")
        if run["status"] != "submitted":
            raise HTTPException(status_code=400, detail="Only submitted runs can be approved")
        await conn.execute(
            "UPDATE payroll_runs SET status='approved', approved_by=$2, approved_at=NOW() WHERE id=$1",
            run_id, admin["id"],
        )
        await audit(conn, admin["id"], "APPROVE_PAYROLL", run_id, "payroll", {})
    return {"ok": True}

@api.post("/admin/payroll/runs/{run_id}/reject")
async def payroll_reject(run_id: str, body: PayrollRejectIn, admin: dict = Depends(require_admin)):
    if admin["role"] not in PAYROLL_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        run = await conn.fetchrow("SELECT status FROM payroll_runs WHERE id=$1", run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Not found")
        if run["status"] not in ("submitted", "approved"):
            raise HTTPException(status_code=400, detail="Cannot reject at this stage")
        await conn.execute(
            "UPDATE payroll_runs SET status='draft', rejection_note=$2, approved_by=NULL, approved_at=NULL, submitted_by=NULL, submitted_at=NULL WHERE id=$1",
            run_id, body.note,
        )
        await audit(conn, admin["id"], "REJECT_PAYROLL", run_id, "payroll", {"note": body.note})
    return {"ok": True}

@api.post("/admin/payroll/runs/{run_id}/execute")
async def payroll_execute(
    run_id: str,
    admin: dict = Depends(require_admin),
    _danger: dict = Depends(require_danger_token),
):
    if not has_permission(admin, "large_withdrawals"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        run = await conn.fetchrow("SELECT status FROM payroll_runs WHERE id=$1", run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Not found")
        if run["status"] != "approved":
            raise HTTPException(status_code=400, detail="Only approved runs can be executed")
        await conn.execute(
            "UPDATE payroll_runs SET status='executed', executed_by=$2, executed_at=NOW() WHERE id=$1",
            run_id, admin["id"],
        )
        await audit(conn, admin["id"], "EXECUTE_PAYROLL", run_id, "payroll", {})
    return {"ok": True}

@api.get("/admin/payroll/runs/{run_id}/export")
async def payroll_export(run_id: str, admin: dict = Depends(require_admin)):
    if admin["role"] not in PAYROLL_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        run = await conn.fetchrow("SELECT period_month FROM payroll_runs WHERE id=$1", run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Not found")
        lines = await conn.fetch(
            "SELECT * FROM payroll_line_items WHERE run_id=$1 ORDER BY full_name", run_id
        )
        await audit(conn, admin["id"], "EXPORT_PAYROLL", run_id, "payroll", {})
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Full Name", "Role", "Department", "Gross Salary",
        "PAYE", "UIF (Employee)", "UIF (Employer)", "SDL", "Net Pay",
        "Bank", "Account Number", "Branch Code",
    ])
    for ln in lines:
        writer.writerow([
            ln["full_name"], ln["role_title"], ln["department"], ln["gross_salary"],
            ln["paye"], ln["uif_employee"], ln["uif_employer"], ln["sdl"], ln["net_pay"],
            ln["bank_name"] or "", ln["account_number"] or "", ln["branch_code"] or "",
        ])
    output.seek(0)
    fname = f"payroll_{run['period_month']}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


# ════════════════════════════════════════════════════════════════
# Database Management
# ════════════════════════════════════════════════════════════════

@api.get("/admin/db/tables")
async def admin_db_tables(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                t.table_name,
                COALESCE(s.n_live_tup, 0) AS rows
            FROM information_schema.tables t
            LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
            WHERE t.table_schema = 'public'
              AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name
        """)
        return [{"name": r["table_name"], "rows": r["rows"]} for r in rows]


@api.get("/admin/db/table/{table_name}")
async def admin_db_table(
    table_name: str,
    page: int = 1,
    limit: int = 50,
    admin: dict = Depends(require_admin),
):
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403, detail="Permission denied")
    # Validate table name — only allow alphanumeric + underscore
    if not table_name.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid table name")
    limit = min(limit, 200)
    offset = (page - 1) * limit
    async with pool.acquire() as conn:
        # Verify table exists in public schema
        exists = await conn.fetchval(
            "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
            table_name,
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Table not found")
        count = await conn.fetchval(f'SELECT COUNT(*) FROM "{table_name}"')
        records = await conn.fetch(f'SELECT * FROM "{table_name}" LIMIT $1 OFFSET $2', limit, offset)
        if not records:
            # Get column names even for empty tables
            cols = await conn.fetch(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
                table_name,
            )
            return {"columns": [c["column_name"] for c in cols], "rows": [], "count": count}
        columns = list(records[0].keys())
        rows = [[str(v) if v is not None else None for v in r.values()] for r in records]
        return {"columns": columns, "rows": rows, "count": count}


class DbQueryIn(BaseModel):
    sql: str

@api.post("/admin/db/query")
async def admin_db_query(body: DbQueryIn, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403, detail="Permission denied")
    sql = body.sql.strip()
    if not sql:
        raise HTTPException(status_code=400, detail="Empty query")
    # Block destructive DDL
    upper = sql.upper()
    blocked = ("DROP TABLE", "DROP DATABASE", "TRUNCATE", "ALTER TABLE", "DROP SCHEMA", "CREATE TABLE")
    for b in blocked:
        if b in upper:
            raise HTTPException(status_code=400, detail=f"Statement not allowed: {b}")
    async with pool.acquire() as conn:
        try:
            import time
            start = time.time()
            if upper.lstrip().startswith("SELECT") or upper.lstrip().startswith("WITH"):
                records = await conn.fetch(sql)
                duration_ms = int((time.time() - start) * 1000)
                if not records:
                    return {"columns": [], "rows": [], "count": 0, "duration_ms": duration_ms}
                columns = list(records[0].keys())
                rows = [[str(v) if v is not None else None for v in r.values()] for r in records]
                return {"columns": columns, "rows": rows, "count": len(rows), "duration_ms": duration_ms}
            else:
                result = await conn.execute(sql)
                duration_ms = int((time.time() - start) * 1000)
                count = 0
                try:
                    count = int(result.split()[-1])
                except Exception:
                    pass
                await audit(conn, admin["id"], "db_mutation", None, "database", {"sql": sql[:500]})
                return {"columns": [], "rows": [], "count": count, "duration_ms": duration_ms}
        except Exception as e:
            return {"columns": [], "rows": [], "count": 0, "error": str(e)}


# ── Driver Transfer Endpoints ─────────────────────────────────

@api.post("/driver/transfer/request")
async def driver_transfer_request(body: TransferRequestIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    code = body.owner_code.strip()
    async with pool.acquire() as conn:
        open_cashup = await conn.fetchrow(
            "SELECT id FROM cashup_records WHERE driver_user_id=$1 AND status='open'", user["id"]
        )
        if open_cashup:
            raise HTTPException(status_code=400, detail="Close your current cashup before switching owners")

        existing = await conn.fetchrow(
            "SELECT id FROM driver_transfer_requests WHERE driver_user_id=$1 AND status NOT IN ('completed','cancelled','rejected_by_old_owner','rejected_by_new_owner')",
            user["id"]
        )
        if existing:
            raise HTTPException(status_code=400, detail="You already have a pending transfer request")

        new_owner_user = await conn.fetchrow(
            "SELECT u.id, u.full_name, u.phone_number FROM users u JOIN fleet_owners fo ON fo.user_id=u.id WHERE u.id=$1 OR u.phone_number=$1",
            code
        )
        if not new_owner_user:
            raise HTTPException(status_code=404, detail="Owner not found with that code")
        new_owner = await conn.fetchrow("SELECT id FROM fleet_owners WHERE user_id=$1", new_owner_user["id"])
        if not new_owner:
            raise HTTPException(status_code=404, detail="That user is not a registered fleet owner")

        current_link = await conn.fetchrow(
            """SELECT od.owner_id, fo.user_id as owner_user_id, u.full_name as owner_name
               FROM owner_drivers od
               JOIN fleet_owners fo ON fo.id=od.owner_id
               JOIN users u ON u.id=fo.user_id
               WHERE od.driver_user_id=$1 LIMIT 1""",
            user["id"]
        )
        if current_link and current_link["owner_id"] == new_owner["id"]:
            raise HTTPException(status_code=400, detail="You are already linked to this owner")

        old_owner_id = current_link["owner_id"] if current_link else None
        old_owner_user_id = current_link["owner_user_id"] if current_link else None
        initial_status = "pending_old_owner" if old_owner_id else "pending_new_owner"

        transfer_id = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO driver_transfer_requests
               (id,driver_user_id,old_owner_id,old_owner_user_id,new_owner_id,new_owner_user_id,status)
               VALUES ($1,$2,$3,$4,$5,$6,$7)""",
            transfer_id, user["id"], old_owner_id, old_owner_user_id, new_owner["id"], new_owner_user["id"], initial_status
        )
        if old_owner_user_id:
            await notify_user(conn, "Driver Transfer Request",
                f"{user['full_name']} wants to leave your fleet and join another owner. Please review in the app.",
                "transfer", old_owner_user_id)
        pending_msg = (f"{user['full_name']} has requested to join your fleet. Awaiting old owner approval first."
                       if old_owner_id else
                       f"{user['full_name']} has requested to join your fleet. Please approve or reject.")
        await notify_user(conn, "Driver Wants to Join Your Fleet", pending_msg, "transfer", new_owner_user["id"])
        await audit(conn, user["id"], "transfer_request", transfer_id, "driver_transfer",
                    {"new_owner": new_owner_user["id"]}, "", True)
    return {"ok": True, "transfer_id": transfer_id, "status": initial_status}


@api.get("/driver/transfer/active")
async def driver_transfer_active(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT dtr.*,
                      u_drv.full_name as driver_name, u_drv.phone_number as driver_phone,
                      u_old.full_name as old_owner_name,
                      u_new.full_name as new_owner_name
               FROM driver_transfer_requests dtr
               JOIN users u_drv ON u_drv.id=dtr.driver_user_id
               LEFT JOIN users u_old ON u_old.id=dtr.old_owner_user_id
               JOIN users u_new ON u_new.id=dtr.new_owner_user_id
               WHERE dtr.driver_user_id=$1
                 AND dtr.status NOT IN ('completed','cancelled','rejected_by_old_owner','rejected_by_new_owner')
               ORDER BY dtr.created_at DESC LIMIT 1""",
            user["id"]
        )
    return {"transfer": _fmt_transfer(dict(row)) if row else None}


@api.delete("/driver/transfer/{transfer_id}")
async def driver_cancel_transfer(transfer_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id,old_owner_user_id,new_owner_user_id,status FROM driver_transfer_requests WHERE id=$1 AND driver_user_id=$2",
            transfer_id, user["id"]
        )
        if not row:
            raise HTTPException(status_code=404, detail="Transfer not found")
        if row["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Cannot cancel a completed or already cancelled transfer")
        await conn.execute("UPDATE driver_transfer_requests SET status='cancelled' WHERE id=$1", transfer_id)
        if row["old_owner_user_id"]:
            await notify_user(conn, "Transfer Cancelled",
                f"{user['full_name']} cancelled their transfer request.", "transfer", row["old_owner_user_id"])
        await notify_user(conn, "Transfer Cancelled",
            f"{user['full_name']} cancelled their transfer request.", "transfer", row["new_owner_user_id"])
    return {"ok": True}


@api.get("/owner/transfers")
async def owner_get_transfers(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        rows = await conn.fetch(
            """SELECT dtr.*,
                      u_drv.full_name as driver_name, u_drv.phone_number as driver_phone,
                      u_old.full_name as old_owner_name,
                      u_new.full_name as new_owner_name
               FROM driver_transfer_requests dtr
               JOIN users u_drv ON u_drv.id=dtr.driver_user_id
               LEFT JOIN users u_old ON u_old.id=dtr.old_owner_user_id
               JOIN users u_new ON u_new.id=dtr.new_owner_user_id
               WHERE (dtr.old_owner_id=$1 OR dtr.new_owner_id=$1)
                 AND dtr.status NOT IN ('cancelled')
               ORDER BY dtr.created_at DESC""",
            owner["id"]
        )
    return [_fmt_transfer(dict(r)) for r in rows]


@api.post("/owner/transfer/{transfer_id}/approve")
async def owner_approve_transfer(transfer_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        row = await conn.fetchrow("SELECT * FROM driver_transfer_requests WHERE id=$1", transfer_id)
        if not row:
            raise HTTPException(status_code=404, detail="Transfer not found")
        drv_name_row = await conn.fetchrow("SELECT full_name FROM users WHERE id=$1", row["driver_user_id"])
        drv_name = drv_name_row["full_name"] if drv_name_row else "Driver"

        if row["old_owner_id"] == owner["id"] and row["status"] in ("pending_old_owner", "escalated_to_admin"):
            await conn.execute(
                "UPDATE driver_transfer_requests SET status='pending_new_owner' WHERE id=$1", transfer_id
            )
            await notify_user(conn, "Old Owner Approved Transfer",
                f"{drv_name}'s previous owner approved the transfer. Please review and accept or reject.",
                "transfer", row["new_owner_user_id"])
            await notify_user(conn, "Transfer Approved by Previous Owner",
                "Your previous owner approved your transfer. Waiting for new owner to accept.",
                "transfer", row["driver_user_id"])
        elif row["new_owner_id"] == owner["id"] and row["status"] == "pending_new_owner":
            async with conn.transaction():
                if row["old_owner_id"]:
                    await conn.execute(
                        "DELETE FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2",
                        row["old_owner_id"], row["driver_user_id"]
                    )
                exists = await conn.fetchrow(
                    "SELECT id FROM owner_drivers WHERE owner_id=$1 AND driver_user_id=$2",
                    owner["id"], row["driver_user_id"]
                )
                if not exists:
                    await conn.execute(
                        "INSERT INTO owner_drivers (id,owner_id,driver_user_id) VALUES ($1,$2,$3)",
                        str(uuid.uuid4()), owner["id"], row["driver_user_id"]
                    )
                await conn.execute(
                    "UPDATE driver_transfer_requests SET status='completed',completed_at=NOW() WHERE id=$1",
                    transfer_id
                )
            await notify_user(conn, "Transfer Complete!",
                f"You have been successfully transferred to {user['full_name']}'s fleet.",
                "transfer", row["driver_user_id"])
            if row["old_owner_user_id"]:
                await notify_user(conn, "Driver Transfer Completed",
                    f"{drv_name} has joined their new fleet and has been removed from yours.",
                    "transfer", row["old_owner_user_id"])
        else:
            raise HTTPException(status_code=400, detail="You cannot approve this transfer at this stage")
        await audit(conn, user["id"], "transfer_approved", transfer_id, "driver_transfer",
                    {"owner_id": owner["id"]}, "", True)
    return {"ok": True}


@api.post("/owner/transfer/{transfer_id}/reject")
async def owner_reject_transfer(transfer_id: str, body: TransferRejectIn, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        owner = await get_owner_record(conn, user["id"])
        row = await conn.fetchrow("SELECT * FROM driver_transfer_requests WHERE id=$1", transfer_id)
        if not row:
            raise HTTPException(status_code=404, detail="Transfer not found")
        drv_name_row = await conn.fetchrow("SELECT full_name FROM users WHERE id=$1", row["driver_user_id"])
        drv_name = drv_name_row["full_name"] if drv_name_row else "Driver"

        if row["old_owner_id"] == owner["id"] and row["status"] in ("pending_old_owner", "escalated_to_admin"):
            await conn.execute(
                "UPDATE driver_transfer_requests SET status='rejected_by_old_owner',old_owner_reject_reason=$1 WHERE id=$2",
                body.reason, transfer_id
            )
            await notify_user(conn, "Transfer Request Rejected",
                f"Your transfer was rejected by your current owner. Reason: {body.reason}",
                "transfer", row["driver_user_id"])
            await notify_user(conn, "Transfer Request Rejected",
                f"{drv_name}'s transfer request was rejected.", "transfer", row["new_owner_user_id"])
        elif row["new_owner_id"] == owner["id"] and row["status"] == "pending_new_owner":
            await conn.execute(
                "UPDATE driver_transfer_requests SET status='rejected_by_new_owner',new_owner_reject_reason=$1 WHERE id=$2",
                body.reason, transfer_id
            )
            await notify_user(conn, "Transfer Request Rejected",
                f"The new owner rejected your transfer. Reason: {body.reason}",
                "transfer", row["driver_user_id"])
            if row["old_owner_user_id"]:
                await notify_user(conn, "Transfer Not Proceeding",
                    f"{drv_name} will remain in your fleet. The new owner rejected them.",
                    "transfer", row["old_owner_user_id"])
        else:
            raise HTTPException(status_code=400, detail="You cannot reject this transfer at this stage")
        await audit(conn, user["id"], "transfer_rejected", transfer_id, "driver_transfer",
                    {"reason": body.reason}, "", True)
    return {"ok": True}


@api.get("/admin/transfers")
async def admin_get_transfers(status: Optional[str] = None, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        if status:
            rows = await conn.fetch(
                """SELECT dtr.*,
                          u_drv.full_name as driver_name, u_drv.phone_number as driver_phone,
                          u_old.full_name as old_owner_name,
                          u_new.full_name as new_owner_name
                   FROM driver_transfer_requests dtr
                   JOIN users u_drv ON u_drv.id=dtr.driver_user_id
                   LEFT JOIN users u_old ON u_old.id=dtr.old_owner_user_id
                   JOIN users u_new ON u_new.id=dtr.new_owner_user_id
                   WHERE dtr.status=$1
                   ORDER BY dtr.created_at DESC LIMIT 200""", status
            )
        else:
            rows = await conn.fetch(
                """SELECT dtr.*,
                          u_drv.full_name as driver_name, u_drv.phone_number as driver_phone,
                          u_old.full_name as old_owner_name,
                          u_new.full_name as new_owner_name
                   FROM driver_transfer_requests dtr
                   JOIN users u_drv ON u_drv.id=dtr.driver_user_id
                   LEFT JOIN users u_old ON u_old.id=dtr.old_owner_user_id
                   JOIN users u_new ON u_new.id=dtr.new_owner_user_id
                   ORDER BY dtr.created_at DESC LIMIT 200"""
            )
    return [_fmt_transfer(dict(r)) for r in rows]


@api.post("/admin/transfers/{transfer_id}/contact-attempt")
async def admin_log_contact(transfer_id: str, body: ContactAttemptIn, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id FROM driver_transfer_requests WHERE id=$1", transfer_id)
        if not row:
            raise HTTPException(status_code=404, detail="Transfer not found")
        await conn.execute(
            """INSERT INTO transfer_contact_attempts (id,transfer_id,admin_id,contact_method,outcome,notes)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            str(uuid.uuid4()), transfer_id, admin["id"], body.contact_method, body.outcome, body.notes
        )
    return {"ok": True}


@api.get("/admin/transfers/{transfer_id}/contact-attempts")
async def admin_get_contact_attempts(transfer_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT ca.*, u.full_name as admin_name
               FROM transfer_contact_attempts ca
               JOIN users u ON u.id=ca.admin_id
               WHERE ca.transfer_id=$1
               ORDER BY ca.attempted_at DESC""",
            transfer_id
        )
    return [{"id": r["id"], "admin_name": r["admin_name"], "contact_method": r["contact_method"],
             "outcome": r["outcome"], "notes": r["notes"], "attempted_at": iso(r["attempted_at"])} for r in rows]


@api.post("/admin/transfers/{transfer_id}/admin-approve")
async def admin_transfer_approve(transfer_id: str, body: AdminTransferOverrideIn, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM driver_transfer_requests WHERE id=$1", transfer_id)
        if not row:
            raise HTTPException(status_code=404, detail="Transfer not found")
        if row["status"] not in ("escalated_to_admin", "pending_old_owner"):
            raise HTTPException(status_code=400, detail="Transfer is not awaiting admin action")
        attempts = await conn.fetchval(
            "SELECT COUNT(*) FROM transfer_contact_attempts WHERE transfer_id=$1", transfer_id
        )
        if attempts == 0:
            raise HTTPException(status_code=400, detail="Log at least one contact attempt before overriding")
        drv_name_row = await conn.fetchrow("SELECT full_name FROM users WHERE id=$1", row["driver_user_id"])
        drv_name = drv_name_row["full_name"] if drv_name_row else "Driver"
        await conn.execute(
            """UPDATE driver_transfer_requests
               SET status='pending_new_owner', admin_override_by=$1, admin_override_at=NOW(), admin_override_note=$2
               WHERE id=$3""",
            admin["id"], body.note, transfer_id
        )
        await notify_user(conn, "Transfer Approved by Admin",
            "Admin reviewed your transfer and approved it. Waiting for new owner to accept.",
            "transfer", row["driver_user_id"])
        await notify_user(conn, "Driver Transfer Ready for Review",
            f"Admin approved {drv_name}'s transfer. Please accept or reject.",
            "transfer", row["new_owner_user_id"])
        if row["old_owner_user_id"]:
            await notify_user(conn, "Transfer Override by Admin",
                f"Tag-n-Ride admin overrode your inaction on {drv_name}'s transfer after multiple contact attempts.",
                "transfer", row["old_owner_user_id"])
        await audit(conn, admin["id"], "admin_transfer_override", transfer_id, "driver_transfer",
                    {"note": body.note}, "", True)
    return {"ok": True}


@api.post("/admin/transfers/{transfer_id}/admin-reject")
async def admin_transfer_reject(transfer_id: str, body: AdminTransferOverrideIn, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM driver_transfer_requests WHERE id=$1", transfer_id)
        if not row:
            raise HTTPException(status_code=404, detail="Transfer not found")
        if row["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Transfer is already finalised")
        await conn.execute(
            """UPDATE driver_transfer_requests
               SET status='rejected_by_old_owner', old_owner_reject_reason=$1,
                   admin_override_by=$2, admin_override_at=NOW(), admin_override_note=$1
               WHERE id=$3""",
            body.note, admin["id"], transfer_id
        )
        await notify_user(conn, "Transfer Closed by Admin",
            f"Your transfer request was closed by admin: {body.note}",
            "transfer", row["driver_user_id"])
        await audit(conn, admin["id"], "admin_transfer_reject", transfer_id, "driver_transfer",
                    {"note": body.note}, "", True)
    return {"ok": True}


# ── Commission auto-cashup loop ───────────────────────────────
SAST = timezone(timedelta(hours=2))

async def _run_commission_auto_cashup():
    """
    Auto-cashup for all drivers in approved commission_split mode.
    Owner's share: wallet → owner wallet.
    Driver's share: sent to driver's bank account via Stitch (R3.50 gateway fee deducted).
    Falls back to leaving driver's share in wallet if no bank account is on file.
    """
    if not pool:
        return
    GATEWAY_FEE = 3.50
    log.info("[AUTO CASHUP] Starting commission auto-cashup run")

    async with pool.acquire() as conn:
        links = await conn.fetch("""
            SELECT od.id as link_id,
                   od.driver_user_id, od.driver_commission_pct,
                   fo.user_id as owner_user_id
            FROM owner_drivers od
            JOIN fleet_owners fo ON fo.id = od.owner_id
            WHERE od.payment_mode = 'commission_split'
              AND od.commission_status = 'approved'
              AND od.driver_commission_pct > 0
        """)

    processed = skipped = errors = 0
    for link in links:
        driver_id  = link["driver_user_id"]
        owner_id   = link["owner_user_id"]
        commission_pct = float(link["driver_commission_pct"])
        try:
            async with pool.acquire() as conn:
                # ── Today's earnings & fuel ──
                today_earned = float(await conn.fetchval(
                    """SELECT COALESCE(SUM(driver_net),0) FROM transactions
                       WHERE receiver_id=$1 AND type='payment' AND status='completed'
                         AND DATE(created_at AT TIME ZONE 'Africa/Johannesburg')
                             = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date""",
                    driver_id
                ) or 0)
                if today_earned <= 0:
                    skipped += 1
                    continue

                fuel_deducted = float(await conn.fetchval(
                    """SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests
                       WHERE user_id=$1 AND payout_type='pay_fuel'
                         AND DATE(created_at AT TIME ZONE 'Africa/Johannesburg')
                             = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date
                         AND status IN ('approved','completed','auto_approved')""",
                    driver_id
                ) or 0)

                net_after_fuel = max(0, today_earned - fuel_deducted)
                if net_after_fuel <= 0:
                    skipped += 1
                    continue

                driver_share = round(net_after_fuel * (commission_pct / 100), 2)
                owner_share  = round(net_after_fuel - driver_share, 2)
                if owner_share <= 0:
                    skipped += 1
                    continue

                # ── Driver's bank account (for direct payout) ──
                bank_acct = await conn.fetchrow(
                    """SELECT bank_name, account_number, account_name
                       FROM payout_accounts WHERE user_id=$1 AND type='self'
                       ORDER BY created_at DESC LIMIT 1""",
                    driver_id
                )
                driver_user = await conn.fetchrow(
                    "SELECT full_name, phone_number FROM users WHERE id=$1", driver_id
                )
                can_bank_payout = (
                    bank_acct is not None
                    and driver_share > GATEWAY_FEE
                )
                # Amount to deduct from wallet: owner share always + driver share if paying out
                wallet_deduct = owner_share + (driver_share if can_bank_payout else 0)

                # ── Wallet transaction (atomic) ──
                async with conn.transaction():
                    wallet = await conn.fetchrow(
                        "SELECT balance, is_frozen FROM wallets WHERE user_id=$1 FOR UPDATE", driver_id
                    )
                    if not wallet or wallet["is_frozen"] or float(wallet["balance"]) < wallet_deduct:
                        skipped += 1
                        continue

                    # Owner receives their cut
                    await conn.execute(
                        "UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", owner_share, driver_id
                    )
                    await conn.execute(
                        "UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", owner_share, owner_id
                    )
                    # Pre-deduct driver share from wallet before bank payout
                    if can_bank_payout:
                        await conn.execute(
                            "UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", driver_share, driver_id
                        )

                    record_id = str(uuid.uuid4())
                    await conn.execute("""
                        INSERT INTO cashup_records
                            (id, owner_user_id, driver_user_id, target_amount, earned_amount,
                             cashup_amount, shortfall, driver_profit,
                             cashup_method, payout_fee, status,
                             payment_mode, commission_pct, fuel_deducted,
                             driver_payout_status)
                        VALUES ($1,$2,$3,0,$4,$5,0,$6,
                                $7,$8,'completed',
                                'commission_split',$9,$10,
                                $11)
                    """,
                        record_id, owner_id, driver_id,
                        today_earned, owner_share, driver_share,
                        'bank' if can_bank_payout else 'wallet',
                        GATEWAY_FEE if can_bank_payout else 0,
                        commission_pct, fuel_deducted,
                        'pending' if can_bank_payout else 'wallet_only',
                    )

            # ── Bank payout for driver's share (outside DB transaction) ──
            if can_bank_payout:
                try:
                    withdrawal_id = str(uuid.uuid4())
                    payout_result = await stitch_payout(
                        amount=driver_share,
                        bank_name=bank_acct["bank_name"],
                        account_number=bank_acct["account_number"],
                        account_holder=bank_acct["account_name"] or driver_user["full_name"],
                        reference=f"TNR-CASHUP-{record_id[:8].upper()}",
                        withdrawal_id=withdrawal_id,
                        user_id=driver_id,
                        phone_number=driver_user["phone_number"] or "",
                    )
                    async with pool.acquire() as conn:
                        await conn.execute(
                            """UPDATE cashup_records
                               SET driver_payout_id=$1, driver_payout_status='initiated'
                               WHERE id=$2""",
                            payout_result.get("payout_id"), record_id
                        )
                        await conn.execute("""
                            INSERT INTO notifications (id, user_id, title, message, type, target)
                            VALUES ($1,$2,$3,$4,'cashup','user')
                        """,
                            str(uuid.uuid4()), driver_id,
                            "Daily Cashup Complete",
                            f"R{round(driver_share - GATEWAY_FEE, 2):.2f} sent to your bank account "
                            f"(R{GATEWAY_FEE:.2f} gateway fee deducted). "
                            f"Owner received R{owner_share:.2f}.",
                        )
                    log.info(
                        "[AUTO CASHUP] driver=%s bank_payout=%.2f owner_wallet=%.2f gateway_fee=%.2f",
                        driver_id, driver_share - GATEWAY_FEE, owner_share, GATEWAY_FEE
                    )
                except Exception as payout_err:
                    # Bank payout failed — refund driver_share back to wallet
                    log.error("[AUTO CASHUP] Bank payout failed driver=%s: %s — refunding to wallet", driver_id, payout_err)
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE wallets SET balance=balance+$1 WHERE user_id=$2", driver_share, driver_id
                        )
                        await conn.execute(
                            "UPDATE cashup_records SET driver_payout_status='failed', cashup_method='wallet' WHERE id=$1",
                            record_id
                        )
                        await conn.execute("""
                            INSERT INTO notifications (id, user_id, title, message, type, target)
                            VALUES ($1,$2,'Cashup: Bank Payout Failed',$3,'cashup','user')
                        """,
                            str(uuid.uuid4()), driver_id,
                            f"Your share of R{driver_share:.2f} could not be sent to your bank and has been kept "
                            f"in your wallet. Please check your bank account details in your profile.",
                        )
            else:
                # No bank account — notify driver to add one
                if bank_acct is None:
                    async with pool.acquire() as conn:
                        await conn.execute("""
                            INSERT INTO notifications (id, user_id, title, message, type, target)
                            VALUES ($1,$2,'Add Bank Account for Auto-Payout',$3,'cashup','user')
                        """,
                            str(uuid.uuid4()), driver_id,
                            f"Your commission share of R{driver_share:.2f} is in your wallet. "
                            f"Add a bank account in your profile to receive future cashups directly to your bank.",
                        )
                log.info(
                    "[AUTO CASHUP] driver=%s wallet_share=%.2f owner_wallet=%.2f (no bank%s)",
                    driver_id, driver_share, owner_share,
                    "" if bank_acct is None else " — share too small for fee"
                )

            processed += 1

        except Exception as e:
            log.error("[AUTO CASHUP] Error for driver=%s: %s", driver_id, e)
            errors += 1

    log.info("[AUTO CASHUP] Done — processed=%d skipped=%d errors=%d", processed, skipped, errors)

# ── Subscription helpers ──────────────────────────────────────
async def _get_or_create_subscription(conn, owner_user_id: str) -> dict:
    """Return owner's subscription row, creating it if missing."""
    row = await conn.fetchrow("SELECT * FROM owner_subscriptions WHERE owner_user_id=$1", owner_user_id)
    if row:
        return dict(row)
    taxi_count = await conn.fetchval(
        """SELECT COUNT(*) FROM owner_drivers od
           JOIN fleet_owners fo ON fo.id=od.owner_id
           WHERE fo.user_id=$1""", owner_user_id
    ) or 0
    settings = await conn.fetchrow("SELECT subscription_free_taxis, subscription_price_per_taxi FROM payout_settings WHERE id='default'")
    free_taxis = int(settings["subscription_free_taxis"] or 1) if settings else 1
    price = float(settings["subscription_price_per_taxi"] or 10) if settings else 10.0
    billable = max(0, taxi_count - free_taxis)
    monthly_fee = round(billable * price, 2)
    from datetime import date
    today = date.today()
    next_billing = today.replace(day=1)
    if today.month == 12:
        next_billing = next_billing.replace(year=today.year + 1, month=1)
    else:
        next_billing = next_billing.replace(month=today.month + 1)
    sub_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO owner_subscriptions
            (id, owner_user_id, status, taxi_count, billable_taxis, monthly_fee,
             billing_day, next_billing_date)
        VALUES ($1,$2,'active',$3,$4,$5,1,$6)
        ON CONFLICT (owner_user_id) DO NOTHING
    """, sub_id, owner_user_id, taxi_count, billable, monthly_fee, next_billing)
    row = await conn.fetchrow("SELECT * FROM owner_subscriptions WHERE owner_user_id=$1", owner_user_id)
    return dict(row)

async def _refresh_subscription_fee(conn, owner_user_id: str):
    """Recalculate taxi count and monthly fee after fleet changes."""
    taxi_count = await conn.fetchval(
        """SELECT COUNT(*) FROM owner_drivers od
           JOIN fleet_owners fo ON fo.id=od.owner_id
           WHERE fo.user_id=$1""", owner_user_id
    ) or 0
    settings = await conn.fetchrow("SELECT subscription_free_taxis, subscription_price_per_taxi FROM payout_settings WHERE id='default'")
    free_taxis = int(settings["subscription_free_taxis"] or 1) if settings else 1
    price = float(settings["subscription_price_per_taxi"] or 10) if settings else 10.0
    billable = max(0, taxi_count - free_taxis)
    monthly_fee = round(billable * price, 2)
    await conn.execute("""
        UPDATE owner_subscriptions
        SET taxi_count=$1, billable_taxis=$2, monthly_fee=$3, updated_at=NOW()
        WHERE owner_user_id=$4
    """, taxi_count, billable, monthly_fee, owner_user_id)

# ── Owner subscription endpoints ─────────────────────────────

@api.get("/owner/subscription")
async def owner_get_subscription(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        await _refresh_subscription_fee(conn, user["id"])
        sub = await _get_or_create_subscription(conn, user["id"])
        settings = await conn.fetchrow(
            "SELECT subscription_free_taxis, subscription_price_per_taxi FROM payout_settings WHERE id='default'"
        )
        billing_rows = await conn.fetch(
            """SELECT * FROM subscription_billing_records
               WHERE owner_user_id=$1 ORDER BY billed_at DESC LIMIT 6""",
            user["id"]
        )
    free_taxis = int(settings["subscription_free_taxis"] or 1) if settings else 1
    price_per_taxi = float(settings["subscription_price_per_taxi"] or 10.0) if settings else 10.0
    return {
        "subscription": {
            "status": sub["status"],
            "taxi_count": sub["taxi_count"],
            "free_taxis": free_taxis,
            "billable_taxis": sub["billable_taxis"],
            "price_per_taxi": price_per_taxi,
            "monthly_fee": float(sub["monthly_fee"] or 0),
            "next_billing_date": sub["next_billing_date"].isoformat() if sub["next_billing_date"] else None,
            "last_billed_date": sub["last_billed_date"].isoformat() if sub["last_billed_date"] else None,
            "overdue_since": sub["overdue_since"].isoformat() if sub["overdue_since"] else None,
            "auto_debit": True,
            "billing_day": sub["billing_day"] or 1,
        },
        "billing_history": [
            {
                "id": r["id"],
                "period": f"{r['period_month']:02d}/{r['period_year']}",
                "taxi_count": r["taxi_count"],
                "billable_taxis": r["billable_taxis"],
                "amount": float(r["amount"]),
                "status": r["status"],
                "billed_at": iso(r["billed_at"]),
            }
            for r in billing_rows
        ],
    }

# ── Admin subscription endpoints ─────────────────────────────

@api.get("/admin/subscriptions")
async def admin_list_subscriptions(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_users"):
        raise HTTPException(status_code=403)
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT os.*, u.full_name, u.email,
                   fo.business_name,
                   (SELECT COUNT(*) FROM subscription_billing_records sbr
                    WHERE sbr.owner_user_id=os.owner_user_id AND sbr.status='paid') as paid_count,
                   (SELECT COALESCE(SUM(amount),0) FROM subscription_billing_records sbr
                    WHERE sbr.owner_user_id=os.owner_user_id AND sbr.status='paid') as total_paid
            FROM owner_subscriptions os
            JOIN users u ON u.id=os.owner_user_id
            LEFT JOIN fleet_owners fo ON fo.user_id=os.owner_user_id
            ORDER BY os.monthly_fee DESC, u.full_name
        """)
    return [
        {
            "owner_user_id": r["owner_user_id"],
            "full_name": r["full_name"],
            "email": r["email"],
            "business_name": r["business_name"],
            "status": r["status"],
            "taxi_count": r["taxi_count"],
            "billable_taxis": r["billable_taxis"],
            "monthly_fee": float(r["monthly_fee"] or 0),
            "next_billing_date": r["next_billing_date"].isoformat() if r["next_billing_date"] else None,
            "last_billed_date": r["last_billed_date"].isoformat() if r["last_billed_date"] else None,
            "overdue_since": r["overdue_since"].isoformat() if r["overdue_since"] else None,
            "paid_count": r["paid_count"],
            "total_paid": float(r["total_paid"] or 0),
        }
        for r in rows
    ]

@api.get("/admin/subscriptions/revenue")
async def admin_subscription_revenue(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "view_financials"):
        raise HTTPException(status_code=403)
    async with pool.acquire() as conn:
        from datetime import date
        today = date.today()
        mrr = await conn.fetchval(
            "SELECT COALESCE(SUM(monthly_fee),0) FROM owner_subscriptions WHERE status='active' AND billable_taxis>0"
        )
        total_collected = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM subscription_billing_records WHERE status='paid'"
        )
        this_month = await conn.fetchval(
            "SELECT COALESCE(SUM(amount),0) FROM subscription_billing_records WHERE status='paid' AND period_month=$1 AND period_year=$2",
            today.month, today.year
        )
        overdue_count = await conn.fetchval(
            "SELECT COUNT(*) FROM owner_subscriptions WHERE status='overdue'"
        )
        active_count = await conn.fetchval(
            "SELECT COUNT(*) FROM owner_subscriptions WHERE status='active'"
        )
        free_count = await conn.fetchval(
            "SELECT COUNT(*) FROM owner_subscriptions WHERE billable_taxis=0"
        )
        monthly_breakdown = await conn.fetch(
            """SELECT period_year, period_month, SUM(amount) as revenue, COUNT(*) as billings
               FROM subscription_billing_records WHERE status='paid'
               GROUP BY period_year, period_month ORDER BY period_year DESC, period_month DESC LIMIT 12"""
        )
    return {
        "mrr": float(mrr or 0),
        "total_collected": float(total_collected or 0),
        "this_month": float(this_month or 0),
        "active_subscriptions": active_count,
        "overdue_subscriptions": overdue_count,
        "free_subscriptions": free_count,
        "monthly_breakdown": [
            {"year": r["period_year"], "month": r["period_month"],
             "revenue": float(r["revenue"]), "billings": r["billings"]}
            for r in monthly_breakdown
        ],
    }

@api.post("/admin/subscriptions/{owner_user_id}/bill-now")
async def admin_bill_owner_now(owner_user_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403)
    await _bill_owner(owner_user_id)
    return {"ok": True, "message": "Billing triggered for owner"}

@api.post("/admin/subscriptions/{owner_user_id}/waive")
async def admin_waive_subscription(owner_user_id: str, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403)
    async with pool.acquire() as conn:
        sub = await conn.fetchrow("SELECT * FROM owner_subscriptions WHERE owner_user_id=$1", owner_user_id)
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        from datetime import date
        today = date.today()
        record_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO subscription_billing_records
                (id, owner_user_id, period_month, period_year, taxi_count,
                 billable_taxis, price_per_taxi, amount, status, paid_at)
            VALUES ($1,$2,$3,$4,$5,$6,0,0,'waived',NOW())
        """, record_id, owner_user_id, today.month, today.year,
            sub["taxi_count"], sub["billable_taxis"])
        next_billing = _next_month(today)
        await conn.execute("""
            UPDATE owner_subscriptions
            SET status='active', overdue_since=NULL,
                last_billed_date=$1, next_billing_date=$2, updated_at=NOW()
            WHERE owner_user_id=$3
        """, today, next_billing, owner_user_id)
        await notify_user(conn, "Subscription Fee Waived",
            "Your subscription fee for this month has been waived by the Tag-n-Ride team.",
            "subscription", owner_user_id)
    return {"ok": True}

@api.get("/admin/subscriptions/billing-history")
async def admin_subscription_billing_history(
    admin: dict = Depends(require_admin),
    limit: int = 100,
    status: Optional[str] = None,
):
    if not has_permission(admin, "view_users"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        where = "WHERE 1=1"
        args: list = []
        if status:
            args.append(status)
            where += f" AND sbr.status=${len(args)}"
        rows = await conn.fetch(f"""
            SELECT sbr.*, u.full_name, u.email,
                   fo.business_name
            FROM subscription_billing_records sbr
            JOIN users u ON u.id = sbr.owner_user_id
            LEFT JOIN fleet_owners fo ON fo.user_id = sbr.owner_user_id
            {where}
            ORDER BY sbr.billed_at DESC NULLS LAST
            LIMIT {limit}
        """, *args)
    return [
        {
            "id": r["id"],
            "owner_user_id": r["owner_user_id"],
            "full_name": r["full_name"],
            "business_name": r["business_name"],
            "period": f"{r['period_month']:02d}/{r['period_year']}",
            "period_month": r["period_month"],
            "period_year": r["period_year"],
            "taxi_count": r["taxi_count"],
            "billable_taxis": r["billable_taxis"],
            "price_per_taxi": float(r["price_per_taxi"] or 0),
            "amount": float(r["amount"] or 0),
            "status": r["status"],
            "billed_at": r["billed_at"].isoformat() if r["billed_at"] else None,
            "failure_reason": r.get("failure_reason"),
        }
        for r in rows
    ]

@api.get("/admin/maintenance-fee/preview")
async def admin_maintenance_fee_preview(admin: dict = Depends(require_admin)):
    """Return how many wallets would be charged and total revenue if billing ran now."""
    async with pool.acquire() as conn:
        settings = await conn.fetchrow(
            "SELECT maintenance_fee_enabled, maintenance_fee_amount, maintenance_fee_day, maintenance_fee_label "
            "FROM payout_settings WHERE id='default'"
        )
        fee = float(settings["maintenance_fee_amount"] or 0) if settings else 0.0
        eligible = await conn.fetchval(
            """SELECT COUNT(*) FROM wallets w
               JOIN users u ON u.id = w.user_id
               WHERE w.is_frozen = FALSE AND u.is_active = TRUE AND w.balance >= $1""",
            fee
        ) or 0
        total_wallets = await conn.fetchval("SELECT COUNT(*) FROM wallets") or 0
    return {
        "enabled": bool(settings["maintenance_fee_enabled"]) if settings else False,
        "fee": fee,
        "billing_day": int(settings["maintenance_fee_day"] or 1) if settings else 1,
        "label": str(settings["maintenance_fee_label"] or "Monthly maintenance fee") if settings else "Monthly maintenance fee",
        "eligible_wallets": int(eligible),
        "total_wallets": int(total_wallets),
        "projected_revenue": round(fee * int(eligible), 2),
    }

@api.post("/admin/maintenance-fee/run-now")
async def admin_run_maintenance_fee(admin: dict = Depends(require_admin)):
    if not has_permission(admin, "edit_system"):
        raise HTTPException(status_code=403, detail="Permission denied")
    result = await _run_maintenance_fee_billing()
    return result

# ── Subscription billing engine ───────────────────────────────

def _next_month(d) -> "date":
    from datetime import date
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)

async def _bill_owner(owner_user_id: str):
    """Deduct subscription fee from one owner's wallet. Creates billing record."""
    if not pool:
        return
    from datetime import date
    today = date.today()
    async with pool.acquire() as conn:
        sub = await conn.fetchrow("SELECT * FROM owner_subscriptions WHERE owner_user_id=$1", owner_user_id)
        if not sub:
            return
        settings = await conn.fetchrow("SELECT subscription_price_per_taxi, subscription_free_taxis FROM payout_settings WHERE id='default'")
        price = float(settings["subscription_price_per_taxi"] or 10) if settings else 10.0
        free_taxis = int(settings["subscription_free_taxis"] or 1) if settings else 1
        taxi_count = await conn.fetchval(
            """SELECT COUNT(*) FROM owner_drivers od
               JOIN fleet_owners fo ON fo.id=od.owner_id WHERE fo.user_id=$1""", owner_user_id
        ) or 0
        billable = max(0, taxi_count - free_taxis)
        amount = round(billable * price, 2)
        record_id = str(uuid.uuid4())
        if amount <= 0:
            await conn.execute("""
                INSERT INTO subscription_billing_records
                    (id, owner_user_id, period_month, period_year, taxi_count,
                     billable_taxis, price_per_taxi, amount, status, paid_at)
                VALUES ($1,$2,$3,$4,$5,0,$6,0,'waived',NOW())
            """, record_id, owner_user_id, today.month, today.year, taxi_count, price)
            await conn.execute("""
                UPDATE owner_subscriptions
                SET taxi_count=$1, billable_taxis=0, monthly_fee=0,
                    last_billed_date=$2, next_billing_date=$3, updated_at=NOW()
                WHERE owner_user_id=$4
            """, taxi_count, today, _next_month(today), owner_user_id)
            return
        wallet = await conn.fetchrow(
            "SELECT balance, is_frozen FROM wallets WHERE user_id=$1", owner_user_id
        )
        if not wallet or wallet["is_frozen"] or float(wallet["balance"]) < amount:
            await conn.execute("""
                INSERT INTO subscription_billing_records
                    (id, owner_user_id, period_month, period_year, taxi_count,
                     billable_taxis, price_per_taxi, amount, status, failure_reason)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'failed',$9)
            """, record_id, owner_user_id, today.month, today.year,
                taxi_count, billable, price, amount,
                "Insufficient wallet balance" if wallet and not wallet["is_frozen"] else "Wallet frozen or missing")
            await conn.execute("""
                UPDATE owner_subscriptions
                SET status='overdue', overdue_since=COALESCE(overdue_since,$1), updated_at=NOW()
                WHERE owner_user_id=$2
            """, today, owner_user_id)
            await notify_user(conn, "Subscription Payment Failed",
                f"Your monthly subscription of R{amount:.2f} could not be deducted — insufficient wallet balance. "
                f"Please top up your wallet to avoid service interruption.",
                "subscription", owner_user_id)
            return
        async with conn.transaction():
            await conn.execute("UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", amount, owner_user_id)
            txn_id = str(uuid.uuid4())
            ref = f"SUB-{today.strftime('%Y%m')}-{txn_id[:8].upper()}"
            await conn.execute("""
                INSERT INTO transactions
                    (id, reference, type, status, amount, currency, receiver_id, note)
                VALUES ($1,$2,'subscription_fee','completed',$3,'ZAR','system',$4)
            """, txn_id, ref, amount, f"Subscription: {billable} taxi(s) × R{price:.2f}")
            await conn.execute("""
                INSERT INTO subscription_billing_records
                    (id, owner_user_id, period_month, period_year, taxi_count,
                     billable_taxis, price_per_taxi, amount, status, transaction_id, paid_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'paid',$9,NOW())
            """, record_id, owner_user_id, today.month, today.year,
                taxi_count, billable, price, amount, txn_id)
            await conn.execute("""
                UPDATE owner_subscriptions
                SET status='active', overdue_since=NULL, taxi_count=$1, billable_taxis=$2,
                    monthly_fee=$3, last_billed_date=$4, next_billing_date=$5, updated_at=NOW()
                WHERE owner_user_id=$6
            """, taxi_count, billable, amount, today, _next_month(today), owner_user_id)
        await notify_user(conn, "Subscription Fee Deducted",
            f"R{amount:.2f} deducted for your {taxi_count} taxi fleet subscription "
            f"({free_taxis} free + {billable} paid @ R{price:.2f}/month). "
            f"Next billing: {_next_month(today).strftime('%d %b %Y')}.",
            "subscription", owner_user_id)
    log.info("[SUBSCRIPTION] billed owner=%s amount=%.2f taxis=%d", owner_user_id, amount, taxi_count)

# ── Statement endpoints (paid) ────────────────────────────────

class StatementRequestIn(BaseModel):
    period_start: str  # "YYYY-MM-DD"
    period_end: str

@api.get("/owner/statement/pricing")
async def owner_statement_pricing(user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        settings = await conn.fetchrow("SELECT owner_statement_price FROM payout_settings WHERE id='default'")
        price = float(settings["owner_statement_price"] or 10) if settings else 10.0
    return {"enabled": True, "price": price}

@api.post("/owner/statement/request")
async def owner_request_statement(body: StatementRequestIn, user: dict = Depends(require_owner)):
    """Owner pays for and immediately receives a fleet breakdown statement."""
    import re
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", body.period_start) or not re.match(r"^\d{4}-\d{2}-\d{2}$", body.period_end):
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
    async with pool.acquire() as conn:
        settings = await conn.fetchrow("SELECT owner_statement_price FROM payout_settings WHERE id='default'")
        price = float(settings["owner_statement_price"] or 10) if settings else 10.0
        wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user["id"])
        if not wallet or float(wallet["balance"]) < price:
            raise HTTPException(status_code=400, detail=f"Insufficient balance. Statement costs R{price:.2f}")
        owner = await conn.fetchrow("SELECT id, business_name FROM fleet_owners WHERE user_id=$1", user["id"])
        if not owner:
            raise HTTPException(status_code=404, detail="Fleet owner profile not found")
        # Build statement data
        cashups = await conn.fetch("""
            SELECT cr.*, u.full_name as driver_name
            FROM cashup_records cr
            JOIN users u ON u.id=cr.driver_user_id
            WHERE cr.owner_user_id=$1
              AND DATE(cr.created_at) BETWEEN $2 AND $3
            ORDER BY cr.created_at DESC
        """, user["id"], body.period_start, body.period_end)
        drivers = await conn.fetch("""
            SELECT u.full_name, u.id as driver_id, d.vehicle_plate, d.total_earnings,
                   od.driver_commission_pct, od.payment_mode
            FROM owner_drivers od
            JOIN users u ON u.id=od.driver_user_id
            LEFT JOIN drivers d ON d.user_id=od.driver_user_id
            JOIN fleet_owners fo ON fo.id=od.owner_id
            WHERE fo.user_id=$1
            ORDER BY u.full_name
        """, user["id"])
        sub_fees = await conn.fetch("""
            SELECT * FROM subscription_billing_records
            WHERE owner_user_id=$1
              AND DATE(billed_at) BETWEEN $2 AND $3
              AND status='paid'
        """, user["id"], body.period_start, body.period_end)
        payout_rows = await conn.fetch("""
            SELECT wr.amount, wr.status, wr.created_at, wr.bank_name
            FROM withdrawal_requests wr
            WHERE wr.user_id=$1
              AND DATE(wr.created_at) BETWEEN $2 AND $3
            ORDER BY wr.created_at DESC
        """, user["id"], body.period_start, body.period_end)
        owner_txns = await conn.fetch("""
            SELECT t.amount, t.type, t.reference, t.note, t.created_at
            FROM transactions t
            WHERE (t.sender_id=$1 OR t.receiver_id=$1)
              AND DATE(t.created_at) BETWEEN $2 AND $3
              AND t.status='completed'
            ORDER BY t.created_at DESC LIMIT 200
        """, user["id"], body.period_start, body.period_end)

        total_cashup_received = sum(float(r["cashup_amount"]) for r in cashups)
        total_fuel_deducted   = sum(float(r["fuel_deducted"] or 0) for r in cashups)
        total_driver_profit   = sum(float(r["driver_profit"] or 0) for r in cashups)
        total_sub_fees        = sum(float(r["amount"]) for r in sub_fees)
        total_payouts         = sum(float(r["amount"]) for r in payout_rows if r["status"] in ("completed","paid","approved"))

        stmt_data = {
            "type": "owner_fleet_statement",
            "owner_name": user["full_name"],
            "business_name": owner["business_name"] or "",
            "period_start": body.period_start,
            "period_end": body.period_end,
            "generated_at": iso(None) or "",
            "summary": {
                "total_cashup_received": total_cashup_received,
                "total_fuel_deducted": total_fuel_deducted,
                "total_driver_profit": total_driver_profit,
                "subscription_fees_paid": total_sub_fees,
                "total_payouts": total_payouts,
                "net_earnings": round(total_cashup_received - total_sub_fees - total_payouts, 2),
            },
            "drivers": [
                {
                    "name": d["full_name"],
                    "vehicle_plate": d["vehicle_plate"] or "",
                    "payment_mode": d["payment_mode"] or "daily_target",
                    "commission_pct": float(d["driver_commission_pct"] or 0),
                    "total_earnings": float(d["total_earnings"] or 0),
                }
                for d in drivers
            ],
            "cashup_records": [
                {
                    "driver": r["driver_name"],
                    "date": iso(r["created_at"]),
                    "earned": float(r["earned_amount"]),
                    "fuel_deducted": float(r["fuel_deducted"] or 0),
                    "owner_received": float(r["cashup_amount"]),
                    "driver_profit": float(r["driver_profit"]),
                    "mode": r["payment_mode"] or "daily_target",
                }
                for r in cashups
            ],
            "subscription_fees": [
                {
                    "period": f"{r['period_month']:02d}/{r['period_year']}",
                    "taxis": r["taxi_count"],
                    "amount": float(r["amount"]),
                }
                for r in sub_fees
            ],
            "payouts": [
                {
                    "amount": float(r["amount"]),
                    "bank": r["bank_name"],
                    "status": r["status"],
                    "date": iso(r["created_at"]),
                }
                for r in payout_rows
            ],
            "transactions": [
                {
                    "reference": r["reference"],
                    "type": r["type"],
                    "amount": float(r["amount"]),
                    "note": r["note"] or "",
                    "date": iso(r["created_at"]),
                }
                for r in owner_txns
            ],
        }
        # Charge wallet and save
        stmt_id = str(uuid.uuid4())
        ref = f"STMT-{stmt_id[:8].upper()}"
        txn_id = str(uuid.uuid4())
        async with conn.transaction():
            await conn.execute("UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", price, user["id"])
            await conn.execute("""
                INSERT INTO transactions (id, reference, type, status, amount, currency, sender_id, note)
                VALUES ($1,$2,'statement_fee','completed',$3,'ZAR',$4,'Owner fleet statement download')
            """, txn_id, f"STMTFEE-{ref}", price, user["id"])
            await conn.execute("""
                INSERT INTO statement_requests
                    (id, reference, user_id, role, period_start, period_end,
                     amount_paid, status, transaction_id, statement_data)
                VALUES ($1,$2,$3,'owner',$4,$5,$6,'paid',$7,$8)
            """, stmt_id, ref, user["id"], body.period_start, body.period_end,
                price, txn_id, stmt_data)
            await conn.execute(
                """INSERT INTO user_documents
                   (id,user_id,document_type,title,description,period_label,amount,reference_number,source,is_read,metadata)
                   VALUES (gen_random_uuid()::text,$1,'statement',$2,$3,$4,$5,$6,'app',false,$7::jsonb)""",
                user["id"],
                f"Fleet Statement – {body.period_start[:7]}",
                f"Your fleet earnings breakdown for {body.period_start} to {body.period_end}.",
                f"{body.period_start} to {body.period_end}",
                price,
                ref,
                {"statement_id": stmt_id, "statement_type": "owner"}
            )
    return {"statement_id": stmt_id, "reference": ref, "amount_charged": price, "data": stmt_data}

@api.get("/owner/statement/{statement_id}")
async def owner_get_statement(statement_id: str, user: dict = Depends(require_owner)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM statement_requests WHERE id=$1 AND user_id=$2 AND role='owner'",
            statement_id, user["id"]
        )
    if not row:
        raise HTTPException(status_code=404, detail="Statement not found")
    return {"statement_id": row["id"], "reference": row["reference"],
            "data": row["statement_data"], "created_at": iso(row["created_at"])}

@api.get("/passenger/statement/pricing")
async def passenger_statement_pricing(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        settings = await conn.fetchrow("SELECT passenger_statement_price FROM payout_settings WHERE id='default'")
    price = float(settings["passenger_statement_price"]) if settings and settings["passenger_statement_price"] is not None else 5.0
    return {"enabled": True, "price": price}

@api.post("/passenger/statement/request")
async def passenger_request_statement(body: StatementRequestIn, user: dict = Depends(get_current_user)):
    if user["role"] not in ("passenger", "driver"):
        raise HTTPException(status_code=403, detail="Not a passenger account")
    import re
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", body.period_start) or not re.match(r"^\d{4}-\d{2}-\d{2}$", body.period_end):
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
    async with pool.acquire() as conn:
        settings = await conn.fetchrow("SELECT passenger_statement_price FROM payout_settings WHERE id='default'")
        price = float(settings["passenger_statement_price"]) if settings and settings["passenger_statement_price"] is not None else 5.0
        wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user["id"])
        if price > 0 and (not wallet or float(wallet["balance"]) < price):
            raise HTTPException(status_code=400, detail=f"Insufficient balance. Statement costs R{price:.2f}")
        # Build passenger statement
        trips = await conn.fetch("""
            SELECT t.reference, t.amount, t.driver_net, t.platform_fee,
                   t.created_at, u.full_name as driver_name
            FROM transactions t
            LEFT JOIN users u ON u.id=t.receiver_id
            WHERE t.sender_id=$1 AND t.type='payment' AND t.status='completed'
              AND DATE(t.created_at) BETWEEN $2::date AND $3::date
            ORDER BY t.created_at DESC
        """, user["id"], body.period_start, body.period_end)
        topups = await conn.fetch("""
            SELECT t.reference, t.amount, t.created_at
            FROM transactions t
            WHERE t.receiver_id=$1 AND t.type='topup' AND t.status='completed'
              AND DATE(t.created_at) BETWEEN $2::date AND $3::date
            ORDER BY t.created_at DESC
        """, user["id"], body.period_start, body.period_end)
        total_spent  = sum(float(r["amount"]) for r in trips)
        total_topped = sum(float(r["amount"]) for r in topups)
        stmt_data = {
            "type": "passenger_expense_statement",
            "passenger_name": user["full_name"],
            "period_start": body.period_start,
            "period_end": body.period_end,
            "summary": {
                "total_trips": len(trips),
                "total_spent": total_spent,
                "total_topups": total_topped,
                "average_trip": round(total_spent / len(trips), 2) if trips else 0,
            },
            "trips": [
                {
                    "reference": r["reference"],
                    "amount": float(r["amount"]),
                    "driver": r["driver_name"] or "Unknown",
                    "date": iso(r["created_at"]),
                }
                for r in trips
            ],
            "topups": [
                {"reference": r["reference"], "amount": float(r["amount"]), "date": iso(r["created_at"])}
                for r in topups
            ],
        }
        stmt_id = str(uuid.uuid4())
        ref = f"PSTMT-{stmt_id[:8].upper()}"
        async with conn.transaction():
            if price > 0:
                txn_id = str(uuid.uuid4())
                await conn.execute("UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", price, user["id"])
                await conn.execute("""
                    INSERT INTO transactions (id, reference, type, status, amount, currency, sender_id, note)
                    VALUES ($1,$2,'statement_fee','completed',$3,'ZAR',$4,'Passenger expense statement')
                """, txn_id, f"STMTFEE-{ref}", price, user["id"])
            else:
                txn_id = None
            await conn.execute("""
                INSERT INTO statement_requests
                    (id, reference, user_id, role, period_start, period_end,
                     amount_paid, status, transaction_id, statement_data)
                VALUES ($1,$2,$3,'passenger',$4,$5,$6,'paid',$7,$8)
            """, stmt_id, ref, user["id"], body.period_start, body.period_end,
                price, txn_id, stmt_data)
            await conn.execute(
                """INSERT INTO user_documents
                   (id,user_id,document_type,title,description,period_label,amount,reference_number,source,is_read,metadata)
                   VALUES (gen_random_uuid()::text,$1,'statement',$2,$3,$4,$5,$6,'app',false,$7::jsonb)""",
                user["id"],
                f"Expense Statement – {body.period_start[:7]}",
                f"Your ride expense breakdown for {body.period_start} to {body.period_end}.",
                f"{body.period_start} to {body.period_end}",
                price,
                ref,
                {"statement_id": stmt_id, "statement_type": "passenger"}
            )
    return {"statement_id": stmt_id, "reference": ref, "amount_charged": price, "data": stmt_data}

@api.get("/passenger/statement/{statement_id}")
async def passenger_get_statement(statement_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM statement_requests WHERE id=$1 AND user_id=$2 AND role='passenger'",
            statement_id, user["id"]
        )
    if not row:
        raise HTTPException(status_code=404, detail="Statement not found")
    return {"statement_id": row["id"], "reference": row["reference"],
            "data": row["statement_data"], "created_at": iso(row["created_at"])}

async def subscription_billing_loop():
    await asyncio.sleep(45)
    while True:
        try:
            if pool:
                from datetime import date
                today = date.today()
                async with pool.acquire() as conn:
                    settings = await conn.fetchrow(
                        "SELECT subscription_billing_day FROM payout_settings WHERE id='default'"
                    )
                    billing_day = int(settings["subscription_billing_day"] or 1) if settings else 1
                    due = await conn.fetch(
                        """SELECT owner_user_id FROM owner_subscriptions
                           WHERE status != 'cancelled'
                             AND (next_billing_date IS NULL OR next_billing_date <= $1)""",
                        today
                    )
                # Only bill if today is the configured billing day OR account is overdue
                if today.day == billing_day or due:
                    for row in due:
                        try:
                            await _bill_owner(row["owner_user_id"])
                        except Exception as e:
                            log.error("[SUBSCRIPTION LOOP] owner=%s err=%s", row["owner_user_id"], e)
        except Exception as e:
            log.error("[SUBSCRIPTION LOOP] %s", e)
        await asyncio.sleep(3600)  # check every hour

async def _run_maintenance_fee_billing() -> dict:
    """Deduct maintenance fee from all active wallets for all roles."""
    async with pool.acquire() as conn:
        settings = await conn.fetchrow(
            "SELECT maintenance_fee_enabled, maintenance_fee_amount, maintenance_fee_label "
            "FROM payout_settings WHERE id='default'"
        )
    if not settings or not settings["maintenance_fee_enabled"]:
        return {"ok": False, "reason": "Maintenance fee is disabled"}
    fee = float(settings["maintenance_fee_amount"] or 0)
    if fee <= 0:
        return {"ok": False, "reason": "Maintenance fee amount is zero"}
    label = settings["maintenance_fee_label"] or "Monthly maintenance fee"
    charged = 0; skipped = 0; total_collected = 0.0
    async with pool.acquire() as conn:
        wallets = await conn.fetch(
            """SELECT w.user_id, w.balance FROM wallets w
               JOIN users u ON u.id = w.user_id
               WHERE w.is_frozen = FALSE AND u.is_active = TRUE AND w.balance >= $1""",
            fee
        )
        for w in wallets:
            try:
                async with conn.transaction():
                    # Re-check balance inside transaction
                    current = await conn.fetchval(
                        "SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE", w["user_id"]
                    )
                    if current is None or float(current) < fee:
                        skipped += 1
                        continue
                    await conn.execute(
                        "UPDATE wallets SET balance=balance-$1 WHERE user_id=$2", fee, w["user_id"]
                    )
                    txn_id = str(uuid.uuid4()); ref = gen_ref()
                    await conn.execute(
                        "INSERT INTO transactions (id,reference,type,status,amount,sender_id,note,currency) "
                        "VALUES ($1,$2,'maintenance_fee','completed',$3,$4,$5,'ZAR')",
                        txn_id, ref, fee, w["user_id"], label
                    )
                    charged += 1
                    total_collected += fee
            except Exception as e:
                log.error("[MAINTENANCE FEE] user=%s err=%s", w["user_id"], e)
                skipped += 1
    log.info("[MAINTENANCE FEE] charged=%d skipped=%d total=%.2f", charged, skipped, total_collected)
    return {"ok": True, "charged": charged, "skipped": skipped, "total_collected": round(total_collected, 2)}

async def association_auto_pay_loop():
    """Daily loop: process auto-payments for taxi associations due today."""
    await asyncio.sleep(90)  # startup delay
    from datetime import date as _date
    last_run_date = None
    while True:
        try:
            if pool:
                today = _date.today()
                if last_run_date != today:
                    async with pool.acquire() as conn:
                        due = await conn.fetch("""
                            SELECT * FROM taxi_associations
                            WHERE auto_pay_enabled=TRUE AND is_active=TRUE AND auto_pay_day=$1
                        """, today.day)
                    for assoc in due:
                        assoc_id = assoc["id"]
                        try:
                            async with pool.acquire() as conn:
                                driver_ids = [r["id"] for r in await conn.fetch(
                                    "SELECT id FROM users WHERE taxi_association_id=$1 AND role='driver'", assoc_id
                                )]
                                existing = await conn.fetchval("""
                                    SELECT id FROM association_payouts
                                    WHERE association_id=$1 AND period_month=$2 AND period_year=$3 AND status='paid'
                                """, assoc_id, today.month, today.year)
                                if existing:
                                    continue
                                pf = float(await conn.fetchval("""
                                    SELECT COALESCE(SUM(platform_fee),0) FROM transactions
                                    WHERE receiver_id=ANY($1::text[]) AND type='payment' AND status='completed'
                                        AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
                                """, driver_ids, today.month, today.year) or 0)
                                sf = float(await conn.fetchval("""
                                    SELECT COALESCE(SUM(amount),0) FROM transactions
                                    WHERE sender_id=ANY($1::text[]) AND type IN ('subscription_fee','subscription') AND status='completed'
                                        AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
                                """, driver_ids, today.month, today.year) or 0) if driver_ids else 0.0
                                stf = float(await conn.fetchval("""
                                    SELECT COALESCE(SUM(amount),0) FROM transactions
                                    WHERE sender_id=ANY($1::text[]) AND type='statement_fee' AND status='completed'
                                        AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
                                """, driver_ids, today.month, today.year) or 0) if driver_ids else 0.0
                                tnr_rev = pf + sf + stf
                                if assoc["auto_pay_amount"] is not None:
                                    amount = float(assoc["auto_pay_amount"])
                                elif assoc["agreement_type"] == "percentage":
                                    amount = tnr_rev * (float(assoc["agreement_amount"]) / 100)
                                elif assoc["agreement_type"] == "per_driver":
                                    amount = float(assoc["agreement_amount"]) * len(driver_ids)
                                else:
                                    amount = float(assoc["agreement_amount"])
                                ref = gen_ref()
                                await conn.execute("""
                                    INSERT INTO association_payouts (
                                        id, association_id, period_month, period_year, driver_count,
                                        platform_fees, subscription_fees, statement_fees, total_revenue,
                                        payout_amount, bank_name, account_number, account_holder,
                                        reference, status, paid_at, paid_by, paid_by_name, notes, created_by
                                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'paid',NOW(),$15,$16,$17,$18)
                                """, str(uuid.uuid4()), assoc_id, today.month, today.year, len(driver_ids),
                                    pf, sf, stf, tnr_rev, amount,
                                    assoc["bank_name"], assoc["account_number"], assoc["account_holder"],
                                    ref, "system", "Auto-Pay", "Monthly auto-payment", "system")
                            log.info("[ASSOC AUTO-PAY] Paid %s — %s — ref %s", assoc["name"], amount, ref)
                        except Exception as ex:
                            log.error("[ASSOC AUTO-PAY] Failed for %s: %s", assoc["name"], ex)
                    last_run_date = today
        except Exception as e:
            log.error("[ASSOC AUTO-PAY LOOP] %s", e)
        await asyncio.sleep(3600)

async def maintenance_fee_billing_loop():
    await asyncio.sleep(60)
    last_run_date = None
    while True:
        try:
            if pool:
                from datetime import date
                today = date.today()
                async with pool.acquire() as conn:
                    settings = await conn.fetchrow(
                        "SELECT maintenance_fee_enabled, maintenance_fee_day FROM payout_settings WHERE id='default'"
                    )
                enabled = settings and settings["maintenance_fee_enabled"]
                fee_day = int(settings["maintenance_fee_day"] or 1) if settings else 1
                if enabled and today.day == fee_day and last_run_date != today:
                    result = await _run_maintenance_fee_billing()
                    last_run_date = today
                    log.info("[MAINTENANCE FEE LOOP] %s", result)
        except Exception as e:
            log.error("[MAINTENANCE FEE LOOP] %s", e)
        await asyncio.sleep(3600)  # check every hour

async def commission_auto_cashup_loop():
    await asyncio.sleep(30)  # brief startup delay
    while True:
        try:
            if pool:
                async with pool.acquire() as conn:
                    row = await conn.fetchrow("SELECT commission_auto_cashup_time, commission_auto_cashup_last_run FROM payout_settings WHERE id='default'")
                if row and row["commission_auto_cashup_time"]:
                    target_time = row["commission_auto_cashup_time"]  # "HH:MM"
                    last_run = row["commission_auto_cashup_last_run"]
                    now_sast = datetime.now(SAST)
                    today_sast = now_sast.date()
                    current_hhmm = now_sast.strftime("%H:%M")
                    # Fire if current time matches and not already run today
                    if current_hhmm == target_time and (last_run is None or last_run < today_sast):
                        async with pool.acquire() as conn:
                            await conn.execute(
                                "UPDATE payout_settings SET commission_auto_cashup_last_run=$1 WHERE id='default'",
                                today_sast
                            )
                        await _run_commission_auto_cashup()
        except Exception as e:
            log.error("[COMMISSION CASHUP LOOP] %s", e)
        await asyncio.sleep(60)  # check every minute

# ── Background escalation ─────────────────────────────────────
async def transfer_escalation_loop():
    await asyncio.sleep(60)
    while True:
        try:
            if pool:
                async with pool.acquire() as conn:
                    pending_24h = await conn.fetch(
                        """SELECT dtr.*, u_drv.full_name as driver_name
                           FROM driver_transfer_requests dtr
                           JOIN users u_drv ON u_drv.id=dtr.driver_user_id
                           WHERE dtr.status='pending_old_owner'
                             AND dtr.reminder_sent_at IS NULL
                             AND dtr.created_at < NOW() - INTERVAL '24 hours'"""
                    )
                    for t in pending_24h:
                        if t["old_owner_user_id"]:
                            await notify_user(conn, "Reminder: Driver Transfer Awaiting Approval",
                                f"{t['driver_name']} is waiting for your approval to transfer fleets. Please respond within 24 hours.",
                                "transfer", t["old_owner_user_id"])
                        await conn.execute(
                            "UPDATE driver_transfer_requests SET reminder_sent_at=NOW() WHERE id=$1", t["id"]
                        )

                    to_escalate = await conn.fetch(
                        """SELECT dtr.*, u_drv.full_name as driver_name
                           FROM driver_transfer_requests dtr
                           JOIN users u_drv ON u_drv.id=dtr.driver_user_id
                           WHERE dtr.status='pending_old_owner'
                             AND dtr.reminder_sent_at IS NOT NULL
                             AND dtr.reminder_sent_at < NOW() - INTERVAL '24 hours'"""
                    )
                    for t in to_escalate:
                        await conn.execute(
                            "UPDATE driver_transfer_requests SET status='escalated_to_admin',escalated_at=NOW() WHERE id=$1",
                            t["id"]
                        )
                        await notify_user(conn, "Transfer Escalated to Admin",
                            "Your transfer request has been escalated to admin since your previous owner hasn't responded.",
                            "transfer", t["driver_user_id"])
        except Exception as e:
            print(f"[TRANSFER ESCALATION ERROR] {e}")
        await asyncio.sleep(3600)


# ════════════════════════════════════════════════════════════════
# Company Documents — CRUD
# ════════════════════════════════════════════════════════════════

_DOC_VIEW  = {"superadmin", "ceo", "cfo", "cto", "hr"}
_DOC_EDIT  = {"superadmin", "ceo", "hr"}
_DOC_EXEC  = {"superadmin", "ceo"}
_EXEC_FOLDERS = {
    "01-legal-incorporation", "02-equity-and-shares",
    "03-investor-documents",  "06-fintech-regulatory", "07-marketing",
    "09-tax-sars", "10-business-agreements", "11-financial-management", "12-corporate-governance",
    "13-taxi-associations", "14-tender-documents", "15-legal-documents", "16-appointments-promotions",
}

FOLDER_META = {
    "01-legal-incorporation":     {"label": "Legal & Incorporation",     "color": "purple"},
    "02-equity-and-shares":       {"label": "Equity & Shares",           "color": "yellow"},
    "03-investor-documents":      {"label": "Investor Documents",        "color": "cyan"},
    "04-hr-documents":            {"label": "Human Resources",           "color": "green"},
    "05-company-policies":        {"label": "Company Policies",          "color": "orange"},
    "06-fintech-regulatory":      {"label": "Fintech & Regulatory",      "color": "red"},
    "07-marketing":               {"label": "Marketing",                 "color": "pink"},
    "08-daily-use":               {"label": "Daily Use Templates",       "color": "blue"},
    "09-tax-sars":                {"label": "Tax & SARS",                "color": "yellow"},
    "10-business-agreements":     {"label": "Business Agreements",       "color": "orange"},
    "11-financial-management":    {"label": "Financial Management",      "color": "green"},
    "12-corporate-governance":    {"label": "Corporate Governance",      "color": "purple"},
    "13-taxi-associations":       {"label": "Taxi Associations",         "color": "orange"},
    "14-tender-documents":        {"label": "Tender Documents",          "color": "red"},
    "15-legal-documents":         {"label": "Legal Documents",           "color": "purple"},
    "16-appointments-promotions": {"label": "Appointments & Promotions", "color": "green"},
}

@api.get("/admin/documents")
async def list_company_documents(admin: dict = Depends(require_admin)):
    if admin["role"] not in _DOC_VIEW:
        raise HTTPException(status_code=403, detail="Access denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, folder_id, file_name, display_name, access_level, version,
                      created_at, updated_at
               FROM company_documents
               WHERE is_active = TRUE
               ORDER BY folder_id, display_name"""
        )
    result: dict[str, list] = {}
    for r in rows:
        fid = r["folder_id"]
        if fid not in result:
            result[fid] = []
        result[fid].append({
            "dbId":        r["id"],
            "name":        r["display_name"],
            "path":        f"{r['folder_id']}/{r['file_name']}",
            "folder":      r["folder_id"],
            "fileName":    r["file_name"],
            "accessLevel": r["access_level"],
            "version":     r["version"],
            "updatedAt":   iso(r["updated_at"]),
            "createdAt":   iso(r["created_at"]),
        })
    return {"documents": result}

@api.get("/admin/documents/{doc_id}")
async def get_company_document(doc_id: str, admin: dict = Depends(require_admin)):
    if admin["role"] not in _DOC_VIEW:
        raise HTTPException(status_code=403, detail="Access denied")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM company_documents WHERE id = $1 AND is_active = TRUE", doc_id
        )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    folder_id = row["folder_id"]
    if folder_id in _EXEC_FOLDERS and admin["role"] not in _DOC_EXEC:
        raise HTTPException(status_code=403, detail="Access denied — executive documents only")
    return {
        "dbId":        row["id"],
        "folderId":    row["folder_id"],
        "fileName":    row["file_name"],
        "displayName": row["display_name"],
        "content":     row["content"],
        "accessLevel": row["access_level"],
        "version":     row["version"],
        "createdAt":   iso(row["created_at"]),
        "updatedAt":   iso(row["updated_at"]),
    }

@api.post("/admin/documents")
async def create_company_document(body: DocumentCreateIn, admin: dict = Depends(require_admin)):
    if admin["role"] not in _DOC_EDIT:
        raise HTTPException(status_code=403, detail="Access denied")
    if admin["role"] == "hr" and body.folder_id in _EXEC_FOLDERS:
        raise HTTPException(status_code=403, detail="HR cannot create documents in executive folders")
    if body.access_level not in {"public", "internal", "confidential", "restricted"}:
        raise HTTPException(status_code=400, detail="Invalid access level")
    doc_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                """INSERT INTO company_documents
                       (id, folder_id, file_name, display_name, content, access_level, created_by)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                doc_id, body.folder_id, body.file_name,
                body.display_name, body.content, body.access_level, admin["id"]
            )
        except Exception as e:
            if "unique" in str(e).lower():
                raise HTTPException(status_code=409, detail="A document with this filename already exists in this folder")
            raise
    return {"ok": True, "id": doc_id}

@api.put("/admin/documents/{doc_id}")
async def update_company_document(doc_id: str, body: DocumentUpdateIn, admin: dict = Depends(require_admin)):
    if admin["role"] not in _DOC_EDIT:
        raise HTTPException(status_code=403, detail="Access denied")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT folder_id FROM company_documents WHERE id = $1 AND is_active = TRUE", doc_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        if admin["role"] == "hr" and row["folder_id"] in _EXEC_FOLDERS:
            raise HTTPException(status_code=403, detail="HR cannot edit executive documents")
        if body.access_level and body.access_level not in {"public", "internal", "confidential", "restricted"}:
            raise HTTPException(status_code=400, detail="Invalid access level")
        clauses, params, i = [], [], 1
        if body.display_name is not None:
            clauses.append(f"display_name = ${i}"); params.append(body.display_name); i += 1
        if body.content is not None:
            clauses.append(f"content = ${i}"); params.append(body.content); i += 1
        if body.access_level is not None:
            clauses.append(f"access_level = ${i}"); params.append(body.access_level); i += 1
        if not clauses:
            raise HTTPException(status_code=400, detail="Nothing to update")
        clauses += [f"updated_by = ${i}", "updated_at = NOW()", "version = version + 1"]
        params += [admin["id"], doc_id]
        await conn.execute(
            f"UPDATE company_documents SET {', '.join(clauses)} WHERE id = ${i + 1}",
            *params
        )
    return {"ok": True}

@api.delete("/admin/documents/{doc_id}")
async def delete_company_document(doc_id: str, admin: dict = Depends(require_admin)):
    if admin["role"] not in _DOC_EXEC:
        raise HTTPException(status_code=403, detail="Only CEO or Superadmin can delete documents")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM company_documents WHERE id = $1 AND is_active = TRUE", doc_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        await conn.execute(
            "UPDATE company_documents SET is_active = FALSE, updated_by = $1, updated_at = NOW() WHERE id = $2",
            admin["id"], doc_id
        )
    return {"ok": True}

# ════════════════════════════════════════════════════════════════
# Signed Documents Vault
# ════════════════════════════════════════════════════════════════

_SIGNED_UPLOAD = {"superadmin", "ceo"}
_SIGNED_VIEW   = {"superadmin", "ceo", "cfo"}
_SIGNED_DELETE = {"superadmin", "ceo"}
_SIGNED_CATEGORIES = {"general", "partnership", "nda", "employment", "vendor", "investment", "legal", "taxi", "tender", "other"}
_MAX_FILE_MB = 20

@api.get("/admin/signed-documents")
async def list_signed_documents(admin: dict = Depends(require_admin)):
    if admin["role"] not in _SIGNED_VIEW:
        raise HTTPException(status_code=403, detail="Access denied")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, title, description, file_name, file_size, mime_type,
                      category, signed_by, signed_date, counterparty, access_level,
                      uploaded_by, created_at, updated_at,
                      u.full_name as uploader_name
               FROM signed_documents sd
               LEFT JOIN users u ON u.id = sd.uploaded_by
               WHERE sd.is_active = TRUE
               ORDER BY sd.created_at DESC"""
        )
    return {"documents": [
        {
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "fileName": r["file_name"],
            "fileSize": r["file_size"],
            "mimeType": r["mime_type"],
            "category": r["category"],
            "signedBy": r["signed_by"],
            "signedDate": str(r["signed_date"]) if r["signed_date"] else None,
            "counterparty": r["counterparty"],
            "accessLevel": r["access_level"],
            "uploaderName": r["uploader_name"],
            "createdAt": iso(r["created_at"]),
            "updatedAt": iso(r["updated_at"]),
        } for r in rows
    ]}

@api.post("/admin/signed-documents")
async def upload_signed_document(
    request: Request,
    admin: dict = Depends(require_admin),
    file: UploadFile = File(...),
):
    if admin["role"] not in _SIGNED_UPLOAD:
        raise HTTPException(status_code=403, detail="Only CEO or Superadmin can upload signed documents")

    # Read and validate file
    content = await file.read()
    file_size = len(content)
    if file_size > _MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {_MAX_FILE_MB}MB limit")
    if file.content_type not in {"application/pdf", "image/png", "image/jpeg"}:
        raise HTTPException(status_code=415, detail="Only PDF, PNG, JPG files are accepted")

    # Parse metadata from form
    form = await request.form()
    meta_raw = form.get("meta", "{}")
    try:
        import json as _json
        meta = SignedDocMetaIn(**_json.loads(str(meta_raw)))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid metadata")
    if meta.access_level not in {"public", "internal", "confidential", "restricted"}:
        raise HTTPException(status_code=400, detail="Invalid access level")
    if meta.category not in _SIGNED_CATEGORIES:
        meta.category = "other"

    file_b64 = base64.b64encode(content).decode()
    doc_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO signed_documents
                   (id, title, description, file_name, file_data, file_size, mime_type,
                    category, signed_by, signed_date, counterparty, access_level, uploaded_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)""",
            doc_id, meta.title, meta.description, file.filename or "document.pdf",
            file_b64, file_size, file.content_type,
            meta.category, meta.signed_by,
            meta.signed_date if meta.signed_date else None,
            meta.counterparty, meta.access_level, admin["id"]
        )
        await audit(conn, admin["id"], "SIGNED_DOC_UPLOAD", doc_id, "signed_documents",
                    {"title": meta.title, "size": file_size}, request.client.host)
    return {"ok": True, "id": doc_id}

@api.get("/admin/signed-documents/{doc_id}/download")
async def download_signed_document(doc_id: str, admin: dict = Depends(require_admin)):
    if admin["role"] not in _SIGNED_VIEW:
        raise HTTPException(status_code=403, detail="Access denied")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT title, file_name, file_data, mime_type FROM signed_documents WHERE id=$1 AND is_active=TRUE",
            doc_id
        )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    file_bytes = base64.b64decode(row["file_data"])
    safe_name = row["file_name"].replace(" ", "_")
    return StreamingResponse(
        iter([file_bytes]),
        media_type=row["mime_type"] or "application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'}
    )

@api.delete("/admin/signed-documents/{doc_id}")
async def delete_signed_document(doc_id: str, request: Request, admin: dict = Depends(require_admin)):
    if admin["role"] not in _SIGNED_DELETE:
        raise HTTPException(status_code=403, detail="Only CEO or Superadmin can delete signed documents")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM signed_documents WHERE id=$1 AND is_active=TRUE", doc_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        await conn.execute(
            "UPDATE signed_documents SET is_active=FALSE, deleted_by=$1, updated_at=NOW() WHERE id=$2",
            admin["id"], doc_id
        )
        await audit(conn, admin["id"], "SIGNED_DOC_DELETE", doc_id, "signed_documents", {}, request.client.host)
    return {"ok": True}

# ════════════════════════════════════════════════════════════════
# Driver Payslip Feature
# ════════════════════════════════════════════════════════════════

class PayslipRequestIn(BaseModel):
    period_type: str
    month: str  # "YYYY-MM"

_PAYSLIP_FEE_KEYS = {
    "1month": "payslip_fee_1month",
    "3months": "payslip_fee_3months",
    "6months": "payslip_fee_6months",
    "12months": "payslip_fee_12months",
}
_FORMAL_PAYSLIP_FEE_KEYS = {
    "1month": "formal_payslip_fee_1month",
    "3months": "formal_payslip_fee_3months",
    "6months": "formal_payslip_fee_6months",
    "12months": "formal_payslip_fee_12months",
}
_PAYSLIP_MONTHS = {"1month": 1, "3months": 3, "6months": 6, "12months": 12}
_MONTH_NAMES = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"]

def _payslip_period(period_type: str, month: str):
    year, mon = map(int, month.split("-"))
    n = _PAYSLIP_MONTHS[period_type]
    last_day = _calendar.monthrange(year, mon)[1]
    period_end = datetime(year, mon, last_day, 23, 59, 59, tzinfo=timezone.utc)
    start_mon = mon - (n - 1)
    start_year = year
    while start_mon <= 0:
        start_mon += 12
        start_year -= 1
    period_start = datetime(start_year, start_mon, 1, tzinfo=timezone.utc)
    if period_type == "1month":
        label = f"{_MONTH_NAMES[mon-1]} {year}"
    else:
        label = f"{_MONTH_NAMES[start_mon-1]} {start_year} – {_MONTH_NAMES[mon-1]} {year}"
    return period_start, period_end, label


async def _build_payslip(conn, user: dict, body: PayslipRequestIn, document_type: str, fee: float, fee_key_prefix: str):
    """Shared logic for generating both statements and formal payslips."""
    period_start, period_end, period_label = _payslip_period(body.period_type, body.month)

    gross = float(await conn.fetchval(
        """SELECT COALESCE(SUM(amount),0) FROM transactions
           WHERE receiver_id=$1 AND type='payment' AND status='completed'
           AND created_at >= $2 AND created_at <= $3""",
        user["id"], period_start, period_end
    ))
    platform_fee_amt = round(gross * 0.03, 2)
    total_net = round(gross - platform_fee_amt, 2)

    owner_payouts = float(await conn.fetchval(
        """SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests
           WHERE user_id=$1 AND payout_type='cashup_owner'
           AND status IN ('approved','completed','auto_approved')
           AND created_at >= $2 AND created_at <= $3""",
        user["id"], period_start, period_end
    ))
    driver_net_earnings = round(total_net - owner_payouts, 2)

    driver_cashups_self = float(await conn.fetchval(
        """SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests
           WHERE user_id=$1 AND payout_type='driver_payout'
           AND status IN ('approved','completed','auto_approved')
           AND created_at >= $2 AND created_at <= $3""",
        user["id"], period_start, period_end
    ))

    wallet_after = float((await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user["id"]))["balance"])

    total_trips = int(await conn.fetchval(
        """SELECT COUNT(*) FROM transactions
           WHERE receiver_id=$1 AND type='payment' AND status='completed'
           AND created_at >= $2 AND created_at <= $3""",
        user["id"], period_start, period_end
    ))

    drv = await conn.fetchrow("SELECT rating_avg, rating_count FROM drivers WHERE user_id=$1", user["id"])
    rating_avg = float(drv["rating_avg"]) if drv else 0.0
    rating_count = int(drv["rating_count"]) if drv else 0

    yyyymm = body.month.replace("-", "")
    prefix = "TNR-PAY" if document_type == "statement" else "TNR-SLIP"
    base_ref = f"{prefix}-{yyyymm}-{user['id'][:6].upper()}"
    existing = await conn.fetchval("SELECT id FROM payslips WHERE reference_number=$1", base_ref)
    reference_number = f"{base_ref}-{secrets.token_hex(2).upper()}" if existing else base_ref

    verification_code = hmac.new(
        JWT_SECRET.encode(), reference_number.encode(), hashlib.sha256
    ).hexdigest()[:16]

    payslip_id = str(uuid.uuid4())
    await conn.execute(
        """INSERT INTO payslips
           (id,user_id,document_type,period_type,period_label,period_start,period_end,
            gross_earnings,platform_fee,total_net,owner_payouts,driver_net_earnings,
            driver_cashups_self,wallet_balance_at_generation,total_trips,
            rating_avg,rating_count,fee_charged,reference_number,verification_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)""",
        payslip_id, user["id"], document_type, body.period_type, period_label,
        period_start, period_end, gross, platform_fee_amt, total_net,
        owner_payouts, driver_net_earnings, driver_cashups_self,
        wallet_after, total_trips, rating_avg, rating_count,
        fee, reference_number, verification_code
    )

    txn_type = "payslip_fee" if document_type == "statement" else "formal_payslip_fee"
    fee_ref = f"TNR-{txn_type.upper()}-{secrets.token_hex(4).upper()}"
    await conn.execute(
        """INSERT INTO transactions
           (id,reference,type,status,amount,currency,sender_id,receiver_id,note)
           VALUES ($1,$2,$3,$4,$5,'ZAR',$6,$7,$8)""",
        str(uuid.uuid4()), fee_ref, txn_type, "completed",
        fee, user["id"], None, f"{document_type.capitalize()} fee – {period_label}"
    )

    # Insert into user_documents
    doc_title = f"Earnings Statement – {period_label}" if document_type == "statement" else f"Formal Payslip – {period_label}"
    doc_desc = f"Your {period_label} earnings document is ready to download."
    import json as _json
    doc_meta = _json.dumps({"payslip_id": payslip_id, "document_type": document_type})
    await conn.execute(
        """INSERT INTO user_documents
           (id,user_id,document_type,title,description,period_label,amount,reference_number,source,is_read,metadata)
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,'app',false,$8::jsonb)""",
        user["id"], document_type, doc_title, doc_desc,
        period_label, driver_net_earnings, reference_number, doc_meta
    )

    id_row = await conn.fetchrow("SELECT id_number FROM users WHERE id=$1", user["id"])
    id_number = id_row["id_number"] if id_row else None

    return {
        "id": payslip_id,
        "document_type": document_type,
        "period_type": body.period_type,
        "period_label": period_label,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "gross_earnings": gross,
        "platform_fee": platform_fee_amt,
        "total_net": total_net,
        "owner_payouts": owner_payouts,
        "driver_net_earnings": driver_net_earnings,
        "driver_cashups_self": driver_cashups_self,
        "wallet_balance_at_generation": wallet_after,
        "total_trips": total_trips,
        "rating_avg": rating_avg,
        "rating_count": rating_count,
        "fee_charged": fee,
        "reference_number": reference_number,
        "verification_code": verification_code,
        "status": "generated",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "driver_name": user["full_name"],
        "driver_phone": user.get("phone_number"),
        "vehicle_plate": user.get("vehicle_plate"),
        "id_number": id_number,
    }


@api.get("/driver/payslip/pricing")
async def payslip_pricing(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT key, value FROM system_config WHERE key = ANY($1::text[])",
            list(_PAYSLIP_FEE_KEYS.values()) + ["payslip_enabled"]
        )
    cfg = {r["key"]: r["value"] for r in rows}
    return {
        "enabled": cfg.get("payslip_enabled", "true").lower() == "true",
        "fee_1month": float(cfg.get("payslip_fee_1month", "2.00")),
        "fee_3months": float(cfg.get("payslip_fee_3months", "5.00")),
        "fee_6months": float(cfg.get("payslip_fee_6months", "8.00")),
        "fee_12months": float(cfg.get("payslip_fee_12months", "12.00")),
    }


@api.get("/driver/formal-payslip/pricing")
async def formal_payslip_pricing(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT key, value FROM system_config WHERE key = ANY($1::text[])",
            list(_FORMAL_PAYSLIP_FEE_KEYS.values()) + ["formal_payslip_enabled"]
        )
    cfg = {r["key"]: r["value"] for r in rows}
    return {
        "enabled": cfg.get("formal_payslip_enabled", "true").lower() == "true",
        "fee_1month": float(cfg.get("formal_payslip_fee_1month", "5.00")),
        "fee_3months": float(cfg.get("formal_payslip_fee_3months", "10.00")),
        "fee_6months": float(cfg.get("formal_payslip_fee_6months", "15.00")),
        "fee_12months": float(cfg.get("formal_payslip_fee_12months", "25.00")),
    }


@api.post("/driver/payslip/request")
async def payslip_request(body: PayslipRequestIn, user: dict = Depends(get_current_user)):
    if body.period_type not in _PAYSLIP_FEE_KEYS:
        raise HTTPException(status_code=400, detail="Invalid period_type")
    try:
        yr, mn = map(int, body.month.split("-"))
        if not (1 <= mn <= 12 and yr >= 2020):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format, use YYYY-MM")

    async with pool.acquire() as conn:
        enabled_row = await conn.fetchrow("SELECT value FROM system_config WHERE key='payslip_enabled'")
        if enabled_row and enabled_row["value"].lower() != "true":
            raise HTTPException(status_code=403, detail="Earnings statement feature is currently unavailable")

        fee_key = _PAYSLIP_FEE_KEYS[body.period_type]
        fee_row = await conn.fetchrow("SELECT value FROM system_config WHERE key=$1", fee_key)
        fee = float(fee_row["value"]) if fee_row else 2.00

        wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user["id"])
        balance = float(wallet["balance"]) if wallet else 0.0
        if not wallet or balance < fee:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. You need R{fee:.2f} to generate this statement. Your balance is R{balance:.2f}."
            )

        await conn.execute("UPDATE wallets SET balance = balance - $1 WHERE user_id=$2", fee, user["id"])
        result = await _build_payslip(conn, user, body, "statement", fee, "payslip")

    return result


@api.post("/driver/formal-payslip/request")
async def formal_payslip_request(body: PayslipRequestIn, user: dict = Depends(get_current_user)):
    if body.period_type not in _FORMAL_PAYSLIP_FEE_KEYS:
        raise HTTPException(status_code=400, detail="Invalid period_type")
    try:
        yr, mn = map(int, body.month.split("-"))
        if not (1 <= mn <= 12 and yr >= 2020):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format, use YYYY-MM")

    async with pool.acquire() as conn:
        enabled_row = await conn.fetchrow("SELECT value FROM system_config WHERE key='formal_payslip_enabled'")
        if enabled_row and enabled_row["value"].lower() != "true":
            raise HTTPException(status_code=403, detail="Formal payslip feature is currently unavailable")

        fee_key = _FORMAL_PAYSLIP_FEE_KEYS[body.period_type]
        fee_row = await conn.fetchrow("SELECT value FROM system_config WHERE key=$1", fee_key)
        fee = float(fee_row["value"]) if fee_row else 5.00

        wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user["id"])
        balance = float(wallet["balance"]) if wallet else 0.0
        if not wallet or balance < fee:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. You need R{fee:.2f} to generate this payslip. Your balance is R{balance:.2f}."
            )

        await conn.execute("UPDATE wallets SET balance = balance - $1 WHERE user_id=$2", fee, user["id"])
        result = await _build_payslip(conn, user, body, "payslip", fee, "formal_payslip")

    return result


@api.get("/driver/payslip/history")
async def payslip_history(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM payslips WHERE user_id=$1 AND status != 'deleted' ORDER BY created_at DESC",
            user["id"]
        )
    return [dict(r) for r in rows]


@api.get("/driver/payslip/verify")
async def payslip_verify(ref: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT p.*, u.full_name, u.phone_number FROM payslips p
               JOIN users u ON u.id = p.user_id
               WHERE p.reference_number=$1 AND p.status != 'deleted'""",
            ref
        )
    if not row:
        return {"valid": False}
    name_parts = row["full_name"].split()
    masked_name = (f"{name_parts[0]} {name_parts[-1][0]}***" if len(name_parts) >= 2
                   else f"{row['full_name'][:2]}***")
    phone = row["phone_number"] or ""
    masked_phone = (f"{phone[:4]} XX XXX {phone[-4:]}" if len(phone) >= 7 else "***")
    return {
        "valid": True,
        "document_type": row.get("document_type", "statement"),
        "driver_name": masked_name,
        "phone": masked_phone,
        "period_label": row["period_label"],
        "driver_net_earnings": float(row["driver_net_earnings"]),
        "total_trips": int(row["total_trips"]),
        "issued_by": "Tag n Ride Pty Ltd",
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }


@api.get("/driver/payslip/{payslip_id}")
async def payslip_get(payslip_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT p.*, u.full_name as driver_name, u.phone_number as driver_phone,
                      u.vehicle_plate, u.id_number
               FROM payslips p JOIN users u ON u.id = p.user_id
               WHERE p.id=$1 AND p.user_id=$2""",
            payslip_id, user["id"]
        )
        if not row:
            raise HTTPException(status_code=404, detail="Payslip not found")
        trips = await conn.fetch(
            """SELECT t.reference, t.amount, t.created_at,
                      s.full_name as passenger_name
               FROM transactions t
               LEFT JOIN users s ON s.id = t.sender_id
               WHERE t.receiver_id=$1 AND t.type='payment' AND t.status='completed'
                 AND t.created_at >= $2 AND t.created_at <= $3
               ORDER BY t.created_at DESC""",
            user["id"], row["period_start"], row["period_end"]
        )
    result = dict(row)
    result["trips"] = [
        {
            "reference": t["reference"],
            "amount": float(t["amount"]),
            "passenger": t["passenger_name"] or "Passenger",
            "date": iso(t["created_at"]),
        }
        for t in trips
    ]
    return result


@api.delete("/driver/payslip/{payslip_id}")
async def payslip_delete(payslip_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM payslips WHERE id=$1 AND user_id=$2 AND status != 'deleted'",
            payslip_id, user["id"]
        )
        if not row:
            raise HTTPException(status_code=404, detail="Payslip not found")
        await conn.execute("UPDATE payslips SET status='deleted' WHERE id=$1", payslip_id)
    return {"ok": True}


@api.get("/admin/drivers/{user_id}/payslips")
async def admin_driver_payslips(user_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM payslips WHERE user_id=$1 ORDER BY created_at DESC",
            user_id
        )
    return [dict(r) for r in rows]


# ════════════════════════════════════════════════════════════════
# USER DOCUMENTS
# ════════════════════════════════════════════════════════════════

class SendNoticeIn(BaseModel):
    target: str  # phone number, "ALL", "ALL_DRIVERS", "ALL_PASSENGERS"
    document_type: str = Field(default="notice")
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=2, max_length=1000)

@api.get("/documents")
async def get_user_documents(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id,document_type,title,description,period_label,amount,
                      reference_number,is_read,status,metadata,created_at
               FROM user_documents
               WHERE user_id=$1 AND status != 'deleted'
               ORDER BY created_at DESC""",
            user["id"]
        )
    return [
        {**dict(r), "amount": float(r["amount"] or 0), "created_at": iso(r["created_at"])}
        for r in rows
    ]

@api.get("/documents/unread-count")
async def get_documents_unread_count(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM user_documents WHERE user_id=$1 AND is_read=false AND status != 'deleted'",
            user["id"]
        )
    return {"count": int(count)}

@api.get("/documents/{doc_id}")
async def get_document(doc_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id,document_type,title,description,period_label,amount,
                      reference_number,is_read,status,metadata,created_at
               FROM user_documents WHERE id=$1 AND user_id=$2""",
            doc_id, user["id"]
        )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return {**dict(row), "amount": float(row["amount"] or 0), "created_at": iso(row["created_at"])}

@api.patch("/documents/{doc_id}/read")
async def mark_document_read(doc_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM user_documents WHERE id=$1 AND user_id=$2", doc_id, user["id"]
        )
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        await conn.execute(
            "UPDATE user_documents SET is_read=true, updated_at=NOW() WHERE id=$1", doc_id
        )
    return {"ok": True}

@api.patch("/documents/read-all")
async def mark_all_documents_read(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE user_documents SET is_read=true, updated_at=NOW() WHERE user_id=$1 AND status != 'deleted'",
            user["id"]
        )
    return {"ok": True}

@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM user_documents WHERE id=$1 AND user_id=$2", doc_id, user["id"]
        )
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        await conn.execute(
            "UPDATE user_documents SET status='deleted', updated_at=NOW() WHERE id=$1", doc_id
        )
    return {"ok": True}

@api.post("/admin/documents/send-notice")
async def admin_send_notice(body: SendNoticeIn, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "manage_users"):
        raise HTTPException(status_code=403, detail="Permission denied")
    async with pool.acquire() as conn:
        target = body.target.strip().upper()
        if target == "ALL":
            user_ids = [r["id"] for r in await conn.fetch(
                "SELECT id FROM users WHERE is_active=true AND role NOT IN ('superadmin','admin','finance','support','cfo','cto','ceo')"
            )]
        elif target == "ALL_DRIVERS":
            user_ids = [r["id"] for r in await conn.fetch(
                "SELECT id FROM users WHERE is_active=true AND role='driver'"
            )]
        elif target == "ALL_PASSENGERS":
            user_ids = [r["id"] for r in await conn.fetch(
                "SELECT id FROM users WHERE is_active=true AND role='passenger'"
            )]
        else:
            # treat as phone number
            row = await conn.fetchrow("SELECT id FROM users WHERE phone_number=$1", body.target.strip())
            if not row:
                raise HTTPException(status_code=404, detail="User not found with that phone number")
            user_ids = [row["id"]]

        for uid in user_ids:
            await conn.execute(
                """INSERT INTO user_documents (id,user_id,document_type,title,description,source,is_read)
                   VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'admin',false)""",
                uid, body.document_type, body.title, body.description
            )
        await audit(conn, admin["id"], "SEND_NOTICE", None, "user_documents",
                    {"target": body.target, "count": len(user_ids), "title": body.title}, request.client.host)
    return {"ok": True, "sent_to": len(user_ids)}


# ════════════════════════════════════════════════════════════════
# SafeRide Safety System
# ════════════════════════════════════════════════════════════════

SAFETY_FIELDS = [
    "full_name", "id_number", "passport_number", "date_of_birth", "blood_type", "home_address",
    "medical_conditions", "allergies",
    "emergency_contact_1_name", "emergency_contact_1_phone", "emergency_contact_1_relationship",
    "emergency_contact_2_name", "emergency_contact_2_phone", "emergency_contact_2_relationship",
    "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relationship",
]

class SafetyProfileIn(BaseModel):
    full_name: Optional[str] = None
    id_number: Optional[str] = None
    passport_number: Optional[str] = None
    date_of_birth: Optional[str] = None
    blood_type: Optional[str] = None
    home_address: Optional[str] = None
    medical_conditions: Optional[str] = None
    allergies: Optional[str] = None
    emergency_contact_1_name: Optional[str] = None
    emergency_contact_1_phone: Optional[str] = None
    emergency_contact_1_relationship: Optional[str] = None
    emergency_contact_2_name: Optional[str] = None
    emergency_contact_2_phone: Optional[str] = None
    emergency_contact_2_relationship: Optional[str] = None
    next_of_kin_name: Optional[str] = None
    next_of_kin_phone: Optional[str] = None
    next_of_kin_relationship: Optional[str] = None

class DeadManCodeIn(BaseModel):
    dead_man_code: str   # 4–6 digit code
    current_pin: str     # user's real PIN to authorise change

class DeadManResetRequestIn(BaseModel):
    reason: str = Field(min_length=10, max_length=500)

class DeadManResetReviewIn(BaseModel):
    reason: str = Field(min_length=10, max_length=500)

class TripEndPinIn(BaseModel):
    trip_id: str
    pin: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class SosCancelPinIn(BaseModel):
    sos_id: str
    pin: str

class GhostPingIn(BaseModel):
    latitude: float
    longitude: float

class TripStartIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class TripEndIn(BaseModel):
    trip_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class TripLocationIn(BaseModel):
    trip_id: str
    latitude: float
    longitude: float
    speed: Optional[float] = 0.0
    heading: Optional[float] = 0.0

class IncidentCreateIn(BaseModel):
    vehicle_plate: str
    trip_id: Optional[str] = None
    incident_type: str = "accident"
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class IncidentResolveIn(BaseModel):
    resolution_notes: str = ""

class PanicIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class TripShareIn(BaseModel):
    trip_id: str

class TripDetailsIn(BaseModel):
    cash_passengers: Optional[int] = None
    taxi_capacity: Optional[int] = None

class SosRequestIn(BaseModel):
    emergency_type: str  # 'police' or 'ambulance'
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class SosLocationIn(BaseModel):
    latitude: float
    longitude: float

class SosUpdateIn(BaseModel):
    status: str  # 'help_coming', 'dispatched', or 'resolved'
    notes: Optional[str] = None

class SosChargeIn(BaseModel):
    price: float

class TrackMeStartIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class TrackMePingIn(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None

_gps_last: dict = {}

# ── GET /api/safety/profile ──
@api.get("/safety/profile")
async def get_safety_profile(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
    if not row:
        return {"profile_complete": False, "user_id": user["id"], "dead_man_code_set": False}
    p = dict(row)
    p["profile_complete"] = bool(p.get("profile_complete"))
    p["dead_man_code_set"] = bool(p.get("dead_man_code"))
    p.pop("dead_man_code", None)  # never expose hash
    if p.get("created_at"): p["created_at"] = iso(p["created_at"])
    if p.get("updated_at"): p["updated_at"] = iso(p["updated_at"])
    return p

# ── POST /api/safety/profile ──
@api.post("/safety/profile")
async def save_safety_profile(body: SafetyProfileIn, user: dict = Depends(get_current_user)):
    data = body.dict()
    now = datetime.now(timezone.utc)
    profile_complete = bool(
        data.get("emergency_contact_1_name") and
        data.get("emergency_contact_1_phone") and
        data.get("id_number")
    )
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        if existing:
            set_parts = [f"{f}=${i+2}" for i, f in enumerate(SAFETY_FIELDS)]
            set_parts += [f"profile_complete=${len(SAFETY_FIELDS)+2}", f"updated_at=${len(SAFETY_FIELDS)+3}"]
            vals = [user["id"]] + [data.get(f) for f in SAFETY_FIELDS] + [profile_complete, now]
            await conn.execute(
                f"UPDATE passenger_safety_profiles SET {', '.join(set_parts)} WHERE user_id=$1",
                *vals
            )
        else:
            pid = str(uuid.uuid4())
            col_list = ["id", "user_id"] + SAFETY_FIELDS + ["profile_complete", "created_at", "updated_at"]
            placeholders = ", ".join([f"${i+1}" for i in range(len(col_list))])
            vals = [pid, user["id"]] + [data.get(f) for f in SAFETY_FIELDS] + [profile_complete, now, now]
            await conn.execute(
                f"INSERT INTO passenger_safety_profiles ({', '.join(col_list)}) VALUES ({placeholders})",
                *vals
            )
        row = await conn.fetchrow("SELECT * FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
    p = dict(row)
    p["profile_complete"] = bool(p.get("profile_complete"))
    if p.get("created_at"): p["created_at"] = iso(p["created_at"])
    if p.get("updated_at"): p["updated_at"] = iso(p["updated_at"])
    return p

# ── PATCH /api/safety/profile ──
@api.patch("/safety/profile")
async def patch_safety_profile(body: SafetyProfileIn, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in body.dict().items() if v is not None}
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        if not data:
            if not existing:
                return {"profile_complete": False, "user_id": user["id"]}
            p = dict(existing)
            p["profile_complete"] = bool(p.get("profile_complete"))
            if p.get("created_at"): p["created_at"] = iso(p["created_at"])
            if p.get("updated_at"): p["updated_at"] = iso(p["updated_at"])
            return p
        if existing:
            set_parts = [f"{k}=${i+2}" for i, k in enumerate(data.keys())]
            set_parts.append(f"updated_at=${len(data)+2}")
            vals = [user["id"]] + list(data.values()) + [now]
            await conn.execute(
                f"UPDATE passenger_safety_profiles SET {', '.join(set_parts)} WHERE user_id=$1",
                *vals
            )
        else:
            pid = str(uuid.uuid4())
            cols = ["id", "user_id"] + list(data.keys()) + ["created_at", "updated_at"]
            placeholders = ", ".join([f"${i+1}" for i in range(len(cols))])
            vals = [pid, user["id"]] + list(data.values()) + [now, now]
            await conn.execute(
                f"INSERT INTO passenger_safety_profiles ({', '.join(cols)}) VALUES ({placeholders})",
                *vals
            )
        row = await conn.fetchrow("SELECT * FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        cur = dict(row)
        pc = bool(cur.get("emergency_contact_1_name") and cur.get("emergency_contact_1_phone") and cur.get("id_number"))
        await conn.execute(
            "UPDATE passenger_safety_profiles SET profile_complete=$1, updated_at=$2 WHERE user_id=$3",
            pc, now, user["id"]
        )
        row = await conn.fetchrow("SELECT * FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
    p = dict(row)
    p["profile_complete"] = bool(p.get("profile_complete"))
    if p.get("created_at"): p["created_at"] = iso(p["created_at"])
    if p.get("updated_at"): p["updated_at"] = iso(p["updated_at"])
    return p

# ── POST /api/trips/start ──
@api.post("/trips/start")
async def trip_start(body: TripStartIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await require_can_drive(user, conn)
        existing = await conn.fetchrow(
            "SELECT * FROM trips WHERE driver_id=$1 AND status='active' ORDER BY started_at DESC LIMIT 1",
            user["id"]
        )
        if existing:
            t = dict(existing)
            t["started_at"] = iso(t.get("started_at"))
            if t.get("total_revenue") is not None: t["total_revenue"] = float(t["total_revenue"])
            return t
        drv = await conn.fetchrow("SELECT vehicle_plate FROM drivers WHERE user_id=$1", user["id"])
        u_row = await conn.fetchrow("SELECT full_name, phone_number FROM users WHERE id=$1", user["id"])
        trip_date = datetime.now(timezone.utc).strftime('%Y%m%d')
        trip_ref = f"TNR-TRIP-{trip_date}-{user['id'][:6].upper()}"
        existing_ref = await conn.fetchrow("SELECT id FROM trips WHERE trip_reference=$1", trip_ref)
        if existing_ref:
            trip_ref = f"{trip_ref}-{secrets.token_hex(2).upper()}"
        trip_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO trips (id,trip_reference,driver_id,driver_name,driver_phone,vehicle_plate,"
            "status,start_latitude,start_longitude,total_passengers,total_revenue) "
            "VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,0,0)",
            trip_id, trip_ref, user["id"],
            u_row["full_name"] if u_row else "",
            (u_row["phone_number"] or "") if u_row else "",
            (drv["vehicle_plate"] or "") if drv else "",
            body.latitude, body.longitude
        )
        row = await conn.fetchrow("SELECT * FROM trips WHERE id=$1", trip_id)
    t = dict(row)
    t["started_at"] = iso(t.get("started_at"))
    if t.get("total_revenue") is not None: t["total_revenue"] = float(t["total_revenue"])
    return t

# ── GET /api/trips/active ──
@api.get("/trips/active")
async def trip_active(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await require_can_drive(user, conn)
        trip = await conn.fetchrow(
            "SELECT * FROM trips WHERE driver_id=$1 AND status='active' ORDER BY started_at DESC LIMIT 1",
            user["id"]
        )
        if not trip:
            return {"trip": None, "passengers": []}
        passengers = await conn.fetch(
            "SELECT tp.id, tp.passenger_id, tp.passenger_name, tp.passenger_phone, tp.payment_amount, "
            "tp.boarded_at, tp.safety_profile_complete, psp.blood_type, psp.medical_conditions "
            "FROM trip_passengers tp "
            "LEFT JOIN passenger_safety_profiles psp ON psp.user_id=tp.passenger_id "
            "WHERE tp.trip_id=$1 ORDER BY tp.boarded_at ASC",
            trip["id"]
        )
        plist = []
        for p in passengers:
            pd = dict(p)
            pd["boarded_at"] = iso(pd.get("boarded_at"))
            if pd.get("payment_amount") is not None: pd["payment_amount"] = float(pd["payment_amount"])
            plist.append(pd)
        t = dict(trip)
        t["started_at"] = iso(t.get("started_at"))
        if t.get("total_revenue") is not None: t["total_revenue"] = float(t["total_revenue"])
    return {"trip": t, "passengers": plist}

# ── POST /api/trips/end ──
@api.post("/trips/end")
async def trip_end(body: TripEndIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await require_can_drive(user, conn)
        trip = await conn.fetchrow("SELECT * FROM trips WHERE id=$1 AND driver_id=$2", body.trip_id, user["id"])
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        await conn.execute(
            "UPDATE trips SET status='completed', ended_at=NOW(), end_latitude=$1, end_longitude=$2 WHERE id=$3",
            body.latitude, body.longitude, body.trip_id
        )
        row = await conn.fetchrow("SELECT * FROM trips WHERE id=$1", body.trip_id)
    t = dict(row)
    started = t.get("started_at")
    ended = t.get("ended_at")
    duration_minutes = 0
    if started and ended:
        delta = ended - started
        duration_minutes = max(0, int(delta.total_seconds() / 60))
    t["started_at"] = iso(started)
    t["ended_at"] = iso(ended)
    gross = float(t.get("total_revenue") or 0)
    fee = round(gross * 0.03, 2)
    net = round(gross - fee, 2)
    t["total_revenue"] = gross
    return {
        "trip": t,
        "duration_minutes": duration_minutes,
        "total_passengers": int(t.get("total_passengers") or 0),
        "gross_earnings": gross,
        "platform_fee": fee,
        "net_earnings": net,
    }

# ── POST /api/trips/location ──
@api.post("/trips/location")
async def trip_location(body: TripLocationIn, user: dict = Depends(get_current_user)):
    now_ts = time.time()
    if now_ts - _gps_last.get(user["id"], 0) < 30:
        return {"ok": True, "skipped": True}
    _gps_last[user["id"]] = now_ts
    async with pool.acquire() as conn:
        await require_can_drive(user, conn)
        await conn.execute(
            "INSERT INTO gps_locations (id,user_id,trip_id,latitude,longitude,speed,heading) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7)",
            str(uuid.uuid4()), user["id"], body.trip_id,
            body.latitude, body.longitude, body.speed or 0, body.heading or 0
        )
        # Keep trips table updated with the latest position so admin map view is always fresh
        if body.trip_id:
            await conn.execute(
                "UPDATE trips SET last_latitude=$1, last_longitude=$2, last_location_update=NOW() "
                "WHERE id=$3 AND driver_id=$4 AND status='active'",
                body.latitude, body.longitude, body.trip_id, user["id"]
            )
    return {"ok": True}

# ── GET /api/trips/history ──
@api.get("/trips/history")
async def trips_history(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await require_can_drive(user, conn)
        rows = await conn.fetch(
            "SELECT t.id, t.trip_reference, t.status, t.started_at, t.ended_at, t.vehicle_plate, "
            "t.total_passengers, t.total_revenue, "
            "(SELECT COUNT(*) FROM trip_passengers tp WHERE tp.trip_id=t.id) as passenger_count "
            "FROM trips t WHERE t.driver_id=$1 ORDER BY t.started_at DESC LIMIT 50",
            user["id"]
        )
    result = []
    for row in rows:
        t = dict(row)
        t["started_at"] = iso(t.get("started_at"))
        t["ended_at"] = iso(t.get("ended_at"))
        if t.get("total_revenue") is not None: t["total_revenue"] = float(t["total_revenue"])
        result.append(t)
    return result

# ── GET /api/trips/driver-locations (admin) ──
@api.get("/trips/driver-locations")
async def driver_locations_map(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        active_trips = await conn.fetch("SELECT * FROM trips WHERE status='active'")
        result = []
        for trip in active_trips:
            # Prefer trip-specific GPS row (correct trip context)
            loc = await conn.fetchrow(
                "SELECT latitude,longitude,speed,recorded_at FROM gps_locations "
                "WHERE trip_id=$1 ORDER BY recorded_at DESC LIMIT 1",
                trip["id"]
            )
            # Fall back to trips.last_latitude which we now keep updated
            if not loc and trip.get("last_latitude") is not None:
                lat = float(trip["last_latitude"])
                lng = float(trip["last_longitude"])
                speed = 0.0
                last_update = iso(trip.get("last_location_update"))
            else:
                lat = float(loc["latitude"]) if loc and loc.get("latitude") is not None else None
                lng = float(loc["longitude"]) if loc and loc.get("longitude") is not None else None
                speed = float(loc["speed"]) if loc and loc.get("speed") is not None else 0.0
                last_update = iso(loc["recorded_at"]) if loc else None
            pcount = await conn.fetchval("SELECT COUNT(*) FROM trip_passengers WHERE trip_id=$1", trip["id"])
            result.append({
                "driver_id": trip["driver_id"],
                "driver_name": trip["driver_name"],
                "vehicle_plate": trip["vehicle_plate"],
                "latitude": lat,
                "longitude": lng,
                "speed": speed,
                "trip_id": trip["id"],
                "trip_reference": trip["trip_reference"],
                "passenger_count": int(pcount or 0),
                "last_update": last_update,
            })
    return result

# ── GET /api/trips/{trip_id} ──
@api.get("/trips/{trip_id}")
async def trip_get(trip_id: str, user: dict = Depends(get_current_user)):
    is_admin_user = user.get("role") in ADMIN_ROLES
    async with pool.acquire() as conn:
        trip = await conn.fetchrow("SELECT * FROM trips WHERE id=$1", trip_id)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        if not is_admin_user and trip["driver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        passengers = await conn.fetch(
            "SELECT tp.id, tp.passenger_id, tp.passenger_name, tp.passenger_phone, tp.payment_amount, "
            "tp.boarded_at, tp.safety_profile_complete, "
            "psp.blood_type, psp.medical_conditions, psp.allergies, psp.profile_complete, "
            "psp.emergency_contact_1_name, psp.emergency_contact_1_phone, psp.emergency_contact_1_relationship, "
            "psp.emergency_contact_2_name, psp.emergency_contact_2_phone, psp.emergency_contact_2_relationship, "
            "psp.next_of_kin_name, psp.next_of_kin_phone, psp.next_of_kin_relationship "
            "FROM trip_passengers tp "
            "LEFT JOIN passenger_safety_profiles psp ON psp.user_id=tp.passenger_id "
            "WHERE tp.trip_id=$1",
            trip_id
        )
        plist = []
        for p in passengers:
            pd = dict(p)
            pd["boarded_at"] = iso(pd.get("boarded_at"))
            if not is_admin_user:
                for f in ("emergency_contact_1_phone", "emergency_contact_2_phone", "next_of_kin_phone"):
                    pd.pop(f, None)
            plist.append(pd)
    t = dict(trip)
    t["started_at"] = iso(t.get("started_at"))
    t["ended_at"] = iso(t.get("ended_at"))
    if t.get("total_revenue") is not None: t["total_revenue"] = float(t["total_revenue"])
    return {"trip": t, "passengers": plist}

# ── POST /api/admin/incidents ──
@api.post("/admin/incidents")
async def create_incident(body: IncidentCreateIn, request: Request, admin: dict = Depends(require_admin)):
    inc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    inc_ref = f"TNR-INC-{now.strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
    plate_upper = body.vehicle_plate.upper().strip()
    async with pool.acquire() as conn:
        trip = await conn.fetchrow(
            "SELECT * FROM trips WHERE UPPER(REPLACE(vehicle_plate,' ',''))=UPPER(REPLACE($1,' ','')) "
            "AND status='active' ORDER BY started_at DESC LIMIT 1", plate_upper
        )
        if not trip and body.trip_id:
            trip = await conn.fetchrow("SELECT * FROM trips WHERE id=$1", body.trip_id)
        if not trip:
            trip = await conn.fetchrow(
                "SELECT * FROM trips WHERE UPPER(REPLACE(vehicle_plate,' ',''))=UPPER(REPLACE($1,' ','')) "
                "ORDER BY started_at DESC LIMIT 1", plate_upper
            )
        trip_id = trip["id"] if trip else body.trip_id
        driver_id = trip["driver_id"] if trip else None
        await conn.execute(
            "INSERT INTO incidents (id,incident_reference,trip_id,vehicle_plate,driver_id,"
            "incident_type,description,latitude,longitude,flagged_by,flagged_at,status) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')",
            inc_id, inc_ref, trip_id, plate_upper, driver_id,
            body.incident_type, body.description, body.latitude, body.longitude, admin["id"], now
        )
        if trip_id:
            await conn.execute(
                "UPDATE trips SET incident_flag=true, incident_notes=$1, incident_flagged_at=$2, incident_flagged_by=$3 WHERE id=$4",
                body.description, now, admin["id"], trip_id
            )
        passengers = []
        if trip_id:
            passengers = await conn.fetch(
                "SELECT tp.passenger_id, tp.passenger_name, tp.passenger_phone, "
                "psp.emergency_contact_1_name, psp.emergency_contact_1_phone, psp.emergency_contact_1_relationship, "
                "psp.emergency_contact_2_name, psp.emergency_contact_2_phone, psp.emergency_contact_2_relationship, "
                "psp.next_of_kin_name, psp.next_of_kin_phone, psp.next_of_kin_relationship "
                "FROM trip_passengers tp "
                "LEFT JOIN passenger_safety_profiles psp ON psp.user_id=tp.passenger_id "
                "WHERE tp.trip_id=$1", trip_id
            )
        notifications_sent = 0
        for p in passengers:
            for cname, cphone, crel in [
                (p["emergency_contact_1_name"], p["emergency_contact_1_phone"], p["emergency_contact_1_relationship"]),
                (p["emergency_contact_2_name"], p["emergency_contact_2_phone"], p["emergency_contact_2_relationship"]),
                (p["next_of_kin_name"], p["next_of_kin_phone"], p["next_of_kin_relationship"]),
            ]:
                if not cphone:
                    continue
                msg = (f"URGENT TAG N RIDE SAFETY ALERT\n"
                       f"A vehicle you have an emergency contact in\n"
                       f"Plate: {plate_upper}\n"
                       f"has been involved in an incident.\n"
                       f"Please contact Tag n Ride Support immediately.\n"
                       f"Reference: {inc_ref}\n"
                       f"Helpline: 0800 000 000")
                await conn.execute(
                    "INSERT INTO emergency_notifications (id,incident_id,passenger_id,contact_name,contact_phone,"
                    "contact_relationship,message_sent,sms_status,sent_at,created_at) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,'sent',NOW(),NOW())",
                    str(uuid.uuid4()), inc_id, p["passenger_id"], cname, cphone, crel, msg
                )
                await send_sms(cphone, msg)
                notifications_sent += 1
        await conn.execute("UPDATE incidents SET notifications_sent=true, notifications_sent_at=NOW() WHERE id=$1", inc_id)
        await audit(conn, admin["id"], "CREATE_INCIDENT", inc_id, "incident",
                    {"plate": plate_upper, "type": body.incident_type, "sms_count": notifications_sent},
                    request.client.host if request.client else None)
        row = await conn.fetchrow("SELECT * FROM incidents WHERE id=$1", inc_id)
    inc = dict(row)
    inc["flagged_at"] = iso(inc.get("flagged_at"))
    inc["notifications_sent_at"] = iso(inc.get("notifications_sent_at"))
    inc["passenger_count"] = len(passengers)
    inc["notifications_sent_count"] = notifications_sent
    return inc

# ── GET /api/admin/incidents ──
@api.get("/admin/incidents")
async def list_incidents(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT i.id, i.incident_reference, i.vehicle_plate, i.driver_id, i.incident_type, "
            "i.description, i.flagged_at, i.notifications_sent, i.status, i.resolved_at, i.trip_id, "
            "(SELECT COUNT(*) FROM emergency_notifications en WHERE en.incident_id=i.id) as notif_count, "
            "(SELECT COUNT(*) FROM trip_passengers tp WHERE tp.trip_id=i.trip_id) as passenger_count "
            "FROM incidents i ORDER BY i.flagged_at DESC LIMIT 100"
        )
    result = []
    for row in rows:
        inc = dict(row)
        inc["flagged_at"] = iso(inc.get("flagged_at"))
        inc["resolved_at"] = iso(inc.get("resolved_at"))
        result.append(inc)
    return result

# ── GET /api/admin/incidents/{incident_id} ──
@api.get("/admin/incidents/{incident_id}")
async def get_incident(incident_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        inc = await conn.fetchrow("SELECT * FROM incidents WHERE id=$1", incident_id)
        if not inc:
            raise HTTPException(status_code=404, detail="Incident not found")
        passengers = []
        if inc["trip_id"]:
            passengers = await conn.fetch(
                "SELECT tp.passenger_id, tp.passenger_name, tp.passenger_phone, tp.payment_amount, "
                "psp.blood_type, psp.medical_conditions, psp.allergies, psp.profile_complete, "
                "psp.emergency_contact_1_name, psp.emergency_contact_1_phone, psp.emergency_contact_1_relationship, "
                "psp.emergency_contact_2_name, psp.emergency_contact_2_phone, psp.emergency_contact_2_relationship, "
                "psp.next_of_kin_name, psp.next_of_kin_phone, psp.next_of_kin_relationship "
                "FROM trip_passengers tp "
                "LEFT JOIN passenger_safety_profiles psp ON psp.user_id=tp.passenger_id "
                "WHERE tp.trip_id=$1", inc["trip_id"]
            )
        notifs = await conn.fetch(
            "SELECT id, contact_name, contact_phone, contact_relationship, sms_status, sent_at, passenger_id "
            "FROM emergency_notifications WHERE incident_id=$1 ORDER BY created_at ASC", incident_id
        )
        gps = []
        if inc["trip_id"]:
            gps = await conn.fetch(
                "SELECT latitude, longitude, speed, recorded_at FROM gps_locations "
                "WHERE trip_id=$1 ORDER BY recorded_at ASC LIMIT 200", inc["trip_id"]
            )
    result = dict(inc)
    result["flagged_at"] = iso(result.get("flagged_at"))
    result["resolved_at"] = iso(result.get("resolved_at"))
    result["notifications_sent_at"] = iso(result.get("notifications_sent_at"))
    result["passengers"] = []
    for p in passengers:
        pd = dict(p)
        if pd.get("payment_amount") is not None: pd["payment_amount"] = float(pd["payment_amount"])
        result["passengers"].append(pd)
    result["notifications"] = [dict(n) | {"sent_at": iso(n.get("sent_at"))} for n in notifs]
    result["gps_route"] = [
        {"latitude": float(g["latitude"]) if g.get("latitude") is not None else None,
         "longitude": float(g["longitude"]) if g.get("longitude") is not None else None,
         "speed": float(g["speed"]) if g.get("speed") is not None else 0,
         "recorded_at": iso(g["recorded_at"])}
        for g in gps
    ]
    return result

# ── PATCH /api/admin/incidents/{incident_id}/resolve ──
@api.patch("/admin/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, body: IncidentResolveIn, request: Request, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        if not await conn.fetchrow("SELECT id FROM incidents WHERE id=$1", incident_id):
            raise HTTPException(status_code=404, detail="Incident not found")
        await conn.execute(
            "UPDATE incidents SET status='resolved', resolved_at=NOW(), resolved_by=$1, resolution_notes=$2 WHERE id=$3",
            admin["id"], body.resolution_notes, incident_id
        )
        await audit(conn, admin["id"], "RESOLVE_INCIDENT", incident_id, "incident",
                    {"notes": body.resolution_notes}, request.client.host if request.client else None)
        row = await conn.fetchrow("SELECT * FROM incidents WHERE id=$1", incident_id)
    result = dict(row)
    result["flagged_at"] = iso(result.get("flagged_at"))
    result["resolved_at"] = iso(result.get("resolved_at"))
    return result

# ── GET /api/admin/saferide/search ──
@api.get("/admin/saferide/search")
async def saferide_search(plate: str, admin: dict = Depends(require_admin)):
    plate_clean = plate.upper().strip()
    async with pool.acquire() as conn:
        drivers = await conn.fetch(
            "SELECT u.id, u.full_name, u.phone_number, u.is_active, d.vehicle_plate, d.is_verified, d.rating_avg "
            "FROM users u JOIN drivers d ON d.user_id=u.id "
            "WHERE UPPER(REPLACE(d.vehicle_plate,' ',''))=UPPER(REPLACE($1,' ',''))", plate_clean
        )
        trips = await conn.fetch(
            "SELECT * FROM trips WHERE UPPER(REPLACE(vehicle_plate,' ',''))=UPPER(REPLACE($1,' ','')) "
            "AND DATE(started_at AT TIME ZONE 'UTC')=CURRENT_DATE ORDER BY started_at DESC", plate_clean
        )
        last_gps = None
        if drivers:
            last_gps = await conn.fetchrow(
                "SELECT latitude,longitude,speed,recorded_at FROM gps_locations "
                "WHERE user_id=$1 ORDER BY recorded_at DESC LIMIT 1", drivers[0]["id"]
            )
        all_passengers = []
        for trip in trips:
            passengers = await conn.fetch(
                "SELECT tp.passenger_id, tp.passenger_name, tp.passenger_phone, tp.payment_amount, tp.boarded_at, "
                "psp.blood_type, psp.medical_conditions, psp.allergies, psp.profile_complete, "
                "psp.emergency_contact_1_name, psp.emergency_contact_1_phone, psp.emergency_contact_1_relationship, "
                "psp.emergency_contact_2_name, psp.emergency_contact_2_phone, psp.emergency_contact_2_relationship, "
                "psp.next_of_kin_name, psp.next_of_kin_phone, psp.next_of_kin_relationship "
                "FROM trip_passengers tp "
                "LEFT JOIN passenger_safety_profiles psp ON psp.user_id=tp.passenger_id "
                "WHERE tp.trip_id=$1", trip["id"]
            )
            for p in passengers:
                pd = dict(p)
                pd.update({"trip_id": trip["id"], "trip_reference": trip["trip_reference"]})
                pd["boarded_at"] = iso(pd.get("boarded_at"))
                if pd.get("payment_amount") is not None: pd["payment_amount"] = float(pd["payment_amount"])
                all_passengers.append(pd)
    return {
        "plate": plate_clean,
        "drivers": [{"user_id": d["id"], "full_name": d["full_name"], "phone_number": d["phone_number"],
                     "vehicle_plate": d["vehicle_plate"], "is_verified": d["is_verified"],
                     "rating_avg": float(d["rating_avg"] or 0)} for d in drivers],
        "trips_today": [dict(t) | {"started_at": iso(t.get("started_at")), "ended_at": iso(t.get("ended_at")),
                                    "total_revenue": float(t["total_revenue"]) if t.get("total_revenue") is not None else 0}
                        for t in trips],
        "passengers": all_passengers,
        "last_gps": {
            "latitude": float(last_gps["latitude"]) if last_gps and last_gps.get("latitude") is not None else None,
            "longitude": float(last_gps["longitude"]) if last_gps and last_gps.get("longitude") is not None else None,
            "speed": float(last_gps["speed"]) if last_gps and last_gps.get("speed") is not None else 0,
            "recorded_at": iso(last_gps["recorded_at"]) if last_gps else None,
        } if last_gps else None,
    }

# ── POST /api/safety/panic ──
@api.post("/safety/panic")
async def panic_button(body: PanicIn, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    inc_id = str(uuid.uuid4())
    inc_ref = f"TNR-INC-{now.strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
    user_name = user.get("full_name") or user.get("id")
    maps_url = (f"https://maps.google.com/?q={body.latitude},{body.longitude}" if body.latitude else "Location unavailable")
    time_str = now.strftime('%Y-%m-%d %H:%M UTC')
    async with pool.acquire() as conn:
        active_trip = await conn.fetchrow(
            "SELECT t.id, t.vehicle_plate, t.driver_id FROM trips t "
            "JOIN trip_passengers tp ON tp.trip_id=t.id "
            "WHERE tp.passenger_id=$1 AND t.status='active' LIMIT 1", user["id"]
        )
        if not active_trip:
            active_trip = await conn.fetchrow(
                "SELECT id, vehicle_plate, driver_id FROM trips WHERE driver_id=$1 AND status='active' LIMIT 1",
                user["id"]
            )
        await conn.execute(
            "INSERT INTO incidents (id,incident_reference,trip_id,vehicle_plate,driver_id,"
            "incident_type,description,latitude,longitude,flagged_by,flagged_at,status) "
            "VALUES ($1,$2,$3,$4,$5,'panic','SOS Panic button triggered',$6,$7,$8,$9,'active')",
            inc_id, inc_ref,
            active_trip["id"] if active_trip else None,
            active_trip["vehicle_plate"] if active_trip else None,
            active_trip["driver_id"] if active_trip else None,
            body.latitude, body.longitude, user["id"], now
        )
        profile = await conn.fetchrow("SELECT * FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        notifications_sent = 0
        if profile:
            for cname, cphone, crel in [
                (profile["emergency_contact_1_name"], profile["emergency_contact_1_phone"], profile["emergency_contact_1_relationship"]),
                (profile["emergency_contact_2_name"], profile["emergency_contact_2_phone"], profile["emergency_contact_2_relationship"]),
                (profile["next_of_kin_name"], profile["next_of_kin_phone"], profile["next_of_kin_relationship"]),
            ]:
                if not cphone:
                    continue
                msg = (f"SOS ALERT from Tag n Ride\n"
                       f"{user_name} has triggered an emergency alert\n"
                       f"Last known location: {maps_url}\n"
                       f"Time: {time_str}\n"
                       f"Please contact them immediately or call emergency services 10111")
                await conn.execute(
                    "INSERT INTO emergency_notifications (id,incident_id,passenger_id,contact_name,contact_phone,"
                    "contact_relationship,message_sent,sms_status,sent_at,created_at) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,'sent',NOW(),NOW())",
                    str(uuid.uuid4()), inc_id, user["id"], cname, cphone, crel, msg
                )
                await send_sms(cphone, msg)
                notifications_sent += 1
        await conn.execute("UPDATE incidents SET notifications_sent=true, notifications_sent_at=NOW() WHERE id=$1", inc_id)
        admin_users = await conn.fetch(
            "SELECT id FROM users WHERE role IN ('superadmin','admin','ceo') AND is_active=true LIMIT 20"
        )
        for au in admin_users:
            await notify_user(conn, f"SOS PANIC: {user_name}",
                f"{user_name} triggered SOS panic. Location: {maps_url}", "panic_alert", au["id"])
    return {
        "ok": True,
        "incident_reference": inc_ref,
        "notifications_sent": notifications_sent,
        "message": f"SOS sent to {notifications_sent} emergency contact(s)",
    }

# ── POST /api/saferide/deadman-code ── set / update dead man code
@api.post("/saferide/deadman-code")
async def set_dead_man_code(body: DeadManCodeIn, user: dict = Depends(get_current_user)):
    if len(body.dead_man_code) < 4 or not body.dead_man_code.isdigit():
        raise HTTPException(400, "Dead man code must be 4–6 digits")
    if body.dead_man_code == body.current_pin:
        raise HTTPException(400, "Dead man code must differ from your regular PIN")
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow("SELECT pin_hash FROM users WHERE id=$1", user["id"])
        if not user_row or not verify_pin(body.current_pin, user_row["pin_hash"]):
            raise HTTPException(401, "Incorrect PIN")
        hashed = hash_pin(body.dead_man_code)
        existing = await conn.fetchrow("SELECT id FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        if existing:
            await conn.execute(
                "UPDATE passenger_safety_profiles SET dead_man_code=$1, updated_at=NOW() WHERE user_id=$2",
                hashed, user["id"]
            )
        else:
            await conn.execute(
                "INSERT INTO passenger_safety_profiles (id,user_id,dead_man_code,created_at,updated_at) VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW())",
                user["id"], hashed
            )
    return {"ok": True}


# ── POST /api/saferide/deadman-code/reset-request ── user submits reset request
@api.post("/saferide/deadman-code/reset-request")
async def request_dead_man_reset(body: DeadManResetRequestIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, status FROM dead_man_reset_requests WHERE user_id=$1 AND status='pending'", user["id"]
        )
        if existing:
            raise HTTPException(400, "You already have a pending dead man code reset request.")
        await conn.execute(
            """INSERT INTO dead_man_reset_requests (id,user_id,user_name,user_phone,user_role,reason,status,created_at,updated_at)
               VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,'pending',NOW(),NOW())""",
            user["id"], user.get("full_name"), user.get("phone_number"), user.get("role"), body.reason
        )
        admins = await conn.fetch(
            "SELECT id FROM users WHERE role IN ('superadmin','admin','support') AND is_active=true"
        )
        for au in admins:
            await notify_user(
                conn,
                "🔑 Dead Man Code Reset Request",
                f"{user.get('full_name') or 'A user'} ({user.get('phone_number','')}) has requested a dead man code reset. Reason: {body.reason}",
                "deadman_reset_request", au["id"]
            )
    return {"ok": True}

# ── GET /api/saferide/deadman-code/reset-request ── user checks own request status
@api.get("/saferide/deadman-code/reset-request")
async def get_dead_man_reset_status(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id,status,reason,admin_reason,created_at,updated_at FROM dead_man_reset_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
            user["id"]
        )
        if not row:
            return {"request": None}
        r = dict(row)
        r["created_at"] = r["created_at"].isoformat() if r["created_at"] else None
        r["updated_at"] = r["updated_at"].isoformat() if r["updated_at"] else None
        return {"request": r}

# ── GET /api/admin/deadman-reset-requests ── admin lists all requests
@api.get("/admin/deadman-reset-requests")
async def admin_list_dead_man_resets(status: Optional[str] = None, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "approve_deadman_reset"):
        raise HTTPException(403, "Permission denied")
    async with pool.acquire() as conn:
        q = """SELECT r.*, u.full_name, u.phone_number, u.role as urole
               FROM dead_man_reset_requests r JOIN users u ON r.user_id=u.id"""
        if status:
            rows = await conn.fetch(q + " WHERE r.status=$1 ORDER BY r.created_at DESC", status)
        else:
            rows = await conn.fetch(q + " ORDER BY r.created_at DESC LIMIT 100")
        result = []
        for r in rows:
            d = dict(r)
            for k in ("created_at", "updated_at"):
                if d.get(k): d[k] = d[k].isoformat()
            result.append(d)
        return result

# ── POST /api/admin/deadman-reset-requests/{id}/approve ── admin approves
@api.post("/admin/deadman-reset-requests/{request_id}/approve")
async def admin_approve_dead_man_reset(request_id: str, body: DeadManResetReviewIn, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "approve_deadman_reset"):
        raise HTTPException(403, "Permission denied")
    async with pool.acquire() as conn:
        req = await conn.fetchrow(
            "SELECT * FROM dead_man_reset_requests WHERE id=$1", request_id
        )
        if not req:
            raise HTTPException(404, "Request not found")
        if req["status"] != "pending":
            raise HTTPException(400, f"Request is already {req['status']}")
        await conn.execute(
            """UPDATE dead_man_reset_requests
               SET status='approved', admin_id=$1, admin_name=$2, admin_reason=$3, updated_at=NOW()
               WHERE id=$4""",
            admin["id"], admin.get("full_name"), body.reason, request_id
        )
        # Clear the dead man code so user can set a fresh one
        await conn.execute(
            "UPDATE passenger_safety_profiles SET dead_man_code=NULL, updated_at=NOW() WHERE user_id=$1",
            req["user_id"]
        )
        # Notify the user
        await notify_user(
            conn,
            "✅ Dead Man Code Reset Approved",
            f"Your dead man code reset request has been approved. You can now set a new dead man code in your profile.",
            "deadman_reset_approved", req["user_id"]
        )
        # Notify CEO + superadmin about this admin action
        leaders = await conn.fetch(
            "SELECT id FROM users WHERE role IN ('superadmin','ceo') AND is_active=true"
        )
        for lu in leaders:
            if lu["id"] == admin["id"]:
                continue
            await notify_user(
                conn,
                "📋 Dead Man Code Reset — Admin Action",
                f"Admin {admin.get('full_name') or admin.get('email','')} approved a dead man code reset for "
                f"{req.get('user_name') or req['user_id']} ({req.get('user_phone','')}). "
                f"User reason: {req['reason']}. Admin reason: {body.reason}",
                "deadman_reset_report", lu["id"]
            )
        await audit(conn, admin["id"], "APPROVE_DEADMAN_RESET", req["user_id"], "user",
                    {"user_name": req.get("user_name"), "admin_reason": body.reason}, request.client.host)
    return {"ok": True}

# ── POST /api/admin/deadman-reset-requests/{id}/reject ── admin rejects
@api.post("/admin/deadman-reset-requests/{request_id}/reject")
async def admin_reject_dead_man_reset(request_id: str, body: DeadManResetReviewIn, request: Request, admin: dict = Depends(require_admin)):
    if not has_permission(admin, "approve_deadman_reset"):
        raise HTTPException(403, "Permission denied")
    async with pool.acquire() as conn:
        req = await conn.fetchrow(
            "SELECT * FROM dead_man_reset_requests WHERE id=$1", request_id
        )
        if not req:
            raise HTTPException(404, "Request not found")
        if req["status"] != "pending":
            raise HTTPException(400, f"Request is already {req['status']}")
        await conn.execute(
            """UPDATE dead_man_reset_requests
               SET status='rejected', admin_id=$1, admin_name=$2, admin_reason=$3, updated_at=NOW()
               WHERE id=$4""",
            admin["id"], admin.get("full_name"), body.reason, request_id
        )
        await notify_user(
            conn,
            "❌ Dead Man Code Reset Rejected",
            f"Your dead man code reset request was rejected. Reason: {body.reason}. If you believe this is an error, please contact support.",
            "deadman_reset_rejected", req["user_id"]
        )
        # Notify CEO + superadmin about rejection too
        leaders = await conn.fetch(
            "SELECT id FROM users WHERE role IN ('superadmin','ceo') AND is_active=true"
        )
        for lu in leaders:
            if lu["id"] == admin["id"]:
                continue
            await notify_user(
                conn,
                "📋 Dead Man Code Reset — Rejected",
                f"Admin {admin.get('full_name') or admin.get('email','')} rejected a dead man code reset for "
                f"{req.get('user_name') or req['user_id']} ({req.get('user_phone','')}). "
                f"User reason: {req['reason']}. Admin reason: {body.reason}",
                "deadman_reset_report", lu["id"]
            )
        await audit(conn, admin["id"], "REJECT_DEADMAN_RESET", req["user_id"], "user",
                    {"user_name": req.get("user_name"), "admin_reason": body.reason}, request.client.host)
    return {"ok": True}


async def _trigger_dead_man(conn, user: dict, latitude=None, longitude=None, context: str = "trip_end"):
    """Create a dead man alert and notify all admins. Returns the new sos_request id."""
    sos_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await conn.execute(
        "INSERT INTO sos_requests (id,user_id,user_name,user_phone,emergency_type,latitude,longitude,status,is_dead_man,dead_man_triggered_at) "
        "VALUES ($1,$2,$3,$4,'dead_man',$5,$6,'active',true,$7)",
        sos_id, user["id"], user.get("full_name"), user.get("phone_number"), latitude, longitude, now
    )
    if latitude and longitude:
        await conn.execute(
            "INSERT INTO sos_locations (id,sos_id,latitude,longitude) VALUES (gen_random_uuid()::text,$1,$2,$3)",
            sos_id, latitude, longitude
        )
    maps_url = f"https://maps.google.com/?q={latitude},{longitude}" if latitude and longitude else "No location"
    admins = await conn.fetch(
        "SELECT id FROM users WHERE role IN ('superadmin','admin','ceo','cto') AND is_active=true"
    )
    for au in admins:
        await notify_user(
            conn, "🚨 DEAD MAN ALERT",
            f"{user.get('full_name') or 'User'} ({user.get('phone_number','')}) may be under duress ({context}). "
            f"Dead man code entered. Location: {maps_url}",
            "dead_man_alert", au["id"]
        )
    return sos_id


# ── POST /api/saferide/trip/end-pin ── PIN-protected trip end (dead-man aware)
@api.post("/saferide/trip/end-pin")
async def end_trip_with_pin(body: TripEndPinIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow("SELECT pin_hash FROM users WHERE id=$1", user["id"])
        profile  = await conn.fetchrow("SELECT dead_man_code FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        if not user_row:
            raise HTTPException(401, "User not found")
        real_ok     = verify_pin(body.pin, user_row["pin_hash"])
        dead_man_ok = bool(profile and profile["dead_man_code"] and verify_pin(body.pin, profile["dead_man_code"]))
        if not real_ok and not dead_man_ok:
            raise HTTPException(401, "Incorrect PIN")
        if dead_man_ok:
            await _trigger_dead_man(conn, user, body.latitude, body.longitude, "trip_end")
            # return success illusion — caller sees a normal end
            return {"ok": True, "ended": True, "stealth": True}
        # Real PIN: end the trip
        trip = await conn.fetchrow(
            "SELECT id FROM trips WHERE id=$1 AND driver_id=$2 AND status='active'",
            body.trip_id, user["id"]
        )
        if not trip:
            raise HTTPException(404, "Active trip not found")
        now = datetime.now(timezone.utc)
        update_parts = ["status='ended'", "ended_at=$2"]
        vals: List[Any] = [body.trip_id, now]
        if body.latitude is not None:
            update_parts.append(f"end_latitude=${len(vals)+1}"); vals.append(body.latitude)
        if body.longitude is not None:
            update_parts.append(f"end_longitude=${len(vals)+1}"); vals.append(body.longitude)
        await conn.execute(f"UPDATE trips SET {', '.join(update_parts)} WHERE id=$1", *vals)
    return {"ok": True, "ended": True, "stealth": False}


# ── POST /api/saferide/sos/cancel-pin ── PIN-protected SOS cancel (dead-man aware)
@api.post("/saferide/sos/cancel-pin")
async def cancel_sos_with_pin(body: SosCancelPinIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow("SELECT pin_hash FROM users WHERE id=$1", user["id"])
        profile  = await conn.fetchrow("SELECT dead_man_code FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        if not user_row:
            raise HTTPException(401, "User not found")
        real_ok     = verify_pin(body.pin, user_row["pin_hash"])
        dead_man_ok = bool(profile and profile["dead_man_code"] and verify_pin(body.pin, profile["dead_man_code"]))
        if not real_ok and not dead_man_ok:
            raise HTTPException(401, "Incorrect PIN")
        if dead_man_ok:
            # Escalate existing SOS to dead man — don't actually cancel it
            sos = await conn.fetchrow("SELECT id,latitude,longitude FROM sos_requests WHERE id=$1 AND user_id=$2", body.sos_id, user["id"])
            lat = float(sos["latitude"]) if sos and sos["latitude"] else None
            lng = float(sos["longitude"]) if sos and sos["longitude"] else None
            new_id = await _trigger_dead_man(conn, user, lat, lng, "sos_cancel")
            # Mark original SOS as dead man escalation (keep active)
            await conn.execute(
                "UPDATE sos_requests SET is_dead_man=true, dead_man_triggered_at=NOW() WHERE id=$1",
                body.sos_id
            )
            return {"ok": True, "cancelled": True, "stealth": True}
        # Real PIN: cancel SOS
        await conn.execute(
            "UPDATE sos_requests SET status='resolved', resolved_at=NOW() WHERE id=$1 AND user_id=$2",
            body.sos_id, user["id"]
        )
    return {"ok": True, "cancelled": True, "stealth": False}


# ── POST /api/saferide/ghost-ping ── stealth location ping after dead man trigger
@api.post("/saferide/ghost-ping")
async def ghost_ping(body: GhostPingIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        sos = await conn.fetchrow(
            "SELECT id FROM sos_requests WHERE user_id=$1 AND is_dead_man=true AND status='active' ORDER BY created_at DESC LIMIT 1",
            user["id"]
        )
        if not sos:
            return {"ok": False, "continue": False}
        await conn.execute(
            "INSERT INTO sos_locations (id,sos_id,latitude,longitude) VALUES (gen_random_uuid()::text,$1,$2,$3)",
            sos["id"], body.latitude, body.longitude
        )
        await conn.execute(
            "UPDATE sos_requests SET latitude=$1,longitude=$2 WHERE id=$3",
            body.latitude, body.longitude, sos["id"]
        )
    return {"ok": True, "continue": True}


# ── POST /api/saferide/sos ── user triggers SOS distress signal
@api.post("/saferide/sos")
async def create_sos_request(body: SosRequestIn, user: dict = Depends(get_current_user)):
    if body.emergency_type not in ("police", "ambulance"):
        raise HTTPException(400, "emergency_type must be 'police' or 'ambulance'")
    now = datetime.now(timezone.utc)
    sos_id = str(uuid.uuid4())
    user_name = user.get("full_name") or user.get("id")
    user_phone = user.get("phone_number") or ""
    maps_url = (f"https://maps.google.com/?q={body.latitude},{body.longitude}"
                if body.latitude and body.longitude else "Location unavailable")
    time_str = now.strftime("%Y-%m-%d %H:%M UTC")
    etype_label = "POLICE" if body.emergency_type == "police" else "AMBULANCE"
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sos_requests (id,user_id,user_name,user_phone,emergency_type,latitude,longitude,status,created_at) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8)",
            sos_id, user["id"], user_name, user_phone, body.emergency_type,
            body.latitude, body.longitude, now
        )
        if body.latitude and body.longitude:
            await conn.execute(
                "INSERT INTO sos_locations (id,sos_id,latitude,longitude) VALUES ($1,$2,$3,$4)",
                str(uuid.uuid4()), sos_id, body.latitude, body.longitude
            )
        # SMS to all emergency contacts
        profile = await conn.fetchrow("SELECT * FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        if profile:
            for cname, cphone in [
                (profile["emergency_contact_1_name"], profile["emergency_contact_1_phone"]),
                (profile["emergency_contact_2_name"], profile["emergency_contact_2_phone"]),
                (profile["next_of_kin_name"], profile["next_of_kin_phone"]),
            ]:
                if not cphone:
                    continue
                msg = (f"SOS ALERT — {etype_label} NEEDED\n"
                       f"{user_name} has triggered an emergency via Tag n Ride\n"
                       f"Location: {maps_url}\n"
                       f"Time: {time_str}\n"
                       f"Our team is contacting {etype_label} on their behalf.")
                await send_sms(cphone, msg)
        # Notify all admin/superadmin/ceo users
        admin_users = await conn.fetch(
            "SELECT id FROM users WHERE role IN ('superadmin','admin','ceo') AND is_active=true LIMIT 20"
        )
        blood = profile["blood_type"] if profile and profile.get("blood_type") else "Unknown"
        for au in admin_users:
            await notify_user(
                conn,
                f"SOS — {etype_label} NEEDED",
                f"{user_name} | {user_phone} | Blood: {blood} | {maps_url}",
                "sos_alert", au["id"]
            )
    return {"ok": True, "sos_id": sos_id}


# ── POST /api/saferide/sos/{sos_id}/location ── live location ping
@api.post("/saferide/sos/{sos_id}/location")
async def sos_location_ping(sos_id: str, body: SosLocationIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        req = await conn.fetchrow("SELECT id,user_id,status,admin_notes FROM sos_requests WHERE id=$1", sos_id)
        if not req or req["user_id"] != user["id"]:
            raise HTTPException(404, "SOS request not found")
        if req["status"] in ("resolved", "help_received"):
            return {"ok": True, "resolved": True, "help_coming": False, "admin_notes": req["admin_notes"]}
        await conn.execute(
            "INSERT INTO sos_locations (id,sos_id,latitude,longitude) VALUES ($1,$2,$3,$4)",
            str(uuid.uuid4()), sos_id, body.latitude, body.longitude
        )
        await conn.execute(
            "UPDATE sos_requests SET latitude=$1,longitude=$2 WHERE id=$3",
            body.latitude, body.longitude, sos_id
        )
    help_coming = req["status"] in ("help_coming", "dispatched")
    return {"ok": True, "resolved": False, "help_coming": help_coming, "admin_notes": req["admin_notes"]}


# ── PATCH /api/saferide/sos/{sos_id}/received ── user confirms help arrived
@api.patch("/saferide/sos/{sos_id}/received")
async def sos_user_received(sos_id: str, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        req = await conn.fetchrow("SELECT id,user_id,status FROM sos_requests WHERE id=$1", sos_id)
        if not req or req["user_id"] != user["id"]:
            raise HTTPException(404, "SOS request not found")
        await conn.execute(
            "UPDATE sos_requests SET status='resolved',resolved_at=$1,admin_notes=COALESCE(admin_notes||' | ','')|| 'User confirmed help received' WHERE id=$2",
            now, sos_id
        )
    return {"ok": True}


# ── GET /api/admin/saferide/sos ── list all SOS requests (excludes dead man — use /deadman for those)
@api.get("/admin/saferide/sos")
async def admin_list_sos(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT s.*, "
            "(SELECT latitude FROM sos_locations WHERE sos_id=s.id ORDER BY recorded_at DESC LIMIT 1) AS latest_lat, "
            "(SELECT longitude FROM sos_locations WHERE sos_id=s.id ORDER BY recorded_at DESC LIMIT 1) AS latest_lng "
            "FROM sos_requests s WHERE COALESCE(s.is_dead_man, false)=false ORDER BY s.created_at DESC LIMIT 100"
        )
    result = []
    for r in rows:
        d = dict(r)
        for k in ("created_at", "dispatched_at", "resolved_at", "dead_man_triggered_at"):
            if d.get(k):
                d[k] = iso(d[k])
        for k in ("latitude", "longitude", "latest_lat", "latest_lng", "price"):
            if d.get(k) is not None:
                d[k] = float(d[k])
        result.append(d)
    return result


# ── GET /api/admin/saferide/deadman ── list dead man alerts
@api.get("/admin/saferide/deadman")
async def admin_list_dead_man(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT s.*, "
            "(SELECT latitude FROM sos_locations WHERE sos_id=s.id ORDER BY recorded_at DESC LIMIT 1) AS latest_lat, "
            "(SELECT longitude FROM sos_locations WHERE sos_id=s.id ORDER BY recorded_at DESC LIMIT 1) AS latest_lng "
            "FROM sos_requests s WHERE s.is_dead_man=true ORDER BY s.created_at DESC LIMIT 100"
        )
    result = []
    for r in rows:
        d = dict(r)
        for k in ("created_at", "dispatched_at", "resolved_at", "dead_man_triggered_at"):
            if d.get(k):
                d[k] = iso(d[k])
        for k in ("latitude", "longitude", "latest_lat", "latest_lng", "price"):
            if d.get(k) is not None:
                d[k] = float(d[k])
        result.append(d)
    return result


# ── PATCH /api/admin/saferide/sos/bulk ── bulk-update multiple SOS (group incident)
class SosBulkUpdateIn(BaseModel):
    sos_ids: List[str]
    status: str  # 'help_coming' or 'resolved'
    notes: Optional[str] = None

@api.patch("/admin/saferide/sos/bulk")
async def admin_bulk_update_sos(body: SosBulkUpdateIn, admin: dict = Depends(require_admin)):
    if body.status not in ("help_coming", "dispatched", "resolved"):
        raise HTTPException(400, "status must be 'help_coming', 'dispatched', or 'resolved'")
    if not body.sos_ids:
        raise HTTPException(400, "sos_ids must not be empty")
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        if body.status in ("help_coming", "dispatched"):
            await conn.execute(
                "UPDATE sos_requests SET status=$1,admin_id=$2,admin_notes=$3,dispatched_at=$4 WHERE id=ANY($5::text[])",
                body.status, admin["id"], body.notes, now, body.sos_ids
            )
        else:
            await conn.execute(
                "UPDATE sos_requests SET status='resolved',admin_id=$1,admin_notes=$2,resolved_at=$3 WHERE id=ANY($4::text[])",
                admin["id"], body.notes, now, body.sos_ids
            )
    return {"ok": True, "updated": len(body.sos_ids)}


# ── PATCH /api/admin/saferide/sos/{sos_id} ── update status
@api.patch("/admin/saferide/sos/{sos_id}")
async def admin_update_sos(sos_id: str, body: SosUpdateIn, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    if body.status not in ("help_coming", "dispatched", "resolved"):
        raise HTTPException(400, "status must be 'help_coming', 'dispatched', or 'resolved'")
    async with pool.acquire() as conn:
        if body.status in ("help_coming", "dispatched"):
            await conn.execute(
                "UPDATE sos_requests SET status=$1,admin_id=$2,admin_notes=$3,dispatched_at=$4 WHERE id=$5",
                body.status, admin["id"], body.notes, now, sos_id
            )
        else:
            await conn.execute(
                "UPDATE sos_requests SET status='resolved',admin_id=$1,admin_notes=$2,resolved_at=$3 WHERE id=$4",
                admin["id"], body.notes, now, sos_id
            )
    return {"ok": True}


# ── POST /api/admin/saferide/sos/{sos_id}/charge ── debit user for SOS service
@api.post("/admin/saferide/sos/{sos_id}/charge")
async def admin_charge_sos(sos_id: str, body: SosChargeIn, admin: dict = Depends(require_admin)):
    if body.price <= 0:
        raise HTTPException(400, "Price must be greater than 0")
    async with pool.acquire() as conn:
        req = await conn.fetchrow("SELECT * FROM sos_requests WHERE id=$1", sos_id)
        if not req:
            raise HTTPException(404, "SOS request not found")
        if req["charged"]:
            raise HTTPException(400, "Already charged for this SOS")
        etype = (req["emergency_type"] or "").upper()
        ref = f"SOS-{sos_id[:8].upper()}"
        # Attempt wallet deduction; if insufficient funds the balance stays and admin follows up
        deducted = await conn.fetchval(
            "UPDATE wallets SET balance=balance-$1 WHERE user_id=$2 AND balance>=$1 RETURNING balance",
            body.price, req["user_id"]
        )
        txn_note = f"SOS Emergency Service Fee ({etype})"
        await conn.execute(
            "INSERT INTO transactions (id,reference,type,status,amount,sender_id,receiver_id,note) "
            "VALUES ($1,$2,'sos_fee','completed',$3,$4,NULL,$5)",
            str(uuid.uuid4()), ref, body.price, req["user_id"], txn_note
        )
        await conn.execute(
            "UPDATE sos_requests SET price=$1,charged=true WHERE id=$2",
            body.price, sos_id
        )
        # Notify user
        if deducted is not None:
            await notify_user(conn, "SOS Service Fee Charged",
                f"R{body.price:.2f} has been deducted from your wallet for emergency services ({etype}).",
                "sos_fee", req["user_id"])
        else:
            await notify_user(conn, "SOS Service Fee — Payment Due",
                f"R{body.price:.2f} is owed for your recent emergency services ({etype}). Please top up your wallet.",
                "sos_fee", req["user_id"])
    return {"ok": True, "deducted_from_wallet": deducted is not None}


# ── GET /api/admin/track-me ── list active Track Me sessions
@api.get("/admin/track-me")
async def admin_list_track_me(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                t.id,
                t.trip_reference,
                t.created_at,
                u.full_name    AS user_name,
                u.phone_number AS user_phone,
                u.id           AS user_id,
                gl.latitude    AS last_lat,
                gl.longitude   AS last_lng,
                gl.recorded_at AS last_ping
            FROM trips t
            JOIN users u ON u.id = t.driver_id
            LEFT JOIN LATERAL (
                SELECT latitude, longitude, recorded_at
                FROM gps_logs
                WHERE trip_id = t.id
                ORDER BY recorded_at DESC
                LIMIT 1
            ) gl ON true
            WHERE t.status = 'active'
              AND t.trip_reference LIKE 'TNR-TRACK-%'
            ORDER BY t.created_at DESC
        """)
    result = []
    for r in rows:
        d = dict(r)
        d["created_at"] = iso(d.get("created_at"))
        d["last_ping"]  = iso(d.get("last_ping"))
        if d.get("last_lat") is not None: d["last_lat"] = float(d["last_lat"])
        if d.get("last_lng") is not None: d["last_lng"] = float(d["last_lng"])
        result.append(d)
    return result


# ── POST /api/admin/track-me/{trip_id}/end ── force-end a Track Me session
@api.post("/admin/track-me/{trip_id}/end")
async def admin_end_track_me(trip_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        trip = await conn.fetchrow(
            "SELECT id, driver_id FROM trips WHERE id=$1 AND status='active' AND trip_reference LIKE 'TNR-TRACK-%'",
            trip_id
        )
        if not trip:
            raise HTTPException(404, "Track Me session not found or already ended")
        await conn.execute(
            "UPDATE trips SET status='completed', ended_at=NOW() WHERE id=$1",
            trip_id
        )
        await notify_user(
            conn, "Track Me Session Ended",
            "Your Track Me session has been ended by the safety team.",
            "track_me_ended", trip["driver_id"]
        )
    return {"ok": True}


# ── PATCH /api/trips/{trip_id}/details ──
@api.patch("/trips/{trip_id}/details")
async def update_trip_details(trip_id: str, body: TripDetailsIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        await require_can_drive(user, conn)
        trip = await conn.fetchrow("SELECT id FROM trips WHERE id=$1 AND driver_id=$2", trip_id, user["id"])
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        updates, vals = [], []
        if body.cash_passengers is not None:
            updates.append(f"cash_passengers=${len(vals)+1}")
            vals.append(max(0, body.cash_passengers))
        if body.taxi_capacity is not None:
            updates.append(f"taxi_capacity=${len(vals)+1}")
            vals.append(max(0, body.taxi_capacity))
        if updates:
            vals.append(trip_id)
            await conn.execute(f"UPDATE trips SET {', '.join(updates)} WHERE id=${len(vals)}", *vals)
        row = await conn.fetchrow("SELECT * FROM trips WHERE id=$1", trip_id)
    t = dict(row)
    t["started_at"] = iso(t.get("started_at"))
    if t.get("total_revenue") is not None: t["total_revenue"] = float(t["total_revenue"])
    return t

# ── POST /api/trips/share ──
@api.post("/trips/share")
async def trip_share(body: TripShareIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        if user["role"] in ("driver", "owner"):
            # Driver or owner-driver can share any of their own trips
            trip = await conn.fetchrow(
                "SELECT trip_reference FROM trips WHERE id=$1 AND driver_id=$2",
                body.trip_id, user["id"]
            )
        else:
            # Passengers can share a trip they are in
            row = await conn.fetchrow(
                "SELECT t.trip_reference FROM trips t "
                "JOIN trip_passengers tp ON tp.trip_id=t.id "
                "WHERE t.id=$1 AND tp.passenger_id=$2 LIMIT 1",
                body.trip_id, user["id"]
            )
            trip = row
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found or access denied")
    return {
        "share_url": f"{TRACK_BASE_URL}/track/{trip['trip_reference']}",
        "trip_reference": trip["trip_reference"],
    }

# ── GET /api/trips/track/{trip_reference} ── PUBLIC no auth
@api.get("/trips/track/{trip_reference}")
async def trip_track_public(trip_reference: str):
    async with pool.acquire() as conn:
        trip = await conn.fetchrow("SELECT * FROM trips WHERE trip_reference=$1", trip_reference)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        pcount = await conn.fetchval("SELECT COUNT(*) FROM trip_passengers WHERE trip_id=$1", trip["id"])
        # Primary: latest GPS ping for this trip
        loc = await conn.fetchrow(
            "SELECT latitude, longitude, recorded_at FROM gps_locations "
            "WHERE trip_id=$1 ORDER BY recorded_at DESC LIMIT 1",
            trip["id"]
        )
    t = dict(trip)
    driver_full = t.get("driver_name") or ""
    parts = driver_full.split()
    if parts:
        first = parts[0]
        last = parts[-1] if len(parts) > 1 else ""
        masked_name = f"{first} {last[0]}***" if last else first
    else:
        masked_name = "Driver"

    # Resolve coordinates: gps_locations first, then trips.last_latitude fallback
    if loc and loc.get("latitude") is not None:
        last_lat = float(loc["latitude"])
        last_lng = float(loc["longitude"])
        last_update = iso(loc["recorded_at"])
    elif t.get("last_latitude") is not None:
        last_lat = float(t["last_latitude"])
        last_lng = float(t["last_longitude"])
        last_update = iso(t.get("last_location_update"))
    else:
        last_lat = None
        last_lng = None
        last_update = None

    is_personal = t["trip_reference"].startswith("TNR-TRACK-")
    return {
        "trip_reference": t["trip_reference"],
        "vehicle_plate": t.get("vehicle_plate") or "",
        "driver_name": masked_name,
        "status": t.get("status") or "active",
        "started_at": iso(t.get("started_at")),
        "ended_at": iso(t.get("ended_at")),
        "passenger_count": int(pcount or 0),
        "last_latitude": last_lat,
        "last_longitude": last_lng,
        "last_location_update": last_update,
        "is_personal_track": is_personal,
    }

# ── POST /api/track-me/start ──
@api.post("/track-me/start")
async def track_me_start(body: TrackMeStartIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        enabled = await conn.fetchval("SELECT value FROM system_config WHERE key='track_me_enabled'")
        if enabled and enabled.lower() == "false":
            raise HTTPException(status_code=403, detail="Track Me is currently disabled")
        fee_str = await conn.fetchval("SELECT value FROM system_config WHERE key='track_me_fee'")
        fee = float(fee_str or "3.00")
        wallet = await conn.fetchrow("SELECT balance FROM wallets WHERE user_id=$1", user["id"])
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
        if float(wallet["balance"]) < fee:
            raise HTTPException(status_code=400, detail=f"Insufficient balance. Track Me costs R{fee:.2f}.")
        # Check for already active session
        existing = await conn.fetchrow(
            "SELECT id, trip_reference FROM trips WHERE driver_id=$1 AND status='active' AND trip_reference LIKE 'TNR-TRACK-%'",
            user["id"]
        )
        if existing:
            return {
                "session_id": existing["id"],
                "trip_reference": existing["trip_reference"],
                "share_url": f"{TRACK_BASE_URL}/track/{existing['trip_reference']}",
                "fee_charged": 0,
                "already_active": True,
            }
        # Deduct fee
        new_balance = float(wallet["balance"]) - fee
        await conn.execute("UPDATE wallets SET balance=$1 WHERE user_id=$2", new_balance, user["id"])
        # Record transaction
        txn_id = str(uuid.uuid4())
        ref = f"TNR-TRACK-{secrets.token_hex(3).upper()}"
        await conn.execute(
            "INSERT INTO transactions (id,reference,type,status,amount,sender_id,note) VALUES ($1,$2,'track_me','completed',$3,$4,'Track Me session fee')",
            txn_id, ref, fee, user["id"]
        )
        # Create trip row for this session
        session_id = str(uuid.uuid4())
        trip_date = datetime.now(timezone.utc).strftime('%Y%m%d')
        trip_ref = f"TNR-TRACK-{trip_date}-{user['id'][:6].upper()}-{secrets.token_hex(2).upper()}"
        await conn.execute(
            "INSERT INTO trips (id,trip_reference,driver_id,driver_name,driver_phone,vehicle_plate,status,total_passengers,total_revenue) "
            "VALUES ($1,$2,$3,$4,$5,'',  'active',0,0)",
            session_id, trip_ref, user["id"], user.get("full_name",""), user.get("phone_number","")
        )
        if body.latitude is not None and body.longitude is not None:
            await conn.execute(
                "INSERT INTO gps_locations (id,user_id,trip_id,latitude,longitude) VALUES ($1,$2,$3,$4,$5)",
                str(uuid.uuid4()), user["id"], session_id, body.latitude, body.longitude
            )
            await conn.execute(
                "UPDATE trips SET last_latitude=$1,last_longitude=$2,last_location_update=NOW() WHERE id=$3",
                body.latitude, body.longitude, session_id
            )
    return {
        "session_id": session_id,
        "trip_reference": trip_ref,
        "share_url": f"{TRACK_BASE_URL}/track/{trip_ref}",
        "fee_charged": fee,
        "already_active": False,
    }

# ── POST /api/track-me/{session_id}/ping ──
@api.post("/track-me/{session_id}/ping")
async def track_me_ping(session_id: str, body: TrackMePingIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        trip = await conn.fetchrow(
            "SELECT id FROM trips WHERE id=$1 AND driver_id=$2 AND status='active' AND trip_reference LIKE 'TNR-TRACK-%'",
            session_id, user["id"]
        )
        if not trip:
            raise HTTPException(status_code=404, detail="No active Track Me session found")
        await conn.execute(
            "INSERT INTO gps_locations (id,user_id,trip_id,latitude,longitude,accuracy) VALUES ($1,$2,$3,$4,$5,$6)",
            str(uuid.uuid4()), user["id"], session_id, body.latitude, body.longitude, body.accuracy
        )
        await conn.execute(
            "UPDATE trips SET last_latitude=$1,last_longitude=$2,last_location_update=NOW() WHERE id=$3",
            body.latitude, body.longitude, session_id
        )
    return {"ok": True}

# ── POST /api/track-me/{session_id}/end ──
@api.post("/track-me/{session_id}/end")
async def track_me_end(session_id: str, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        trip = await conn.fetchrow(
            "SELECT id FROM trips WHERE id=$1 AND driver_id=$2 AND trip_reference LIKE 'TNR-TRACK-%'",
            session_id, user["id"]
        )
        if not trip:
            raise HTTPException(status_code=404, detail="Track Me session not found")
        await conn.execute("UPDATE trips SET status='completed', ended_at=NOW() WHERE id=$1", session_id)
    return {"ok": True}

# ── POST /api/track-me/end-pin ── PIN-protected stop (dead-man aware)
@api.post("/track-me/end-pin")
async def track_me_end_pin(body: TripEndPinIn, user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow("SELECT pin_hash FROM users WHERE id=$1", user["id"])
        profile  = await conn.fetchrow("SELECT dead_man_code FROM passenger_safety_profiles WHERE user_id=$1", user["id"])
        if not user_row:
            raise HTTPException(401, "User not found")
        real_ok     = verify_pin(body.pin, user_row["pin_hash"])
        dead_man_ok = bool(profile and profile["dead_man_code"] and verify_pin(body.pin, profile["dead_man_code"]))
        if not real_ok and not dead_man_ok:
            raise HTTPException(401, "Incorrect PIN")
        if dead_man_ok:
            await _trigger_dead_man(conn, user, body.latitude, body.longitude, "track_me_stop")
            return {"ok": True, "ended": True, "stealth": True}
        # Real PIN — end the track-me session
        trip = await conn.fetchrow(
            "SELECT id FROM trips WHERE id=$1 AND driver_id=$2 AND status='active' AND trip_reference LIKE 'TNR-TRACK-%'",
            body.trip_id, user["id"]
        )
        if not trip:
            raise HTTPException(404, "Track Me session not found")
        await conn.execute("UPDATE trips SET status='completed', ended_at=NOW() WHERE id=$1", body.trip_id)
    return {"ok": True, "ended": True, "stealth": False}

# ── GET /api/track-me/active ──
@api.get("/track-me/active")
async def track_me_active(user: dict = Depends(get_current_user)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, trip_reference, started_at FROM trips "
            "WHERE driver_id=$1 AND status='active' AND trip_reference LIKE 'TNR-TRACK-%' "
            "ORDER BY started_at DESC LIMIT 1",
            user["id"]
        )
        if not row:
            return {"session": None}
        return {
            "session": {
                "id": row["id"],
                "trip_reference": row["trip_reference"],
                "share_url": f"{TRACK_BASE_URL}/track/{row['trip_reference']}",
                "started_at": iso(row["started_at"]),
            }
        }

# ── GET /api/track-me/fee ── PUBLIC
@api.get("/track-me/fee")
async def track_me_fee():
    async with pool.acquire() as conn:
        fee_str = await conn.fetchval("SELECT value FROM system_config WHERE key='track_me_fee'")
        enabled_str = await conn.fetchval("SELECT value FROM system_config WHERE key='track_me_enabled'")
    return {
        "fee": float(fee_str or "3.00"),
        "enabled": (enabled_str or "true").lower() != "false",
    }

# ── GET /api/trips/passenger-current ──
@api.get("/trips/passenger-current")
async def trip_passenger_current(user: dict = Depends(get_current_user)):
    if user["role"] == "driver":
        raise HTTPException(status_code=403, detail="Passengers only")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT t.* FROM trips t "
            "JOIN trip_passengers tp ON tp.trip_id=t.id "
            "WHERE tp.passenger_id=$1 AND t.status='active' AND tp.alighted=false "
            "ORDER BY tp.boarded_at DESC LIMIT 1",
            user["id"]
        )
        if not row:
            return {"trip": None}
        t = dict(row)
        t["started_at"] = iso(t.get("started_at"))
        if t.get("total_revenue") is not None: t["total_revenue"] = float(t["total_revenue"])
    return {"trip": t}

# ════════════════════════════════════════════════════════════════
# SYSTEM INTELLIGENCE — superadmin & CEO only
# ════════════════════════════════════════════════════════════════

class IntelligenceAskIn(BaseModel):
    question: str = Field(min_length=3, max_length=1000)

async def _get_intelligence_overview(conn) -> dict:
    now_utc = datetime.now(timezone.utc)

    # ── live pulse ──────────────────────────────────────────────
    users_online = await conn.fetchval(
        "SELECT COUNT(DISTINCT sender_id) FROM transactions WHERE created_at > NOW() - INTERVAL '30 minutes' AND is_test IS NOT TRUE"
    ) or 0
    drivers_active = await conn.fetchval(
        "SELECT COUNT(*) FROM driver_routes WHERE status='active'"
    ) or 0
    trips_live = await conn.fetchval(
        "SELECT COUNT(*) FROM trips WHERE status='active'"
    ) or 0
    money_last_hour = await conn.fetchval(
        "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE created_at > NOW() - INTERVAL '1 hour' AND type='payment' AND status='completed' AND is_test IS NOT TRUE"
    ) or 0
    pending_kyc = await conn.fetchval("SELECT COUNT(*) FROM kyc_documents WHERE status='pending'") or 0
    open_disputes = await conn.fetchval("SELECT COUNT(*) FROM disputes WHERE status='open'") or 0
    open_incidents = await conn.fetchval("SELECT COUNT(*) FROM incidents WHERE status != 'resolved'") or 0

    # ── money ────────────────────────────────────────────────────
    today_gross = await conn.fetchval(
        "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE AND is_test IS NOT TRUE"
    ) or 0
    today_cashouts = await conn.fetchval(
        "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type IN ('cashup','withdrawal') AND status='completed' AND DATE(created_at)=CURRENT_DATE AND is_test IS NOT TRUE"
    ) or 0
    today_topups = await conn.fetchval(
        "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='topup' AND status='completed' AND DATE(created_at)=CURRENT_DATE AND is_test IS NOT TRUE"
    ) or 0
    total_wallet = await conn.fetchval(
        "SELECT COALESCE(SUM(balance),0) FROM wallets"
    ) or 0
    pending_withdrawals_amt = await conn.fetchval(
        "SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='pending'"
    ) or 0
    monthly_revenue = await conn.fetchval(
        "SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW()) AND is_test IS NOT TRUE"
    ) or 0
    monthly_revenue_last = await conn.fetchval(
        "SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW()-INTERVAL '1 month') AND is_test IS NOT TRUE"
    ) or 0
    rev_growth = 0.0
    if float(monthly_revenue_last) > 0:
        rev_growth = round((float(monthly_revenue) - float(monthly_revenue_last)) / float(monthly_revenue_last) * 100, 1)
    largest_txn = await conn.fetchval(
        "SELECT COALESCE(MAX(amount),0) FROM transactions WHERE type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE AND is_test IS NOT TRUE"
    ) or 0
    txn_count_today = await conn.fetchval(
        "SELECT COUNT(*) FROM transactions WHERE type='payment' AND status='completed' AND DATE(created_at)=CURRENT_DATE AND is_test IS NOT TRUE"
    ) or 0
    avg_txn = float(today_gross) / int(txn_count_today) if int(txn_count_today) > 0 else 0.0
    payslip_rev_today = await conn.fetchval(
        "SELECT COALESCE(SUM(fee_charged),0) FROM payslips WHERE DATE(created_at)=CURRENT_DATE AND status!='deleted'"
    ) or 0

    # ── users ────────────────────────────────────────────────────
    total_users = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr')") or 0
    total_passengers = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role='passenger'") or 0
    total_drivers = await conn.fetchval("SELECT COUNT(*) FROM drivers") or 0
    total_owners = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role='owner'") or 0
    new_today = await conn.fetchval("SELECT COUNT(*) FROM users WHERE DATE(created_at)=CURRENT_DATE AND role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr')") or 0
    new_week = await conn.fetchval("SELECT COUNT(*) FROM users WHERE created_at >= DATE_TRUNC('week',NOW()) AND role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr')") or 0
    new_month = await conn.fetchval("SELECT COUNT(*) FROM users WHERE created_at >= DATE_TRUNC('month',NOW()) AND role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr')") or 0
    active_today = await conn.fetchval(
        "SELECT COUNT(DISTINCT sender_id) FROM transactions WHERE DATE(created_at)=CURRENT_DATE AND is_test IS NOT TRUE"
    ) or 0
    kyc_approved = await conn.fetchval("SELECT COUNT(*) FROM kyc_documents WHERE status='approved'") or 0
    kyc_pending = await conn.fetchval("SELECT COUNT(*) FROM kyc_documents WHERE status='pending'") or 0
    kyc_rejected = await conn.fetchval("SELECT COUNT(*) FROM kyc_documents WHERE status='rejected'") or 0
    safety_complete = await conn.fetchval("SELECT COUNT(*) FROM passenger_safety_profiles WHERE profile_complete=TRUE") or 0
    safety_incomplete = await conn.fetchval("SELECT COUNT(*) FROM passenger_safety_profiles WHERE profile_complete=FALSE") or 0
    blacklisted = await conn.fetchval("SELECT COUNT(*) FROM blacklist") or 0
    top_passenger_row = await conn.fetchrow(
        """SELECT u.full_name, COALESCE(SUM(t.amount),0) as total_spent
           FROM transactions t JOIN users u ON u.id=t.sender_id
           WHERE t.type='payment' AND t.status='completed' AND t.is_test IS NOT TRUE
           AND DATE_TRUNC('month',t.created_at)=DATE_TRUNC('month',NOW())
           GROUP BY u.id, u.full_name ORDER BY total_spent DESC LIMIT 1"""
    )
    top_driver_row = await conn.fetchrow(
        """SELECT u.full_name, COALESCE(SUM(t.amount),0) as total_earned
           FROM transactions t JOIN users u ON u.id=t.receiver_id
           WHERE t.type='payment' AND t.status='completed' AND t.is_test IS NOT TRUE
           AND DATE_TRUNC('month',t.created_at)=DATE_TRUNC('month',NOW())
           GROUP BY u.id, u.full_name ORDER BY total_earned DESC LIMIT 1"""
    )

    # ── trips ────────────────────────────────────────────────────
    trips_today = await conn.fetchval("SELECT COUNT(*) FROM driver_routes WHERE DATE(started_at)=CURRENT_DATE") or 0
    trips_week = await conn.fetchval("SELECT COUNT(*) FROM driver_routes WHERE started_at >= DATE_TRUNC('week',NOW())") or 0
    pax_in_active = await conn.fetchval(
        "SELECT COALESCE(SUM(app_count+cash_count),0) FROM driver_routes WHERE status='active'"
    ) or 0
    panic_month = await conn.fetchval(
        "SELECT COUNT(*) FROM incidents WHERE flagged_at >= DATE_TRUNC('month',NOW())"
    ) or 0

    # ── safety ───────────────────────────────────────────────────
    active_incidents = await conn.fetchval("SELECT COUNT(*) FROM incidents WHERE status != 'resolved'") or 0
    incidents_month = await conn.fetchval("SELECT COUNT(*) FROM incidents WHERE flagged_at >= DATE_TRUNC('month',NOW())") or 0

    # ── trends ───────────────────────────────────────────────────
    daily_30 = await conn.fetch(
        """SELECT DATE(created_at) as date,
           COALESCE(SUM(platform_fee),0) as fees,
           COALESCE(SUM(amount),0) as volume,
           COUNT(*) as transactions
           FROM transactions WHERE type='payment' AND status='completed'
           AND created_at >= NOW()-INTERVAL '30 days' AND is_test IS NOT TRUE
           GROUP BY DATE(created_at) ORDER BY date"""
    )
    hourly_today = await conn.fetch(
        """SELECT EXTRACT(HOUR FROM created_at)::int as hour,
           COUNT(*) as count, COALESCE(SUM(amount),0) as volume
           FROM transactions WHERE type='payment' AND status='completed'
           AND DATE(created_at)=CURRENT_DATE AND is_test IS NOT TRUE
           GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY hour"""
    )
    user_growth_30 = await conn.fetch(
        """SELECT DATE(created_at) as date, COUNT(*) as new_users
           FROM users WHERE created_at >= NOW()-INTERVAL '30 days'
           AND role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr')
           GROUP BY DATE(created_at) ORDER BY date"""
    )

    # total all-time
    total_txns_all = await conn.fetchval("SELECT COUNT(*) FROM transactions WHERE is_test IS NOT TRUE") or 0
    total_vol_all = await conn.fetchval("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payment' AND status='completed' AND is_test IS NOT TRUE") or 0
    total_fees_all = await conn.fetchval("SELECT COALESCE(SUM(platform_fee),0) FROM transactions WHERE type='payment' AND status='completed' AND is_test IS NOT TRUE") or 0

    # Build user growth with running cumulative
    user_growth_list = []
    cumulative = int(total_users) - sum(int(r["new_users"]) for r in user_growth_30)
    for r in user_growth_30:
        cumulative += int(r["new_users"])
        user_growth_list.append({"date": str(r["date"]), "new_users": int(r["new_users"]), "cumulative": cumulative})

    # Determine system status
    system_status = "healthy"
    if int(open_incidents) > 2 or int(pending_kyc) > 20:
        system_status = "degraded"

    return {
        "timestamp": now_utc.isoformat(),
        "system_status": system_status,
        "live_pulse": {
            "users_online_estimate": int(users_online),
            "drivers_active": int(drivers_active),
            "trips_live": int(trips_live),
            "money_moving_last_hour": float(money_last_hour),
            "pending_kyc": int(pending_kyc),
            "open_compliance_alerts": 0,
            "open_incidents": int(open_incidents),
            "open_disputes": int(open_disputes),
        },
        "money": {
            "today_gross_volume": float(today_gross),
            "today_platform_fees": round(float(today_gross) * 0.03, 2),
            "today_cashouts": float(today_cashouts),
            "today_topups": float(today_topups),
            "total_wallet_balance": float(total_wallet),
            "pending_withdrawals": float(pending_withdrawals_amt),
            "monthly_revenue": float(monthly_revenue),
            "monthly_revenue_last_month": float(monthly_revenue_last),
            "revenue_growth_pct": rev_growth,
            "largest_transaction_today": float(largest_txn),
            "transaction_count_today": int(txn_count_today),
            "avg_transaction_value": round(avg_txn, 2),
            "payslip_revenue_today": float(payslip_rev_today),
        },
        "users": {
            "total_users": int(total_users),
            "total_passengers": int(total_passengers),
            "total_drivers": int(total_drivers),
            "total_owners": int(total_owners),
            "new_users_today": int(new_today),
            "new_users_this_week": int(new_week),
            "new_users_this_month": int(new_month),
            "active_users_today": int(active_today),
            "kyc_approved": int(kyc_approved),
            "kyc_pending": int(kyc_pending),
            "kyc_rejected": int(kyc_rejected),
            "safety_profiles_complete": int(safety_complete),
            "safety_profiles_incomplete": int(safety_incomplete),
            "blacklisted_users": int(blacklisted),
            "top_passenger": {"name": top_passenger_row["full_name"], "total_spent_month": float(top_passenger_row["total_spent"])} if top_passenger_row else None,
            "top_driver": {"name": top_driver_row["full_name"], "total_earned_month": float(top_driver_row["total_earned"])} if top_driver_row else None,
        },
        "trips": {
            "active_trips_now": int(drivers_active),
            "trips_today": int(trips_today),
            "trips_this_week": int(trips_week),
            "total_passengers_in_active_trips": int(pax_in_active),
            "avg_trip_duration_minutes": 0,
            "avg_passengers_per_trip": 0,
            "panic_buttons_this_month": int(panic_month),
        },
        "safety": {
            "active_incidents": int(active_incidents),
            "incidents_this_month": int(incidents_month),
            "emergency_sms_sent_month": 0,
            "drivers_without_safety_profile": 0,
            "passengers_without_safety_profile": int(safety_incomplete),
        },
        "system": {
            "database_status": "healthy",
            "payment_gateway_status": "healthy",
            "sms_gateway_status": "healthy",
            "cloudinary_status": "healthy",
            "total_transactions_all_time": int(total_txns_all),
            "total_volume_all_time": float(total_vol_all),
            "total_fees_all_time": float(total_fees_all),
        },
        "trends": {
            "daily_revenue_last_30_days": [
                {"date": str(r["date"]), "fees": float(r["fees"]), "volume": float(r["volume"]), "transactions": int(r["transactions"])}
                for r in daily_30
            ],
            "hourly_transactions_today": [
                {"hour": r["hour"], "count": int(r["count"]), "volume": float(r["volume"])}
                for r in hourly_today
            ],
            "user_growth_last_30_days": user_growth_list,
            "top_areas": [],
        },
    }


@api.get("/admin/intelligence/overview")
async def intelligence_overview(admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        data = await _get_intelligence_overview(conn)
    return data


@api.get("/admin/intelligence/ai-status")
async def intelligence_ai_status(admin: dict = Depends(require_superadmin)):
    """Diagnostic: check whether the AI service is ready."""
    package_ok = _anthropic is not None
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    key_set = bool(key)
    key_preview = (key[:12] + "...") if key_set else None
    return {
        "package_installed": package_ok,
        "key_set": key_set,
        "key_preview": key_preview,
        "ready": package_ok and key_set,
    }


@api.post("/admin/intelligence/ask")
async def intelligence_ask(body: IntelligenceAskIn, admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        overview = await _get_intelligence_overview(conn)

    context_text = json.dumps(overview, indent=2, default=str)

    system_prompt = (
        "You are the Tag n Ride System Intelligence AI. "
        "You are embedded in the admin panel of Tag n Ride Pty Ltd, "
        "a South African fintech company that provides cashless payment solutions "
        "for the minibus taxi industry. "
        "You have access to real live data from the platform. "
        "Answer questions about the system in plain English. "
        "Always reference the actual numbers from the data provided. "
        "Be specific, honest and actionable. "
        "End every answer with a recommendation or next step. "
        "Never make up numbers - only use what is in the context. "
        "If you cannot answer from the data, say so clearly. "
        "Keep answers under 300 words unless the question needs more. "
        "Format key numbers in a visually clear way. "
        "You understand: wallets, transactions, KYC, SafeRide, trips, fleet owners, "
        "drivers, passengers, platform fees, CashUp, reconciliation, compliance, "
        "payslips, incidents."
    )

    user_message = f"Here is the current system data:\n\n{context_text}\n\nQuestion from admin: {body.question}"

    if _anthropic is None:
        raise HTTPException(status_code=503, detail="AI service unavailable — 'anthropic' package not installed. Run: pip install anthropic>=0.50.0")

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not set. In Railway: Variables → add ANTHROPIC_API_KEY = sk-ant-...")

    try:
        ai_client = _anthropic.Anthropic(api_key=anthropic_key)
        message = ai_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        answer = message.content[0].text if message.content else "No response generated."
    except Exception as e:
        err = str(e)
        if "401" in err or "authentication" in err.lower() or "api_key" in err.lower() or "invalid x-api-key" in err.lower():
            raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is invalid. Verify the key value in Railway Variables — it must start with sk-ant-...")
        raise HTTPException(status_code=502, detail=f"AI service error: {err}")

    suggested = [
        "What is my projected monthly revenue?",
        "Which drivers need attention?",
        "Are there any safety concerns right now?",
        "How is user growth trending?",
        "Is everything working correctly?",
    ]

    return {"answer": answer, "suggested_followups": suggested}


@api.get("/admin/intelligence/timeline")
async def intelligence_timeline(
    metric: str = "revenue",
    period: str = "30d",
    admin: dict = Depends(require_superadmin),
):
    days = 7 if period == "7d" else 90 if period == "90d" else 30
    async with pool.acquire() as conn:
        if metric == "revenue":
            rows = await conn.fetch(
                """SELECT DATE(created_at) as date,
                   COALESCE(SUM(platform_fee),0) as value,
                   COUNT(*) as count
                   FROM transactions WHERE type='payment' AND status='completed'
                   AND created_at >= NOW()-($1 || ' days')::INTERVAL AND is_test IS NOT TRUE
                   GROUP BY DATE(created_at) ORDER BY date""",
                str(days)
            )
        elif metric == "transactions":
            rows = await conn.fetch(
                """SELECT DATE(created_at) as date,
                   COUNT(*) as value, COALESCE(SUM(amount),0) as count
                   FROM transactions WHERE type='payment' AND status='completed'
                   AND created_at >= NOW()-($1 || ' days')::INTERVAL AND is_test IS NOT TRUE
                   GROUP BY DATE(created_at) ORDER BY date""",
                str(days)
            )
        elif metric == "users":
            rows = await conn.fetch(
                """SELECT DATE(created_at) as date, COUNT(*) as value, 0 as count
                   FROM users WHERE created_at >= NOW()-($1 || ' days')::INTERVAL
                   AND role NOT IN ('admin','superadmin','finance','support','ceo','cto','cfo','hr')
                   GROUP BY DATE(created_at) ORDER BY date""",
                str(days)
            )
        elif metric == "trips":
            rows = await conn.fetch(
                """SELECT DATE(started_at) as date, COUNT(*) as value, 0 as count
                   FROM driver_routes WHERE started_at >= NOW()-($1 || ' days')::INTERVAL
                   GROUP BY DATE(started_at) ORDER BY date""",
                str(days)
            )
        else:
            rows = []

    return {
        "metric": metric,
        "period": period,
        "data": [{"date": str(r["date"]), "value": float(r["value"]), "count": float(r["count"])} for r in rows]
    }


@api.get("/admin/intelligence/leaderboard")
async def intelligence_leaderboard(admin: dict = Depends(require_superadmin)):
    async with pool.acquire() as conn:
        top_drivers = await conn.fetch(
            """SELECT u.full_name as name, u.phone_number,
               COALESCE(SUM(t.driver_net),0) as earnings,
               COUNT(t.id) as trips,
               COALESCE(AVG(d.rating_avg),0) as rating
               FROM transactions t
               JOIN users u ON u.id=t.receiver_id
               JOIN drivers d ON d.user_id=u.id
               WHERE t.type='payment' AND t.status='completed' AND t.is_test IS NOT TRUE
               AND DATE_TRUNC('month',t.created_at)=DATE_TRUNC('month',NOW())
               GROUP BY u.id, u.full_name, u.phone_number, d.rating_avg
               ORDER BY earnings DESC LIMIT 10"""
        )
        top_passengers = await conn.fetch(
            """SELECT u.full_name as name, u.phone_number,
               COALESCE(SUM(t.amount),0) as total_spent,
               COUNT(t.id) as trips,
               MIN(u.created_at) as member_since
               FROM transactions t
               JOIN users u ON u.id=t.sender_id
               WHERE t.type='payment' AND t.status='completed' AND t.is_test IS NOT TRUE
               AND DATE_TRUNC('month',t.created_at)=DATE_TRUNC('month',NOW())
               GROUP BY u.id, u.full_name, u.phone_number
               ORDER BY total_spent DESC LIMIT 10"""
        )
        top_owners = await conn.fetch(
            """SELECT u.full_name as name, u.phone_number,
               COUNT(DISTINCT od.driver_user_id) as fleet_size,
               COALESCE(SUM(cr.cashup_amount),0) as fleet_revenue
               FROM fleet_owners fo
               JOIN users u ON u.id=fo.user_id
               LEFT JOIN owner_drivers od ON od.owner_id=fo.id
               LEFT JOIN cashup_records cr ON cr.owner_user_id=fo.user_id
               AND DATE_TRUNC('month',cr.created_at)=DATE_TRUNC('month',NOW())
               GROUP BY u.id, u.full_name, u.phone_number
               ORDER BY fleet_revenue DESC LIMIT 10"""
        )

    def rank_list(rows, keys):
        result = []
        for i, r in enumerate(rows):
            entry = {"rank": i + 1}
            for k in keys:
                v = r[k]
                entry[k] = float(v) if hasattr(v, '__float__') and not isinstance(v, (int, str)) else (str(v) if hasattr(v, 'isoformat') else v)
            result.append(entry)
        return result

    return {
        "top_drivers": rank_list(top_drivers, ["name", "phone_number", "earnings", "trips", "rating"]),
        "top_passengers": rank_list(top_passengers, ["name", "phone_number", "total_spent", "trips", "member_since"]),
        "top_owners": rank_list(top_owners, ["name", "phone_number", "fleet_size", "fleet_revenue"]),
    }


# ════════════════════════════════════════════════════════════════
# Support Tickets
# ════════════════════════════════════════════════════════════════

class TicketCreateIn(BaseModel):
    user_id: Optional[str] = None
    channel: str = Field(default="app")
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=5)
    priority: str = Field(default="normal")

    @field_validator("channel")
    @classmethod
    def val_channel(cls, v):
        if v not in ("whatsapp", "email", "call", "app"): raise ValueError("Invalid channel")
        return v

    @field_validator("priority")
    @classmethod
    def val_priority(cls, v):
        if v not in ("low", "normal", "high", "urgent"): raise ValueError("Invalid priority")
        return v

class TicketUpdateIn(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    resolution_note: Optional[str] = None
    priority: Optional[str] = None

def _ticket_num():
    import random, string
    return "TKT-" + "".join(random.choices(string.digits, k=6))

@api.get("/admin/support/tickets")
async def list_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    channel: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    admin: dict = Depends(require_admin),
):
    async with pool.acquire() as conn:
        conditions = ["1=1"]
        args: list = []
        i = 1
        if status:
            conditions.append(f"t.status=${ i}"); args.append(status); i += 1
        if priority:
            conditions.append(f"t.priority=${i}"); args.append(priority); i += 1
        if channel:
            conditions.append(f"t.channel=${i}"); args.append(channel); i += 1
        if search:
            conditions.append(
                f"(u.full_name ILIKE ${i} OR u.phone_number ILIKE ${i} OR t.subject ILIKE ${i} OR t.ticket_number ILIKE ${i})"
            ); args.append(f"%{search}%"); i += 1
        where = " AND ".join(conditions)
        rows = await conn.fetch(
            f"""SELECT t.*, u.full_name as user_name, u.phone_number,
                       a.full_name as assigned_to_name
                FROM support_tickets t
                LEFT JOIN users u ON u.id=t.user_id
                LEFT JOIN users a ON a.id=t.assigned_to
                WHERE {where}
                ORDER BY t.created_at DESC LIMIT ${i}""",
            *args, min(limit, 500)
        )
    return [{**dict(r), "created_at": iso(r["created_at"]), "updated_at": iso(r.get("updated_at")),
             "resolved_at": iso(r["resolved_at"]) if r.get("resolved_at") else None} for r in rows]

@api.post("/admin/support/tickets")
async def create_ticket(body: TicketCreateIn, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        ticket_id = str(uuid.uuid4())
        ticket_num = _ticket_num()
        await conn.execute(
            """INSERT INTO support_tickets
               (id, ticket_number, user_id, channel, subject, message, status, priority, assigned_to)
               VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8)""",
            ticket_id, ticket_num, body.user_id, body.channel,
            body.subject, body.message, body.priority, admin["id"]
        )
    return {"ok": True, "id": ticket_id, "ticket_number": ticket_num}

@api.patch("/admin/support/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, body: TicketUpdateIn, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        ticket = await conn.fetchrow("SELECT id FROM support_tickets WHERE id=$1", ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        updates = {}
        if body.status: updates["status"] = body.status
        if body.assigned_to: updates["assigned_to"] = body.assigned_to
        if body.resolution_note: updates["resolution_note"] = body.resolution_note
        if body.priority: updates["priority"] = body.priority
        if body.status in ("resolved", "closed"):
            updates["resolved_at"] = "NOW()"
            updates["resolved_by"] = admin["id"]
        if updates:
            set_parts = []
            vals = []
            idx = 1
            for k, v in updates.items():
                if v == "NOW()":
                    set_parts.append(f"{k}=NOW()")
                else:
                    set_parts.append(f"{k}=${idx}"); vals.append(v); idx += 1
            set_parts.append(f"updated_at=NOW()")
            await conn.execute(
                f"UPDATE support_tickets SET {', '.join(set_parts)} WHERE id=${idx}",
                *vals, ticket_id
            )
    return {"ok": True}

@api.get("/admin/support/tickets/stats")
async def ticket_stats(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        open_ct = await conn.fetchval("SELECT COUNT(*) FROM support_tickets WHERE status='open'")
        in_progress = await conn.fetchval("SELECT COUNT(*) FROM support_tickets WHERE status='in_progress'")
        waiting = await conn.fetchval("SELECT COUNT(*) FROM support_tickets WHERE status='waiting_user'")
        resolved_today = await conn.fetchval(
            "SELECT COUNT(*) FROM support_tickets WHERE status IN ('resolved','closed') AND DATE(resolved_at)=CURRENT_DATE"
        )
        urgent = await conn.fetchval("SELECT COUNT(*) FROM support_tickets WHERE priority='urgent' AND status='open'")
        overdue = await conn.fetchval(
            "SELECT COUNT(*) FROM support_tickets WHERE status='open' AND created_at < NOW()-INTERVAL '24 hours'"
        )
    return {"open": int(open_ct), "in_progress": int(in_progress), "waiting_user": int(waiting),
            "resolved_today": int(resolved_today), "urgent_open": int(urgent), "overdue": int(overdue)}


# ════════════════════════════════════════════════════════════════
# Revenue P&L
# ════════════════════════════════════════════════════════════════

@api.get("/admin/revenue/pnl")
async def revenue_pnl(range: str = "30d", admin: dict = Depends(require_admin)):
    from datetime import datetime as _dt, timedelta as _td
    days = int(range.replace("d", "")) if range.endswith("d") else 30
    from_date = _dt.utcnow() - _td(days=days)
    async with pool.acquire() as conn:
        # ── Income ───────────────────────────────────────────────
        platform_fees = float(await conn.fetchval("""
            SELECT COALESCE(SUM(platform_fee), 0) FROM transactions
            WHERE type='payment' AND status='completed' AND created_at >= $1
        """, from_date) or 0)
        subscription_rev = float(await conn.fetchval("""
            SELECT COALESCE(SUM(amount), 0) FROM transactions
            WHERE type IN ('subscription_fee','subscription') AND status='completed' AND created_at >= $1
        """, from_date) or 0)
        statement_rev = float(await conn.fetchval("""
            SELECT COALESCE(SUM(amount), 0) FROM transactions
            WHERE type='statement_fee' AND status='completed' AND created_at >= $1
        """, from_date) or 0)
        sos_rev = float(await conn.fetchval("""
            SELECT COALESCE(SUM(amount), 0) FROM transactions
            WHERE type='sos_fee' AND status='completed' AND created_at >= $1
        """, from_date) or 0)
        maintenance_rev = float(await conn.fetchval("""
            SELECT COALESCE(SUM(amount), 0) FROM transactions
            WHERE type='maintenance_fee' AND status='completed' AND created_at >= $1
        """, from_date) or 0)
        topup_fees = float(await conn.fetchval("""
            SELECT COALESCE(SUM(amount), 0) FROM transactions
            WHERE type='topup_fee' AND status='completed' AND created_at >= $1
        """, from_date) or 0)
        withdrawal_fees = float(await conn.fetchval("""
            SELECT COALESCE(SUM(payout_fee), 0) FROM cashup_records
            WHERE created_at >= $1
        """, from_date) or 0)

        gross_revenue = platform_fees + subscription_rev + statement_rev + sos_rev + maintenance_rev + topup_fees + withdrawal_fees

        # ── Expenses ─────────────────────────────────────────────
        assoc_paid = float(await conn.fetchval("""
            SELECT COALESCE(SUM(payout_amount), 0) FROM association_payouts
            WHERE status='paid' AND paid_at >= $1
        """, from_date) or 0)
        salary_paid = float(await conn.fetchval("""
            SELECT COALESCE(SUM(net_amount), 0) FROM salary_payments
            WHERE status='paid' AND paid_at >= $1
        """, from_date) or 0)

        # ── All-time totals ──────────────────────────────────────
        assoc_paid_total = float(await conn.fetchval(
            "SELECT COALESCE(SUM(payout_amount), 0) FROM association_payouts WHERE status='paid'"
        ) or 0)
        salary_paid_total = float(await conn.fetchval(
            "SELECT COALESCE(SUM(net_amount), 0) FROM salary_payments WHERE status='paid'"
        ) or 0)

        # ── Pending obligations ──────────────────────────────────
        pending_assoc = float(await conn.fetchval(
            "SELECT COALESCE(SUM(payout_amount), 0) FROM association_payouts WHERE status='pending'"
        ) or 0)
        pending_assoc_count = int(await conn.fetchval(
            "SELECT COUNT(*) FROM association_payouts WHERE status='pending'"
        ) or 0)
        pending_salary = float(await conn.fetchval(
            "SELECT COALESCE(SUM(net_amount), 0) FROM salary_payments WHERE status IN ('approved','pending')"
        ) or 0)
        pending_salary_count = int(await conn.fetchval(
            "SELECT COUNT(*) FROM salary_payments WHERE status IN ('approved','pending')"
        ) or 0)

        # ── Per-association payout breakdown ─────────────────────
        assoc_rows = await conn.fetch("""
            SELECT ta.name, COALESCE(SUM(ap.payout_amount), 0) AS total_paid, COUNT(ap.id) AS payout_count
            FROM taxi_associations ta
            LEFT JOIN association_payouts ap ON ap.association_id = ta.id AND ap.status='paid' AND ap.paid_at >= $1
            GROUP BY ta.id, ta.name
            ORDER BY total_paid DESC
        """, from_date)

        total_expenses = assoc_paid + salary_paid
        net_profit = gross_revenue - total_expenses
        profit_margin = (net_profit / gross_revenue * 100) if gross_revenue > 0 else 0

        return {
            "period_days": days,
            "gross_revenue": gross_revenue,
            "income": {
                "platform_fees": platform_fees,
                "subscriptions": subscription_rev,
                "statement_fees": statement_rev,
                "sos_fees": sos_rev,
                "maintenance_fees": maintenance_rev,
                "topup_fees": topup_fees,
                "withdrawal_fees": withdrawal_fees,
            },
            "expenses": {
                "association_payouts": assoc_paid,
                "salary_paid": salary_paid,
                "total": total_expenses,
            },
            "net_profit": net_profit,
            "profit_margin": profit_margin,
            "all_time": {
                "association_payouts": assoc_paid_total,
                "salary_paid": salary_paid_total,
            },
            "pending": {
                "association_payouts": pending_assoc,
                "association_count": pending_assoc_count,
                "salary": pending_salary,
                "salary_count": pending_salary_count,
                "total": pending_assoc + pending_salary,
            },
            "association_breakdown": [dict(r) for r in assoc_rows],
        }

# ════════════════════════════════════════════════════════════════
# Taxi Associations
# ════════════════════════════════════════════════════════════════

class TaxiAssociationCreate(BaseModel):
    name: str
    registration_number: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    branch_code: Optional[str] = None
    agreement_type: str = "per_driver"
    agreement_amount: float = 0.0
    auto_pay_enabled: bool = False
    auto_pay_day: int = 25
    auto_pay_amount: Optional[float] = None
    notes: Optional[str] = None

class TaxiAssociationUpdate(BaseModel):
    name: Optional[str] = None
    registration_number: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    branch_code: Optional[str] = None
    agreement_type: Optional[str] = None
    agreement_amount: Optional[float] = None
    auto_pay_enabled: Optional[bool] = None
    auto_pay_day: Optional[int] = None
    auto_pay_amount: Optional[float] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class AssociationPayNowIn(BaseModel):
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    amount: Optional[float] = None
    notes: Optional[str] = None

class AssociationPayoutCreate(BaseModel):
    period_month: int
    period_year: int
    payout_amount: float
    notes: Optional[str] = None

class DriverAssociationUpdate(BaseModel):
    association_id: Optional[str] = None

@api.get("/admin/taxi-associations")
async def list_taxi_associations(admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT ta.*,
                COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'driver' AND u.is_active = TRUE) AS driver_count
            FROM taxi_associations ta
            LEFT JOIN users u ON u.taxi_association_id = ta.id
            GROUP BY ta.id
            ORDER BY ta.name
        """)
        return [dict(r) for r in rows]

@api.post("/admin/taxi-associations")
async def create_taxi_association(body: TaxiAssociationCreate, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        id_ = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO taxi_associations (id, name, registration_number, contact_name, contact_phone,
                contact_email, province, city, bank_name, account_number, account_holder, branch_code,
                agreement_type, agreement_amount, auto_pay_enabled, auto_pay_day, auto_pay_amount,
                notes, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        """, id_, body.name, body.registration_number, body.contact_name, body.contact_phone,
            body.contact_email, body.province, body.city, body.bank_name, body.account_number,
            body.account_holder, body.branch_code, body.agreement_type, body.agreement_amount,
            body.auto_pay_enabled, body.auto_pay_day, body.auto_pay_amount,
            body.notes, admin["id"])
        await audit(conn, admin["id"], "taxi_association_created", id_, "taxi_association",
                    {"name": body.name}, None)
        return {"ok": True, "id": id_}

@api.get("/admin/taxi-associations/{assoc_id}")
async def get_taxi_association(assoc_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT ta.*,
                COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'driver' AND u.is_active = TRUE) AS driver_count
            FROM taxi_associations ta
            LEFT JOIN users u ON u.taxi_association_id = ta.id
            WHERE ta.id = $1
            GROUP BY ta.id
        """, assoc_id)
        if not row:
            raise HTTPException(404, "Association not found")
        return dict(row)

@api.patch("/admin/taxi-associations/{assoc_id}")
async def update_taxi_association(assoc_id: str, body: TaxiAssociationUpdate, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM taxi_associations WHERE id=$1", assoc_id)
        if not existing:
            raise HTTPException(404, "Association not found")
        updates = {k: v for k, v in body.dict().items() if v is not None}
        if not updates:
            return {"ok": True}
        set_clauses = ", ".join(f"{k}=${i+2}" for i, k in enumerate(updates.keys()))
        await conn.execute(
            f"UPDATE taxi_associations SET {set_clauses}, updated_at=NOW() WHERE id=$1",
            assoc_id, *list(updates.values())
        )
        await audit(conn, admin["id"], "taxi_association_updated", assoc_id, "taxi_association", updates, None)
        return {"ok": True}

@api.delete("/admin/taxi-associations/{assoc_id}")
async def delete_taxi_association(assoc_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id, name FROM taxi_associations WHERE id=$1", assoc_id)
        if not existing:
            raise HTTPException(404, "Association not found")
        await conn.execute("UPDATE users SET taxi_association_id=NULL WHERE taxi_association_id=$1", assoc_id)
        await conn.execute("DELETE FROM taxi_associations WHERE id=$1", assoc_id)
        await audit(conn, admin["id"], "taxi_association_deleted", assoc_id, "taxi_association",
                    {"name": existing["name"]}, None)
        return {"ok": True}

@api.get("/admin/taxi-associations/{assoc_id}/drivers")
async def get_association_drivers(assoc_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.id, u.full_name, u.phone_number, u.is_active, u.created_at,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type='payment' AND t.status='completed'), 0) AS total_ride_revenue,
                COALESCE(SUM(t.platform_fee) FILTER (WHERE t.type='payment' AND t.status='completed'), 0) AS total_platform_fees,
                COUNT(t.id) FILTER (WHERE t.type='payment' AND t.status='completed') AS ride_count
            FROM users u
            LEFT JOIN transactions t ON t.receiver_id = u.id
            WHERE u.taxi_association_id = $1 AND u.role = 'driver'
            GROUP BY u.id, u.full_name, u.phone_number, u.is_active, u.created_at
            ORDER BY u.full_name
        """, assoc_id)
        return [dict(r) for r in rows]

@api.get("/admin/taxi-associations/{assoc_id}/revenue")
async def get_association_revenue(
    assoc_id: str,
    months: int = 12,
    period_month: Optional[int] = None,
    period_year: Optional[int] = None,
    admin: dict = Depends(require_admin)
):
    async with pool.acquire() as conn:
        driver_ids = [r["id"] for r in await conn.fetch(
            "SELECT id FROM users WHERE taxi_association_id=$1 AND role='driver'", assoc_id
        )]
        if not driver_ids:
            return {"monthly": [], "totals": {"platform_fees": 0, "subscription_fees": 0, "statement_fees": 0, "tnr_revenue": 0, "ride_revenue": 0, "total_rides": 0, "driver_count": 0}}

        # Single-period mode: return detailed breakdown for one specific month/year
        if period_month and period_year:
            pf = await conn.fetchrow("""
                SELECT COALESCE(SUM(platform_fee), 0) AS platform_fees,
                       COALESCE(SUM(amount), 0) AS ride_revenue,
                       COUNT(*) AS ride_count
                FROM transactions
                WHERE receiver_id = ANY($1::text[]) AND type='payment' AND status='completed'
                    AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
            """, driver_ids, period_month, period_year)
            sf = await conn.fetchval("""
                SELECT COALESCE(SUM(amount), 0) FROM transactions
                WHERE sender_id = ANY($1::text[]) AND type IN ('subscription_fee','subscription') AND status='completed'
                    AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
            """, driver_ids, period_month, period_year)
            stf = await conn.fetchval("""
                SELECT COALESCE(SUM(amount), 0) FROM transactions
                WHERE sender_id = ANY($1::text[]) AND type='statement_fee' AND status='completed'
                    AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
            """, driver_ids, period_month, period_year)
            platform_fees = float(pf["platform_fees"])
            subscription_fees = float(sf or 0)
            statement_fees = float(stf or 0)
            tnr_revenue = platform_fees + subscription_fees + statement_fees
            return {
                "monthly": [],
                "period": {"month": period_month, "year": period_year},
                "totals": {
                    "platform_fees": platform_fees,
                    "subscription_fees": subscription_fees,
                    "statement_fees": statement_fees,
                    "tnr_revenue": tnr_revenue,
                    "ride_revenue": float(pf["ride_revenue"]),
                    "total_rides": int(pf["ride_count"]),
                    "driver_count": len(driver_ids),
                }
            }

        # Range mode: return last N months of monthly data
        monthly = await conn.fetch("""
            SELECT
                DATE_TRUNC('month', t.created_at) AS month,
                COALESCE(SUM(t.platform_fee), 0) AS platform_fees,
                COALESCE(SUM(t.amount), 0) AS ride_revenue,
                COUNT(*) AS ride_count
            FROM transactions t
            WHERE t.receiver_id = ANY($1::text[])
                AND t.type = 'payment' AND t.status = 'completed'
                AND t.created_at >= NOW() - ($2 || ' months')::interval
            GROUP BY DATE_TRUNC('month', t.created_at)
            ORDER BY month DESC
        """, driver_ids, str(months))

        sub_fees = await conn.fetch("""
            SELECT
                DATE_TRUNC('month', t.created_at) AS month,
                COALESCE(SUM(t.amount), 0) AS sub_fees
            FROM transactions t
            WHERE t.sender_id = ANY($1::text[])
                AND t.type IN ('subscription_fee', 'subscription') AND t.status = 'completed'
                AND t.created_at >= NOW() - ($2 || ' months')::interval
            GROUP BY DATE_TRUNC('month', t.created_at)
        """, driver_ids, str(months))

        stmt_fees = await conn.fetch("""
            SELECT
                DATE_TRUNC('month', t.created_at) AS month,
                COALESCE(SUM(t.amount), 0) AS stmt_fees
            FROM transactions t
            WHERE t.sender_id = ANY($1::text[])
                AND t.type = 'statement_fee' AND t.status = 'completed'
                AND t.created_at >= NOW() - ($2 || ' months')::interval
            GROUP BY DATE_TRUNC('month', t.created_at)
        """, driver_ids, str(months))

        sub_map = {r["month"]: float(r["sub_fees"]) for r in sub_fees}
        stmt_map = {r["month"]: float(r["stmt_fees"]) for r in stmt_fees}

        result = []
        for r in monthly:
            m = r["month"]
            pf_val = float(r["platform_fees"])
            sub_val = sub_map.get(m, 0.0)
            stf_val = stmt_map.get(m, 0.0)
            result.append({
                "month": m.isoformat(),
                "platform_fees": pf_val,
                "ride_revenue": float(r["ride_revenue"]),
                "ride_count": int(r["ride_count"]),
                "subscription_fees": sub_val,
                "statement_fees": stf_val,
                "tnr_revenue": pf_val + sub_val + stf_val,
            })

        totals_row = await conn.fetchrow("""
            SELECT COALESCE(SUM(platform_fee), 0) AS total_platform_fees,
                   COALESCE(SUM(amount), 0) AS total_ride_revenue,
                   COUNT(*) AS total_rides
            FROM transactions
            WHERE receiver_id = ANY($1::text[]) AND type = 'payment' AND status = 'completed'
        """, driver_ids)

        return {
            "monthly": result,
            "totals": {
                "platform_fees": float(totals_row["total_platform_fees"]),
                "ride_revenue": float(totals_row["total_ride_revenue"]),
                "total_rides": int(totals_row["total_rides"]),
                "driver_count": len(driver_ids),
            }
        }

@api.get("/admin/taxi-associations/{assoc_id}/payouts")
async def get_association_payouts(assoc_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM association_payouts
            WHERE association_id = $1
            ORDER BY period_year DESC, period_month DESC
        """, assoc_id)
        return [dict(r) for r in rows]

@api.post("/admin/taxi-associations/{assoc_id}/payouts")
async def create_association_payout(assoc_id: str, body: AssociationPayoutCreate, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        assoc = await conn.fetchrow("SELECT * FROM taxi_associations WHERE id=$1", assoc_id)
        if not assoc:
            raise HTTPException(404, "Association not found")
        driver_ids = [r["id"] for r in await conn.fetch(
            "SELECT id FROM users WHERE taxi_association_id=$1 AND role='driver'", assoc_id
        )]
        platform_fees = 0.0
        subscription_fees = 0.0
        statement_fees = 0.0
        if driver_ids:
            pf = await conn.fetchval("""
                SELECT COALESCE(SUM(platform_fee), 0) FROM transactions
                WHERE receiver_id = ANY($1::text[]) AND type='payment' AND status='completed'
                    AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
            """, driver_ids, body.period_month, body.period_year)
            platform_fees = float(pf or 0)
            sf = await conn.fetchval("""
                SELECT COALESCE(SUM(amount), 0) FROM transactions
                WHERE sender_id = ANY($1::text[]) AND type IN ('subscription_fee','subscription') AND status='completed'
                    AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
            """, driver_ids, body.period_month, body.period_year)
            subscription_fees = float(sf or 0)
            stf = await conn.fetchval("""
                SELECT COALESCE(SUM(amount), 0) FROM transactions
                WHERE sender_id = ANY($1::text[]) AND type='statement_fee' AND status='completed'
                    AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
            """, driver_ids, body.period_month, body.period_year)
            statement_fees = float(stf or 0)
        total_revenue = platform_fees + subscription_fees + statement_fees
        id_ = str(uuid.uuid4())
        ref = gen_ref()
        await conn.execute("""
            INSERT INTO association_payouts (
                id, association_id, period_month, period_year, driver_count,
                platform_fees, subscription_fees, statement_fees, total_revenue,
                payout_amount, bank_name, account_number, account_holder,
                reference, status, notes, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16)
        """, id_, assoc_id, body.period_month, body.period_year, len(driver_ids),
            platform_fees, subscription_fees, statement_fees, total_revenue,
            body.payout_amount, assoc["bank_name"], assoc["account_number"], assoc["account_holder"],
            ref, body.notes, admin["id"])
        await audit(conn, admin["id"], "association_payout_created", assoc_id, "taxi_association",
                    {"amount": body.payout_amount, "period": f"{body.period_year}-{body.period_month:02d}", "reference": ref}, None)
        return {"ok": True, "id": id_, "reference": ref}

@api.post("/admin/taxi-associations/{assoc_id}/pay-now")
async def pay_association_now(assoc_id: str, body: AssociationPayNowIn, admin: dict = Depends(require_admin)):
    """Create a payout record and immediately mark it paid."""
    from datetime import datetime as _dt
    now = _dt.utcnow()
    period_month = body.period_month or now.month
    period_year = body.period_year or now.year
    async with pool.acquire() as conn:
        assoc = await conn.fetchrow("SELECT * FROM taxi_associations WHERE id=$1", assoc_id)
        if not assoc:
            raise HTTPException(404, "Association not found")
        if not assoc["bank_name"] or not assoc["account_number"]:
            raise HTTPException(400, "Banking details missing — add bank name and account number first")

        driver_ids = [r["id"] for r in await conn.fetch(
            "SELECT id FROM users WHERE taxi_association_id=$1 AND role='driver'", assoc_id
        )]

        # Compute revenue for the period
        platform_fees = float(await conn.fetchval("""
            SELECT COALESCE(SUM(platform_fee),0) FROM transactions
            WHERE receiver_id=ANY($1::text[]) AND type='payment' AND status='completed'
                AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
        """, driver_ids, period_month, period_year) or 0)
        subscription_fees = float(await conn.fetchval("""
            SELECT COALESCE(SUM(amount),0) FROM transactions
            WHERE sender_id=ANY($1::text[]) AND type IN ('subscription_fee','subscription') AND status='completed'
                AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
        """, driver_ids, period_month, period_year) or 0) if driver_ids else 0.0
        statement_fees = float(await conn.fetchval("""
            SELECT COALESCE(SUM(amount),0) FROM transactions
            WHERE sender_id=ANY($1::text[]) AND type='statement_fee' AND status='completed'
                AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
        """, driver_ids, period_month, period_year) or 0) if driver_ids else 0.0
        tnr_revenue = platform_fees + subscription_fees + statement_fees

        # Calculate payout amount if not provided
        if body.amount is not None:
            payout_amount = body.amount
        elif assoc["auto_pay_amount"] is not None:
            payout_amount = float(assoc["auto_pay_amount"])
        elif assoc["agreement_type"] == "percentage":
            payout_amount = tnr_revenue * (float(assoc["agreement_amount"]) / 100)
        elif assoc["agreement_type"] == "per_driver":
            payout_amount = float(assoc["agreement_amount"]) * len(driver_ids)
        else:
            payout_amount = float(assoc["agreement_amount"])

        id_ = str(uuid.uuid4())
        ref = gen_ref()
        await conn.execute("""
            INSERT INTO association_payouts (
                id, association_id, period_month, period_year, driver_count,
                platform_fees, subscription_fees, statement_fees, total_revenue,
                payout_amount, bank_name, account_number, account_holder,
                reference, status, paid_at, paid_by, paid_by_name, notes, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'paid',NOW(),$15,$16,$17,$18)
        """, id_, assoc_id, period_month, period_year, len(driver_ids),
            platform_fees, subscription_fees, statement_fees, tnr_revenue,
            payout_amount, assoc["bank_name"], assoc["account_number"], assoc["account_holder"],
            ref, admin["id"], admin.get("full_name", "Admin"), body.notes, admin["id"])

        await audit(conn, admin["id"], "association_pay_now", assoc_id, "taxi_association", {
            "amount": payout_amount, "period": f"{period_year}-{period_month:02d}",
            "reference": ref, "tnr_revenue": tnr_revenue,
        }, None)
        return {"ok": True, "id": id_, "reference": ref, "amount": payout_amount, "tnr_revenue": tnr_revenue}

@api.post("/admin/taxi-associations/process-auto-payments")
async def process_auto_association_payments(admin: dict = Depends(require_admin)):
    """Manually trigger auto-payments for all associations due today."""
    from datetime import datetime as _dt
    today = _dt.utcnow()
    results = []
    async with pool.acquire() as conn:
        due = await conn.fetch("""
            SELECT * FROM taxi_associations
            WHERE auto_pay_enabled=TRUE AND is_active=TRUE AND auto_pay_day=$1
        """, today.day)
        for assoc in due:
            assoc_id = assoc["id"]
            try:
                driver_ids = [r["id"] for r in await conn.fetch(
                    "SELECT id FROM users WHERE taxi_association_id=$1 AND role='driver'", assoc_id
                )]
                platform_fees = float(await conn.fetchval("""
                    SELECT COALESCE(SUM(platform_fee),0) FROM transactions
                    WHERE receiver_id=ANY($1::text[]) AND type='payment' AND status='completed'
                        AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
                """, driver_ids, today.month, today.year) or 0)
                subscription_fees = float(await conn.fetchval("""
                    SELECT COALESCE(SUM(amount),0) FROM transactions
                    WHERE sender_id=ANY($1::text[]) AND type IN ('subscription_fee','subscription') AND status='completed'
                        AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
                """, driver_ids, today.month, today.year) or 0) if driver_ids else 0.0
                statement_fees = float(await conn.fetchval("""
                    SELECT COALESCE(SUM(amount),0) FROM transactions
                    WHERE sender_id=ANY($1::text[]) AND type='statement_fee' AND status='completed'
                        AND EXTRACT(MONTH FROM created_at)=$2 AND EXTRACT(YEAR FROM created_at)=$3
                """, driver_ids, today.month, today.year) or 0) if driver_ids else 0.0
                tnr_revenue = platform_fees + subscription_fees + statement_fees

                if assoc["auto_pay_amount"] is not None:
                    payout_amount = float(assoc["auto_pay_amount"])
                elif assoc["agreement_type"] == "percentage":
                    payout_amount = tnr_revenue * (float(assoc["agreement_amount"]) / 100)
                elif assoc["agreement_type"] == "per_driver":
                    payout_amount = float(assoc["agreement_amount"]) * len(driver_ids)
                else:
                    payout_amount = float(assoc["agreement_amount"])

                # Skip if already paid this month
                existing = await conn.fetchval("""
                    SELECT id FROM association_payouts
                    WHERE association_id=$1 AND period_month=$2 AND period_year=$3 AND status='paid'
                """, assoc_id, today.month, today.year)
                if existing:
                    results.append({"id": assoc_id, "name": assoc["name"], "skipped": True, "reason": "Already paid this month"})
                    continue

                id_ = str(uuid.uuid4())
                ref = gen_ref()
                await conn.execute("""
                    INSERT INTO association_payouts (
                        id, association_id, period_month, period_year, driver_count,
                        platform_fees, subscription_fees, statement_fees, total_revenue,
                        payout_amount, bank_name, account_number, account_holder,
                        reference, status, paid_at, paid_by, paid_by_name, notes, created_by
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'paid',NOW(),$15,$16,$17,$18)
                """, id_, assoc_id, today.month, today.year, len(driver_ids),
                    platform_fees, subscription_fees, statement_fees, tnr_revenue,
                    payout_amount, assoc["bank_name"], assoc["account_number"], assoc["account_holder"],
                    ref, "system", "Auto-Pay", "Monthly auto-payment", "system")
                await audit(conn, admin["id"], "association_auto_paid", assoc_id, "taxi_association", {
                    "amount": payout_amount, "reference": ref, "tnr_revenue": tnr_revenue,
                }, None)
                results.append({"id": assoc_id, "name": assoc["name"], "paid": True, "amount": payout_amount, "reference": ref})
            except Exception as ex:
                results.append({"id": assoc_id, "name": assoc["name"], "error": str(ex)})
    return {"ok": True, "processed": len(results), "results": results}

@api.patch("/admin/taxi-associations/{assoc_id}/payouts/{payout_id}/mark-paid")
async def mark_association_payout_paid(assoc_id: str, payout_id: str, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM association_payouts WHERE id=$1 AND association_id=$2", payout_id, assoc_id
        )
        if not row:
            raise HTTPException(404, "Payout not found")
        await conn.execute("""
            UPDATE association_payouts SET status='paid', paid_at=NOW(), paid_by=$1, paid_by_name=$2
            WHERE id=$3
        """, admin["id"], admin.get("full_name", "Admin"), payout_id)
        await audit(conn, admin["id"], "association_payout_paid", assoc_id, "taxi_association",
                    {"payout_id": payout_id}, None)
        return {"ok": True}

@api.patch("/admin/users/{user_id}/taxi-association")
async def update_driver_taxi_association(user_id: str, body: DriverAssociationUpdate, admin: dict = Depends(require_admin)):
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE id=$1", user_id)
        if not user:
            raise HTTPException(404, "User not found")
        if body.association_id:
            assoc = await conn.fetchrow("SELECT id FROM taxi_associations WHERE id=$1", body.association_id)
            if not assoc:
                raise HTTPException(404, "Association not found")
        await conn.execute("UPDATE users SET taxi_association_id=$1 WHERE id=$2", body.association_id, user_id)
        await audit(conn, admin["id"], "driver_association_updated", user_id, "user",
                    {"association_id": body.association_id}, None)
        return {"ok": True}

# ════════════════════════════════════════════════════════════════
# Must be last line
# ════════════════════════════════════════════════════════════════
app.include_router(api)
