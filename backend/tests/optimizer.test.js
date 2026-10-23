import { describe, it, expect } from 'vitest'
import { optimizeRoute, planBatch, evaluateSequence, bestSequence, OptimizationError } from '../src/services/routeOptimizer.js'
import { RANCHI_HUB, RANCHI_LOCATIONS as L } from '../src/data/ranchiLocations.js'
import { estimateFuel } from '../src/services/fuel.js'

// Thursday 15 Oct 2026, 10:00 IST
const DEPART = '2026-10-15T04:30:00.000Z'
const van = { type: 'van', fuelType: 'diesel', mileage: 16, capacity: 750 }

const fiveStops = [
  { ...L.harmuChowk, customerName: 'Priya Sharma' },
  { ...L.ranchiJunction, customerName: 'Rohit Oraon' },
  { ...L.morabadiMaidan, customerName: 'Neha Kumari' },
  { ...L.albertEkkaChowk, customerName: 'Amit Mahto' },
  { ...L.lalpurChowk, customerName: 'Sunita Devi' }
]

function permutations(items) {
  if (items.length <= 1) return [items]
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(p => [x, ...p]))
}

describe('route optimizer — sequencing', () => {
  const base = { depot: RANCHI_HUB, stops: fiveStops, vehicle: van, departureTime: DEPART, trafficEnabled: false }

  it('finds the optimal order for 5 fixed Ranchi addresses (verified by brute force)', () => {
    const result = optimizeRoute(base)
    const all = permutations([0, 1, 2, 3, 4]).map(seq => ({ seq, cost: evaluateSequence(base, seq).cost }))
    const best = all.reduce((a, b) => (b.cost < a.cost ? b : a))
    expect(evaluateSequence(base, result.sequence).cost).toBeCloseTo(best.cost, 6)
    // Hub (Kokar) -> Lalpur -> Morabadi -> Albert Ekka -> Ranchi Junction -> Harmu
    expect(result.sequence).toEqual([4, 2, 3, 1, 0])
    expect(result.stops.map(s => s.customerName)).toEqual(['Sunita Devi', 'Neha Kumari', 'Amit Mahto', 'Rohit Oraon', 'Priya Sharma'])
    expect(result.stops.map(s => s.sequence)).toEqual([1, 2, 3, 4, 5])
  })

  it('beats or equals the as-entered order and reports savings alternatives', () => {
    const result = optimizeRoute(base)
    const byKey = Object.fromEntries(result.alternatives.map(a => [a.key, a]))
    expect(byKey.optimized.operatingCost).toBeLessThanOrEqual(byKey.as_entered.operatingCost)
    expect(byKey.shortest.distanceKm).toBeLessThanOrEqual(byKey.as_entered.distanceKm)
    expect(byKey.shortest.distanceKm).toBeLessThanOrEqual(byKey.optimized.distanceKm + 1e-9)
  })

  it('visits an urgent stop earlier than distance alone would', () => {
    const stops = fiveStops.map((s, i) => (i === 1 ? { ...s, priority: 'urgent' } : s))
    const plain = optimizeRoute(base)
    const urgent = optimizeRoute({ ...base, stops })
    const posPlain = plain.sequence.indexOf(1)
    const posUrgent = urgent.sequence.indexOf(1)
    expect(posPlain).toBe(3)
    expect(posUrgent).toBeLessThan(posPlain)
    expect(urgent.stops[posUrgent].priority).toBe('urgent')
  })

  it('sequences a stop with an early window first and computes ETAs', () => {
    // Ranchi Junction is ~12 min from the hub; a 10:00-10:13 window forces it first
    const stops = fiveStops.map((s, i) => (i === 1 ? { ...s, windowStart: '10:00', windowEnd: '10:13' } : s))
    const result = optimizeRoute({ ...base, stops })
    expect(result.sequence[0]).toBe(1)
    expect(result.violations).toEqual([])
    expect(result.stops[0].windowStatus).toBe('on_time')
    // ETAs are increasing and formatted in IST
    const etas = result.stops.map(s => new Date(s.estimatedArrival).getTime())
    expect([...etas].sort((a, b) => a - b)).toEqual(etas)
    expect(result.stops[0].etaLabel).toMatch(/^10:\d{2}$/)
  })

  it('waits when arriving before a window opens', () => {
    const stops = [{ ...L.lalpurChowk, windowStart: '11:00', windowEnd: '12:00' }]
    const result = optimizeRoute({ ...base, stops })
    expect(result.stops[0].windowStatus).toBe('early')
    expect(result.stops[0].waitMinutes).toBeGreaterThan(40)
    expect(result.totals.totalMinutes).toBeGreaterThanOrEqual(60)
  })

  it('flags windows that cannot be met with a readable message', () => {
    const stops = fiveStops.map((s, i) => (i === 1 ? { ...s, windowStart: '09:00', windowEnd: '10:05' } : s))
    const result = optimizeRoute({ ...base, stops })
    expect(result.violations).toHaveLength(1)
    const v = result.violations[0]
    expect(v.windowEnd).toBe('10:05')
    expect(v.lateByMin).toBeGreaterThan(0)
    expect(v.message).toMatch(/^Stop \d ETA \d{2}:\d{2}, window ends 10:05$/)
    const flagged = result.stops.find(s => s.windowStatus === 'late')
    expect(flagged.address).toBe(L.ranchiJunction.address)
  })
})

