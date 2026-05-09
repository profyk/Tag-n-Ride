# Tag n Ride — Admin Dashboard

Production-ready Next.js admin panel for the Tag n Ride fintech system.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 — redirects to /admin/dashboard (or /login if unauthenticated).

## Backend: Add Admin Routes

Copy `ADMIN_BACKEND_ROUTES.py` into your `server.py` before `app.include_router(api)`.

Then create an admin user in your DB:

```sql
INSERT INTO users (id, phone_number, full_name, role, pin_hash)
VALUES (
  gen_random_uuid()::text,
  '+27800000000',
  'Admin',
  'admin',
  '$2b$12$...'  -- bcrypt hash of your chosen PIN
);
```

Or temporarily update an existing user:
```sql
UPDATE users SET role='admin' WHERE phone_number='+27XXXXXXXXX';
```

## Pages

| Route | Description |
|-------|-------------|
| /login | Admin login |
| /admin/dashboard | Overview stats + recent transactions |
| /admin/users | User management (block/unblock, reset PIN) |
| /admin/drivers | Driver list + verification |
| /admin/drivers/[id] | Driver detail + QR code download/print |
| /admin/transactions | Transaction table with filters |
| /admin/withdrawals | Approve/reject withdrawals (with balance refund on reject) |
| /admin/payouts | Driver payout accounts (masked) |
| /admin/analytics | Charts: daily volume + driver leaderboard |

## Security Notes

- Only users with `role = "admin"` can access any `/api/admin/*` endpoint
- JWT is verified server-side on every request
- Expired tokens auto-redirect to /login
- Bank account numbers are masked in the UI
- PINs are never exposed — reset sets to `0000` (temporary)
- 
