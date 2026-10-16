import { useState } from 'react'
import HopLine from '../components/HopLine'
import useCountUp from '../hooks/useCountUp'

// Dev-only living reference for the Night Dispatch design system (/design-system)
const BG = '#070B14'

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PALETTE = [
  {
    group: 'Night (surfaces)',
    note: 'Deep near-black blue does the heavy lifting.',
    swatches: [
      { name: 'night-950', hex: '#070B14', role: 'Page background' },
      { name: 'night-900', hex: '#0B1220', role: 'Sunken wells: inputs, map backdrop' },
      { name: 'night-850', hex: '#0E1626', role: 'Surface' },
      { name: 'night-800', hex: '#141E33', role: 'Raised surface, glass tint' },
      { name: 'night-700', hex: '#1C2842', role: 'Hairlines and dividers' },
      { name: 'night-600', hex: '#2A3756', role: 'Strong borders, disabled fills' }
    ]
  },
  {
    group: 'Ink (text)',
    note: 'White and grays carry all reading text.',
    swatches: [
      { name: 'ink-50', hex: '#F4F7FB', role: 'Primary text, headings', text: true },
      { name: 'ink-300', hex: '#A9B4C8', role: 'Secondary text', text: true },
      { name: 'ink-400', hex: '#8591A8', role: 'Muted text, captions', text: true },
      { name: 'ink-500', hex: '#76839C', role: 'Placeholders, disabled only', text: true }
    ]
  },
  {
    group: 'Volt (the only accent)',
    note: 'Route lines, primary CTAs, active states, key numbers, status highlights. Under 10% of any screen.',
    swatches: [
      { name: 'volt', hex: '#D4FF3F', role: 'Accent', text: true, accent: true }
    ]
  },
  {
    group: 'Signals (meaning, not decoration)',
    note: 'Used only where status needs a second meaning beside "good".',
    swatches: [
      { name: 'signal-amber', hex: '#F5B544', role: 'Window at risk, warnings', text: true },
      { name: 'signal-coral', hex: '#FF6B78', role: 'Failed delivery, road closure', text: true },
      { name: 'signal-sky', hex: '#7AA2FF', role: 'Secondary chart series, info', text: true }
    ]
  }
]

const TYPE_SCALE = [
  { token: 'hero', px: '61 / 62', font: 'Space Grotesk 600', sample: 'Hop through every stop', cls: 'font-display text-hero font-semibold', use: 'Login only' },
  { token: 'stat', px: '39 / 40', font: 'Space Grotesk 600, tabular', sample: '17.2 km', cls: 'font-display text-stat font-semibold nd-tabular', use: 'KPI numbers' },
  { token: 'h1', px: '31 / 36', font: 'Space Grotesk 600', sample: 'Route Planner', cls: 'font-display text-h1 font-semibold', use: 'Page titles' },
  { token: 'h2', px: '25 / 30', font: 'Space Grotesk 600', sample: 'Morning run, Lalpur area', cls: 'font-display text-h2 font-semibold', use: 'Section titles' },
  { token: 'h3', px: '20 / 26', font: 'Space Grotesk 500', sample: 'Stop 4: Ranchi Junction', cls: 'font-display text-h3 font-medium', use: 'Card titles' },
  { token: 'body-lg', px: '16 / 24', font: 'Inter 400', sample: 'Ravi is on the way with your parcel and should reach Harmu Chowk in about 12 minutes.', cls: 'text-body-lg', use: 'Customer-facing copy' },
  { token: 'body', px: '14 / 20', font: 'Inter 400', sample: 'Lalpur Chowk, Circular Road, Lalpur, Ranchi, Jharkhand 834001', cls: 'text-body', use: 'Default UI text' },
  { token: 'small', px: '13 / 18', font: 'Inter 500', sample: 'ETA 10:42, window ends 11:00', cls: 'text-small font-medium', use: 'Metadata' },
  { token: 'micro', px: '12 / 16', font: 'Inter 500', sample: 'Last GPS ping 4 seconds ago', cls: 'text-micro font-medium text-ink-400', use: 'Captions (sentence case, never all caps)' }
]

function Swatch({ s }) {
  const ratio = contrast(s.hex, BG)
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-11 w-11 shrink-0 rounded-control border border-white/10" style={{ background: s.hex }} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-body font-medium text-ink-50">{s.name} <span className="text-ink-400 font-normal">{s.hex}</span></p>
        <p className="text-micro text-ink-400">{s.role}{s.text ? `; ${ratio.toFixed(1)}:1 on background` : ''}</p>
      </div>
    </div>
  )
}

function KpiCardSample({ replay }) {
  const value = useCountUp(94.2, { decimals: 1, duration: 1000 })
  const delivered = useCountUp(186, { duration: 1000 })
  return (
    <article className="nd-glass p-5 w-full max-w-[340px]" aria-label="On-time deliveries KPI">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-small font-medium text-ink-300">On-time deliveries</h3>
        <span className="text-micro font-medium text-volt">+2.7 pts</span>
      </div>
      <p className="font-display text-stat font-semibold nd-tabular mt-2 text-ink-50">
        {value.toFixed(1)}<span className="text-h3 text-ink-300 ml-0.5">%</span>
      </p>
      <p className="text-micro text-ink-400 mt-1">{delivered} delivered in the last 7 days, versus 91.5% the week before</p>
      <div className="mt-4" key={replay}>
        <HopLine values={[88.1, 90.4, 89.2, 92.7, 91.9, 93.8, 94.2]} label="Daily on-time rate for the last 7 days, rising to 94.2%" />
      </div>
    </article>
  )
}

