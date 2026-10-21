// Night Dispatch theme for Chart.js: ink text, hairline grids, dark tooltips,
// and a glow for datasets marked `glow: true` (the volt "route" line).
import { Chart as ChartJS } from 'chart.js'

export const CHART_COLORS = {
  volt: '#D4FF3F',
  sky: '#7AA2FF',
  coral: '#FF6B78',
  amber: '#F5B544',
  ink: '#A9B4C8',
  muted: '#2A3756',
  grid: 'rgba(169, 180, 200, 0.08)'
}

const glowPlugin = {
  id: 'ndGlow',
  beforeDatasetDraw(chart, args) {
    const ds = chart.data.datasets[args.index]
    if (!ds?.glow) return
    const { ctx } = chart
    ctx.save()
    ctx.shadowColor = 'rgba(212, 255, 63, 0.55)'
    ctx.shadowBlur = 12
  },
  afterDatasetDraw(chart, args) {
    if (chart.data.datasets[args.index]?.glow) chart.ctx.restore()
  }
}

let applied = false
export function applyChartTheme() {
  if (applied) return
  applied = true
  ChartJS.register(glowPlugin)
  const d = ChartJS.defaults
  d.color = '#8591A8'
  d.borderColor = CHART_COLORS.grid
  d.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif'
  d.font.size = 12
  d.plugins.legend.labels.color = '#A9B4C8'
  d.plugins.legend.labels.usePointStyle = true
  d.plugins.legend.labels.boxWidth = 8
  d.plugins.legend.labels.boxHeight = 8
  d.plugins.tooltip.backgroundColor = '#141E33'
  d.plugins.tooltip.borderColor = 'rgba(169, 180, 200, 0.18)'
  d.plugins.tooltip.borderWidth = 1
  d.plugins.tooltip.titleColor = '#F4F7FB'
  d.plugins.tooltip.bodyColor = '#A9B4C8'
  d.plugins.tooltip.padding = 10
  d.plugins.tooltip.cornerRadius = 10
  d.plugins.tooltip.titleFont = { family: '"Space Grotesk", sans-serif', weight: '600', size: 13 }
  d.animation.duration = 900
  d.animation.easing = 'easeOutCubic'
}
