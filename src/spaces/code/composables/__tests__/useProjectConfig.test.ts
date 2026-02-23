import { describe, it, expect } from 'vitest'
import { detectPackageManager } from '../useProjectConfig'

describe('detectPackageManager', () => {
  it('detects bun', () => {
    expect(detectPackageManager({ packageManager: 'bun@1.0.0' })).toBe('bun')
  })

  it('detects yarn', () => {
    expect(detectPackageManager({ packageManager: 'yarn@4.0.0' })).toBe('yarn')
  })

  it('detects pnpm', () => {
    expect(detectPackageManager({ packageManager: 'pnpm@8.0.0' })).toBe('pnpm')
  })

  it('defaults to npm when packageManager starts with npm', () => {
    expect(detectPackageManager({ packageManager: 'npm@10.0.0' })).toBe('npm')
  })

  it('defaults to npm when no packageManager field', () => {
    expect(detectPackageManager({})).toBe('npm')
  })

  it('defaults to npm for unknown value', () => {
    expect(detectPackageManager({ packageManager: 'unknown@1.0' })).toBe('npm')
  })

  it('handles packageManager without version', () => {
    expect(detectPackageManager({ packageManager: 'bun' })).toBe('bun')
  })
})