export default function DesignSystem() {
  const [replay, setReplay] = useState(0)
  return (
    <div className="nd-backdrop min-h-screen font-sans">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-10 space-y-14">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-small text-ink-400">Hopr design system</p>
            <h1 className="font-display text-h1 font-semibold text-ink-50">Night Dispatch</h1>
            <p className="text-body text-ink-300 mt-2 max-w-[62ch]">
              A control room for Ranchi&apos;s deliveries after dark: near-black blue surfaces, white text,
              and one electric accent that only lights up where the work is happening.
            </p>
          </div>
          <button type="button" className="nd-btn nd-btn-secondary" onClick={() => setReplay(r => r + 1)}>Replay motion</button>
        </header>

        <section aria-labelledby="palette-title">
          <h2 id="palette-title" className="font-display text-h2 font-semibold text-ink-50 mb-5">Palette</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {PALETTE.map(group => (
              <div key={group.group} className="nd-glass p-5">
                <h3 className="font-display text-h3 font-medium text-ink-50">{group.group}</h3>
                <p className="text-small text-ink-400 mb-3">{group.note}</p>
                {group.swatches.map(s => <Swatch key={s.name} s={s} />)}
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="type-title">
          <h2 id="type-title" className="font-display text-h2 font-semibold text-ink-50 mb-1">Type scale</h2>
          <p className="text-body text-ink-300 mb-5">Space Grotesk for display and numbers, Inter for everything you read. Ratio 1.25 from 16 px.</p>
          <div className="nd-glass divide-y divide-white/5">
            {TYPE_SCALE.map(t => (
              <div key={t.token} className="grid gap-2 p-5 md:grid-cols-[180px_1fr] md:items-baseline">
                <div>
                  <p className="text-small font-medium text-ink-50">{t.token}</p>
                  <p className="text-micro text-ink-400">{t.px} px, {t.font}</p>
                  <p className="text-micro text-ink-400">{t.use}</p>
                </div>
                <p className={`${t.cls} text-ink-50 min-w-0 break-words`}>{t.sample}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="components-title" className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 id="components-title" className="font-display text-h2 font-semibold text-ink-50 mb-1">KPI card</h2>
            <p className="text-body text-ink-300 mb-5">Glass surface, white number that counts up, and the hop line: the week&apos;s route draws itself, then each day&apos;s stop pops in.</p>
            <KpiCardSample replay={replay} />
          </div>
          <div>
            <h2 className="font-display text-h2 font-semibold text-ink-50 mb-1">Primary button</h2>
            <p className="text-body text-ink-300 mb-5">The only filled lime control on a screen. Dark text on lime (17:1).</p>
            <div className="nd-glass p-5 space-y-5">
              <div className="flex flex-wrap items-center gap-4">
                <figure className="space-y-2"><button type="button" className="nd-btn nd-btn-primary">Optimize routes</button><figcaption className="text-micro text-ink-400">Default</figcaption></figure>
                <figure className="space-y-2"><button type="button" className="nd-btn nd-btn-primary" style={{ background: '#DEFF66', boxShadow: '0 0 0 1px rgb(212 255 63 / 0.55), 0 10px 32px -10px rgb(212 255 63 / 0.45)' }}>Optimize routes</button><figcaption className="text-micro text-ink-400">Hover: glow</figcaption></figure>
                <figure className="space-y-2"><button type="button" className="nd-btn nd-btn-primary" style={{ boxShadow: '0 0 0 2px #070B14, 0 0 0 4px #D4FF3F' }}>Optimize routes</button><figcaption className="text-micro text-ink-400">Keyboard focus</figcaption></figure>
                <figure className="space-y-2"><button type="button" className="nd-btn nd-btn-primary" disabled>Optimize routes</button><figcaption className="text-micro text-ink-400">Disabled</figcaption></figure>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-small text-ink-300 mb-2">For contrast, the secondary button stays neutral, never lime:</p>
                <button type="button" className="nd-btn nd-btn-secondary">Upload CSV</button>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="rules-title" className="nd-glass p-6">
          <h2 id="rules-title" className="font-display text-h3 font-medium text-ink-50 mb-3">Accent discipline</h2>
          <div className="grid gap-6 md:grid-cols-2 text-body">
            <div>
              <p className="font-medium text-ink-50 mb-2">Lime is used for</p>
              <ul className="space-y-1 text-ink-300 list-disc pl-5">
                <li>Route polylines (with a soft glow) and stop markers on the map</li>
                <li>The single primary action on a screen</li>
                <li>Active nav item and selected tab indicator</li>
                <li>Key numbers that need attention, and positive deltas</li>
                <li>Live status: on the road, delivered, GPS live</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-ink-50 mb-2">Lime is never used for</p>
              <ul className="space-y-1 text-ink-300 list-disc pl-5">
                <li>Backgrounds, cards or large fills</li>
                <li>Body text or headings</li>
                <li>Large borders and dividers</li>
                <li>Secondary or destructive buttons</li>
                <li>More than about 10% of a screen</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
