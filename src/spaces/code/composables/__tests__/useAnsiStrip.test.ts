import { describe, it, expect } from 'vitest'
import { stripAnsi } from '../useAnsiStrip'

describe('stripAnsi', () => {
  it('returns empty string unchanged', () => {
    expect(stripAnsi('')).toBe('')
  })

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world')
  })

  it('strips basic color codes', () => {
    expect(stripAnsi('\x1B[31mred text\x1B[0m')).toBe('red text')
  })

  it('strips bold/underline SGR codes', () => {
    expect(stripAnsi('\x1B[1mbold\x1B[22m \x1B[4munderline\x1B[24m')).toBe('bold underline')
  })

  it('strips multi-param SGR codes', () => {
    // e.g. \x1B[1;32;40m — bold green on black
    expect(stripAnsi('\x1B[1;32;40mcolored\x1B[0m')).toBe('colored')
  })

  it('strips OSC title sequences (terminated by BEL)', () => {
    expect(stripAnsi('\x1B]0;Window Title\x07visible')).toBe('visible')
  })

  it('strips cursor movement sequences', () => {
    // CUU (cursor up), CUD (cursor down), CUF (cursor forward)
    expect(stripAnsi('\x1B[2Aup\x1B[3Bdown\x1B[5Cforward')).toBe('updownforward')
  })

  it('strips multiple codes in one string', () => {
    const input = '\x1B[36mcyan\x1B[0m \x1B[33myellow\x1B[0m \x1B[35mmagenta\x1B[0m'
    expect(stripAnsi(input)).toBe('cyan yellow magenta')
  })

  it('strips real npm-style output', () => {
    const input = '\x1B[1m\x1B[32m✓\x1B[39m\x1B[22m Compiled successfully in 1.2s'
    expect(stripAnsi(input)).toBe('✓ Compiled successfully in 1.2s')
  })

  it('strips real vite-style output with localhost URL', () => {
    const input = '  \x1B[32m➜\x1B[39m  \x1B[1mLocal\x1B[22m:   \x1B[36mhttp://localhost:5173/\x1B[39m'
    expect(stripAnsi(input)).toBe('  ➜  Local:   http://localhost:5173/')
  })

  it('handles string that is only escape codes', () => {
    expect(stripAnsi('\x1B[0m\x1B[39m\x1B[22m')).toBe('')
  })
})
