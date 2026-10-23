import { Link } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'
import { SITE_LINKS } from '../../data/site'

export default function Security() {
  return (
    <SitePage title="Security" lede="How Hopr protects your customers’ addresses, your drivers’ locations and your accounts.">
      <div className="site-prose">
        <h2>Accounts and access</h2>
        <ul>
          <li>Passwords are stored only as bcrypt hashes. After five wrong passwords an account locks for 15 minutes.</li>
          <li>Three roles: admins manage users, fleet managers plan and dispatch, drivers see only the routes given to them.</li>
          <li>Changing or resetting a password signs the account out on every device.</li>
          <li>Password reset links work once, for one hour, and the form never reveals whether an email has an account.</li>
        </ul>

        <h2>Customer and driver data</h2>
        <ul>
          <li>A customer’s tracking link carries a 144-bit random code, shows only that customer’s own delivery, and stops working 48 hours after delivery.</li>
          <li>A driver’s location is shared only while their route is active.</li>
          <li>Delivery photos and signatures are visible only to managers and the route’s driver, and are deleted after 90 days.</li>
          <li>The data is stored in MongoDB Atlas in Mumbai, encrypted at rest. Every connection uses HTTPS.</li>
        </ul>

        <h2>The application</h2>
        <ul>
          <li>A strict Content Security Policy: the site runs only its own scripts.</li>
          <li>Every request is validated and rate limited, with tighter limits on sign-in and password reset.</li>
          <li>Every change runs automated tests, including security tests, plus a dependency audit before it ships.</li>
        </ul>

        <h2>Availability</h2>
        <p>The service is checked every five minutes. Its record is public on the <a href={SITE_LINKS.status} target="_blank" rel="noopener noreferrer">status page</a>.</p>

        <h2>Report a vulnerability</h2>
        <p>If you find a security problem, please tell us through the <Link to="/contact?topic=support">contact form</Link> before making it public. We reply within two working days. The full threat model is in the <a href={`${SITE_LINKS.source}/blob/main/docs/SECURITY.md`} target="_blank" rel="noopener noreferrer">security document</a>.</p>
      </div>
    </SitePage>
  )
}
