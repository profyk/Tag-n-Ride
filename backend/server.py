from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator


# ---- Config ----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ACCESS_TTL_MIN = 60 * 24 * 7  # 7 days for mobile UX

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Tag n Ride API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tagnride")


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
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def gen_ref() -> str:
    return f"PAY-{secrets.token_hex(6).upper()}"


# ---- Models ----
Role = Literal["passenger", "driver"]


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
    bank_name: str = Field(min_length=2, max_length=100)
    account_number: str = Field(min_length=6, max_length=20)
    account_name: Optional[str] = None


class RateIn(BaseModel):
    driver_user_id: str
    transaction_id: str
    stars: int = Field(ge=1, le=5)
    comment: Optional[str] = None


# ---- Startup ----
@app.on_event("startup")
async def on_start():
    await db.users.create_index("phone_number", unique=True)
    await db.users.create_index("id", unique=True)
    await db.wallets.create_index("user_id", unique=True)
    await db.drivers.create_index("user_id", unique=True)
    await db.drivers.create_index("qr_code", unique=True)
    await db.transactions.create_index("reference", unique=True)
    await db.transactions.create_index([("sender_id", 1), ("created_at", -1)])
    await db.transactions.create_index([("receiver_id", 1), ("created_at", -1)])
    await db.ratings.create_index("driver_user_id")
    log.info("Indexes ready")


@app.on_event("shutdown")
async def on_stop():
    client.close()


# ---- Routes ----
@api.get("/")
async def health():
    return {"ok": True, "name": "Tag n Ride"}


# ---- Auth ----
@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"phone_number": body.phone_number})
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "phone_number": body.phone_number,
        "full_name": body.full_name,
        "role": body.role,
        "pin_hash": hash_pin(body.pin),
        "is_active": True,
        "created_at": now_utc(),
    }
    await db.users.insert_one(user_doc)
    await db.wallets.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "balance": 0.0,
        "currency": "ZAR",
        "is_frozen": False,
        "created_at": now_utc(),
    })
    if body.role == "driver":
        await db.drivers.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "qr_code": f"app://pay?driver_id={user_id}",
            "vehicle_plate": (body.vehicle_plate or "").upper().strip(),
            "total_earnings": 0.0,
            "is_verified": False,
            "rating_avg": 0.0,
            "rating_count": 0,
            "created_at": now_utc(),
        })
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
    user = await db.users.find_one({"phone_number": body.phone_number.strip()})
    if not user or not verify_pin(body.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid phone number or PIN")
    if not user.get("is_active", True):
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
        drv = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "vehicle_plate": 1})
        if drv:
            user["vehicle_plate"] = drv.get("vehicle_plate", "")
    return user


@api.patch("/driver/profile")
async def update_driver_profile(body: DriverProfileIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    plate = body.vehicle_plate.upper().strip()
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"vehicle_plate": plate}})
    return {"vehicle_plate": plate}


# ---- Wallet ----
@api.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    extras = {}
    if user["role"] == "driver":
        drv = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
        if drv:
            extras = {
                "qr_code": drv["qr_code"],
                "vehicle_plate": drv.get("vehicle_plate", ""),
                "total_earnings": drv["total_earnings"],
                "rating_avg": drv.get("rating_avg", 0.0),
                "rating_count": drv.get("rating_count", 0),
            }
    return {**wallet, "created_at": iso(wallet["created_at"]), **extras}