describe('route optimizer — windows across midnight', () => {
  const base = { depot: RANCHI_HUB, vehicle: van, trafficEnabled: false }
  const AT_23 = '2026-10-15T17:30:00.000Z' // 23:00 IST on the 15th
  const AT_01 = '2026-10-15T19:30:00.000Z' // 01:00 IST on the 16th

  it('takes a morning window as the next day when the route leaves at night', () => {
    const stops = [{ ...L.lalpurChowk, windowStart: '09:00', windowEnd: '12:00' }]
    const result = optimizeRoute({ ...base, stops, departureTime: AT_23 })
    expect(result.violations).toEqual([])
    expect(result.stops[0].windowStatus).toBe('early')
    expect(result.stops[0].waitMinutes).toBeGreaterThan(9 * 60)
  })

  it('accepts an overnight window and waits for it to open', () => {
    const stops = [{ ...L.lalpurChowk, windowStart: '22:00', windowEnd: '02:00' }]
    const result = optimizeRoute({ ...base, stops, departureTime: DEPART })
    expect(result.violations).toEqual([])
    expect(result.stops[0].windowStatus).toBe('early')
    expect(result.stops[0].waitMinutes).toBeGreaterThan(11 * 60)
  })

  it('is already inside an overnight window when leaving after midnight', () => {
    const stops = [{ ...L.lalpurChowk, windowStart: '22:00', windowEnd: '02:00' }]
    const result = optimizeRoute({ ...base, stops, departureTime: AT_01 })
    expect(result.violations).toEqual([])
    expect(result.stops[0].windowStatus).toBe('on_time')
  })

  it('keeps same-day windows unchanged, including ones already open', () => {
    const stops = [{ ...L.lalpurChowk, windowStart: '09:00', windowEnd: '12:00' }]
    const result = optimizeRoute({ ...base, stops, departureTime: DEPART })
    expect(result.stops[0].windowStatus).toBe('on_time')
    expect(result.stops[0].waitMinutes).toBe(0)
  })

  it('still reports a missed window as late when recalculating after it closed', () => {
    // Planned for 10:00, recalculated at 12:30: today's 09:00-12:00 window is missed, not tomorrow's
    const stops = [{ ...L.lalpurChowk, windowStart: '09:00', windowEnd: '12:00' }]
    const result = optimizeRoute({ ...base, stops, departureTime: '2026-10-15T07:00:00.000Z', windowAnchor: DEPART })
    expect(result.violations).toHaveLength(1)
    expect(result.stops[0].windowStatus).toBe('late')
  })
})

