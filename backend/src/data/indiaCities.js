// Hubs and delivery points in five Indian cities, used by the demo data and to
// answer address searches for well-known places. Coordinates are [lng, lat] from
// OpenStreetMap (Photon / Nominatim geocoding, © OpenStreetMap contributors, ODbL).
import { RANCHI_HUB, RANCHI_LOCATIONS as R } from './ranchiLocations.js'

// The geographic centre of India and a box around the country ([minLng, minLat, maxLng, maxLat])
export const INDIA_CENTRE = [80.4, 22.6]
export const INDIA_BBOX = Object.freeze([68.1, 6.5, 97.4, 35.7])

export const DEMO_CITIES = Object.freeze([
  {
    key: 'delhi',
    city: 'New Delhi',
    hub: { name: 'Hopr Hub, Okhla', address: 'Okhla Industrial Area Phase 1, New Delhi, Delhi 110020', coordinates: [77.2811, 28.5349] },
    stops: [
      { name: 'Connaught Place', address: 'Connaught Place, New Delhi, Delhi 110001', coordinates: [77.2194, 28.6318] },
      { name: 'Khan Market', address: 'Khan Market, New Delhi, Delhi 110003', coordinates: [77.2263, 28.5991] },
      { name: 'Lajpat Nagar Central Market', address: 'Lajpat Nagar Central Market, Lajpat Nagar, New Delhi, Delhi', coordinates: [77.2408, 28.569] },
      { name: 'Hauz Khas Village', address: 'Hauz Khas Village, New Delhi, Delhi 110016', coordinates: [77.1945, 28.5541] },
      { name: 'Select Citywalk', address: 'Select Citywalk, Saket, New Delhi, Delhi', coordinates: [77.2183, 28.5293] }
    ]
  },
  {
    key: 'mumbai',
    city: 'Mumbai',
    hub: { name: 'Hopr Hub, MIDC Andheri', address: 'MIDC, Andheri East, Mumbai, Maharashtra 400096', coordinates: [72.8736, 19.1174] },
    stops: [
      { name: 'Linking Road', address: 'Linking Road, Bandra West, Mumbai, Maharashtra 400050', coordinates: [72.8367, 19.0597] },
      { name: 'Hiranandani Gardens', address: 'Hiranandani Gardens, Powai, Mumbai, Maharashtra 400076', coordinates: [72.9065, 19.1194] },
      { name: 'Juhu Beach', address: 'Juhu Beach, Juhu, Mumbai, Maharashtra', coordinates: [72.8187, 19.1221] },
      { name: 'Santacruz Station', address: 'Santacruz Station, Santacruz West, Mumbai, Maharashtra 400054', coordinates: [72.8381, 19.0832] },
      { name: 'Oberoi Mall', address: 'Oberoi Mall, Goregaon East, Mumbai, Maharashtra 400063', coordinates: [72.8606, 19.1737] }
    ]
  },
  {
    key: 'bengaluru',
    city: 'Bengaluru',
    hub: { name: 'Hopr Hub, Bommanahalli', address: 'Bommanahalli, Hosur Road, Bengaluru, Karnataka 560068', coordinates: [77.6272, 12.9096] },
    stops: [
      { name: 'Forum Mall Koramangala', address: 'Forum Mall, Koramangala, Bengaluru, Karnataka 560095', coordinates: [77.6121, 12.935] },
      { name: '100 Feet Road Indiranagar', address: '100 Feet Road, Indiranagar, Bengaluru, Karnataka 560008', coordinates: [77.6413, 12.9702] },
      { name: 'MG Road Metro', address: 'MG Road Metro Station, Bengaluru, Karnataka 560001', coordinates: [77.6065, 12.9754] },
      { name: 'Jayanagar 4th Block', address: 'Jayanagar 4th Block, Bengaluru, Karnataka 560011', coordinates: [77.5835, 12.9266] },
      { name: 'BTM Layout', address: 'BTM Layout, Bengaluru, Karnataka 560076', coordinates: [77.6103, 12.914] }
    ]
  },
  {
    key: 'kolkata',
    city: 'Kolkata',
    hub: { name: 'Hopr Hub, Kasba', address: 'Kasba Industrial Estate, Kolkata, West Bengal', coordinates: [88.4057, 22.5144] },
    stops: [
      { name: 'Park Street', address: 'Park Street, Kolkata, West Bengal 700087', coordinates: [88.3501, 22.5552] },
      { name: 'Salt Lake Sector V', address: 'Sector V, Salt Lake, Bidhannagar, West Bengal 700091', coordinates: [88.4349, 22.578] },
      { name: 'Gariahat', address: 'Gariahat Road, Kolkata, West Bengal 700017', coordinates: [88.3661, 22.5432] },
      { name: 'New Market', address: 'New Market, Kolkata, West Bengal 700087', coordinates: [88.353, 22.5602] },
      { name: 'Ballygunge', address: 'Ballygunge, Kolkata, West Bengal 700042', coordinates: [88.372, 22.5193] }
    ]
  },
  {
    key: 'ranchi',
    city: 'Ranchi',
    hub: RANCHI_HUB,
    stops: [
      { key: 'lalpurChowk', name: 'Lalpur Chowk', ...R.lalpurChowk },
      { key: 'morabadiMaidan', name: 'Morabadi Maidan', ...R.morabadiMaidan },
      { key: 'albertEkkaChowk', name: 'Albert Ekka Chowk', ...R.albertEkkaChowk },
      { key: 'ranchiJunction', name: 'Ranchi Junction', ...R.ranchiJunction },
      { key: 'harmuChowk', name: 'Harmu Chowk', ...R.harmuChowk }
    ]
  }
])

// Every curated place (hubs, demo stops and the other Ranchi landmarks), for address search
export const KNOWN_PLACES = Object.freeze([
  ...DEMO_CITIES.flatMap(c => [{ key: `${c.key}Hub`, ...c.hub }, ...c.stops.map(s => ({ key: s.key || s.name, ...s }))]),
  ...Object.entries(R)
    .filter(([, place]) => !DEMO_CITIES.find(c => c.key === 'ranchi').stops.some(s => s.address === place.address))
    .map(([key, place]) => ({ key, ...place }))
])
