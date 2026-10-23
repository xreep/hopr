import { Link } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'

const FEATURES = [
  {
    title: 'Plan a morning of deliveries in a few minutes',
    image: '/screens/planner.webp',
    alt: 'The route planner with six Delhi deliveries split across vans on a map',
    points: [
      'Type addresses with search that covers all of India and ranks places near your hub first, or upload a spreadsheet',
      'Set a delivery window, priority and parcel weight for each stop',
      'Hopr orders the stops for traffic at that hour, windows, priorities and fuel, and splits them across your vehicles by capacity',
      'See the saving against the order you typed, and every window at risk before a van leaves'
    ]
  },
  {
    title: 'Give each route to the right driver, then watch the day',
    image: '/screens/dashboard.webp',
    alt: 'The dashboard during a morning run, with vans on the map in Delhi',
    points: [
      'Auto-dispatch pairs routes with the nearest driver whose vehicle fits the load, and shows why before you confirm',
      'Drivers on a day off are never offered a route',
      'A live map of every van, with delays and failed deliveries flagged as they happen',
      'Report congestion or a road closure and recalculate the routes it touches; closed roads are driven around',
      'Move stops by hand when a customer calls, or print the route sheet for a driver on paper'
    ]
  },
  {
    title: 'A driver app that works on a cheap phone without signal',
    image: '/screens/driver.webp',
    alt: 'The driver app showing the next stop, its window and the delivered button',
    phone: true,
    points: [
      'The next stop, its delivery window and one tap to navigate',
      'Delivered with a photo and the customer’s signature, or Couldn’t deliver with a reason',
      'Deliveries made without signal are kept on the phone and sent when it reconnects, with the time they really happened',
      'English or Hindi, with spoken announcements; installs to the home screen'
    ]
  },
  {
    title: 'Customers follow their parcel without calling the driver',
    image: '/screens/tracking-hindi.webp',
    alt: 'The customer tracking page in Hindi with the van on the map and minutes to arrival',
    phone: true,
    points: [
      'Every delivery gets its own tracking link, with no app and no sign-in',
      'The van moves along the real road, with a countdown and an alert when it is close',
      'In English or Hindi; the link stops working 48 hours after delivery'
    ]
  }
]

export default function Product() {
  return (
    <SitePage title="Product" lede="Plan, dispatch, deliver and track: one system for the fleet manager, the driver and the customer." wide>
      {FEATURES.map(f => (
        <section key={f.title} className={`site-feature ${f.phone ? 'is-phone' : ''}`}>
          <div>
            <h2>{f.title}</h2>
            <ul>{f.points.map(p => <li key={p}>{p}</li>)}</ul>
          </div>
          <img src={f.image} alt={f.alt} loading="lazy" width={f.phone ? 585 : 1200} height={f.phone ? 996 : 750} />
        </section>
      ))}
      <section className="site-feature">
        <div>
          <h2>Know what each delivery costs</h2>
          <ul>
            <li>On-time rate, cost per delivery, distance, fuel and CO₂ by day, week or month, against the previous period</li>
            <li>Arrival estimates that learn from your own fleet’s drives, with their accuracy reported</li>
            <li>Performance for every driver, and a CSV export for your accountant</li>
          </ul>
        </div>
        <div className="site-prose">
          <p>Every figure comes from recorded deliveries, so nothing is estimated after the fact.</p>
          <p className="mt-4"><Link to="/contact?topic=demo" className="btn btn-primary">Book a demo</Link></p>
        </div>
      </section>
    </SitePage>
  )
}
