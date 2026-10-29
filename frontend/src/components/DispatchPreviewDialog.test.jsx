import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import api from '../utils/api'
import DispatchPreviewDialog from './DispatchPreviewDialog'

vi.mock('../utils/api', () => ({ default: { post: vi.fn() }, errorMessage: () => '' }))

describe('auto-dispatch when nothing can be assigned', () => {
  afterEach(cleanup)

  it('gives the reason and a way to assign by hand instead of a dead end', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        assignments: [],
        unassignedRoutes: 1,
        availableDrivers: 1,
        unassigned: [{ route: { _id: 'r1', name: 'Evening run', routeId: 'RT-1' }, reason: 'Aditya has no vehicle' }]
      }
    })
    const onAssignByHand = vi.fn()
    render(<MemoryRouter><DispatchPreviewDialog onClose={() => {}} onApplied={() => {}} onAssignByHand={onAssignByHand} /></MemoryRouter>)

    expect(await screen.findByText('Nothing can be assigned right now')).toBeInTheDocument()
    expect(screen.getByText('Evening run (RT-1): Aditya has no vehicle')).toBeInTheDocument()
    expect(screen.getByText(/Give a driver a vehicle on the Drivers page/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Assign by hand' }))
    expect(onAssignByHand).toHaveBeenCalledOnce()
  })
})
