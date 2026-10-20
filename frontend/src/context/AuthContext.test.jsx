import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import api from '../utils/api'
import { AuthProvider } from './AuthContext'
import App from '../App'

vi.mock('../utils/api', () => ({ default: { get: vi.fn(), post: vi.fn() }, errorMessage: () => '' }))

const failWith = (status, headers = {}) => Object.assign(new Error(`status ${status}`), { response: status ? { status, headers } : undefined })

function renderApp(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>
  )
}

describe('session check', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    localStorage.clear()
    localStorage.setItem('token', 'stored-token')
  })

  it('keeps a signed-in user on the page when /auth/me is rate limited (429)', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(failWith(429, { 'retry-after': '12' }))
    renderApp()
    expect(await screen.findByText('Too many requests for a moment')).toBeInTheDocument()
    expect(screen.getByText(/still signed in.*12 seconds/)).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBe('stored-token')
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('treats a network failure the same way', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(failWith(undefined))
    renderApp()
    expect(await screen.findByText(/reach Hopr right now/)).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBe('stored-token')
  })

  it('still ends the session on 401', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(failWith(401))
    renderApp()
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull())
    expect(screen.queryByText(/still signed in/)).not.toBeInTheDocument()
  })
})
