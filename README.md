# Hopr - Smart Route Optimization System for Last-Mile Delivery

> "Hop through every stop, smarter."

A comprehensive route optimization platform for logistics companies to plan efficient delivery routes, reduce fuel costs, and improve on-time delivery rates.

## Features

- **Route Planning**: Multi-stop delivery optimization with CSV upload
- **Traffic-Aware Routing**: Real-time traffic integration (Mapbox/Google Maps)
- **Fuel Optimization**: Vehicle-specific fuel consumption estimation
- **Driver Interface**: Mobile-friendly navigation and status updates
- **Fleet Management**: Vehicle and driver assignment with analytics
- **Role-Based Access**: Admin, Fleet Manager, and Driver dashboards
- **Analytics Dashboard**: KPIs, trends, and performance insights

## Tech Stack

- **Frontend**: React 18, Vite, Mapbox GL JS, Chart.js, React Router
- **Backend**: Node.js, Express, MongoDB (Mongoose)
- **Authentication**: JWT with role-based access control
- **Routing**: Custom nearest-neighbor + 2-opt optimization algorithm

## Project Structure

```
hopr/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page components
│   │   ├── context/          # React context providers
│   │   ├── utils/            # Utility functions
│   │   └── hooks/            # Custom React hooks
│   └── ...
├── backend/                  # Express API server
│   ├── src/
│   │   ├── models/           # Mongoose models
│   │   ├── routes/           # API route handlers
│   │   ├── controllers/      # Business logic
│   │   ├── services/         # External services
│   │   ├── middleware/       # Express middleware
│   │   └── config/           # Configuration
│   └── ...
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB 6+
- npm or yarn

### Installation

1. **Clone and install dependencies**

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd ../backend && npm install
```

2. **Configure environment variables**

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your configuration

# Frontend
cd ../frontend
cp .env.example .env
# Edit .env with your Mapbox token (optional)
```

3. **Start development servers**

```bash
# From root directory - runs both frontend and backend
npm run dev
```

Or start individually:

```bash
# Backend (port 5000)
cd backend && npm run dev

# Frontend (port 3000)
cd frontend && npm run dev
```

### Environment Variables

**Backend (.env)**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/hopr
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:3000
MAPBOX_TOKEN=your-mapbox-token
GOOGLE_MAPS_KEY=your-google-maps-key
DEFAULT_FUEL_PRICE=1.50
```

**Frontend (.env)**
```env
VITE_API_URL=http://localhost:5000/api
VITE_MAPBOX_TOKEN=your-mapbox-token
```

## Demo Accounts

After starting the server, register users or use these demo credentials:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hopr.com | admin123 |
| Fleet Manager | manager@hopr.com | manager123 |
| Driver | driver@hopr.com | driver123 |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/password` - Change password
- `PUT /api/auth/notifications` - Update notification preferences

### Routes
- `POST /api/routes/optimize` - Optimize route (algorithm)
- `POST /api/routes` - Create route
- `GET /api/routes` - List routes (with filters)
- `GET /api/routes/driver/assigned` - Get driver's assigned routes
- `GET /api/routes/:id` - Get route details
- `PATCH /api/routes/:id/start` - Start route
- `PATCH /api/routes/:id/stops/:stopIndex/status` - Update stop status
- `POST /api/routes/:id/stops/:stopIndex/issues` - Report issue

### Vehicles
- `POST /api/vehicles` - Add vehicle
- `GET /api/vehicles` - List vehicles
- `GET /api/vehicles/available` - Get available vehicles
- `PUT /api/vehicles/:id` - Update vehicle
- `PATCH /api/vehicles/:id/assign-driver` - Assign driver
- `DELETE /api/vehicles/:id` - Delete vehicle

### Drivers
- `GET /api/drivers` - List drivers with performance
- `GET /api/drivers/available` - Get available drivers
- `GET /api/drivers/:id` - Get driver details
- `PATCH /api/drivers/:id/status` - Update driver status

### Analytics
- `GET /api/analytics` - Get dashboard analytics

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `PATCH /api/admin/users/:id/status` - Toggle user status
- `DELETE /api/admin/users/:id` - Delete user

### Maps
- `GET /api/map/geocode` - Geocode address
- `GET /api/map/reverse-geocode` - Reverse geocode
- `GET /api/map/directions` - Get directions

## Route Optimization Algorithm

The system uses a two-phase optimization:

1. **Nearest Neighbor**: Creates initial route by always visiting the nearest unvisited stop
2. **2-opt Improvement**: Iteratively swaps route segments to reduce total distance

This provides good results for up to 20-30 stops. For larger problems, consider integrating with dedicated solvers (OR-Tools, etc.).

> **Limit**: The nearest-neighbor + 2-opt solver is documented for ≤ 30 stops. Beyond that, performance degrades and a dedicated VRP solver should be used.

## Map Integration

The application supports both Mapbox and Google Maps APIs. If no API keys are provided, mock data is used for development.

To enable real maps:
1. Get a Mapbox token from [mapbox.com](https://mapbox.com)
2. Add to `VITE_MAPBOX_TOKEN` (frontend) and `MAPBOX_TOKEN` (backend)
3. Or use Google Maps API key

## Deployment (Free Tiers Only — ₹0 Budget)

### Database: MongoDB Atlas M0 (Free)
1. Create account at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create M0 free cluster (shared, 512 MB)
3. Database Access → Add user with readWrite permissions
4. Network Access → Add IP `0.0.0.0/0` (allow all) or Render IPs
5. Connect → Drivers → Copy connection string
6. Replace `<password>` and `<dbname>` in connection string

### Backend: Render (Free Tier)
1. Fork this repo to GitHub
2. New Web Service on Render → Connect GitHub repo
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `npm start`
6. Environment variables:
   - `MONGODB_URI` = Atlas connection string
   - `JWT_SECRET` = long random string (32+ chars)
   - `FRONTEND_URL` = Vercel frontend URL (e.g., `https://hopr.vercel.app`)
   - `PORT` = `10000` (Render default)
   - `NODE_ENV` = `production`
7. Note: Free tier sleeps after 15 min inactivity — first load takes 30-60s

### Frontend: Vercel (Free Tier)
1. Import GitHub repo on Vercel
2. Root directory: `frontend`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Environment variables:
   - `VITE_API_URL` = Render backend URL (e.g., `https://hopr-backend.onrender.com/api`)
   - `VITE_MAPBOX_TOKEN` = your Mapbox token
6. Deploy

### Live URLs (update after deployment)
- **Frontend**: `https://hopr.vercel.app` (replace with your Vercel URL)
- **Backend**: `https://hopr-backend.onrender.com` (replace with your Render URL)

## Demo Credentials (after deployment)
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hopr.com | admin123 |
| Fleet Manager | manager@hopr.com | manager123 |
| Driver | driver@hopr.com | driver123 |

> **Note**: Register these users via the Admin Panel after first login, or seed them via script.

## Testing

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend |
| `npm run dev:frontend` | Start frontend only |
| `npm run dev:backend` | Start backend only |
| `npm run build` | Build both for production |
| `npm run test` | Run all tests |
| `npm run lint` | Lint all code |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and feature requests, please use the GitHub issue tracker.