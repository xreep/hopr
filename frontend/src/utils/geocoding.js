import api from './api'

// Address suggestions from the server, which uses Mapbox when it has a token and
// OpenStreetMap otherwise. `near` ([lng, lat], usually the batch's hub) ranks
// nearby places first; results can still come from anywhere in India.
export async function fetchSuggestions(query, { signal, limit = 5, near } = {}) {
  const params = { q: query, limit }
  if (Array.isArray(near) && near.length === 2) params.near = near.map(n => Number(n).toFixed(5)).join(',')
  const { data } = await api.get('/map/suggest', { params, signal })
  return (data.suggestions || []).map((s, i) => ({ id: `${i}-${s.label}`, label: s.label, coordinates: s.coordinates }))
}
