import { Link } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'
import { SITE_LINKS } from '../../data/site'

export default function About() {
  return (
    <SitePage title="About Hopr" lede="We build route planning for the way deliveries actually happen in India.">
      <div className="site-prose">
        <h2>Why Hopr exists</h2>
        <p>
          Most route planners are built for neat addresses, predictable traffic and drivers with good phones and steady signal.
          Indian last-mile delivery has none of those. Addresses are landmarks, the evening peak can double a drive, riders work
          from basements and highways without signal, and many drivers are more at home in Hindi than in English.
        </p>
        <p>
          Small and mid-sized fleets feel this most. They plan from spreadsheets and phone calls because the large logistics
          platforms are priced and built for companies with thousands of vehicles.
        </p>

        <h2>What we believe</h2>
        <ul>
          <li><strong>The driver’s phone matters as much as the manager’s screen.</strong> If the app fails in a basement, the plan fails with it.</li>
          <li><strong>Customers should not have to call the driver.</strong> A tracking link with an honest countdown answers the question first.</li>
          <li><strong>Numbers should come from real deliveries.</strong> Our reports use what was recorded, and our arrival estimates learn from your fleet.</li>
          <li><strong>Plain prices.</strong> A price per vehicle, no charge per delivery, and free while we are in beta.</li>
        </ul>

        <h2>How we work</h2>
        <p>
          Hopr’s source code is <a href={SITE_LINKS.source} target="_blank" rel="noopener noreferrer">public on GitHub</a>, along with its
          tests, a benchmark of the routing engine and the security document. You can see exactly how routes are planned and how data is handled.
          What changes and when is in the <Link to="/changelog">changelog</Link>, and the service’s uptime is on the <a href={SITE_LINKS.status} target="_blank" rel="noopener noreferrer">status page</a>.
        </p>

        <h2>Talk to us</h2>
        <p>Whether you run five bikes or five hundred vans, we’d like to hear how you deliver. <Link to="/contact">Send us a message</Link>.</p>
      </div>
    </SitePage>
  )
}