describe('route optimizer — traffic', () => {
  const stops = fiveStops
  it('takes longer in the 18:00 evening peak than at 03:00', () => {
    const peak = optimizeRoute({ depot: RANCHI_HUB, stops, vehicle: van, departureTime: '2026-10-15T12:30:00.000Z' })
    const night = optimizeRoute({ depot: RANCHI_HUB, stops, vehicle: van, departureTime: '2026-10-14T21:30:00.000Z' })
    expect(peak.totals.driveMinutes).toBeGreaterThan(night.totals.driveMinutes * 1.4)
    expect(peak.totals.trafficImpactFactor).toBeGreaterThan(1.5)
    expect(peak.totals.trafficLevel).toBe('heavy')
    expect(night.totals.trafficImpactFactor).toBe(1)
  })

  it('ignores time-of-day traffic when traffic-aware routing is off', () => {
    const r = optimizeRoute({ depot: RANCHI_HUB, stops, vehicle: van, departureTime: '2026-10-15T12:30:00.000Z', trafficEnabled: false })
    expect(r.totals.trafficImpactFactor).toBe(1)
  })

  it('applies congestion zones and road closures to affected legs', () => {
    const stops2 = [L.lalpurChowk, L.albertEkkaChowk]
    const opts = { depot: RANCHI_HUB, stops: stops2, vehicle: van, departureTime: '2026-10-14T21:30:00.000Z' }
    const clear = optimizeRoute(opts)
    // Zone centred between Lalpur and Albert Ekka Chowk
    const centre = [85.3316, 23.3712]
    const jam = optimizeRoute({ ...opts, incidents: [{ type: 'congestion', coordinates: centre, radiusKm: 0.4, severity: 2 }] })
    const closed = optimizeRoute({ ...opts, incidents: [{ type: 'closure', coordinates: centre, radiusKm: 0.4 }] })
    expect(jam.totals.driveMinutes).toBeGreaterThan(clear.totals.driveMinutes)
    expect(jam.totals.distanceKm).toBeCloseTo(clear.totals.distanceKm, 5)
    expect(closed.totals.distanceKm).toBeGreaterThan(clear.totals.distanceKm)
    expect(closed.stops.some(s => s.incidents.length > 0)).toBe(true)
  })
})

describe('fuel estimation', () => {
  const prices = { petrol: 100, diesel: 90, cng: 80, hybrid: 100, electric: 10 }
  it('computes litres, rupees and CO2 for a diesel van', () => {
    const f = estimateFuel(32, { fuelType: 'diesel', mileage: 16 }, prices)
    expect(f).toMatchObject({ quantity: 2, unit: 'L', cost: 180, co2Kg: 5.36 })
  })
  it('uses kWh for electric vehicles', () => {
    const f = estimateFuel(70, { fuelType: 'electric', mileage: 7 }, prices)
    expect(f).toMatchObject({ quantity: 10, unit: 'kWh', cost: 100, co2Kg: 7.1 })
  })
  it('uses the vehicle record mileage when present', () => {
    const r = optimizeRoute({ depot: RANCHI_HUB, stops: fiveStops, vehicle: { ...van, mileage: 8 }, departureTime: DEPART, trafficEnabled: false })
    expect(r.totals.fuel.quantity).toBeCloseTo(r.totals.distanceKm / 8, 1)
    expect(r.vehicleComparison.map(v => v.type)).toEqual(['bike', 'van', 'truck', 'ev_van'])
  })
})

