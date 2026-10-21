import { describe, it, expect } from 'vitest'
import { matchLandmarks, dedupeSuggestions, insideServiceArea, SERVICE_BBOX } from '../src/services/geocoding.js'
import { RANCHI_LOCATIONS as L } from '../src/data/ranchiLocations.js'

describe('address suggestions', () => {
  it('finds curated Ranchi landmarks by the names people type', () => {
    expect(matchLandmarks('Ranchi Junction railway station')[0].coordinates).toEqual(L.ranchiJunction.coordinates)
    expect(matchLandmarks('railway stn')).toEqual([]) // every word must match
    expect(matchLandmarks('Lalpur')[0].coordinates).toEqual(L.lalpurChowk.coordinates)
    expect(matchLandmarks('airport')[0].coordinates).toEqual(L.birsaMundaAirport.coordinates)
    expect(matchLandmarks('firayalal')[0].coordinates).toEqual(L.albertEkkaChowk.coordinates)
    // "Ranchi" alone describes the whole city, not a place
    expect(matchLandmarks('Ranchi, Jharkhand')).toEqual([])
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

  it('keeps the search area around Ranchi', () => {
    expect(SERVICE_BBOX[0]).toBeLessThan(SERVICE_BBOX[2])
    expect(insideServiceArea(L.harmuChowk.coordinates)).toBe(true)
    expect(insideServiceArea([81.6296, 21.2514])).toBe(false) // Raipur
  })
})
