import api from './api'
import { MAPBOX_TOKEN, RANCHI_CENTRE } from '../config'

// Address suggestions. Uses the Mapbox Geocoding API directly when
// VITE_MAPBOX_TOKEN is set, otherwise the backend's OpenStreetMap-backed /map/suggest.
export async function fetchSuggestions(query, { signal, limit = 5 } = {}) {
  if (MAPBOX_TOKEN) {
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`)
    url.search = new URLSearchParams({
      access_token: MAPBOX_TOKEN,
      autocomplete: 'true',
      country: 'in',
      proximity: RANCHI_CENTRE.join(','),
      limit: String(limit),
      types: 'address,poi,neighborhood,locality,place,postcode'
    })
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
    const data = await res.json()
    return (data.features || []).map(f => ({ id: f.id, label: f.place_name, coordinates: f.center }))
  }
  const { data } = await api.get('/map/suggest', { params: { q: query, limit }, signal })
  return (data.suggestions || []).map((s, i) => ({ id: `${i}-${s.label}`, label: s.label, coordinates: s.coordinates }))
}

