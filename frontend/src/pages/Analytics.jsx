import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Chart as ChartJS, ArcElement, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js'
import { Doughnut, Line, Bar } from 'react-chartjs-2'
import api, { errorMessage } from '../utils/api'
import { StatCard, PageSkeleton, EmptyState } from '../components/ui'
import Icon from '../components/icons'
import { applyChartTheme, CHART_COLORS as C } from '../components/chartTheme'
import { formatINR, formatKm, formatDuration } from '../utils/format'

ChartJS.register(ArcElement, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)
applyChartTheme()

const axes = {
  x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
  y: { beginAtZero: true, grid: { color: C.grid }, border: { display: false } }
}
const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { position: 'bottom', align: 'start' } },
  scales: axes
}

const shortLabel = key => (key.length === 7
  ? new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
  : new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }))

const RANGE_LABELS = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '1y': 'Last 12 months' }

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
      toast.error(errorMessage(err, 'Could not load analytics'))
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
      toast.success('Report downloaded')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not download the report'))
    }
  }

  if (loading && !data) return <PageSkeleton label="Loading analytics" />
  if (!data) return <div className="card"><EmptyState title="Analytics are unavailable right now" action={<button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>} /></div>

  const { kpis, trends } = data
  const hasDeliveries = kpis.totalDeliveries > 0 || kpis.failedDeliveries > 0
  const labels = data.deliveryTrend.labels.map(shortLabel)
  const statusTotal = Object.values(data.statusDistribution).reduce((a, b) => a + b, 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">How the fleet is performing, from recorded deliveries, compared with the period before.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="form-input form-select w-auto" value={range} onChange={e => setRange(e.target.value)} aria-label="Time range">
            {Object.entries(RANGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button type="button" className="btn btn-secondary" onClick={downloadReport}><Icon name="download" />Download report</button>
        </div>
      </div>

      {!hasDeliveries && (
        <div className="alert alert-info mb-4">Nothing delivered in this period yet. These numbers fill in as drivers complete stops. <Link to="/route-planner">Plan a route</Link></div>
      )}

      <div className="stats-strip mb-6" role="region" aria-label="Key performance indicators">
        <StatCard label="Deliveries completed" value={kpis.totalDeliveries} isKey trend={trends.totalDeliveries}
          hint={`${kpis.failedDeliveries} failed`} spark={data.deliveryTrend.data} sparkLabel="Deliveries per day" />
        <StatCard label="On-time delivery rate" value={kpis.onTimeRate} suffix="%" trend={trends.onTimeRate} trendUnit=" pts" hint="Inside the window, or ETA + 15 min" />
        <StatCard label="Average delivery time" value={kpis.avgDeliveryTime === null ? null : Math.round(kpis.avgDeliveryTime)} suffix="min"
          trend={trends.avgDeliveryTime} trendGoodWhen="down" trendUnit=" min" hint="From route start to the doorstep" />
        <StatCard label="Fuel cost per delivery" value={kpis.fuelCostPerDelivery} decimals={2} format={formatINR}
          trend={trends.fuelCostPerDelivery} trendGoodWhen="down" spark={data.fuelTrend.data} sparkLabel="Fuel cost per day" />
        <StatCard label="Route efficiency score" value={kpis.routeEfficiencyScore} suffix="%" trend={trends.routeEfficiencyScore} trendUnit=" pts" hint="Planned distance divided by distance driven" />
        <StatCard label="Vehicle utilization" value={kpis.vehicleUtilization} suffix="%" trend={trends.vehicleUtilization} trendUnit=" pts"
          hint={kpis.capacityUtilization === null ? 'Share of the active fleet used' : `Loads fill ${kpis.capacityUtilization}% of capacity on average`} />
        <StatCard label="Delivery completion rate" value={kpis.completionRate} suffix="%" trend={trends.completionRate} trendUnit=" pts" hint="Of stops on routes that went out" />
        <StatCard label="Saved by optimizing" value={kpis.optimizationSavingsKm} suffix="km"
          hint={`${formatINR(kpis.optimizationSavingsCost)} in fuel against the order entered, ${kpis.co2Kg} kg CO₂ emitted`} />
      </div>

      <div className="grid grid-2 gap-6 mb-6">
        <ChartCard title="Deliveries per day" caption={`${kpis.totalDeliveries} delivered, ${kpis.failedDeliveries} failed`}>
          <Bar data={{
            labels,
            datasets: [
              { label: 'Delivered', data: data.deliveryTrend.data, backgroundColor: C.volt, borderRadius: 2, stack: 'd', maxBarThickness: 22 },
              { label: 'Failed', data: data.deliveryTrend.failed, backgroundColor: C.coral, borderRadius: 2, stack: 'd', maxBarThickness: 22 }
            ]
          }} options={{ ...baseOptions, scales: { x: { ...axes.x, stacked: true }, y: { ...axes.y, stacked: true, ticks: { precision: 0 } } } }} />
        </ChartCard>
        <ChartCard title="Fuel spend and emissions" caption={`${formatINR(kpis.totalFuelCost)} planned fuel, ${formatKm(kpis.totalDistanceKm)} planned`}>
          <Line data={{
            labels: data.fuelTrend.labels.map(shortLabel),
            datasets: [
              {
                label: 'Fuel cost (₹)', data: data.fuelTrend.data, borderColor: C.volt, backgroundColor: C.volt,
                borderWidth: 2.25, tension: 0.35, pointRadius: data.fuelTrend.data.map(v => (v > 0 ? 3 : 0)), pointBackgroundColor: '#FFFFFF', pointBorderWidth: 1.5, yAxisID: 'y'
              },
              { label: 'CO₂ (kg)', data: data.fuelTrend.co2, borderColor: C.ink, borderDash: [4, 4], borderWidth: 1.5, tension: 0.35, pointRadius: 0, yAxisID: 'y1' }
            ]
          }} options={{
            ...baseOptions,
            scales: { x: axes.x, y: { ...axes.y, ticks: { callback: v => `₹${v}` } }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, border: { display: false } } }
          }} />
        </ChartCard>
      </div>

      <div className="grid grid-2 gap-6 mb-6">
        <ChartCard title="Where every stop stands" caption={`${statusTotal} stops in this period`}>
          {statusTotal ? (
            <Doughnut data={{
              labels: ['Delivered', 'On the way', 'Waiting', 'Failed'],
              datasets: [{
                data: [data.statusDistribution.completed, data.statusDistribution.in_progress, data.statusDistribution.pending, data.statusDistribution.failed],
                backgroundColor: [C.volt, C.sky, C.muted, C.coral],
                borderColor: '#FFFFFF',
                borderWidth: 3,
                hoverOffset: 6
              }]
            }} options={{ responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'right' } } }} />
          ) : <EmptyState title="No stops in this period" />}
        </ChartCard>
        <ChartCard title="How full each vehicle runs" caption="Average load as a share of capacity">
          {data.vehicleUtilization.length ? (
            <Bar data={{
              labels: data.vehicleUtilization.map(v => v.name),
              datasets: [{
                label: 'Average load',
                data: data.vehicleUtilization.map(v => v.utilization),
                backgroundColor: C.sky,
                borderRadius: 2,
                maxBarThickness: 18
              }]
            }} options={{
              ...baseOptions,
              indexAxis: 'y',
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x}% full on average`, afterLabel: ctx => `${data.vehicleUtilization[ctx.dataIndex].routes} route(s), ${data.vehicleUtilization[ctx.dataIndex].distanceKm} km` } } },
              scales: { x: { ...axes.y, max: 100, ticks: { callback: v => `${v}%` } }, y: { grid: { display: false }, border: { display: false } } }
            }} />
          ) : <EmptyState title="No active vehicles" />}
        </ChartCard>
      </div>

      <div className="grid grid-2 gap-6">
        <div className="card">
          <div className="card-header"><h3>Drivers</h3></div>
          {data.driverPerformance.length ? (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Driver</th><th>Delivered</th><th>On time</th><th>Completed</th><th>Avg time</th></tr></thead>
                <tbody>
                  {data.driverPerformance.map(d => (
                    <tr key={d._id}>
                      <td className="font-medium">{d.name}</td>
                      <td className="nd-tabular">{d.totalDeliveries}{d.failedDeliveries ? <span className="text-micro text-signal-coral"> {d.failedDeliveries} failed</span> : null}</td>
                      <td className="nd-tabular">{d.onTimeRate === null ? '—' : `${d.onTimeRate}%`}</td>
                      <td className="nd-tabular">{d.completionRate === null ? '—' : `${d.completionRate}%`}</td>
                      <td className="nd-tabular">{d.avgDeliveryMinutes === null ? '—' : `${Math.round(d.avgDeliveryMinutes)} min`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No driver activity in this period" />}
        </div>

        <div className="card">
          <div className="card-header"><h3>Planned against actual</h3></div>
          {data.plannedVsActual.length ? (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Route</th><th>Distance, plan and GPS</th><th>Time, plan and actual</th><th>Efficiency</th></tr></thead>
                <tbody>
                  {data.plannedVsActual.map(r => (
                    <tr key={r._id}>
                      <td><Link to={`/routes/${r._id}`}>{r.name}</Link></td>
                      <td className="nd-tabular">{formatKm(r.plannedDistance)} / {r.actualDistance === null ? '—' : formatKm(r.actualDistance)}</td>
                      <td className="nd-tabular">{formatDuration(r.plannedMinutes)} / {r.actualMinutes === null ? '—' : formatDuration(r.actualMinutes)}</td>
                      <td>{r.efficiency === null ? '—' : <span className={`badge ${r.efficiency >= 90 ? 'badge-done' : r.efficiency >= 75 ? 'badge-warning' : 'badge-error'}`}>{r.efficiency}%</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No routes finished in this period">Completed routes show their planned and driven distance here.</EmptyState>}
        </div>
      </div>
    </div>
  )
}

function ChartCard({ title, caption, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3>{title}</h3>
        {caption && <p className="text-micro text-ink-400 mt-0.5">{caption}</p>}
      </div>
      <div className="card-body chart-box">{children}</div>
    </div>
  )
}
