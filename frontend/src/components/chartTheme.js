// Chart.js theme for the light road-signage design: ink text, light grid lines,
// white tooltips. Colour roles match the rest of the app.
import { Chart as ChartJS } from 'chart.js'

export const CHART_COLORS = {
  volt: '#0B6B3A', // route green: the main series
  sky: '#1F4E9C', // city blue
  coral: '#C8102E', // failures
  amber: '#F2B705', // warnings
  ink: '#5E6873', // secondary series
  muted: '#D5DADE', // empty / remainder
  grid: '#E6E9EC'
}

let applied = false
export function applyChartTheme() {
  if (applied) return
  applied = true
  const d = ChartJS.defaults
  d.color = '#5E6873'
  d.borderColor = CHART_COLORS.grid
  d.font.family = 'Overpass, ui-sans-serif, system-ui, sans-serif'
  d.font.size = 12
  d.plugins.legend.labels.color = '#47515B'
  d.plugins.legend.labels.usePointStyle = true
  d.plugins.legend.labels.pointStyle = 'rect'
  d.plugins.legend.labels.boxWidth = 8
  d.plugins.legend.labels.boxHeight = 8
  d.plugins.tooltip.backgroundColor = '#FFFFFF'
  d.plugins.tooltip.borderColor = '#C3C9CE'
  d.plugins.tooltip.borderWidth = 1
  d.plugins.tooltip.titleColor = '#15191D'
  d.plugins.tooltip.bodyColor = '#47515B'
  d.plugins.tooltip.padding = 10
  d.plugins.tooltip.cornerRadius = 6
  d.plugins.tooltip.titleFont = { family: 'Overpass, sans-serif', weight: '700', size: 13 }
  d.animation.duration = 300
}
