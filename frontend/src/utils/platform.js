// Apple keyboards use ⌘ where everyone else uses Ctrl
export const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
