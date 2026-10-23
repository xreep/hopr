import SitePage from '../../components/SiteLayout'
import { RELEASES, SITE_LINKS } from '../../data/site'

export default function Changelog() {
  return (
    <SitePage title="Changelog" lede="What changed in Hopr, newest first.">
      <div className="site-prose">
        {RELEASES.map(r => (
          <section key={r.title} className="site-release">
            <time>{r.date}</time>
            <div>
              <h2>{r.title}</h2>
              <ul>{r.items.map(i => <li key={i}>{i}</li>)}</ul>
            </div>
          </section>
        ))}
        <p className="mt-6">Every change is also in the <a href={`${SITE_LINKS.source}/pulls?q=is%3Apr+is%3Amerged`} target="_blank" rel="noopener noreferrer">source repository</a>.</p>
      </div>
    </SitePage>
  )
}
