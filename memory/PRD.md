# Tag n Ride — Product Requirements (PRD)

## Overview
Cashless taxi/bus payment app inspired by https://github.com/profyk/Tag-n-Ride. Adapted to React Native (Expo) + FastAPI + MongoDB.

Tagline: **No cash, no stress. Scan & pay.** · Powered by **BukkaPay Technologies**.

## Launch market
**South Africa first.** Currency: **ZAR (R)**. Country code: **+27 only** for now (UI shows 🇿🇦 chip).

## Roles
- **Passenger** — top up wallet, scan driver QR, pay, view history, rate drivers.
- **Driver** — display QR + vehicle plate, receive payments, see earnings/ratings, request bank withdrawals to SA banks.

## Auth
- Phone number (+27 9 local digits) + 4-digit PIN
- bcrypt-hashed PINs, JWT Bearer tokens (7-day TTL)
- Token persisted via AsyncStorage
- Self-registration with role selection
- PIN visibility toggle (eye icon)

## Core Flows
1. **Splash → Welcome** (city skyline + brand logo + "Powered by BukkaPay Technologies")
2. **Register / Login** — phone + PIN, role selection (passenger/driver). Drivers also enter vehicle plate.
3. **Passenger Dashboard** — wallet balance (ZAR), quick actions (Scan & Pay, Top Up, History), recent transactions
4. **Driver Dashboard** — wallet balance, total earnings, rating, large QR display + vehicle plate, withdraw entry
5. **Scan & Pay** — camera QR scan (works on web + native via expo-camera), torch/flashlight toggle, manual driver-ID fallback → driver lookup (shows plate) → amount + note → confirm → success screen with **5-star driver rating**
6. **Top Up** — mock card payment with quick-select amounts (R50/100/200/500/1000)
7. **Withdraw** — driver bank withdrawal to SA banks (Standard Bank, FNB, Absa, Nedbank, Capitec, Investec, Discovery, TymeBank, African Bank)
8. **Transactions** — filterable history (Received / Paid / Top-ups / Withdrawals)
9. **Profile** — driver can edit vehicle plate, sign-out (verified working)

## Backend
- FastAPI + MongoDB (motor)
- Atomic balance updates via conditional `find_one_and_update` with `$gte` guard (prevents double-spend)
- Collections: users, wallets, drivers, transactions, withdrawal_requests, ratings
- Currency: **ZAR**
- New endpoint: `PATCH /api/driver/profile` to update vehicle plate (driver only)

## Bonus over original repo
- **Driver rating system** (5-star) recomputes driver's rating_avg/rating_count via aggregation.
- **Vehicle plate visible to passengers** (yellow license-plate-style chip on Pay confirm + driver QR screen).
- **BukkaPay Technologies** branding.
- **Web QR scanner** support (expo-camera CameraView works on web in SDK 54).
- **Flashlight (torch) toggle** on the Scan & Pay screen for low-light environments.
- **PIN show/hide toggle** on all PIN inputs.

## Mocks
- **Top-up: MOCKED** card form (CVV/exp not validated against real processor) — instant balance increment.
- **Withdraw: MOCKED** — debits balance immediately and creates a pending withdrawal request; no real bank disbursement.
- **QR camera**: real `expo-camera` with manual fallback.
