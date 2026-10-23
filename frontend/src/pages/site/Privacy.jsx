import { Link } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'

export default function Privacy() {
  return (
    <SitePage title="Privacy policy" lede="What Hopr collects, why, who can see it, how long it is kept and how to have it removed.">
      <div className="site-prose">
        <p className="site-updated">Last updated 23 October 2026</p>

        <h2>Who this covers</h2>
        <p>
          Hopr is used by delivery businesses (“fleets”) to plan routes and deliver parcels. This policy covers the people whose data
          passes through it: the fleet’s managers and drivers, the fleet’s customers who receive deliveries, and visitors to this website.
        </p>
        <p>
          For a fleet’s customers and drivers, the fleet decides what is delivered to whom, and is responsible for that data under
          India’s Digital Personal Data Protection Act, 2023. Hopr processes it on the fleet’s behalf and only to run the service.
        </p>

        <h2>What we collect and why</h2>
        <ul>
          <li><strong>Account details</strong> for managers and drivers: name, email, phone and, optionally, an address. Used to sign in and to send the alerts each person chooses.</li>
          <li><strong>Delivery details</strong> entered by the fleet: each customer’s name, phone, delivery address, delivery window and notes. Used to plan the route and to show the driver where to go.</li>
          <li><strong>Driver location</strong>, shared from the driver’s phone every few seconds <em>only while a route is active</em>. Used to show the van to the fleet and to the customer waiting for it, and to measure distance driven.</li>
          <li><strong>Proof of delivery</strong>: a photo and the customer’s signature, when the driver takes them.</li>
          <li><strong>Contact form messages</strong>: your name, email, company and message, used only to reply.</li>
        </ul>
        <p>We do not sell personal data, show advertising, or use it to train models.</p>

        <h2>Who can see what</h2>
        <p>
          Admins and fleet managers see their fleet’s routes, deliveries, proof and driver locations. A driver sees only the routes given to them.
          A customer’s tracking link shows only that customer’s own delivery, the driver’s first name and initials, the vehicle type and the van’s
          position, and stops working 48 hours after delivery. Nobody outside the fleet can see its data.
        </p>

        <h2>How long we keep it</h2>
        <ul>
          <li>Delivery photos and signatures are deleted 90 days after they are taken. The record that the delivery happened stays.</li>
          <li>Contact form messages are deleted after one year.</li>
          <li>Accounts, routes and delivery records are kept while the fleet uses Hopr, and deleted when the fleet asks.</li>
        </ul>

        <h2>Where it is stored and who helps us run it</h2>
        <p>Data is stored in MongoDB Atlas in Mumbai, India. These providers process data for us, each only for its own part of the service:</p>
        <ul>
          <li>Render (Singapore) runs the server, and Vercel serves the website.</li>
          <li>Mapbox and OpenStreetMap services turn addresses into map positions and work out road routes. They receive addresses and coordinates, not names or phone numbers.</li>
          <li>Resend sends emails, when the fleet has turned email on.</li>
        </ul>

        <h2>Storage on your device</h2>
        <p>
          Hopr does not use advertising or tracking cookies. The app keeps a few things in your browser’s storage so it works: your sign-in
          (until you sign out, for up to 7 days), your language, and, on a driver’s phone, deliveries waiting to be sent while there is no signal.
          Signing out clears the sign-in and the cached routes.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask for a copy of your personal data, ask us to correct it, or ask us to delete it. If you are a fleet’s customer or driver,
          you can also ask the fleet directly. Send requests through the <Link to="/contact?topic=data_request">contact form</Link> with the
          topic “My data”; we reply within 30 days.
        </p>

        <h2>Changes</h2>
        <p>If this policy changes in a way that matters, we will say so on this page and tell account holders by email before it takes effect.</p>
      </div>
    </SitePage>
  )
}
