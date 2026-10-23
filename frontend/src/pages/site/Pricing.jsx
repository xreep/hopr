import { Link } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'
import { PLANS } from '../../data/site'

const rupees = n => `₹${n.toLocaleString('en-IN')}`

export default function Pricing() {
  return (
    <SitePage title="Pricing" lede="Free while Hopr is in beta. Afterwards, a price per vehicle per month, with no charge per delivery." wide>
      <div className="site-beta" role="note">
        <div>
          <strong>Free during the beta</strong>
          <p className="mt-1">Every feature, for any number of vehicles, at no cost while we are in beta. We will give you at least 30 days’ notice before any plan below starts, and you choose whether to continue.</p>
        </div>
      </div>

      <div className="site-plans">
        {PLANS.map((plan, i) => (
          <section key={plan.name} className={`site-plan ${i === 1 ? 'is-featured' : ''}`} aria-labelledby={`plan-${i}`}>
            <h2 id={`plan-${i}`}>{plan.name}</h2>
            <p className="text-small text-ink-3 mt-1">{plan.for}</p>
            <p className="site-price">
              {plan.price ? <>{rupees(plan.price)}<small> per vehicle a month</small></> : <>Talk to us</>}
            </p>
            <p className="text-micro text-ink-400">{plan.price ? 'After the beta. Plus GST.' : 'Priced for your fleet.'}</p>
            <ul>{plan.features.map(f => <li key={f}>{f}</li>)}</ul>
            <Link to={plan.price ? '/contact?topic=demo' : '/contact?topic=question'} className={`btn ${i === 1 ? 'btn-primary' : 'btn-outline'} w-full`}>
              {plan.price ? 'Book a demo' : 'Contact us'}
            </Link>
          </section>
        ))}
      </div>

      <div className="site-prose mt-12">
        <h2>Questions about pricing</h2>
        <h3>What counts as a vehicle?</h3>
        <p>Each bike, van or truck that is given at least one route in the month. Vehicles parked all month are free.</p>
        <h3>Are drivers, managers or customers charged?</h3>
        <p>No. Add as many manager and driver accounts as you need. Customers never pay or sign up to track a parcel.</p>
        <h3>What happens to my data if I stop?</h3>
        <p>You can export a report of every route as CSV at any time, and ask us to delete everything. See the <Link to="/privacy">privacy policy</Link>.</p>
      </div>
    </SitePage>
  )
}
