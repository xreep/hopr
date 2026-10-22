import { describe, it, expect } from 'vitest'
import { STRINGS, translate, translateKnown } from './strings'

const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('driver and tracking strings', () => {
  it('has a Hindi version of every English string, with the same placeholders', () => {
    const en = Object.keys(STRINGS.en)
    expect(Object.keys(STRINGS.hi).sort()).toEqual([...en].sort())
    for (const key of en) {
      expect(STRINGS.hi[key].trim(), key).not.toBe('')
      expect(placeholders(STRINGS.hi[key]), key).toEqual(placeholders(STRINGS.en[key]))
    }
  })

  it('fills placeholders and falls back to English, then to the key', () => {
    expect(translate('hi', 'driver.stopOf', { n: 2, total: 5 })).toBe('स्टॉप 2 / 5')
    expect(translate('en', 'driver.stopOf', { n: 2, total: 5 })).toBe('Stop 2 of 5')
    expect(translate('fr', 'driver.title')).toBe('My deliveries')
    expect(translate('hi', 'no.such.key')).toBe('no.such.key')
  })

  it('translates the fixed English values the server stores, and leaves free text alone', () => {
    expect(translateKnown('hi', 'fail', 'Address not found')).toBe('पता नहीं मिला')
    expect(translateKnown('hi', 'vehicle', 'Electric Van')).toBe('इलेक्ट्रिक वैन')
    expect(translateKnown('hi', 'fail', 'Dog in the yard')).toBe('Dog in the yard')
  })
})
