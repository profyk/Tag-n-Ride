# Tag n Ride — Product Requirements (PRD)

## Overview
Cashless taxi/bus payment app inspired by https://github.com/profyk/Tag-n-Ride. Adapted to React Native (Expo) + FastAPI + MongoDB.

Tagline: **No cash, no stress. Scan & pay.**

## Roles
- **Passenger** — top up wallet, scan driver QR, pay, view history, rate drivers.
- **Driver** — display QR code, receive payments, see earnings/ratings, request bank withdrawals.

## Auth
- Phone number + 4-digit PIN
- bcrypt-hashed PINs, JWT Bearer tokens (7-day TTL)
- Token persisted via AsyncStorage
- Self-registration with role selection

## Core Flows
1. **Splash → Welcome** (city skyline + brand logo)
2. **Register / Login** — phone + PIN, role selection (passenger/driver)
3. **Passenger Dashboard** — wallet balance, quick actions (Scan & Pay, Top Up, History), recent transactions
4. **Driver Dashboard** — wallet balance, total earnings, rating, large QR display, withdraw entry
5. **Scan & Pay** — camera QR scan (with manual driver-ID fallback) → driver lookup → amount + note → confirm → success screen with **5-star driver rating**
6. **Top Up** — mock card payment with quick-select amounts
7. **Withdraw** — driver bank withdrawal request (Nigerian banks)
8. **Transactions** — filterable history (Received / Paid / Top-ups / Withdrawals)

## Backend
- FastAPI + MongoDB (motor)
- Atomic balance updates via conditional `find_one_and_update` with `$gte` guard (prevents double-spend)
- Collections: users, wallets, drivers, transactions, withdrawal_requests, ratings
- Currency: NGN (Naira)

## Bonus over original repo
- **Driver rating system** (5-star) recomputes driver's rating_avg/rating_count via aggregation.
- Verified-driver pill, neon dark UI tuned for low-end Android, 4-digit PIN UX with auto-mask.

## Mocks
- **Top-up: MOCKED** card form (CVV/exp not validated against real processor) — instant balance increment.
- **Withdraw: MOCKED** — debits balance immediately and creates a pending withdrawal request; no real bank disbursement.
- **QR camera**: real `expo-camera` with manual fallback (works in web preview).
