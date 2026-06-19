import { describe, it, expect } from 'vitest'
import { confidenceColor } from '../../src/renderer/src/types/game'

// Confidence-tier → Vuetify color mapping (spec 008 US4 / T044). Pure helper, so it's
// unit-tested here in the Node env rather than via a component mount (the project has no
// jsdom/@vue/test-utils setup — adding them would violate Constitution VII for this UI).
describe('confidenceColor', () => {
  it('escalates color with sample-size confidence', () => {
    expect(confidenceColor('Confirmed')).toBe('error') // red — strongest signal
    expect(confidenceColor('Likely')).toBe('warning') // orange
    expect(confidenceColor('Potential')).toBe('info') // blue — weakest signal
  })
})
