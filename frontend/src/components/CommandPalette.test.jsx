import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import api from '../utils/api'
import CommandPalette from './CommandPalette'

vi.mock('../utils/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isManager: true, logout: vi.fn() }) }))

afterEach(cleanup)

const pages = [
  { name: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { name: 'Analytics', href: '/analytics', icon: 'chart' }
]
const routes = [
  { _id: 'r1', name: 'Morning run', routeId: 'RT-91E27A', status: 'active', driver: { name: 'Pooja Kumari' } },
  { _id: 'r2', name: 'Doranda afternoon', routeId: 'RT-AA827C', status: 'planned', driver: null }
]

function Where() {
  return <p data-testid="where">{useLocation().pathname + useLocation().search}</p>
}

function renderPalette(onClose = vi.fn()) {
  vi.mocked(api.get).mockResolvedValue({ data: { routes } })
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <CommandPalette open onClose={onClose} pages={pages} />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>
  )
  return onClose
}

describe('command palette', () => {
  it('finds a route by ID or driver and opens it with Enter', async () => {
    const onClose = renderPalette()
    const input = screen.getByRole('combobox')
    await screen.findByText('Morning run')

    fireEvent.change(input, { target: { value: 'aa827' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option')).toHaveTextContent('Doranda afternoon')

    fireEvent.change(input, { target: { value: 'pooja' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByTestId('where')).toHaveTextContent('/routes/r1')
  })

  it('moves through results with the arrow keys and runs actions', async () => {
    renderPalette()
    const input = screen.getByRole('combobox')
    await screen.findByText('Morning run')
    fireEvent.change(input, { target: { value: 'dispatch' } })
    const first = screen.getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('where')).toHaveTextContent('/routes?dispatch=1')
  })

  it('says what to try when nothing matches', async () => {
    renderPalette()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz' } })
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument()
  })
})