@api.post("/wallet/topup")
async def topup(body: TopUpIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can top up")
    res = await db.wallets.find_one_and_update(
        {"user_id": user["id"], "is_frozen": False},
        {"$inc": {"balance": body.amount}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=400, detail="Wallet not available")
    txn = {
        "id": str(uuid.uuid4()),
        "reference": gen_ref(),
        "type": "topup",
        "status": "completed",
        "amount": body.amount,
        "currency": "ZAR",
        "sender_id": None,
        "receiver_id": user["id"],
        "note": "Wallet top-up",
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    txn["created_at"] = iso(txn["created_at"])
    txn.pop("_id", None)
    return {"balance": res["balance"], "transaction": txn}


@api.get("/wallet/driver/{driver_user_id}")
async def lookup_driver(driver_user_id: str, _: dict = Depends(get_current_user)):
    drv = await db.drivers.find_one({"user_id": driver_user_id}, {"_id": 0})
    if not drv:
        raise HTTPException(status_code=404, detail="Driver not found")
    user = await db.users.find_one({"id": driver_user_id}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Driver user not found")
    return {
        "user_id": user["id"],
        "full_name": user["full_name"],
        "phone_number": user["phone_number"],
        "qr_code": drv["qr_code"],
        "vehicle_plate": drv.get("vehicle_plate", ""),
        "is_verified": drv.get("is_verified", False),
        "rating_avg": drv.get("rating_avg", 0.0),
        "rating_count": drv.get("rating_count", 0),
    }


@api.post("/wallet/transfer")
async def transfer(body: TransferIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can pay")
    if body.driver_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot pay yourself")
    drv = await db.drivers.find_one({"user_id": body.driver_user_id})
    if not drv:
        raise HTTPException(status_code=404, detail="Driver not found")
    # Atomic conditional debit
    sender_w = await db.wallets.find_one_and_update(
        {"user_id": user["id"], "is_frozen": False, "balance": {"$gte": body.amount}},
        {"$inc": {"balance": -body.amount}},
        return_document=True,
        projection={"_id": 0},
    )
    if not sender_w:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    # Credit driver
    await db.wallets.update_one(
        {"user_id": body.driver_user_id},
        {"$inc": {"balance": body.amount}},
    )
    await db.drivers.update_one(
        {"user_id": body.driver_user_id},
        {"$inc": {"total_earnings": body.amount}},
    )
    txn = {
        "id": str(uuid.uuid4()),
        "reference": gen_ref(),
        "type": "payment",
        "status": "completed",
        "amount": body.amount,
        "currency": "ZAR",
        "sender_id": user["id"],
        "receiver_id": body.driver_user_id,
        "note": body.note or "Ride payment",
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    txn["created_at"] = iso(txn["created_at"])
    txn.pop("_id", None)
    return {"balance": sender_w["balance"], "transaction": txn}


@api.get("/wallet/transactions")
async def transactions(limit: int = 50, user: dict = Depends(get_current_user)):
    cur = db.transactions.find(
        {"$or": [{"sender_id": user["id"]}, {"receiver_id": user["id"]}]},
        {"_id": 0},
    ).sort("created_at", -1).limit(min(limit, 200))
    items = []
    async for t in cur:
        t["created_at"] = iso(t["created_at"])
        # enrich with counterparty name
        cp_id = t["receiver_id"] if t["sender_id"] == user["id"] else t["sender_id"]
        cp_name = None
        if cp_id:
            cp = await db.users.find_one({"id": cp_id}, {"_id": 0, "full_name": 1})
            cp_name = cp["full_name"] if cp else None
        t["counterparty_name"] = cp_name
        t["direction"] = "out" if t.get("sender_id") == user["id"] else "in"
        items.append(t)
    return items


@api.post("/wallet/withdraw")
async def withdraw(body: WithdrawIn, user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can withdraw")
    sender_w = await db.wallets.find_one_and_update(
        {"user_id": user["id"], "is_frozen": False, "balance": {"$gte": body.amount}},
        {"$inc": {"balance": -body.amount}},
        return_document=True,
        projection={"_id": 0},
    )
    if not sender_w:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    req = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "amount": body.amount,
        "bank_name": body.bank_name,
        "account_number": body.account_number,
        "account_name": body.account_name or user["full_name"],
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.withdrawal_requests.insert_one(req)
    txn = {
        "id": str(uuid.uuid4()),
        "reference": gen_ref(),
        "type": "withdrawal",
        "status": "pending",
        "amount": body.amount,
        "currency": "ZAR",
        "sender_id": user["id"],
        "receiver_id": None,
        "note": f"Withdraw to {body.bank_name} {body.account_number}",
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    req["created_at"] = iso(req["created_at"])
    txn["created_at"] = iso(txn["created_at"])
    req.pop("_id", None)
    txn.pop("_id", None)
    return {"balance": sender_w["balance"], "withdrawal": req, "transaction": txn}


@api.post("/wallet/rate")
async def rate(body: RateIn, user: dict = Depends(get_current_user)):
    if user["role"] != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can rate")
    txn = await db.transactions.find_one({"id": body.transaction_id, "sender_id": user["id"]})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.get("type") != "payment" or txn.get("receiver_id") != body.driver_user_id:
        raise HTTPException(status_code=400, detail="Transaction does not match driver")
    existing = await db.ratings.find_one({"transaction_id": body.transaction_id})
    if existing:
        raise HTTPException(status_code=400, detail="Already rated")
    await db.ratings.insert_one({
        "id": str(uuid.uuid4()),
        "driver_user_id": body.driver_user_id,
        "passenger_user_id": user["id"],
        "transaction_id": body.transaction_id,
        "stars": body.stars,
        "comment": body.comment,
        "created_at": now_utc(),
    })
    # Recompute driver rating
    pipeline = [
        {"$match": {"driver_user_id": body.driver_user_id}},
        {"$group": {"_id": "$driver_user_id", "avg": {"$avg": "$stars"}, "count": {"$sum": 1}}},
    ]
    agg = await db.ratings.aggregate(pipeline).to_list(1)
    if agg:
        await db.drivers.update_one(
            {"user_id": body.driver_user_id},
            {"$set": {"rating_avg": round(agg[0]["avg"], 2), "rating_count": agg[0]["count"]}},
        )
    return {"ok": True}


@api.get("/wallet/withdrawals")
async def withdrawals(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers")
    cur = db.withdrawal_requests.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    items = []
    async for r in cur:
        r["created_at"] = iso(r["created_at"])
        items.append(r)
    return items


# Mount router
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
