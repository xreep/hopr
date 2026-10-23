import { Link } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'

export default function Terms() {
  return (
    <SitePage title="Terms of use" lede="The rules for using Hopr, in plain language.">
      <div className="site-prose">
        <p className="site-updated">Last updated 23 October 2026</p>

        <h2>The service</h2>
        <p>
          Hopr is software for planning delivery routes, dispatching them to drivers, recording deliveries and letting customers track them.
          By creating an account or using it, you agree to these terms. If you use Hopr for a business, you agree for that business.
        </p>

        <h2>The beta</h2>
        <p>
          Hopr is in beta and free to use. Features may change, and the service may occasionally be slow or unavailable; its uptime is public on
          the status page. We will give at least 30 days’ notice by email before charging for anything, and you choose whether to continue.
        </p>

        <h2>Your account</h2>
        <ul>
          <li>Keep your password to yourself. You are responsible for what is done with your account.</li>
          <li>Admins decide who in their fleet can use Hopr and with which role, and can remove access at any time.</li>
          <li>Give accurate details, and tell us through the <Link to="/contact?topic=support">contact form</Link> if you think your account has been misused.</li>
        </ul>

        <h2>Your data</h2>
        <p>
          The routes, deliveries and customer details you put into Hopr belong to you. You give us permission to store and process them only to
          provide the service, as described in the <Link to="/privacy">privacy policy</Link>. You confirm you are allowed to share your customers’
          and drivers’ details with us for that purpose, and that drivers know their location is shared while a route is active.
        </p>

        <h2>Fair use</h2>
        <ul>
          <li>Do not use Hopr for anything unlawful, or to track people who have not agreed to it.</li>
          <li>Do not try to break, overload or get around the security of the service, or to read other fleets’ data.</li>
          <li>Do not resell access to Hopr without our written agreement.</li>
        </ul>

        <h2>Routes are guidance</h2>
        <p>
          Routes, arrival times and fuel figures are estimates. Drivers must follow traffic rules and use their own judgement on the road. Hopr is
          not responsible for fines, accidents or late deliveries that result from following a suggested route.
        </p>

        <h2>Liability</h2>
        <p>
          The service is provided as it is. As far as the law allows, we are not liable for indirect losses such as lost profit or lost business.
          While Hopr is free, our total liability is limited to ₹10,000.
        </p>

        <h2>Ending</h2>
        <p>
          You can stop using Hopr at any time and ask us to delete your fleet’s data. We may suspend an account that breaks these terms, and will tell
          you why unless the law prevents it.
        </p>

        <h2>Law</h2>
        <p>These terms are governed by the laws of India. Questions about them? <Link to="/contact?topic=question">Ask us</Link>.</p>
      </div>
    </SitePage>
  )
}
