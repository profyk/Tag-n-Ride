# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

Three independent packages — each has its own `node_modules` / `package.json`:

```
Tag-n-Ride/
├── admin/        # Next.js 14 App Router — admin dashboard (deployed on Vercel)
├── frontend/     # Expo 54 / React Native — passenger + driver mobile app
├── backend/      # FastAPI (Python) — single server.py, deployed on Railway
└── company-docs/ # Markdown files served by admin /api/documents routes
```

The backend is the single source of truth. Both `admin` and `frontend` call the same production API at `https://tag-n-ride-production.up.railway.app`.

---

## Commands

### Admin (Next.js)
```bash
cd admin
npm install
npm run dev          # localhost:3000
npm run build        # Vercel build — TypeScript errors fail the build
```
Admin auto-deploys from GitHub `main` branch to Vercel. Push to main = deploy.

### Frontend (Expo / React Native)
```bash
cd frontend
yarn install
yarn start           # Expo dev server
yarn android         # Android emulator/device
yarn ios             # iOS simulator
yarn lint            # expo lint
```
Uses `yarn` (not npm). Package manager is pinned in `package.json`.

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```
All logic lives in `backend/server.py` (single-file architecture). Requires env vars set in `.env`.

---

## Backend Environment Variables

Required in `backend/.env`:
```
DATABASE_URL=
JWT_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
ANTHROPIC_API_KEY=        # Required for System Intelligence AI (admin/intelligence)
```
The app will crash on startup if any Cloudinary var is missing. `ANTHROPIC_API_KEY` is optional at startup but the intelligence AI returns 503 without it.

---

## Architecture

### Auth Flow

**Frontend:** JWT stored in `AsyncStorage` under key `tnr_token`. Sent as `Authorization: Bearer {token}` on every request. Role embedded in JWT payload (`role` field).

**Admin:** JWT stored in `localStorage` under key `tnr_admin_token`. Permissions array stored separately under `tnr_permissions`. Helper functions in `admin/lib/api.ts`:
- `getRole()` — decodes JWT client-side
- `isSuperAdmin()` — true for `superadmin` or `ceo`
- `hasPermission(p)` — checks permissions array
- `isAuthenticated()` — validates expiry + role whitelist

**Backend:** FastAPI `Depends(require_*)` guards on every route. Admin roles: `admin`, `superadmin`, `finance`, `support`, `ceo`, `cto`, `cfo`, `hr`. App user roles: `passenger`, `driver`, `owner`.

Danger actions (e.g. execute payroll, freeze wallet) require an additional `X-Danger-Token` header verified via `DangerPinModal` in the admin.

### Admin Panel (`admin/`)

- `app/admin/*/page.tsx` — one page per feature, all `"use client"`
- `components/layout/AdminShell.tsx` — wraps every page, handles auth redirect
- `components/layout/Sidebar.tsx` — collapsible nav groups with permission filtering
- `components/ui/index.tsx` — shared UI: `Card`, `Table`, `Tr`, `Td`, `Badge`, `Button`, `Spinner`, `Modal`, `Input`, `Select`
- `lib/api.ts` — Axios client + all typed API calls + auth helpers
- `lib/utils.ts` — `formatZAR()`, `formatDate()`

All API calls go directly to the Railway backend — there are no Next.js API route proxies except for `/api/documents` (which reads `company-docs/*.md` from the filesystem).

Multi-role admins: `extra_roles TEXT` column (comma-separated). `has_permission()` merges base role + extra roles.

### Frontend App (`frontend/`)

Expo Router (file-based routing):
- `app/(app)/` — protected screens (passenger + driver)
- `app/(auth)/` — login, register, welcome
- `app/owner/` — fleet owner screens
- `app/verify/` — public payslip verification

`src/api.ts` — single `api` object with all typed calls. `request<T>()` helper handles auth header injection from AsyncStorage.

`src/AuthContext.tsx` — `useAuth()` hook, state is `{ status: "authed", user: {...} } | { status: "guest" }`.

`src/ThemeContext.tsx` — `useTheme()` returns `colors` object. **Always use `useTheme()` — never import static `colors` from `theme.ts` in screen components**, as it won't respond to theme changes.

`src/DocumentContext.tsx` — tracks unread document count, badge in header.

### Backend (`backend/server.py`)

Single-file FastAPI app (~11,000+ lines). Structure within the file:
1. Imports + env setup + Cloudinary config
2. DB pool (`asyncpg`) with lifespan context
3. `APIRouter` instance (`api`)
4. All route handlers grouped by feature
5. `app.include_router(api)` at the end

Key DB tables: `users`, `wallets`, `transactions`, `withdrawal_requests`, `kyc_documents`, `payout_settings`, `system_config`, `cashup_records`, `outstanding_balances`, `owner_drivers`, `fleet_owners`, `payslips`, `statement_requests`, `payroll_runs`, `staff`, `user_documents`, `incidents`, `trips`, `driver_routes`, `passenger_safety_profiles`, `blacklist`, `disputes`.

**`system_config` table** — key/value store for runtime config (fees, pricing, feature flags). Read via `GET /api/admin/config`, written via `PATCH /api/admin/config/{key}`.

**`payout_settings` table** — single row for payout/cashup configuration including `owner_statement_price`, `passenger_statement_price`, commission defaults, fuel settings.

---

## Key Patterns

### Adding a new admin page

1. Create `admin/app/admin/{feature}/page.tsx` with `"use client"` at top
2. Wrap in `<AdminShell title="...">` 
3. Add to a nav group in `admin/components/layout/Sidebar.tsx`
4. Auth guard: check `hasPermission("...")` or `isSuperAdmin()` at the top of the page component

### Adding a config key (fee / feature flag)

- Add the key to `system_config` via the backend migration pattern
- Expose it via `GET /api/admin/config` (already returns all rows)
- Edit it via `PATCH /api/admin/config/{key}` with `{ value: string }`
- In the admin UI, use the Settings page pattern or add to `admin/app/admin/document-pricing/page.tsx` for document fees

### Payslip / Statement pricing

- **Driver payslips** (1/3/6/12 months): `system_config` keys `payslip_fee_*` / `formal_payslip_fee_*`
- **Owner fleet statement**: `payout_settings.owner_statement_price`
- **Passenger expense statement**: `payout_settings.passenger_statement_price`
- Managed via `/admin/document-pricing`

### Danger actions

Wrap with `useDangerPin()` hook:
```tsx
const { open, request, handleSuccess, handleCancel } = useDangerPin();
// ...
const token = await request();
if (!token) return;
// use token in X-Danger-Token header
```

---

## Design System

Dark theme, electric/neon aesthetic. Brand colour is **cyan `#00E5FF`** (Tailwind: `text-cyan`, `bg-cyanDim`, `border-cyan/20`).

**Admin Tailwind tokens** (defined in `admin/app/globals.css`):
`bg`, `bg2`, `bg3`, `text`, `textMuted`, `textDim`, `border`, `cyan`, `cyanDim`, `green`, `red`, `yellow`, `purple`, `orange`

**Frontend** (`frontend/src/theme.ts`): same palette as `colors.bg`, `colors.cyan`, etc. Spacing: `radius.sm/md/lg/pill`.

Icon library: `lucide-react` (admin), `@expo/vector-icons` Ionicons (frontend).

UI components for admin are all in `admin/components/ui/index.tsx`. Reuse them — don't create one-off styled divs for tables, modals, badges, or buttons.

---

## DB Column Gotchas

- `wallets.frozen_reason` — NOT `freeze_reason`
- `owner_drivers` has `daily_target`, `confirmed` columns
- `fleet_owners` has `cashup_method`, `bank_name`, `account_number`, `account_name`
- `users` has `ban_reason`, `extra_roles` (comma-separated additional admin roles)
- `users.phone_number` is nullable — owners register with email+password, no phone
- Analytics range param: always pass `range: "7d"|"30d"|"90d"` to `analytics()` calls
- `user_documents.metadata` is a `jsonb` column — asyncpg returns it as a Python dict (json codec configured on pool init). In the frontend, always defensively parse: `typeof m === "string" ? JSON.parse(m) : m`
- `owner_drivers.owner_id` references `fleet_owners.id` (NOT `fleet_owners.user_id`) — use `JOIN fleet_owners fo ON fo.id = od.owner_id`

## Owner Registration

Owners register with email + password (no phone). The `users.phone_number` NOT NULL constraint was dropped via migration. The `RegisterIn` model accepts `driver_mode: bool` which is stored in `fleet_owners.registered_as_driver`. Owner login: `POST /api/auth/owner-login` (email+password, returns JWT).

## Document Viewing Pattern

`user_documents` links to payslips/statements via `metadata.payslip_id` (driver docs) or `metadata.statement_id` + `metadata.statement_type` ("passenger"|"owner"). The full-screen viewer is `frontend/app/(app)/document-view.tsx` — navigated to via `router.push('/(app)/document-view?id=DOC_ID')`. PDF builders are exported from `payslip.tsx` (`buildStatementPDF`, `buildFormalPayslipPDF`), `statement.tsx` (`buildPassengerStatementPDF`), and `owner/statement.tsx` (`buildOwnerStatementPDF`).

## Public Verify Page

`admin/app/verify/page.tsx` — publicly accessible at `https://tag-n-ride-admin.vercel.app/verify?ref=REF`. Calls `GET /api/driver/payslip/verify?ref=...` (no auth). Share links from the mobile app point here.

## Deployment

- **Admin**: push to `main` → Vercel auto-deploys. Build errors block deployment.
- **Backend**: Railway auto-deploys from the connected repo. Backend env vars set in Railway dashboard.
- **Frontend**: `eas build` for native builds. EAS project ID: `c67cdf54-7ac5-43f7-bbfe-2cf692014d3d`.
