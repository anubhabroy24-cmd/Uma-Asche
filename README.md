# 🪔 Uma-Asche (PujoPlan 2026) — Durga Puja Route & Group Planning Web Application

A full-stack collaborative web application built for planning Durga Puja visits in Kolkata. Individuals or groups can select Kolkata regions (North, South, Central), explore verified Puja spots, vote on destinations, see interactive OpenStreetMap routes with numbered markers, and calculate optimized travel routes via OpenRouteService.

---

## 🌟 Key Features

1. **Google Authentication & Dev Mode**:
   - Official Google OAuth 2.0 with JWT session persistence.
   - Built-in Demo/Dev Mode adapter to test full flows without requiring immediate API keys.
2. **Strict Black + White + Yellow Design System**:
   - Clean, modern, high-contrast aesthetics with zero clutter or excessive gradients.
   - Mobile-responsive design optimized for navigating during Durga Puja festivities.
3. **Curated Kolkata Dataset**:
   - 30+ iconic pandals across **South Kolkata** (Maddox Square, Ekdalia Evergreen, Suruchi Sangha), **North Kolkata** (Bagbazar, Sovabazar Rajbari, Kumartuli Park, College Square), and **Central Kolkata** (Santosh Mitra Square, Simla Vyayam Samiti).
   - Rich metadata: exact coordinates, crowd levels (*Moderate, High, Very High*), categories (*Traditional, Theme, Famous, Heritage, Family Friendly*), and descriptions.
4. **Collaborative Group Planning & Unique Invite Tokens**:
   - Unique shareable invite links: `/join/:inviteToken` (e.g., `/join/ABC123XYZ`).
   - Secure server-side validation: prevents duplicate memberships and unauthorized actions.
   - Democratic pandal voting with thumbs-up tallies, unvote capabilities, and Admin finalize controls.
5. **Smart Routing with OpenRouteService & Heuristic TSP**:
   - Server-side route calculation starting from any landmark or metro station.
   - Real OpenRouteService directions/optimization via backend environment variable (`ORS_API_KEY`).
   - Offline Heuristic Traveling Salesperson fallback ensuring route ordering and map rendering never break.
6. **Solo Planning Mode**:
   - Streamlined personal itinerary generator with identical routing and map visualization.

---

## 🏗️ Tech Stack

- **Frontend**: React 18, Vite, React Router 6, Leaflet & OpenStreetMap, Lucide Icons.
- **Backend**: Node.js, Express.js, Prisma ORM, JSON Web Tokens (JWT), Axios, Rate Limiter.
- **Database**: SQLite (instant local run) or PostgreSQL (production-ready).
- **External APIs**: OpenRouteService (server-side only), Google OAuth.

---

## 🚀 Quick Start Instructions

### 1. Backend Setup
```bash
cd pujoplan/server
npm install

# Generate database schema and seed the Kolkata Puja dataset
npx prisma generate
npx prisma db push
npm run seed

# Start the backend server
npm start
# (Runs at http://localhost:5000)
```

### 2. Frontend Setup
```bash
cd pujoplan/client
npm install

# Start the Vite development server
npm run dev
# (Runs at http://localhost:5173)
```

Open your browser at **`http://localhost:5173`**.

---

## 🔑 Environment Variables

The server includes a `.env.example` file. Copy it to `.env` if configuring production keys:

```env
# Database connection
DATABASE_URL="file:./dev.db"

# Server port
PORT=5000
CLIENT_URL=http://localhost:5173

# Google OAuth (optional in dev mode)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# OpenRouteService API Key (optional in dev mode, fallback TSP is active)
ORS_API_KEY=your_openrouteservice_api_key_here

# JWT Secret
JWT_SECRET=pujoplan_jwt_super_secret_festive_key_2026_kolkata
NODE_ENV=development
```

---

## 🗺️ API Endpoints Reference

### Authentication
- `POST /api/auth/session` - Google token exchange or demo session
- `GET /api/users/me` - Authenticated user profile

### Puja Spots
- `GET /api/spots` - Query spots with filters (`region`, `category`, `crowdLevel`, `search`)
- `GET /api/spots/:id` - Single spot details

### Groups & Collaboration
- `POST /api/groups` - Create group & generate invite token
- `GET /api/groups` - Get current user's groups
- `GET /api/groups/:id` - Detailed group view with members & suggested spots
- `DELETE /api/groups/:id` - Delete group (Admin only)
- `POST /api/groups/:id/invite` - Regenerate invite token (Admin only)
- `GET /api/groups/invite-info/:token` - Preview invite details
- `POST /api/groups/join/:token` - Join group (requires auth)
- `DELETE /api/groups/:id/members/:userId` - Remove member
- `POST /api/groups/:id/spots` - Add spot to group
- `DELETE /api/groups/:id/spots/:spotId` - Remove spot from group
- `POST /api/groups/:id/spots/:spotId/vote` - Vote / unvote spot
- `POST /api/groups/:id/spots/:spotId/finalize` - Finalize spot (Admin only)
- `POST /api/groups/:id/route` - Generate optimized group route

### Solo Tours
- `POST /api/solo-plans` - Create solo tour
- `GET /api/solo-plans` - List user's solo tours
- `GET /api/solo-plans/:id` - Get solo tour details
- `POST /api/solo-plans/:id/spots` - Add spot to solo tour
- `DELETE /api/solo-plans/:id/spots/:spotId` - Remove spot
- `POST /api/solo-plans/:id/route` - Generate solo route