describe('validation and performance', () => {
  it('rejects more than 30 stops on a single route', () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ address: `S${i}`, coordinates: [85.3 + i * 0.001, 23.36] }))
    expect(() => optimizeRoute({ stops: many, vehicle: van })).toThrow(/at most 30 stops/)
  })

  it('rejects invalid coordinates and malformed windows', () => {
    expect(() => optimizeRoute({ stops: [{ address: 'x', coordinates: [200, 10] }] })).toThrow(OptimizationError)
    expect(() => optimizeRoute({ stops: [{ ...L.doranda, windowStart: '9am' }] })).toThrow(/HH:MM/)
    expect(() => optimizeRoute({ stops: [{ ...L.doranda, windowStart: '25:00', windowEnd: '11:00' }] })).toThrow(/HH:MM/)
    expect(() => optimizeRoute({ stops: [{ ...L.doranda, windowStart: '11:00', windowEnd: '11:00' }] })).toThrow(/same time/)
    // An end before the start is an overnight window, not an error
    expect(() => optimizeRoute({ stops: [{ ...L.doranda, windowStart: '22:00', windowEnd: '02:00' }] })).not.toThrow()
  })

  it('optimizes 30 stops well under the 10 s budget', () => {
    // Deterministic pseudo-random spread across Ranchi
    let seed = 42
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const stops = Array.from({ length: 30 }, (_, i) => ({
      address: `Stop ${i + 1}`,
      coordinates: [85.27 + rand() * 0.12, 23.31 + rand() * 0.1],
      priority: i % 7 === 0 ? 'urgent' : 'standard',
      ...(i % 5 === 0 ? { windowStart: '11:00', windowEnd: '13:00' } : {})
    }))
    const started = Date.now()
    const r = optimizeRoute({ depot: RANCHI_HUB, stops, vehicle: van, departureTime: DEPART })
    expect(Date.now() - started).toBeLessThan(10000)
    expect(new Set(r.sequence).size).toBe(30)
  })
})

describe('multi-vehicle batch planning', () => {
  const twelve = Object.values(L).slice(0, 12).map((loc, i) => ({ ...loc, packageWeightKg: 10 + i }))

  it('splits stops across vehicles, each stop exactly once, within capacity', () => {
    const vehicles = [
      { type: 'bike', capacity: 60 },
      { ...van },
      { ...van }
    ]
    const plan = planBatch({ depot: RANCHI_HUB, stops: twelve, vehicles, departureTime: DEPART })
    const seen = plan.routes.flatMap(r => r.stops.map(s => s.address))
    expect(seen.sort()).toEqual(twelve.map(s => s.address).sort())
    for (const r of plan.routes) {
      expect(r.totals.loadKg).toBeLessThanOrEqual(r.vehicle.capacityKg)
      expect(r.capacityExceeded).toBe(false)
    }
    expect(plan.totals.stops).toBe(12)
    expect(plan.routes.length).toBeGreaterThan(1)
  })

  it('rejects a batch heavier than the whole fleet', () => {
    expect(() => planBatch({ depot: RANCHI_HUB, stops: twelve, vehicles: [{ type: 'bike', capacity: 20 }] }))
      .toThrow(/exceeds fleet capacity/)
  })

  it('plans the largest batch (300 stops, 10 vehicles) in under 10 s', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const stops = Array.from({ length: 300 }, (_, i) => ({
      address: `Stop ${i + 1}`,
      coordinates: [85.25 + rand() * 0.17, 23.29 + rand() * 0.14],
      packageWeightKg: 1 + Math.round(rand() * 8),
      priority: i % 9 === 0 ? 'urgent' : 'standard',
      ...(i % 6 === 0 ? { windowStart: '10:30', windowEnd: '12:30' } : {})
    }))
    const started = Date.now()
    const plan = planBatch({ depot: RANCHI_HUB, stops, vehicles: Array.from({ length: 10 }, () => van), departureTime: DEPART })
    expect(Date.now() - started).toBeLessThan(10000)
    expect(plan.routes).toHaveLength(10)
    expect(plan.totals.stops).toBe(300)
  })

  it('allows more than 30 stops when enough vehicles are selected', () => {
    const stops = Array.from({ length: 40 }, (_, i) => ({ address: `S${i}`, coordinates: [85.28 + (i % 10) * 0.01, 23.32 + Math.floor(i / 10) * 0.02] }))
    const plan = planBatch({ depot: RANCHI_HUB, stops, vehicles: [van, van], departureTime: DEPART, includeAlternatives: false })
    expect(plan.routes.every(r => r.stops.length <= 30)).toBe(true)
    expect(plan.totals.stops).toBe(40)
  })
})

