# Tag n Ride

A South African cashless taxi payment app — passengers top up a wallet and pay drivers by scanning their QR code.

## Run & Operate

| Service | Command | Port |
|---------|---------|------|
| Backend | `cd backend && uvicorn server:app --host 0.0.0.0 --port 8000 --reload` | 8000 |
| Frontend | `cd frontend && EXPO_NO_DOTENV=1 yarn web --port 5000` | 5000 |

**Required env vars/secrets:**
- `MONGO_URL` — MongoDB connection string; set to `mongomock://` for in-memory dev DB
- `DB_NAME` — database name (e.g. `tagnride`)
- `JWT_SECRET` — secret for signing JWTs (set as Replit secret)
- `EXPO_PUBLIC_BACKEND_URL` — full URL of the backend (e.g. `https://8000-<repl>.replit.dev`)

## Stack

- **Backend**: Python 3.12, FastAPI, Uvicorn, Motor (async MongoDB), mongomock-motor (dev), bcrypt, PyJWT
- **Frontend**: React Native / Expo SDK 54, Expo Router v6, TypeScript, AsyncStorage, react-native-qrcode-svg, expo-camera

## Where things live

- `backend/server.py` — entire FastAPI backend (auth, wallet, transfers, ratings, withdrawals)
- `frontend/app/` — Expo Router pages (file-based routing)
- `frontend/src/api.ts` — typed API client
- `frontend/src/AuthContext.tsx` — global auth state
- `frontend/src/theme.ts` — design tokens (colors, radius, formatZAR)
- `frontend/src/ui.tsx` — shared UI components (Button, Field, Card, Pill, etc.)

## Architecture decisions

- **mongomock-motor** used in dev so no real MongoDB instance is required; swap `MONGO_URL` to a real Atlas URI for production
- **JWT tokens** with 7-day expiry stored in AsyncStorage for smooth mobile UX
- Backend CORS is fully open (`allow_origins=["*"]`) — fine for this demo, tighten for production
- Frontend runs as Expo Web (Metro bundler) on port 5000 so it shows in the Replit preview pane
- All monetary amounts in ZAR (South African Rand); `formatZAR` / `formatNGN` are aliases in `theme.ts`

## Product

- **Passengers**: register, top up wallet (mock card), scan driver QR → pay → rate driver
- **Drivers**: register with vehicle plate, show QR code, receive payments, request bank withdrawal
- Transaction history with filters, real-time wallet balance, driver ratings/stats

## User preferences

_Populate as you build_

## Gotchas

- Never run `npx expo start` directly — use `restart_workflow` so env vars are injected
- `mongomock-motor` resets data on every backend restart (in-memory only)
- The backend's `/api/` prefix is handled by `APIRouter(prefix="/api")`

## Pointers

- Expo skill: `.local/skills/expo/SKILL.md`
- Workflows skill: `.local/skills/workflows/SKILL.md`
