import { Link } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'

const CASES = [
  {
    title: 'Grocery and quick commerce',
    problem: 'Many small orders, short delivery slots and riders on bikes leaving a dark store every few minutes.',
    how: [
      'Plan by bike or electric scooter, so capacity and speed match the rider',
      'Tight delivery windows weigh heavily, so a slot is only missed when it cannot be met, and you see which ones before the rider leaves',
      'Auto-dispatch hands each batch to the nearest free rider'
    ]
  },
  {
    title: 'Pharmacies',
    problem: 'Urgent medicines that cannot wait behind routine orders, and a record of who received them.',
    how: [
      'Mark a stop urgent and it moves up the route without wrecking the rest',
      'Proof of delivery with a photo and the customer’s signature, kept for 90 days',
      'Customers see when the medicine will arrive, so the shop gets fewer calls'
    ]
  },
  {
    title: 'D2C and e-commerce brands',
    problem: 'Customers who expect tracking like the big marketplaces, and failed deliveries that cost a second trip.',
    how: [
      'A tracking link for every parcel, in English or Hindi, with the van on the map',
      'Every failed delivery has a reason, reported on the dashboard as it happens',
      'Upload the day’s orders as a spreadsheet straight from your store'
    ]
  },
  {
    title: 'Couriers and 3PL operators',
    problem: 'Several hubs, drivers who change vehicles and routes that change during the day.',
    how: [
      'Hubs anywhere in India, each with its own vehicles and drivers, and drivers never sent to another city',
      'Recalculate the rest of a route from the van’s position when traffic or a closure changes the day',
      'The driver app keeps working in basements and on highways without signal'
    ]
  }
]

export default function UseCases() {
  return (
    <SitePage title="Use cases" lede="Who Hopr is built for, and how it handles what makes each of their deliveries hard." wide>
      <div className="site-prose">
        {CASES.map(c => (
          <section key={c.title}>
            <h2>{c.title}</h2>
            <p>{c.problem}</p>
            <ul>{c.how.map(h => <li key={h}>{h}</li>)}</ul>
          </section>
        ))}
        <h2>Something else?</h2>
        <p>If you deliver from a hub to many addresses in a day, Hopr probably fits. <Link to="/contact?topic=question">Tell us how you deliver</Link> and we’ll say honestly whether it does.</p>
      </div>
    </SitePage>
  )
}
