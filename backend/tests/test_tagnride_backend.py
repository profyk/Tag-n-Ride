"""
Tag n Ride backend regression tests.
Covers: auth (register/login/me), wallet (get/topup/transfer/withdraw/rate),
       transactions, driver lookup, withdrawals, role-based access controls,
       and edge cases (insufficient balance, self-pay, duplicate ratings).
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://ride-tagging.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


def _suffix() -> str:
    return f"{int(time.time())}{uuid.uuid4().hex[:4]}"


@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def passenger(session):
    sfx = _suffix()
    phone = f"+23480{sfx[-9:]}"
    payload = {
        "phone_number": phone,
        "full_name": "TEST_Passenger",
        "pin": "1234",
        "role": "passenger",
    }
    r = session.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"passenger register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "phone": phone,
        "pin": "1234",
        "token": data["token"],
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


@pytest.fixture(scope="module")
def driver(session):
    sfx = _suffix()
    phone = f"+23490{sfx[-9:]}"
    payload = {
        "phone_number": phone,
        "full_name": "TEST_Driver",
        "pin": "5678",
        "role": "driver",
    }
    r = session.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"driver register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "phone": phone,
        "pin": "5678",
        "token": data["token"],
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


# ---- Health ----
class TestHealth:
    def test_health(self, session):
        r = session.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert body.get("name") == "Tag n Ride"


# ---- Auth ----
class TestAuth:
    def test_register_passenger_returns_token(self, passenger):
        assert passenger["token"]
        assert passenger["user"]["role"] == "passenger"
        assert passenger["user"]["full_name"] == "TEST_Passenger"
        assert "id" in passenger["user"]

    def test_register_driver_returns_token(self, driver):
        assert driver["token"]
        assert driver["user"]["role"] == "driver"

    def test_register_duplicate_phone_400(self, session, passenger):
        r = session.post(
            f"{API}/auth/register",
            json={
                "phone_number": passenger["phone"],
                "full_name": "Dup",
                "pin": "1111",
                "role": "passenger",
            },
            timeout=15,
        )
        assert r.status_code == 400

    def test_register_invalid_pin_422(self, session):
        r = session.post(
            f"{API}/auth/register",
            json={
                "phone_number": f"+23470{_suffix()[-9:]}",
                "full_name": "Bad PIN",
                "pin": "12a4",
                "role": "passenger",
            },
            timeout=15,
        )
        assert r.status_code == 422

    def test_login_success(self, session, passenger):
        r = session.post(
            f"{API}/auth/login",
            json={"phone_number": passenger["phone"], "pin": passenger["pin"]},
            timeout=15,
        )
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_wrong_pin_401(self, session, passenger):
        r = session.post(
            f"{API}/auth/login",
            json={"phone_number": passenger["phone"], "pin": "0000"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_me_with_token(self, session, passenger):
        r = session.get(f"{API}/auth/me", headers=passenger["headers"], timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == passenger["user"]["id"]
        assert "pin_hash" not in body
        assert "_id" not in body

    def test_me_without_token_401(self, session):
        r = session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_invalid_token_401(self, session):
        r = session.get(
            f"{API}/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
            timeout=15,
        )
        assert r.status_code == 401


# ---- Wallet basics ----
class TestWallet:
    def test_passenger_wallet_initial(self, session, passenger):
        r = session.get(f"{API}/wallet", headers=passenger["headers"], timeout=15)
        assert r.status_code == 200
        w = r.json()
        assert w["currency"] == "NGN"
        assert w["balance"] == 0.0
        assert w["user_id"] == passenger["user"]["id"]
        # passenger should not have driver-only fields
        assert "qr_code" not in w
        assert "total_earnings" not in w

    def test_driver_wallet_has_qr_and_rating_fields(self, session, driver):
        r = session.get(f"{API}/wallet", headers=driver["headers"], timeout=15)
        assert r.status_code == 200
        w = r.json()
        assert w["currency"] == "NGN"
        assert "qr_code" in w
        assert w["qr_code"].startswith("app://pay?driver_id=")
        assert w["total_earnings"] == 0.0
        assert w["rating_avg"] == 0.0
        assert w["rating_count"] == 0

    def test_topup_passenger_increments_balance(self, session, passenger):
        r = session.post(
            f"{API}/wallet/topup",
            json={"amount": 5000},
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["balance"] == 5000.0
        txn = body["transaction"]
        assert txn["type"] == "topup"
        assert txn["status"] == "completed"
        assert txn["currency"] == "NGN"
        assert txn["amount"] == 5000
        # verify GET
        w = session.get(f"{API}/wallet", headers=passenger["headers"], timeout=15).json()
        assert w["balance"] == 5000.0

    def test_topup_driver_forbidden_403(self, session, driver):
        r = session.post(
            f"{API}/wallet/topup",
            json={"amount": 1000},
            headers=driver["headers"],
            timeout=15,
        )
        assert r.status_code == 403

    def test_topup_negative_amount_422(self, session, passenger):
        r = session.post(
            f"{API}/wallet/topup",
            json={"amount": -10},
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 422


# ---- Driver lookup ----
class TestDriverLookup:
    def test_driver_lookup_returns_public_info(self, session, passenger, driver):
        r = session.get(
            f"{API}/wallet/driver/{driver['user']['id']}",
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["user_id"] == driver["user"]["id"]
        assert d["full_name"] == "TEST_Driver"
        assert d["phone_number"] == driver["phone"]
        assert "qr_code" in d
        assert "rating_avg" in d
        assert "rating_count" in d

    def test_driver_lookup_unknown_404(self, session, passenger):
        r = session.get(
            f"{API}/wallet/driver/{uuid.uuid4()}",
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 404

    def test_driver_lookup_requires_auth_401(self, session, driver):
        r = session.get(f"{API}/wallet/driver/{driver['user']['id']}", timeout=15)
        assert r.status_code == 401


# ---- Transfer ----
class TestTransfer:
    def test_transfer_self_400(self, session, passenger):
        # passenger trying to pay themselves (use own user_id even though not a driver)
        r = session.post(
            f"{API}/wallet/transfer",
            json={"driver_user_id": passenger["user"]["id"], "amount": 100},
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 400
        assert "yourself" in r.json().get("detail", "").lower()

    def test_transfer_driver_forbidden_403(self, session, driver):
        # driver attempting to transfer
        r = session.post(
            f"{API}/wallet/transfer",
            json={"driver_user_id": uuid.uuid4().hex, "amount": 100},
            headers=driver["headers"],
            timeout=15,
        )
        assert r.status_code == 403

    def test_transfer_insufficient_balance_400(self, session, driver):
        # New passenger with zero balance
        sfx = _suffix()
        reg = session.post(
            f"{API}/auth/register",
            json={
                "phone_number": f"+23481{sfx[-9:]}",
                "full_name": "TEST_Broke",
                "pin": "9999",
                "role": "passenger",
            },
            timeout=15,
        ).json()
        h = {"Authorization": f"Bearer {reg['token']}"}
        r = session.post(
            f"{API}/wallet/transfer",
            json={"driver_user_id": driver["user"]["id"], "amount": 1000},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 400
        assert "insufficient" in r.json().get("detail", "").lower()

    def test_transfer_unknown_driver_404(self, session, passenger):
        r = session.post(
            f"{API}/wallet/transfer",
            json={"driver_user_id": str(uuid.uuid4()), "amount": 50},
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 404

    def test_transfer_success_atomic(self, session, passenger, driver):
        # ensure passenger has enough balance (topped up to 5000 earlier)
        before_p = session.get(f"{API}/wallet", headers=passenger["headers"], timeout=15).json()["balance"]
        before_d = session.get(f"{API}/wallet", headers=driver["headers"], timeout=15).json()
        r = session.post(
            f"{API}/wallet/transfer",
            json={"driver_user_id": driver["user"]["id"], "amount": 1500, "note": "TEST_ride"},
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["balance"] == before_p - 1500
        txn = body["transaction"]
        assert txn["type"] == "payment"
        assert txn["status"] == "completed"
        assert txn["amount"] == 1500
        assert txn["sender_id"] == passenger["user"]["id"]
        assert txn["receiver_id"] == driver["user"]["id"]
        # stash for ratings test
        pytest._tagnride_payment_txn_id = txn["id"]
        # verify driver wallet credited and earnings increased
        after_d = session.get(f"{API}/wallet", headers=driver["headers"], timeout=15).json()
        assert after_d["balance"] == before_d["balance"] + 1500
        assert after_d["total_earnings"] == before_d["total_earnings"] + 1500


# ---- Transactions list ----
class TestTransactions:
    def test_passenger_sees_topup_and_payment(self, session, passenger, driver):
        r = session.get(f"{API}/wallet/transactions", headers=passenger["headers"], timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        types = {t["type"] for t in items}
        assert "topup" in types
        assert "payment" in types
        # sorted desc
        ts = [t["created_at"] for t in items]
        assert ts == sorted(ts, reverse=True)
        # direction & counterparty enrichment
        payment = next(t for t in items if t["type"] == "payment")
        assert payment["direction"] == "out"
        assert payment["counterparty_name"] == "TEST_Driver"
        topup = next(t for t in items if t["type"] == "topup")
        assert topup["direction"] == "in"

    def test_driver_sees_received_payment(self, session, driver, passenger):
        r = session.get(f"{API}/wallet/transactions", headers=driver["headers"], timeout=15)
        assert r.status_code == 200
        items = r.json()
        payment = next((t for t in items if t["type"] == "payment"), None)
        assert payment is not None
        assert payment["direction"] == "in"
        assert payment["counterparty_name"] == "TEST_Passenger"


# ---- Withdraw ----
class TestWithdraw:
    def test_withdraw_passenger_forbidden_403(self, session, passenger):
        r = session.post(
            f"{API}/wallet/withdraw",
            json={"amount": 100, "bank_name": "GTBank", "account_number": "0123456789"},
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 403

    def test_withdraw_driver_success(self, session, driver):
        before = session.get(f"{API}/wallet", headers=driver["headers"], timeout=15).json()["balance"]
        r = session.post(
            f"{API}/wallet/withdraw",
            json={
                "amount": 500,
                "bank_name": "GTBank",
                "account_number": "0123456789",
                "account_name": "TEST_Driver",
            },
            headers=driver["headers"],
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["balance"] == before - 500
        assert body["withdrawal"]["status"] == "pending"
        assert body["transaction"]["type"] == "withdrawal"
        assert body["transaction"]["status"] == "pending"

    def test_withdraw_insufficient_balance_400(self, session, driver):
        r = session.post(
            f"{API}/wallet/withdraw",
            json={"amount": 999_999, "bank_name": "GTB", "account_number": "0123456789"},
            headers=driver["headers"],
            timeout=15,
        )
        assert r.status_code == 400

    def test_withdrawals_list_driver(self, session, driver):
        r = session.get(f"{API}/wallet/withdrawals", headers=driver["headers"], timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        assert items[0]["status"] == "pending"

    def test_withdrawals_list_passenger_403(self, session, passenger):
        r = session.get(f"{API}/wallet/withdrawals", headers=passenger["headers"], timeout=15)
        assert r.status_code == 403


# ---- Ratings ----
class TestRatings:
    def test_rate_passenger_success(self, session, passenger, driver):
        txn_id = getattr(pytest, "_tagnride_payment_txn_id", None)
        assert txn_id, "previous payment txn id missing"
        r = session.post(
            f"{API}/wallet/rate",
            json={
                "driver_user_id": driver["user"]["id"],
                "transaction_id": txn_id,
                "stars": 5,
                "comment": "TEST_great",
            },
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # verify driver record updated
        d = session.get(
            f"{API}/wallet/driver/{driver['user']['id']}",
            headers=passenger["headers"],
            timeout=15,
        ).json()
        assert d["rating_count"] == 1
        assert d["rating_avg"] == 5.0

    def test_rate_duplicate_400(self, session, passenger, driver):
        txn_id = getattr(pytest, "_tagnride_payment_txn_id", None)
        r = session.post(
            f"{API}/wallet/rate",
            json={
                "driver_user_id": driver["user"]["id"],
                "transaction_id": txn_id,
                "stars": 4,
            },
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 400

    def test_rate_driver_forbidden_403(self, session, driver):
        r = session.post(
            f"{API}/wallet/rate",
            json={
                "driver_user_id": driver["user"]["id"],
                "transaction_id": str(uuid.uuid4()),
                "stars": 5,
            },
            headers=driver["headers"],
            timeout=15,
        )
        assert r.status_code == 403

    def test_rate_unknown_transaction_404(self, session, passenger, driver):
        r = session.post(
            f"{API}/wallet/rate",
            json={
                "driver_user_id": driver["user"]["id"],
                "transaction_id": str(uuid.uuid4()),
                "stars": 5,
            },
            headers=passenger["headers"],
            timeout=15,
        )
        assert r.status_code == 404
