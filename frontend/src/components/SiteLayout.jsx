import { useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { HopMark } from './icons'
import { SITE_LINKS } from '../data/site'

const NAV = [
  ['/product', 'Product'],
  ['/use-cases', 'Use cases'],
  ['/pricing', 'Pricing'],
  ['/security', 'Security'],
  ['/faq', 'FAQ']
]

// The public website's header: the same on the homepage and every page linked from it
export function SiteHeader() {
  const { pathname } = useLocation()
  return (
    <header className="landing-header">
      <Link to="/" className="brand" aria-label="Hopr home"><HopMark size={30} />Hopr</Link>
      <nav aria-label="Website" className="landing-nav">
        {NAV.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'is-current' : undefined)}>{label}</NavLink>)}
      </nav>
      <div className="flex items-center gap-2">
        <Link to="/login" className="btn btn-ghost">Sign in</Link>
        <Link to="/contact?topic=demo" className="btn btn-primary">Book a demo</Link>
        {/* Phones and tablets: the page links in a menu that closes on navigation */}
        <details className="site-menu" key={pathname}>
          <summary aria-label="Menu"><span aria-hidden="true" /></summary>
          <nav aria-label="Website menu">
            {NAV.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
            <Link to="/about">About</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/login">Sign in</Link>
          </nav>
        </details>
      </div>
    </header>
  )
}

const FOOTER = [
  ['Product', [['/product', 'Product'], ['/use-cases', 'Use cases'], ['/pricing', 'Pricing'], ['/changelog', 'Changelog']]],
  ['Help', [['/faq', 'FAQ'], ['/contact', 'Contact'], [SITE_LINKS.status, 'System status'], ['/login', 'Sign in']]],
  ['Company', [['/about', 'About'], ['/security', 'Security'], [SITE_LINKS.source, 'Source code']]],
  ['Legal', [['/privacy', 'Privacy policy'], ['/terms', 'Terms of use']]]
]

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div>
          <span className="brand text-base"><HopMark size={22} />Hopr</span>
          <p className="mt-2 max-w-[30ch]">Delivery route planning, dispatch and tracking for Indian fleets.</p>
        </div>
        {FOOTER.map(([heading, links]) => (
          <nav key={heading} aria-label={heading}>
            <h2>{heading}</h2>
            <ul>
              {links.map(([to, label]) => (
                <li key={label}>{to.startsWith('http') ? <a href={to} target="_blank" rel="noopener noreferrer">{label}</a> : <Link to={to}>{label}</Link>}</li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="site-footer-base">&copy; 2026 Hopr. Made in India. Map data &copy; Mapbox &copy; OpenStreetMap contributors.</p>
    </footer>
  )
}

// A public page: the green direction sign with its title, then the content
export default function SitePage({ title, lede, children, wide = false }) {
  useEffect(() => {
    document.title = `${title} | Hopr`
    window.scrollTo(0, 0)
  }, [title])
  return (
    <div className="landing">
      <SiteHeader />
      <main>
        <div className="site-head">
          <div className="site-sign">
            <h1>{title}</h1>
            {lede && <p>{lede}</p>}
          </div>
        </div>
        <div className={wide ? 'site-body site-body-wide' : 'site-body'}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}
