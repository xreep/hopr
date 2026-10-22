# Hopr

Route optimization for last-mile delivery anywhere in India. Fleet managers plan multi-stop, multi-vehicle routes that account for traffic, delivery windows, priority and fuel; dispatch them to drivers; and watch them live. Drivers deliver with photo and signature proof. Customers follow their parcel on a live tracking link.

- **Live app**: not deployed yet. See [Deployment](#deployment-free-tiers-0); add the URLs here once they exist.
  - Frontend: `https://<your-app>.vercel.app`
  - API: `https://<your-api>.onrender.com/api/health`
- **Technical documentation**: [docs/TECHNICAL.md](docs/TECHNICAL.md), covering architecture, data models, the routing algorithm, traffic, fuel, security, the full API reference, NFRs and tests
- **Product requirements**: [docs/PRD.md](docs/PRD.md)

## What it does

**Fleet managers and admins**
- Plan a batch: type addresses (India-wide autocomplete, nearest the hub first) or upload a CSV, then set priority, delivery window and weight per stop
- Choose vehicles: fleet vehicles, or a type (motorbike, van, truck, electric van) and a count
- Optimise: sequence, ETAs in IST, fuel and CO₂, window violations, savings against the order as entered, and alternatives
- Dispatch: assign by hand, or auto-dispatch with a preview of every pairing
- Monitor: a live fleet map on the dashboard and live monitor; report congestion or road closures; recalculate affected routes
- Analyse: the six KPIs from the spec over 7, 30 or 90 days or a year, compared with the previous period, plus a CSV export
- Manage vehicles, drivers and, as admin, users and roles
- Press ⌘K or Ctrl+K anywhere to jump to a page or route and run actions
- Run a demo morning from the dashboard: the demo vans in all five cities are dispatched and drive their roads at 20 times real time

**Drivers**
- Today's route, the next stop with plain-language timing, and one-tap navigation
- Delivered with photo and/or signature; Couldn't deliver with a reason; report a problem or a delay
- Location shared every 5 seconds while a route is active; spoken announcements
- Built for phones, with an action dock at the bottom of the screen; installable to the home screen
- Works without signal: deliveries, photos and signatures are saved on the phone and sent when the connection returns, recorded at the time they happened
- English or Hindi, including spoken announcements

**Customers**
- A tracking link per delivery, no login needed: the driver moving smoothly along the road, a live "N min away" ETA, and an Arriving alert within 500 m, in English or Hindi

## Demo accounts

These accounts are created by the demo seeder (below). They are demo credentials for a demo database; never reuse them for real accounts.

| Role | Email | Password |
|---|---|---|
| Admin | admin@hopr.com | admin123 |
| Fleet manager | manager@hopr.com | manager123 |
| Driver (Ravi Kumar Oraon) | driver@hopr.com | driver123 |
| Driver (Pooja Kumari) | pooja.driver@hopr.com | driver123 |
| Driver (Imran Ansari) | imran.driver@hopr.com | driver123 |
| Driver (Kavya Reddy) | kavya.driver@hopr.com | driver123 |
| Driver (Sourav Das) | sourav.driver@hopr.com | driver123 |

The login page has one-click buttons for the first three. The seeder also creates six vehicles, each based at a hub in New Delhi, Mumbai, Bengaluru, Kolkata or Ranchi, and a five-stop morning route with delivery windows in each city. The Ranchi route is assigned to Ravi; the other four wait for auto-dispatch, which pairs each with the driver in that city. Re-running it is safe: it adds fresh demo routes and never overwrites passwords.

## Quick start

**Prerequisites**: Node.js 20.19+ or 22.12+, and MongoDB 6+ (local, or a free Atlas cluster).

```bash
git clone https://github.com/xreep/hopr.git
cd hopr
npm install
```

That installs both workspaces (`frontend/` and `backend/`). Next, create the environment files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set `JWT_SECRET` in `backend/.env` to a long random string (`openssl rand -hex 32`), and `MONGODB_URI` if you aren't using a local MongoDB. Then load the demo data:

```bash
npm run seed --workspace=backend
```

Start both servers:

```bash
npm run dev
```

- App: http://localhost:3000
- API: http://localhost:5001/api, proxied from the app as `/api`

The API runs on 5001 locally because macOS uses port 5000 for AirPlay Receiver. To use another port, set `PORT` in `backend/.env` and start the app with the matching proxy target, e.g. `VITE_PROXY_TARGET=http://localhost:5050 npm run dev` (a shell variable, read by `vite.config.js`).

No map key is needed. Street maps come from OpenFreeMap, address search from Photon and road-following routes from the public OSRM service, all built on OpenStreetMap. A server-side `MAPBOX_TOKEN` is optional and only swaps in Mapbox geocoding and directions.

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string (Atlas in production) |
| `JWT_SECRET` | yes in production | Long random string used to sign sessions. With `NODE_ENV=production` the server refuses to start without it |
| `NODE_ENV` | production | `production` on Render: hides error details and enforces `JWT_SECRET` |
| `FRONTEND_URL` | yes in production | The frontend origin allowed by CORS, e.g. `https://your-app.vercel.app` (no trailing slash) |
| `PORT` | no | Defaults to 5001 locally; Render sets it automatically |
| `TRUST_PROXY` | no | Proxy hops to trust for client IPs; defaults to `1` in production |
| `DEMO_MODE` | no | `true` for a public demo: turns on Load demo data, the demo morning and the demo sign-in buttons, and protects the demo accounts from being changed or locked out. Leave it unset for real use: the demo endpoints then do not exist |
| `MAPBOX_TOKEN` | no | Server-side Mapbox token; when set, Mapbox is tried first for geocoding and road directions, with OpenStreetMap as the fallback |
| `FUEL_PRICE_PETROL`, `FUEL_PRICE_DIESEL`, `FUEL_PRICE_CNG`, `FUEL_PRICE_ELECTRICITY` | no | Fuel prices in ₹ (defaults: typical Indian retail 97.90, 92.60, 91.50 and ₹10/kWh; set your state's prices) |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | yes | `/api` locally (through the dev proxy); the full Render URL ending in `/api` in production |

Never commit `.env` files; they are git-ignored.

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `npm run dev` | API and app together, with reload |
| `npm run build` | Production build of the app and a startup check of the API |
| `npm test` | All tests in both workspaces |
| `npm run lint` | ESLint in both workspaces |
| `npm start` | Start the API in production mode |
| `npm run seed --workspace=backend` | Load demo accounts, fleet and five city demo routes into `MONGODB_URI` |

## Testing

```bash
npm test --workspace=backend    # 129 tests: routing engine, auth, roles, workflow, dispatch, proof, tracking, analytics, demo morning, offline updates, security
npm test --workspace=frontend   # 51 tests: tracking animation, timing, session handling, dialogs, command palette, Hindi, offline outbox
```

Backend tests run against an in-memory MongoDB, so no database setup is needed. [docs/TECHNICAL.md](docs/TECHNICAL.md#13-testing) has the full breakdown and the end-to-end smoke test results.

## Deployment (free tiers, ₹0)

### 1. Database: MongoDB Atlas M0

1. Create a free M0 cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user with read and write access.
3. Network Access: allow `0.0.0.0/0` (Render's free plan has no fixed outbound IPs).
4. Copy the connection string and add a database name, e.g. `.../hopr?retryWrites=true&w=majority`.

### 2. API: Render web service (free)

1. New → Web Service → connect the GitHub repository.
2. Root directory `backend`, build command `npm install`, start command `npm start`.
3. Environment variables: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL` (the Vercel URL, set after step 3), `DEMO_MODE=true` if this is a public demo, and, optionally, `MAPBOX_TOKEN`. Do not set `PORT`.
4. Health check path: `/api/health`.

The free plan sleeps after 15 minutes without traffic, and the next request takes up to about a minute; the app shows a "server is waking up" message while it waits. A free uptime monitor requesting `/api/health` every 10 minutes keeps it awake.

### 3. App: Vercel (free)

1. Add New → Project → import the repository.
2. Root directory `frontend`; framework preset Vite (build `npm run build`, output `dist`).
3. Environment variables: `VITE_API_URL=https://<your-api>.onrender.com/api`.
4. Deploy, then set `FRONTEND_URL` on Render to the Vercel URL and redeploy the API.

`frontend/vercel.json` rewrites every path to the app, so shared links such as `/track/<token>` open directly.

### 4. Demo data

Seed the production database from your machine, pointing at Atlas:

```bash
MONGODB_URI="<your Atlas connection string>" npm run seed --workspace=backend
```

Then sign in as the fleet manager. With `DEMO_MODE=true`, **Load demo data** (Routes, or Admin) creates fresh demo routes in all five cities whenever you need them. Never seed the demo into a database with real customers: its passwords are public.

The website's security headers, including the Content Security Policy, are in `frontend/vercel.json`. It allows API calls to `*.onrender.com`; if the API lives elsewhere, add its origin to `connect-src`.

## Project structure

```
hopr/
├── backend/        Express API: routes/, services/ (routing engine, traffic, fuel, dispatch,
│                   tracking, analytics), models/, middleware/, tests/
├── frontend/       React app: pages/, components/, hooks/, utils/, public/ (icons, manifest)
└── docs/           TECHNICAL.md and PRD.md
```

## Security

Passwords are hashed with bcrypt. JWT sessions are revoked on password change, and accounts lock for 15 minutes after five failed logins. Every endpoint checks its role and validates and sanitises its input. Rate limits are layered by traffic type, helmet sets security headers, and production errors carry no internals. `npm audit` reports 0 vulnerabilities.

These limits are deliberate and documented in [TECHNICAL.md §8](docs/TECHNICAL.md#8-authentication-roles-and-security):
- sessions are stored in `localStorage`
- tokens expire after 7 days
- a route holds at most 30 stops
