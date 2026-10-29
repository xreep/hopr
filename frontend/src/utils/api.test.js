import { describe, it, expect } from 'vitest'
import { errorMessage, UNREACHABLE } from './api'

const httpError = (status, data) => ({ isAxiosError: true, response: { status, data } })

describe('errorMessage', () => {
  it('uses the server’s own message, or its first validation error', () => {
    expect(errorMessage(httpError(401, { message: 'Email or password is incorrect' }), 'x')).toBe('Email or password is incorrect')
    expect(errorMessage(httpError(400, { errors: [{ msg: 'Enter a valid email' }] }), 'x')).toBe('Enter a valid email')
  })

  it('says the server can’t be reached instead of blaming the user', () => {
    // No answer at all: offline, a timeout, or a cross-origin failure
    expect(errorMessage({ isAxiosError: true, request: {} }, 'Email or password is incorrect')).toBe(UNREACHABLE)
    // The host’s gateway page while the API restarts
    for (const status of [502, 503, 504]) expect(errorMessage(httpError(status, '<html>Bad gateway</html>'), 'x')).toBe(UNREACHABLE)
  })

  it('falls back to the caller’s text for other answers without a message', () => {
    expect(errorMessage(httpError(500, {}), 'Could not save')).toBe('Could not save')
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong')
  })
})
