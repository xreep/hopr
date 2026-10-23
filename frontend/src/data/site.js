// Facts the public website repeats in several places, kept in one file

export const SITE_LINKS = {
  status: 'https://stats.uptimerobot.com/NK50eDGlfC',
  source: 'https://github.com/xreep/hopr'
}

// Plans after the beta. Prices are per vehicle per month in rupees, before GST.
// Change them here; the Pricing page and FAQ read from this list.
export const PLANS = [
  {
    name: 'Starter',
    price: 799,
    for: 'Up to 10 vehicles from one hub',
    features: [
      'Route planning with traffic, delivery windows and priorities',
      'Driver app with photo and signature proof, offline mode and Hindi',
      'Customer tracking links',
      'CSV upload and address search across India',
      'Email support'
    ]
  },
  {
    name: 'Growth',
    price: 1499,
    for: 'Fleets of any size across several hubs',
    features: [
      'Everything in Starter',
      'Auto-dispatch to the nearest suitable driver',
      'Live traffic routing and road-closure detours',
      'Analytics with on-time rate, cost per delivery and CSV reports',
      'Priority email support'
    ]
  },
  {
    name: 'Enterprise',
    price: null,
    for: 'Large fleets with their own systems',
    features: [
      'Everything in Growth',
      'Help connecting your order system',
      'A dedicated server region and data retention to your policy',
      'Onboarding for your managers and drivers'
    ]
  }
]

// Releases, newest first. Each matches merged work in the source repository.
export const RELEASES = [
  {
    date: '23 Oct 2026',
    title: 'Dispatcher tools',
    items: [
      'Move the stops of a planned route up or down; ETAs, distance and fuel are re-timed at once',
      'Print a route sheet for drivers working from paper',
      'Drivers mark days off, and auto-dispatch never offers them a route on those days',
      'Forgot password? Reset it from a one-hour email link'
    ]
  },
  {
    date: '23 Oct 2026',
    title: 'Fixes and hardening',
    items: [
      'Routes planned at night now place morning delivery windows on the next day, and overnight windows (22:00 to 02:00) are accepted',
      'A delivery sent twice no longer counts the route twice in vehicle totals',
      'GPS fixes without an accuracy no longer add to the distance driven'
    ]
  },
  {
    date: '23 Oct 2026',
    title: 'Live traffic and closure detours',
    items: [
      'Mapbox maps, address search and live-traffic road routing',
      'Legs that cross a reported road closure are routed around it with A* search',
      'A public status page for the service'
    ]
  },
  {
    date: '22 Oct 2026',
    title: 'Tested end to end',
    items: [
      'Automated browser tests on desktop and phone, including accessibility checks on every main screen',
      'A routing benchmark against the exact optimum',
      'Arrival times that learn from the fleet’s own deliveries',
      'Email alerts for failed deliveries, finished routes and vehicle service dates'
    ]
  },
  {
    date: '22 Oct 2026',
    title: 'Homepage, Hindi and offline driving',
    items: [
      'The driver app keeps working without signal and sends deliveries when the connection returns',
      'Hindi for drivers and customers, including spoken announcements',
      'A demo morning that drives routes in five cities at 20 times real time'
    ]
  },
  {
    date: '22 Oct 2026',
    title: 'All of India',
    items: [
      'Street maps, address search and road routing for the whole country',
      'The road-sign design used across the app'
    ]
  },
  {
    date: '21 Oct 2026',
    title: 'First release',
    items: [
      'Multi-stop, multi-vehicle route planning with traffic, windows, priorities and fuel',
      'Driver app with proof of delivery, live customer tracking and analytics'
    ]
  }
]