describe('search strategies', () => {
  // Seeded stops around the Ranchi hub, some with windows and priorities
  function instance(seed, n) {
    let a = seed
    const r = () => ((a = (a * 16807) % 2147483647) / 2147483647)
    const [lng, lat] = RANCHI_HUB.coordinates
    return {
      depot: RANCHI_HUB,
      vehicle: { type: 'van' },
      departureTime: DEPART,
      stops: Array.from({ length: n }, (_, i) => ({
        address: `Stop ${i + 1}`,
        coordinates: [lng + (r() - 0.5) * 0.12, lat + (r() - 0.5) * 0.12],
        priority: r() < 0.2 ? 'urgent' : 'standard',
        ...(r() < 0.4 ? { windowStart: '10:45', windowEnd: '11:45' } : {})
      }))
    }
  }

  it('is exactly optimal up to 8 stops', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const inst = instance(seed, 8)
      expect(bestSequence(inst).cost).toBeCloseTo(bestSequence(inst, { strategy: 'exact' }).cost, 6)
    }
  })

  it('finds the optimum on 9 stops, beyond the exhaustive limit', () => {
    const inst = instance(11, 9)
    expect(bestSequence(inst).cost).toBeCloseTo(bestSequence(inst, { strategy: 'exact', timeBudgetMs: 60000 }).cost, 6)
  })

  it('is never worse than the previous search, and gives the same plan every time', () => {
    for (let seed = 20; seed < 24; seed++) {
      const inst = instance(seed, 18)
      const now = bestSequence(inst)
      expect(now.cost).toBeLessThanOrEqual(bestSequence(inst, { strategy: 'baseline' }).cost + 1e-6)
      expect(bestSequence(inst).sequence).toEqual(now.sequence)
    }
  })
})

describe('moving stops between vehicles', () => {
  // Two vans and 24 stops scattered around the Ranchi hub
  function batch(seed) {
    let a = seed
    const r = () => ((a = (a * 16807) % 2147483647) / 2147483647)
    const [lng, lat] = RANCHI_HUB.coordinates
    return {
      depot: RANCHI_HUB,
      departureTime: DEPART,
      includeAlternatives: false,
      vehicles: [{ type: 'van', capacity: 60 }, { type: 'van', capacity: 60 }],
      stops: Array.from({ length: 24 }, (_, i) => ({
        address: `Stop ${i + 1}`,
        coordinates: [lng + (r() - 0.5) * 0.14, lat + (r() - 0.5) * 0.14],
        packageWeightKg: 1 + Math.round(r() * 3)
      }))
    }
  }

  it('is never worse than the sweep split, and keeps every van within capacity', () => {
    for (const seed of [3, 7, 11]) {
      const input = batch(seed)
      const sweep = planBatch({ ...input, interRoute: false })
      const improved = planBatch(input)
      expect(improved.totals.operatingCost).toBeLessThanOrEqual(sweep.totals.operatingCost + 1e-6)
      expect(improved.totals.stops).toBe(24)
      expect(improved.routes.flatMap(r => r.stops.map(s => s.address)).sort()).toEqual(input.stops.map(s => s.address).sort())
      for (const route of improved.routes) expect(route.totals.loadKg).toBeLessThanOrEqual(60)
    }
  })
})
