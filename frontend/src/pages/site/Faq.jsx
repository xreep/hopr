import { Link } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'
import { SITE_LINKS } from '../../data/site'

const QUESTIONS = [
  ['Which cities does Hopr cover?', <p key="a">All of India. Address search, street maps and road routing cover the whole country, and search ranks places near your hub first. You can run hubs in as many cities as you like.</p>],
  ['How is the order of stops decided?', <p key="a">For each route Hopr weighs driving time at that hour of day, delivery windows, urgent stops and fuel cost. Routes of up to 8 stops are solved exactly; longer ones use a search that is benchmarked against the exact answer in our <a href={`${SITE_LINKS.source}/blob/main/docs/BENCHMARK.md`} target="_blank" rel="noopener noreferrer">public benchmark</a>.</p>],
  ['Does it use live traffic?', <p key="a">Yes. Road routes and drive times come from Mapbox with live traffic, and the plan also uses an hour-by-hour traffic profile that learns from your own fleet’s drives. Road closures you report are driven around.</p>],
  ['What if a driver has no signal?', <p key="a">The driver app keeps working. Deliveries, photos and signatures are saved on the phone and sent when the connection returns, with the time they actually happened.</p>],
  ['Do my drivers need a smartphone?', <p key="a">It helps, but no. Any Android or iPhone with a browser runs the driver app, and you can print a route sheet for a driver working from paper.</p>],
  ['Is it available in Hindi?', <p key="a">The driver app and the customer tracking page are in English and Hindi, including spoken announcements. Each person chooses their own language.</p>],
  ['Can customers track their parcel?', <p key="a">Yes. Every delivery gets its own tracking link, with no app or sign-in. It shows the van on the map, a countdown and an alert when it is close, and stops working 48 hours after delivery.</p>],
  ['How many stops can a route have?', <p key="a">Up to 30 stops per vehicle, and up to 300 stops split across your vehicles in one plan.</p>],
  ['Why did the first page take a while to load?', <p key="a">During the beta the server sleeps when nobody has used it for a while and takes up to a minute to wake. The app tells you when this is happening. The <a href={SITE_LINKS.status} target="_blank" rel="noopener noreferrer">status page</a> shows whether everything is running.</p>],
  ['What does it cost?', <p key="a">Nothing during the beta. After it, a price per vehicle per month with no charge per delivery. See <Link to="/pricing">pricing</Link>.</p>],
  ['Where is my data stored, and who can see it?', <p key="a">In MongoDB Atlas in Mumbai. Managers see their fleet’s routes; drivers see only their own; customers see only their own delivery. Details are in the <Link to="/privacy">privacy policy</Link> and on the <Link to="/security">security page</Link>.</p>],
  ['Can I connect my order system?', <p key="a">Today you can upload orders as a spreadsheet. A direct connection to order systems is on the Enterprise plan; <Link to="/contact?topic=question">tell us what you use</Link>.</p>]
]

export default function Faq() {
  return (
    <SitePage title="Frequently asked questions" lede="Straight answers about coverage, routing, drivers, customers and cost.">
      <div className="site-faq site-prose">
        {QUESTIONS.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <div>{a}</div>
          </details>
        ))}
        <p className="mt-8">Still have a question? <Link to="/contact?topic=question">Ask us</Link>.</p>
      </div>
    </SitePage>
  )
}
