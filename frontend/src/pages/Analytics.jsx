import { useState, useEffect } from 'react'
import { Chart as ChartJS, ArcElement, LineElement, BarElement, PointElement, BarController, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js'
import { Doughnut, Line, Bar } from 'react-chartjs-2'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'

ChartJS.register(ArcElement, LineElement, BarElement, PointElement, BarController, CategoryScale, LinearScale, Tooltip, Legend, Filler)

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { usePointStyle: true, padding: 20, font: { size: 12 } }
    }
  }
}

const colors = {
  primary: '#1e3a8a',
  secondary: '#06b6d4',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  muted: '#94a3b8'
}

export default function Analytics() {
  const { isAdmin, isFleetManager } = useAuth()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('30d')

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/analytics?range=${timeRange}`)
      setAnalytics(response.data)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner" />
      </div>
    )
  }

  const kpis = analytics?.kpis || {
    totalDeliveries: 0,
    onTimeRate: 0,
    avgDeliveryTime: 0,
    fuelCostPerDelivery: 0,
    vehicleUtilization: 0,
    completionRate: 0
  }

  const deliveryTrend = analytics?.deliveryTrend || { labels: [], data: [] }
  const fuelTrend = analytics?.fuelTrend || { labels: [], data: [] }
  const vehicleUtilization = analytics?.vehicleUtilization || []
  const driverPerformance = analytics?.driverPerformance || []
  const statusDistribution = analytics?.statusDistribution || { pending: 0, in_progress: 0, completed: 0, failed: 0 }

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Fleet performance insights and key metrics</p>
        </div>
        <select
          className="form-input form-select w-auto"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          aria-label="Select time range"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last year</option>
        </select>
      </div>

      <div className="grid grid-4 gap-4 mb-6" role="region" aria-label="Key performance indicators">
        <div className="card stats-card">
          <p className="stats-label">Total Deliveries</p>
          <p className="stats-value">{kpis.totalDeliveries?.toLocaleString() || 0}</p>
          <span className="stats-trend positive">+12% vs last period</span>
        </div>
        <div className="card stats-card">
          <p className="stats-label">On-Time Rate</p>
          <p className="stats-value text-success">{(kpis.onTimeRate || 0).toFixed(1)}%</p>
          <span className="stats-trend positive">+2.3% vs last period</span>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Avg Delivery Time</p>
          <p className="stats-value">{Math.round(kpis.avgDeliveryTime || 0)} min</p>
          <span className="stats-trend negative">-5% vs last period</span>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Fuel Cost/Delivery</p>
          <p className="stats-value text-warning">${(kpis.fuelCostPerDelivery || 0).toFixed(2)}</p>
          <span className="stats-trend negative">-8% vs last period</span>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Vehicle Utilization</p>
          <p className="stats-value text-secondary">{(kpis.vehicleUtilization || 0).toFixed(1)}%</p>
          <span className="stats-trend positive">+3% vs last period</span>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Completion Rate</p>
          <p className="stats-value text-success">{(kpis.completionRate || 0).toFixed(1)}%</p>
          <span className="stats-trend positive">+1.2% vs last period</span>
        </div>
      </div>

      <div className="grid grid-2 gap-6 mb-6">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Delivery Trend</h3>
          </div>
          <div className="card-body h-64">
            {deliveryTrend.labels?.length > 0 ? (
              <Line
                data={{
                  labels: deliveryTrend.labels,
                  datasets: [{
                    label: 'Deliveries',
                    data: deliveryTrend.data,
                    borderColor: colors.primary,
                    backgroundColor: 'rgba(30, 58, 138, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4
                  }]
                }}
                options={chartOptions}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted">No data available</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Fuel Consumption Trend</h3>
          </div>
          <div className="card-body h-64">
            {fuelTrend.labels?.length > 0 ? (
              <Line
                data={{
                  labels: fuelTrend.labels,
                  datasets: [{
                    label: 'Fuel (L)',
                    data: fuelTrend.data,
                    borderColor: colors.warning,
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4
                  }]
                }}
                options={chartOptions}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted">No data available</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-2 gap-6 mb-6">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Delivery Status Distribution</h3>
          </div>
          <div className="card-body h-64 flex items-center justify-center">
            <Doughnut
              data={{
                labels: ['Completed', 'In Progress', 'Pending', 'Failed'],
                datasets: [{
                  data: [
                    statusDistribution.completed || 0,
                    statusDistribution.in_progress || 0,
                    statusDistribution.pending || 0,
                    statusDistribution.failed || 0
                  ],
                  backgroundColor: [
                    colors.success,
                    colors.primary,
                    colors.warning,
                    colors.error
                  ],
                  borderWidth: 0,
                  cutout: '65%'
                }]
              }}
              options={{
                ...chartOptions,
                plugins: {
                  ...chartOptions.plugins,
                  legend: { position: 'right', labels: { usePointStyle: true, padding: 15 } }
                }
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Vehicle Utilization</h3>
          </div>
          <div className="card-body h-64">
            {vehicleUtilization.length > 0 ? (
              <Bar
                data={{
                  labels: vehicleUtilization.map(v => v.vehicleId),
                  datasets: [{
                    label: 'Utilization %',
                    data: vehicleUtilization.map(v => v.utilization),
                    backgroundColor: vehicleUtilization.map(v => 
                      v.utilization > 80 ? colors.success :
                      v.utilization > 50 ? colors.warning : colors.muted
                    ),
                    borderRadius: 4
                  }]
                }}
                options={{
                  ...chartOptions,
                  indexAxis: 'y',
                  scales: {
                    x: { max: 100, ticks: { callback: v => `${v}%` } }
                  }
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted">No data available</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-2 gap-6">
        <div className="card">
          <div className="card-header flex-between">
            <h3 className="font-semibold">Top Drivers</h3>
          </div>
          <div className="card-body p-0">
            {driverPerformance.length > 0 ? (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Driver</th>
                      <th>Deliveries</th>
                      <th>On-Time %</th>
                      <th>Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverPerformance.slice(0, 10).map((driver, index) => (
                      <tr key={driver._id}>
                        <td className="font-bold text-primary">#{index + 1}</td>
                        <td>{driver.name}</td>
                        <td>{driver.deliveries}</td>
                        <td className="text-success font-medium">{driver.onTimeRate.toFixed(1)}%</td>
                        <td>
                          <span className="badge badge-warning">{driver.rating.toFixed(1)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted">No driver data available</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header flex-between">
            <h3 className="font-semibold">Route Efficiency</h3>
          </div>
          <div className="card-body p-0">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Planned (km)</th>
                    <th>Actual (km)</th>
                    <th>Efficiency</th>
                    <th>Fuel Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.routeEfficiency || []).slice(0, 10).map((route, index) => (
                    <tr key={index}>
                      <td className="font-medium">{route.name}</td>
                      <td>{route.plannedDistance.toFixed(1)}</td>
                      <td>{route.actualDistance.toFixed(1)}</td>
                      <td>
                        <span className={`badge ${route.efficiency > 90 ? 'badge-success' : route.efficiency > 75 ? 'badge-warning' : 'badge-error'}`}>
                          {route.efficiency.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-success font-medium">{route.fuelSaved.toFixed(1)} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}