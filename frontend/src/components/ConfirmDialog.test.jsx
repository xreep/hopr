import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { ConfirmProvider, useConfirm } from './ConfirmDialog'
import ErrorBoundary from './ErrorBoundary'

afterEach(cleanup)

function Asker({ onAnswer }) {
  const confirm = useConfirm()
  return (
    <button type="button" onClick={async () => onAnswer(await confirm({ title: 'Delete route?', message: 'This cannot be undone.', confirmLabel: 'Delete route', tone: 'danger' }))}>
      Ask
    </button>
  )
}

describe('confirm dialog', () => {
  it('resolves true on confirm and false on cancel or Escape, focusing Cancel first', async () => {
    const onAnswer = vi.fn()
    render(<ConfirmProvider><Asker onAnswer={onAnswer} /></ConfirmProvider>)

    fireEvent.click(screen.getByText('Ask'))
    expect(screen.getByRole('dialog', { name: 'Delete route?' })).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    expect(document.activeElement).toHaveTextContent('Cancel')
    await act(async () => fireEvent.click(screen.getByText('Delete route')))
    expect(onAnswer).toHaveBeenLastCalledWith(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Ask'))
    await act(async () => fireEvent.click(screen.getByText('Cancel')))
    expect(onAnswer).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByText('Ask'))
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }))
    expect(onAnswer).toHaveBeenLastCalledWith(false)
    expect(onAnswer).toHaveBeenCalledTimes(3)
  })
})

describe('error boundary', () => {
  function Boom({ explode }) {
    if (explode) throw new Error('render failed')
    return <p>Page content</p>
  }

  it('shows a recovery screen instead of a blank page, and clears on navigation', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // jsdom reports errors React already handled; keep the deliberate one out of the output
    const quiet = e => e.preventDefault()
    window.addEventListener('error', quiet)
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom explode /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('This page stopped working')
    expect(screen.getByText('Reload page')).toBeInTheDocument()

    rerender(<ErrorBoundary resetKey="/b"><Boom explode={false} /></ErrorBoundary>)
    expect(screen.getByText('Page content')).toBeInTheDocument()
    window.removeEventListener('error', quiet)
    spy.mockRestore()
  })
})
