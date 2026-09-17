# 🪔 PujoPlan — Durga Puja Route & Group Planning App

Plan your Puja. Explore Kolkata. Enjoy together.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + React Router 6 |
| Auth | Firebase Authentication (Google OAuth) |
| Map | Leaflet + OpenStreetMap |
| Backend | Node.js + Express.js |
| ORM | Prisma |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Routing API | OpenRouteService (server-side) |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Clone & install root
```bash
cd pujoplan
```

### 2. Backend setup
```bash
cd server
npm install

# Copy env and fill in values
cp ../.env.example .env

# Generate Prisma client + push schema to SQLite
npx prisma generate
npx prisma db push

# Seed the 200+ Kolkata pandal dataset
npm run seed

# Start API server (http://localhost:5000)
npm start
```

### 3. Frontend setup
```bash
cd client
npm install

# Start Vite dev server (http://localhost:5173)
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Environment Variables

Copy `.env.example` → `server/.env` and fill in:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite `file:./dev.db` or PostgreSQL URL |
| `FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK private key |
| `JWT_SECRET` | Secret for signing JWTs |
| `ORS_API_KEY` | OpenRouteService API key (optional in dev) |

> ⚠️ **Never expose `ORS_API_KEY` in frontend code.** All ORS calls go through the backend.

---

## Development Mode

If Firebase Admin SDK keys or ORS key are not configured, the app runs in **demo mode**:
- A demo user can log in without real Google credentials.
- Routes use a heuristic nearest-neighbor TSP fallback instead of ORS.

---

## API Reference

```
POST   /api/auth/session              — Exchange Firebase ID token for JWT
GET    /api/users/me                  — Authenticated user profile

GET    /api/spots                     — List spots (filters: region, category, crowdLevel, search)
GET    /api/spots/:id                 — Single spot

POST   /api/groups                    — Create group
GET    /api/groups                    — My groups
GET    /api/groups/:id                — Group detail
DELETE /api/groups/:id                — Delete group (admin)
POST   /api/groups/:id/invite         — Regenerate invite token (admin)
GET    /api/groups/invite-info/:token — Preview invite
POST   /api/groups/join/:token        — Join group (auth required)
GET    /api/groups/:id/members        — List members
DELETE /api/groups/:id/members/:uid   — Remove member (admin)

POST   /api/groups/:id/spots          — Add spot to group
DELETE /api/groups/:id/spots/:spotId  — Remove spot
POST   /api/groups/:id/spots/:spotId/vote   — Vote / unvote
POST   /api/groups/:id/route          — Generate optimized route

POST   /api/solo-plans                — Create solo plan
GET    /api/solo-plans                — My solo plans
GET    /api/solo-plans/:id            — Solo plan detail
POST   /api/solo-plans/:id/spots      — Add spot
DELETE /api/solo-plans/:id/spots/:sid — Remove spot
POST   /api/solo-plans/:id/route      — Generate solo route
```

---

## Folder Structure

```
pujoplan/
├── client/          ← React + Vite frontend
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── layouts/
│       ├── hooks/
│       ├── services/
│       ├── context/
│       └── utils/
└── server/          ← Node + Express backend
    ├── controllers/
    ├── routes/
    ├── middleware/
    ├── services/
    ├── utils/
    ├── prisma/
    └── config/
```
