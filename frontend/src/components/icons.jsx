// Inline stroke icons (24px grid, 1.75 stroke). Decorative by default (aria-hidden).
const PATHS = {
  dashboard: ['M4 5a1 1 0 011-1h5v7H4V5z', 'M14 4h5a1 1 0 011 1v4h-6V4z', 'M14 13h6v6a1 1 0 01-1 1h-5v-7z', 'M4 15h6v5H5a1 1 0 01-1-1v-4z'],
  map: ['M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z', 'M9 4v14', 'M15 6v14'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h8', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  radar: ['M12 12l6-6', 'M12 3a9 9 0 109 9', 'M12 7a5 5 0 105 5', 'M12 12h.01'],
  truck: ['M3 6h11v10H3z', 'M14 9h4l3 3v4h-7', 'M7 19a2 2 0 100-4 2 2 0 000 4z', 'M17 19a2 2 0 100-4 2 2 0 000 4z'],
  users: ['M9 11a4 4 0 100-8 4 4 0 000 8z', 'M2 21v-1a6 6 0 0112 0v1', 'M16 3.5a4 4 0 010 7', 'M22 21v-1a6 6 0 00-4-5.7'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M21 20H3'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z', 'M9 12l2 2 4-4'],
  navigation: ['M12 2l7 19-7-4-7 4 7-19z'],
  user: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 21v-1a7 7 0 0114 0v1'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  logout: ['M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4', 'M10 16l-4-4 4-4', 'M6 12h11'],
  plus: ['M12 5v14', 'M5 12h14'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7l1-8z'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  camera: ['M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z', 'M12 17a4 4 0 100-8 4 4 0 000 8z'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z'],
  refresh: ['M20 11a8 8 0 00-14.3-4.9L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0014.3 4.9L20 16', 'M20 20v-4h-4'],
  volume: ['M4 9v6h4l5 4V5L8 9H4z', 'M16.5 8.5a5 5 0 010 7', 'M19 6a8.5 8.5 0 010 12'],
  volumeOff: ['M4 9v6h4l5 4V5L8 9H4z', 'M17 9l5 5', 'M22 9l-5 5'],
  alert: ['M12 3l10 18H2L12 3z', 'M12 10v4', 'M12 17h.01'],
  clock: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2'],
  pin: ['M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z', 'M12 11a2 2 0 100-4 2 2 0 000 4z'],
  package: ['M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z', 'M3 7.5l9 4.5 9-4.5', 'M12 12v9'],
  bike: ['M5.5 18a3.5 3.5 0 100-7 3.5 3.5 0 000 7z', 'M18.5 18a3.5 3.5 0 100-7 3.5 3.5 0 000 7z', 'M5.5 14.5h4l3-5h4l2 5', 'M12.5 9.5L11 6H8'],
  van: ['M2 7h12l4 4h3v6H2V7z', 'M14 7v4h4', 'M6.5 19a2 2 0 100-4 2 2 0 000 4z', 'M16.5 19a2 2 0 100-4 2 2 0 000 4z'],
  bigTruck: ['M2 5h13v11H2z', 'M15 9h4l3 3v4h-7', 'M6 19a2 2 0 100-4 2 2 0 000 4z', 'M18 19a2 2 0 100-4 2 2 0 000 4z', 'M10 19a2 2 0 100-4 2 2 0 000 4z'],
  plug: ['M9 3v5', 'M15 3v5', 'M6 8h12v3a6 6 0 01-12 0V8z', 'M12 17v4'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  print: ['M7 9V3h10v6', 'M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2', 'M7 14h10v7H7z'],
  share: ['M12 15V3', 'M7 8l5-5 5 5', 'M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M14 6l4 4'],
  play: ['M7 4l13 8-13 8V4z'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5'],
  copy: ['M8 8h12v12H8z', 'M16 8V4H4v12h4'],
  sparkle: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M6 6l2.5 2.5', 'M15.5 15.5L18 18', 'M18 6l-2.5 2.5', 'M8.5 15.5L6 18'],
  search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M20 20l-4-4'],
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 018 0v3'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  eyeOff: ['M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-2.9 3.9', 'M6.6 6.6C3.8 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 005.4-1.6', 'M9.9 9.9a3 3 0 004.2 4.2', 'M3 3l18 18'],
  bell: ['M6 16V11a6 6 0 0112 0v5l2 2H4l2-2z', 'M10 20a2 2 0 004 0'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  gauge: ['M12 14l4-4', 'M4 18a9 9 0 1116 0']
}

export default function Icon({ name, size = 18, className = '', title, strokeWidth = 1.75 }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {d.map(p => <path key={p} d={p} />)}
    </svg>
  )
}

// The Hopr mark: a route with three hops. `animated` draws it on mount.
// Hopr mark: a highway direction sign. Green plate, white inset border, a route that turns and points ahead.
export function HopMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0B6B3A" />
      <rect x="2.5" y="2.5" width="27" height="27" rx="5" stroke="#FFFFFF" strokeWidth="1.4" />
      <path d="M9 25v-6a3 3 0 0 1 3-3h8a3 3 0 0 0 3-3V7.5" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 10.5 23 6.5l4 4" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="25" r="2.3" fill="#FFFFFF" />
    </svg>
  )
}
