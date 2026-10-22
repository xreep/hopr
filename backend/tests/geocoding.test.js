import { describe, it, expect } from 'vitest'
import { matchLandmarks, dedupeSuggestions, insideIndia, parseNear } from '../src/services/geocoding.js'
import { RANCHI_LOCATIONS as L } from '../src/data/ranchiLocations.js'
import { DEMO_CITIES } from '../src/data/indiaCities.js'

const hub = key => DEMO_CITIES.find(c => c.key === key).hub.coordinates

describe('address suggestions', () => {
  it('finds curated places across India by the names people type', () => {
    expect(matchLandmarks('Ranchi Junction railway station')[0].coordinates).toEqual(L.ranchiJunction.coordinates)
    expect(matchLandmarks('railway stn')).toEqual([]) // every word must match
    expect(matchLandmarks('airport')[0].coordinates).toEqual(L.birsaMundaAirport.coordinates)
    expect(matchLandmarks('Connaught Place')[0].label).toMatch(/New Delhi/)
    expect(matchLandmarks('Hiranandani Powai')[0].label).toMatch(/Mumbai/)
    expect(matchLandmarks('Koramangala')[0].label).toMatch(/Bengaluru/)
  })

  it('leaves a bare city or state name to the geocoder', () => {
    expect(matchLandmarks('Ranchi, Jharkhand')).toEqual([])
    expect(matchLandmarks('New Delhi')).toEqual([])
    expect(matchLandmarks('Mumbai')).toEqual([])
  })

  it('ranks matches by distance from the hub when one is given', () => {
    // "Park" matches Park Street (Kolkata); "Market" matches markets in Delhi and Kolkata
    const fromKolkata = matchLandmarks('market', 3, hub('kolkata'))
    const fromDelhi = matchLandmarks('market', 3, hub('delhi'))
    expect(fromKolkata[0].label).toMatch(/Kolkata/)
    expect(fromDelhi[0].label).toMatch(/Delhi/)
  })

  it('removes repeated labels and places a few metres apart', () => {
    const list = [
      { label: 'Albert Ekka Chowk, Ranchi', coordinates: [85.3249, 23.3702] },
      { label: 'Albert Ekka Chowk,  Ranchi', coordinates: [85.3300, 23.3800] },
      { label: 'Firayalal Chowk', coordinates: [85.32491, 23.37021] },
      { label: 'Lalpur Chowk', coordinates: [85.3383, 23.3722] }
    ]
    expect(dedupeSuggestions(list).map(s => s.label)).toEqual(['Albert Ekka Chowk, Ranchi', 'Lalpur Chowk'])
    expect(dedupeSuggestions(list, 1)).toHaveLength(1)
  })

  it('accepts a hub location only inside India', () => {
    expect(insideIndia(hub('mumbai'))).toBe(true)
    expect(insideIndia([81.6296, 21.2514])).toBe(true) // Raipur
    expect(insideIndia([-0.1276, 51.5072])).toBe(false) // London
    expect(parseNear('77.2811,28.5349')).toEqual([77.2811, 28.5349])
    expect(parseNear('-0.12,51.5')).toBeNull()
    expect(parseNear('not,a-place')).toBeNull()
  })
})
