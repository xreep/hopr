import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Chart as ChartJS, ArcElement, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js'
import { Doughnut, Line, Bar } from 'react-chartjs-2'
import api, { errorMessage } from '../utils/api'
import { StatCard, PageLoader, EmptyState } from '../components/ui'
import { formatINR, formatKm, formatDuration } from '../utils/format'

ChartJS.register(ArcElement, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)

const colors = { primary: '#1e3a8a', blue: '#2563eb', success: '#10b981', warning: '#f59e0b', error: '#ef4444', muted: '#94a3b8' }

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } } },
  scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
}

const shortLabel = key => (key.length === 7 ? new Date(`${key}-01`).toLocaleDateString('en-IN', { month: 'short' }) : key.slice(5))

export default function Analytics() {
  const [data, setData] = useState(null)
  const [range, setRange] = useState('30d')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/analytics', { params: { range } })
      setData(res.data)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load analytics'))
    } finally {
      setLoading(false)
    }
  }, [range])
  useEffect(() => { load() }, [load])

  const downloadReport = async () => {
    try {
      const res = await api.get('/analytics/report.csv', { params: { range }, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `hopr-report-${range}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to download report'))
    }
  }

  if (loading && !data) return <PageLoader />
  if (!data) return <div className="card"><EmptyState title="Analytics unavailable" action={<button className="btn btn-primary btn-sm" onClick={load}>Retry</button>} /></div>

  const { kpis, trends } = data
  const hasDeliveries = kpis.totalDeliveries > 0 || kpis.failedDeliveries > 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Fleet KPIs from recorded deliveries, compared with the previous period</p>
        </div>
        <div className="flex gap-2">
          <select className="form-input form-select w-auto" value={range} onChange={e => setRange(e.target.value)} aria-label="Time range">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
          <button type="button" className="btn btn-outline" onClick={downloadReport}>Download CSV report</button>
        </div>
      </div>

      {!hasDeliveries && (
        <div className="alert alert-info mb-4">No deliveries recorded in this period yet. KPIs fill in as drivers complete stops. <Link to="/route-planner">Plan a route →</Link></div>
      )}

      <div className="grid grid-4 mb-6" role="region" aria-label="Key performance indicators">
        <StatCard label="Deliveries completed" value={kpis.totalDeliveries} trend={trends.totalDeliveries} hint={`${kpis.failedDeliveries} failed`} />
        <StatCard label="On-time delivery rate" value={kpis.onTimeRate} suffix="%" trend={trends.onTimeRate} tone="success" />
        <StatCard label="Average delivery time" value={kpis.avgDeliveryTime === null ? null : Math.round(kpis.avgDeliveryTime)} suffix=" min" trend={trends.avgDeliveryTime} trendGoodWhen="down" hint="Route start → doorstep" />
        <StatCard label="Fuel cost per delivery" value={kpis.fuelCostPerDelivery === null ? null : formatINR(kpis.fuelCostPerDelivery)} trend={trends.fuelCostPerDelivery} trendGoodWhen="down" />
        <StatCard label="Route efficiency score" value={kpis.routeEfficiencyScore} suffix="%" trend={trends.routeEfficiencyScore} hint="Planned ÷ driven distance" />
        <StatCard label="Vehicle utilization" value={kpis.vehicleUtilization} suffix="%" trend={trends.vehicleUtilization} hint={kpis.capacityUtilization === null ? 'Share of active fleet used' : `Avg load ${kpis.capacityUtilization}% of capacity`} />
        <StatCard label="Delivery completion rate" value={kpis.completionRate} suffix="%" trend={trends.completionRate} hint="Of stops on dispatched routes" />
        <StatCard label="Saved by optimization" value={formatKm(kpis.optimizationSavingsKm)} hint={`${formatINR(kpis.optimizationSavingsCost)} fuel vs entered order · ${kpis.co2Kg} kg CO₂ total`} />
      </div>

      <div className="grid grid-2 gap-6 mb-6">
        <ChartCard title="Deliveries per day">
          <Bar data={{
            labels: data.deliveryTrend.labels.map(shortLabel),
            datasets: [
              { label: 'Delivered', data: data.deliveryTrend.data, backgroundColor: colors.success, borderRadius: 4, stack: 'd' },
              { label: 'Failed', data: data.deliveryTrend.failed, backgroundColor: colors.error, borderRadius: 4, stack: 'd' }
            ]
          }} options={{ ...baseOptions, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }} />
        </ChartCard>
        <ChartCard title="Fuel cost (₹) and CO₂ (kg)">
          <Line data={{
            labels: data.fuelTrend.labels.map(shortLabel),
            datasets: [
              { label: 'Fuel cost ₹', data: data.fuelTrend.data, borderColor: colors.warning, backgroundColor: 'rgba(245,158,11,0.12)', fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
              { label: 'CO₂ kg', data: data.fuelTrend.co2, borderColor: colors.muted, borderDash: [4, 4], tension: 0.3, pointRadius: 0, yAxisID: 'y1' }
            ]
          }} options={{ ...baseOptions, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, position: 'left' }, y1: { beginAtZero: true, position: 'right', grid: { display: false } } } }} />
        </ChartCard>
      </div>

      <div className="grid grid-2 gap-6 mb-6">
        <ChartCard title="Delivery status">
          <Doughnut data={{
            labels: ['Completed', 'In progress', 'Pending', 'Failed'],
            datasets: [{
              data: [data.statusDistribution.completed, data.statusDistribution.in_progress, data.statusDistribution.pending, data.statusDistribution.failed],
              backgroundColor: [colors.success, colors.blue, colors.warning, colors.error],
              borderWidth: 0
            }]
          }} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } }} />
        </ChartCard>
        <ChartCard title="Vehicle capacity utilization (avg load %)">
          {data.vehicleUtilization.length ? (
            <Bar data={{
              labels: data.vehicleUtilization.map(v => v.name),
              datasets: [{
                label: 'Avg load %',
                data: data.vehicleUtilization.map(v => v.utilization),
                backgroundColor: data.vehicleUtilization.map(v => (v.utilization > 70 ? colors.success : v.utilization > 30 ? colors.warning : colors.muted)),
                borderRadius: 4
              }]
            }} options={{ ...baseOptions, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: ctx => `${data.vehicleUtilization[ctx.dataIndex].routes} route(s)` } } }, scales: { x: { max: 100, ticks: { callback: v => `${v}%` } }, y: { grid: { display: false } } } }} />
          ) : <EmptyState title="No active vehicles" />}
        </ChartCard>
      </div>

      <div className="grid grid-2 gap-6">
        <div className="card">
          <div className="card-header"><h3 className="font-semibold">Driver performance</h3></div>
          {data.driverPerformance.length ? (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>#</th><th>Driver</th><th>Delivered</th><th>On-time</th><th>Completion</th><th>Avg time</th></tr></thead>
                <tbody>
                  {data.driverPerformance.map((d, i) => (
                    <tr key={d._id}>
                      <td className="font-bold">{i + 1}</td>
                      <td>{d.name}</td>
                      <td>{d.totalDeliveries}{d.failedDeliveries ? <span className="text-xs text-error"> / {d.failedDeliveries} failed</span> : null}</td>
                      <td>{d.onTimeRate === null ? '-' : `${d.onTimeRate}%`}</td>
                      <td>{d.completionRate === null ? '-' : `${d.completionRate}%`}</td>
                      <td>{d.avgDeliveryMinutes === null ? '-' : `${Math.round(d.avgDeliveryMinutes)} min`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No driver activity in this period" />}
        </div>

        <div className="card">
          <div className="card-header"><h3 className="font-semibold">Planned vs actual (completed routes)</h3></div>
          {data.plannedVsActual.length ? (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Route</th><th>Distance plan / GPS</th><th>Time plan / actual</th><th>Efficiency</th></tr></thead>
                <tbody>
                  {data.plannedVsActual.map(r => (
                    <tr key={r._id}>
                      <td><Link to={`/routes/${r._id}`}>{r.name}</Link></td>
                      <td>{formatKm(r.plannedDistance)} / {r.actualDistance === null ? '-' : formatKm(r.actualDistance)}</td>
                      <td>{formatDuration(r.plannedMinutes)} / {r.actualMinutes === null ? '-' : formatDuration(r.actualMinutes)}</td>
                      <td>{r.efficiency === null ? '-' : <span className={`badge ${r.efficiency >= 90 ? 'badge-success' : r.efficiency >= 75 ? 'badge-warning' : 'badge-error'}`}>{r.efficiency}%</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No completed routes in this period" />}
        </div>
      </div>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="font-semibold">{title}</h3></div>
      <div className="card-body chart-box">{children}</div>
    </div>
  )
}
