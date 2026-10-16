export class RouteOptimizer {
  static calculateDistance(coord1, coord2) {
    const [lon1, lat1] = coord1
    const [lon2, lat2] = coord2
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  static calculateTravelTime(distance, vehicleType, trafficFactor = 1) {
    const speeds = {
      van: 40,
      truck: 35,
      bike: 15,
      ev_van: 38
    }
    const baseSpeed = speeds[vehicleType] || 40
    const effectiveSpeed = baseSpeed / trafficFactor
    return (distance / effectiveSpeed) * 60
  }

  static calculateFuelConsumption(distance, vehicleType, fuelPrice) {
    const mileage = {
      van: 12,
      truck: 6,
      bike: 0,
      ev_van: 0
    }
    const mpg = mileage[vehicleType] || 12
    if (mpg === 0) return { fuel: 0, cost: 0 }
    const fuel = distance / mpg
    return { fuel, cost: fuel * fuelPrice }
  }

  static nearestNeighbor(stops, startIndex = 0) {
    const n = stops.length
    if (n <= 2) return stops.map((_, i) => i)
    
    const visited = new Array(n).fill(false)
    const route = []
    let current = startIndex
    
    visited[current] = true
    route.push(current)
    
    for (let i = 1; i < n; i++) {
      let nearest = -1
      let minDist = Infinity
      
      for (let j = 0; j < n; j++) {
        if (!visited[j]) {
          const dist = this.calculateDistance(stops[current].coordinates, stops[j].coordinates)
          if (dist < minDist) {
            minDist = dist
            nearest = j
          }
        }
      }
      
      if (nearest !== -1) {
        visited[nearest] = true
        route.push(nearest)
        current = nearest
      }
    }
    
    return route
  }

  static twoOpt(stops, route) {
    const n = route.length
    if (n <= 3) return route
    
    let improved = true
    let bestRoute = [...route]
    let bestDistance = this.calculateRouteDistance(stops, bestRoute)
    
    while (improved) {
      improved = false
      for (let i = 1; i < n - 2; i++) {
        for (let j = i + 1; j < n; j++) {
          if (j - i === 1) continue
          
          const newRoute = [...bestRoute]
          const segment = newRoute.slice(i, j)
          segment.reverse()
          newRoute.splice(i, j - i, ...segment)
          
          const newDistance = this.calculateRouteDistance(stops, newRoute)
          if (newDistance < bestDistance) {
            bestDistance = newDistance
            bestRoute = newRoute
            improved = true
          }
        }
      }
    }
    
    return bestRoute
  }

  static calculateRouteDistance(stops, route) {
    let total = 0
    for (let i = 0; i < route.length - 1; i++) {
      total += this.calculateDistance(stops[route[i]].coordinates, stops[route[i + 1]].coordinates)
    }
    return total
  }

  static generateGeometry(stops, route) {
    return {
      type: 'LineString',
      coordinates: route.map(i => stops[i].coordinates)
    }
  }

  static optimize(stops, options = {}) {
    const { vehicleType = 'van', vehicleCount = 1, fuelPrice = 1.5, trafficFactor = 1.2 } = options
    
    if (stops.length < 2) {
      throw new Error('At least 2 stops required')
    }

    const validStops = stops.filter(s => s.coordinates && s.coordinates.length === 2)
    if (validStops.length < 2) {
      throw new Error('At least 2 stops with valid coordinates required')
    }

    const startIndex = 0
    let route = this.nearestNeighbor(validStops, startIndex)
    route = this.twoOpt(validStops, route)

    const totalDistance = this.calculateRouteDistance(validStops, route)
    const estimatedTime = this.calculateTravelTime(totalDistance, vehicleType, trafficFactor)
    const { fuel, cost } = this.calculateFuelConsumption(totalDistance, vehicleType, fuelPrice)
    const geometry = this.generateGeometry(validStops, route)

    const optimizedStops = route.map((index, sequence) => ({
      address: validStops[index].address,
      coordinates: validStops[index].coordinates,
      priority: validStops[index].priority,
      timeWindow: validStops[index].timeWindow,
      sequence
    }))

    return {
      totalDistance: Math.round(totalDistance * 10) / 10,
      estimatedTime: Math.round(estimatedTime),
      fuelEstimate: Math.round(fuel * 10) / 10,
      fuelCost: Math.round(cost * 100) / 100,
      geometry,
      optimizedStops,
      routeSequence: route
    }
  }
}

export default RouteOptimizer