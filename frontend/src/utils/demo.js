// Demo accounts created by the demo seeder (backend/src/services/demo.js). Demo
// credentials for a demo database only.
export const DEMO_USERS = {
  admin: { email: 'admin@hopr.com', password: 'admin123', label: 'Admin' },
  fleet_manager: { email: 'manager@hopr.com', password: 'manager123', label: 'Fleet manager' },
  driver: { email: 'driver@hopr.com', password: 'driver123', label: 'Driver' }
}

export const DEMO_MISSING = 'Demo accounts aren’t set up on this server yet. Run "npm run seed" in backend/.'
