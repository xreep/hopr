import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../utils/api'
import { pointAlong, projectOnPolyline, polylineLengthKm, stopsAlongKm } from '../utils/geo'

export const PING_INTERVAL_MS = 5000
const SIM_SPEED_KMH = 24 // demo drive: typical Ranchi city speed

// Shares the driver's position for an active route:
//  - gps:      navigator.geolocation.watchPosition, sent every 5 s
//  - manual:   one-off "Update location" (current position, or a point picked on the map)
//  - simulate: demo drive along the planned route (clearly labelled in the UI)
export default function useDriverLocation(route) {
  const routeId = route?._id
  const active = route?.status === 'active'
  const geometry = route?.geometry?.coordinates
  const [mode, setMode] = useState('gps')
  const [status, setStatus] = useState('idle') // idle | waiting | live | denied | unavailable | error
  const [lastSentAt, setLastSentAt] = useState(null)
  const [position, setPosition] = useState(null)
  const [error, setError] = useState('')
  const latest = useRef(null)
  const lastSent = useRef(null)
  const simAlong = useRef(null)
  const simHoldAt = useRef(Infinity)
  const knownLocation = useRef(null)
  useEffect(() => { knownLocation.current = route?.driverLocation?.coordinates || null }, [route?.driverLocation?.coordinates])

  const send = useCallback(async fix => {
    if (!routeId) return
    try {
      await api.patch(`/routes/${routeId}/location`, fix)
      lastSent.current = fix
      setLastSentAt(new Date())
      setError('')
    } catch (err) {
      setError(errorMessage(err, 'Could not send location'))
      // Not allowed any more (signed in as someone else, route finished/reassigned): stop pinging
      if ([403, 404, 409].includes(err.response?.status)) {
        setMode('manual')
        setStatus('error')
      }
    }
  }, [routeId])

  // Real GPS
  useEffect(() => {
    if (!active || mode !== 'gps') return undefined
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return undefined
    }
    setStatus('waiting')
    const id = navigator.geolocation.watchPosition(
      pos => {
        const fix = {
          coordinates: [pos.coords.longitude, pos.coords.latitude],
          accuracy: Math.round(pos.coords.accuracy),
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null
        }
        latest.current = fix
        setPosition(fix.coordinates)
        setStatus('live')
      },
      err => setStatus(err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : 'error'),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [active, mode])

  // The demo drive pulls up at the next stop and waits there until it is delivered or failed
  const stops = route?.stops
  useEffect(() => {
    const ordered = [...(stops || [])].sort((a, b) => a.sequence - b.sequence)
    const next = ordered.findIndex(s => s.status === 'pending' || s.status === 'in_progress')
    simHoldAt.current = next >= 0 && geometry?.length > 1 ? stopsAlongKm(ordered, geometry)[next] : Infinity
  }, [stops, geometry])

  // Demo drive along the route geometry
  useEffect(() => {
    if (!active || mode !== 'simulate' || !(geometry?.length > 1)) return undefined
    const total = polylineLengthKm(geometry)
    if (simAlong.current === null) {
      // Resume from the furthest of: last known position, last finished stop
      const done = (route?.stops || []).filter(s => s.status === 'completed' || s.status === 'failed')
      const candidates = [knownLocation.current, done[done.length - 1]?.coordinates].filter(Boolean)
      simAlong.current = Math.max(0, ...candidates.map(c => projectOnPolyline(c, geometry)?.alongKm ?? 0))
    }
    const step = () => {
      const target = Math.min(total, Math.max(simHoldAt.current, simAlong.current))
      simAlong.current = Math.min(target, simAlong.current + (SIM_SPEED_KMH * PING_INTERVAL_MS) / 3600000)
      const coordinates = pointAlong(geometry, simAlong.current)
      latest.current = { coordinates, accuracy: 5, heading: null, speed: SIM_SPEED_KMH / 3.6 }
      setPosition(coordinates)
    }
    step()
    setStatus('live')
    const id = setInterval(step, PING_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mode, geometry])

  // Send the latest fix every 5 s
  useEffect(() => {
    if (!active || mode === 'manual') return undefined
    const tick = () => {
      const fix = latest.current
      if (fix && fix !== lastSent.current) send(fix)
    }
    tick()
    const id = setInterval(tick, PING_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active, mode, send])

  useEffect(() => { simAlong.current = null }, [routeId])

  const updateNow = useCallback(() => new Promise(resolve => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return resolve(false)
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const fix = { coordinates: [pos.coords.longitude, pos.coords.latitude], accuracy: Math.round(pos.coords.accuracy) }
        latest.current = fix
        setPosition(fix.coordinates)
        await send(fix)
        resolve(true)
      },
      err => {
        setStatus(err.code === 1 ? 'denied' : 'unavailable')
        resolve(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }), [send])

  const sendManual = useCallback(async coordinates => {
    const fix = { coordinates, accuracy: null }
    latest.current = fix
    setPosition(coordinates)
    setMode('manual')
    await send(fix)
  }, [send])

  return { mode, setMode, status, lastSentAt, position, error, updateNow, sendManual }
}
