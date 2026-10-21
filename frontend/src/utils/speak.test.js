import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

function installSpeech(voices = [{ name: 'Rishi', lang: 'en-IN' }, { name: 'Amélie', lang: 'fr-FR' }]) {
  const synth = { speak: vi.fn(), cancel: vi.fn(), getVoices: vi.fn(() => voices), speaking: false }
  window.speechSynthesis = synth
  window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) { this.text = text }
  globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance
  return synth
}

async function freshModule() {
  vi.resetModules()
  return import('./speak')
}

describe('speak()', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    delete window.speechSynthesis
    delete window.SpeechSynthesisUtterance
    delete globalThis.SpeechSynthesisUtterance
  })

  it('cancels in-progress speech, then speaks in English at rate 1', async () => {
    const synth = installSpeech()
    const { speak } = await freshModule()
    expect(speak('Delivery completed')).toBe(true)
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(synth.cancel.mock.invocationCallOrder[0]).toBeLessThan(synth.speak.mock.invocationCallOrder[0])
    const utterance = synth.speak.mock.calls[0][0]
    expect(utterance.text).toBe('Delivery completed')
    expect(utterance.rate).toBe(1)
    expect(utterance.lang).toBe('en-IN')
    expect(utterance.voice.name).toBe('Rishi')
  })

  it('falls back to any English voice, and to lang only when there are no voices', async () => {
    let synth = installSpeech([{ name: 'Daniel', lang: 'en-GB' }, { name: 'Anna', lang: 'de-DE' }])
    let mod = await freshModule()
    mod.speak('Hello')
    expect(synth.speak.mock.calls[0][0].voice.name).toBe('Daniel')

    synth = installSpeech([])
    mod = await freshModule()
    mod.speak('Hello')
    expect(synth.speak.mock.calls[0][0].voice).toBeUndefined()
    expect(synth.speak.mock.calls[0][0].lang).toBe('en-IN')
  })

  it('is a silent no-op when the Web Speech API is unsupported', async () => {
    const { speak, isSpeechSupported } = await freshModule()
    expect(isSpeechSupported()).toBe(false)
    expect(() => speak('Hello')).not.toThrow()
    expect(speak('Hello')).toBe(false)
  })

  it('respects mute, persists it in localStorage and stops current speech', async () => {
    const synth = installSpeech()
    const { speak, setMuted, isMuted } = await freshModule()
    setMuted(true)
    expect(localStorage.getItem('hopr:voice-muted')).toBe('1')
    expect(synth.cancel).toHaveBeenCalled()
    expect(speak('Hello')).toBe(false)
    expect(synth.speak).not.toHaveBeenCalled()

    const reloaded = await freshModule()
    expect(reloaded.isMuted()).toBe(true)
    reloaded.setMuted(false)
    expect(isMuted()).toBe(true) // old module instance untouched; storage updated:
    expect(localStorage.getItem('hopr:voice-muted')).toBe('0')
    expect(reloaded.speak('Hello')).toBe(true)
  })

  it('never throws even if the engine does', async () => {
    const synth = installSpeech()
    synth.speak.mockImplementation(() => { throw new Error('engine busy') })
    const { speak } = await freshModule()
    expect(speak('Hello')).toBe(false)
  })
})
