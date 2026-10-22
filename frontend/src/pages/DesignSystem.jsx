import HopLine from '../components/HopLine'
import { HopMark } from '../components/icons'
import Icon from '../components/icons'
import { StatCard, SkeletonRows, PageLoader, StatusBadge } from '../components/ui'

// Living style guide for the road-signage design system (development builds only, /design-system)
const PALETTE = [
  { name: 'Canvas', hex: '#F4F5F3', role: 'Page background' },
  { name: 'Surface', hex: '#FFFFFF', role: 'Panels, tables, dialogs' },
  { name: 'Line', hex: '#DCE0E3', role: 'Borders and dividers' },
  { name: 'Ink', hex: '#15191D', role: 'Text and the depot marker' },
  { name: 'Ink, secondary', hex: '#47515B', role: 'Labels and supporting text' },
  { name: 'Route green', hex: '#0B6B3A', role: 'Routes, the main action, the active page' },
  { name: 'City blue', hex: '#1F4E9C', role: 'Links, live drivers, focus' },
  { name: 'Marking yellow', hex: '#F2B705', role: 'Warnings (as a fill, never text on white)' },
  { name: 'Stop red', hex: '#C8102E', role: 'Failures and destructive actions' }
]

const TYPE = [
  { token: 'h1', spec: '28 / 34, 800', sample: 'Routes and dispatch', cls: 'text-h1 font-extrabold' },
  { token: 'h2', spec: '22 / 28, 800', sample: 'Morning run, Okhla', cls: 'text-h2 font-extrabold' },
  { token: 'h3', spec: '17 / 24, 700', sample: 'Stop 4: Santacruz Station', cls: 'text-h3 font-bold' },
  { token: 'body-lg', spec: '16 / 24, 400', sample: 'Pooja is on the way with your parcel and should reach Khan Market in about 12 minutes.', cls: 'text-body-lg' },
  { token: 'body', spec: '14 / 21, 400', sample: 'Hiranandani Gardens, Powai, Mumbai, Maharashtra 400076', cls: 'text-body' },
  { token: 'small', spec: '13 / 18, 600', sample: 'Window 10:30 to 12:00', cls: 'text-small font-semibold text-ink-300' },
  { token: 'micro', spec: '12 / 16, 400', sample: 'Based at Hopr Hub, Bommanahalli', cls: 'text-micro text-ink-400' }
]

function Section({ title, note, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-h2 font-extrabold">{title}</h2>
        {note && <p className="text-body text-ink-400 mt-1 max-w-[70ch]">{note}</p>}
      </div>
      {children}
    </section>
  )
}

export default function DesignSystem() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--h-canvas)' }}>
      <div className="max-w-[1100px] mx-auto px-5 py-10 space-y-12">
        <header className="flex items-center gap-3">
          <HopMark size={40} />
          <div>
            <h1 className="text-h1 font-extrabold">Hopr design system</h1>
            <p className="text-body text-ink-400">Road signage: a light, plain interface where colour only ever means something.</p>
          </div>
        </header>

        <Section title="Palette" note="Every colour has one job. Green is reserved for routes, the main action on a screen and the active page; it never fills large areas.">
          <div className="grid gap-3 sm:grid-cols-3">
            {PALETTE.map(c => (
              <div key={c.hex} className="card overflow-hidden">
                <div style={{ background: c.hex, height: 56, borderBottom: '1px solid var(--h-line)' }} />
                <div className="p-3">
                  <p className="font-bold">{c.name}</p>
                  <p className="text-micro text-ink-400 nd-tabular">{c.hex}</p>
                  <p className="text-small text-ink-300 mt-1">{c.role}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type" note="Overpass throughout, from the lineage of the highway sign alphabet. Numbers are tabular so columns of figures line up.">
          <div className="card divide-y divide-[var(--h-line)]">
            {TYPE.map(t => (
              <div key={t.token} className="grid gap-2 p-4 sm:grid-cols-[140px_1fr] items-baseline">
                <p className="text-micro text-ink-400">{t.token}, {t.spec}</p>
                <p className={t.cls}>{t.sample}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Controls and status" note="One primary (green) button per screen. Status plates are small rectangles with a square marker, like the plates on a sign gantry.">
          <div className="card p-5 space-y-5">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary"><Icon name="plus" />Plan routes</button>
              <button type="button" className="btn btn-secondary"><Icon name="bolt" />Auto-dispatch</button>
              <button type="button" className="btn btn-ghost">Details</button>
              <button type="button" className="btn btn-danger"><Icon name="x" />Couldn&apos;t deliver</button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <StatusBadge status="active" />
              <StatusBadge status="planned" />
              <StatusBadge status="completed" />
              <StatusBadge status="late" />
              <StatusBadge status="failed" />
              <span className="route-plate">RT-91E27A</span>
              <span className="timeline-dot" style={{ position: 'static' }}>3</span>
            </div>
          </div>
        </Section>

        <Section title="Key figures" note="KPIs sit in one bordered strip divided into cells, not a grid of identical cards. Values appear as they are; nothing counts up.">
          <div className="stats-strip">
            <StatCard label="Delivered today" value={186} isKey hint="4 failed, 23 still to go" />
            <StatCard label="On-time today" value={94.2} suffix="%" hint="Within the window, or ETA + 15 min" />
            <StatCard label="Routes on the road" value={12} hint="12 of 15 drivers driving" />
            <StatCard label="Fuel cost per delivery" value={18.4} decimals={2} format={v => `₹${v.toFixed(2)}`} hint="Last 30 days" />
          </div>
          <div className="card p-4 max-w-sm">
            <p className="text-small font-semibold text-ink-300 mb-2">Deliveries per day</p>
            <HopLine values={[12, 18, 15, 22, 19, 26, 24]} height={48} label="Deliveries per day" />
          </div>
        </Section>

        <Section title="The direction sign" note="The one distinctive element: a highway direction sign, used on the sign-in page and in the logo. Everything around it stays quiet.">
          <div className="sign-board" style={{ maxWidth: 440 }}>
            <p className="sign-title" style={{ fontSize: '1.5rem', lineHeight: '1.9rem' }}>Plan, dispatch and track deliveries across India.</p>
            <ul className="sign-destinations">
              <li><span className="sign-arrow" style={{ transform: 'rotate(-90deg)' }}><Icon name="arrowRight" size={20} strokeWidth={2.5} /></span><span className="sign-city">New Delhi</span><span className="sign-hub">Okhla</span></li>
              <li><span className="sign-arrow" style={{ transform: 'rotate(90deg)' }}><Icon name="arrowRight" size={20} strokeWidth={2.5} /></span><span className="sign-city">Bengaluru</span><span className="sign-hub">Bommanahalli</span></li>
            </ul>
          </div>
        </Section>

        <Section title="Loading" note="Tables load as rows in the shape of the data. After four seconds a loader explains that the free server may be waking up.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card"><SkeletonRows rows={4} /></div>
            <div className="card"><PageLoader /></div>
          </div>
        </Section>
      </div>
    </div>
  )
}
