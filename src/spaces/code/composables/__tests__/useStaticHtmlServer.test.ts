import { describe, it, expect } from 'vitest'
import { buildStaticHtmlServeCommand, buildStaticHtmlServeScript } from '../useStaticHtmlServer'

describe('buildStaticHtmlServeCommand', () => {
  it('returns [sh, -c, script]', () => {
    const cmd = buildStaticHtmlServeCommand()
    expect(cmd[0]).toBe('sh')
    expect(cmd[1]).toBe('-c')
    expect(typeof cmd[2]).toBe('string')
    expect(cmd).toHaveLength(3)
  })

  it('accepts custom port candidates', () => {
    const cmd = buildStaticHtmlServeCommand([9000, 9001])
    expect(cmd[2]).toContain('9000')
    expect(cmd[2]).toContain('9001')
  })
})

describe('buildStaticHtmlServeScript', () => {
  it('contains python3 fallback', () => {
    const script = buildStaticHtmlServeScript()
    expect(script).toContain('python3')
    expect(script).toContain('http.server')
  })

  it('contains python fallback', () => {
    const script = buildStaticHtmlServeScript()
    expect(script).toContain('command -v python ')
  })

  it('contains php fallback', () => {
    const script = buildStaticHtmlServeScript()
    expect(script).toContain('php -S')
  })

  it('contains bun fallback', () => {
    const script = buildStaticHtmlServeScript()
    expect(script).toContain('command -v bun ')
  })

  it('contains npx fallback', () => {
    const script = buildStaticHtmlServeScript()
    expect(script).toContain('npx --yes serve')
  })

  it('uses default port candidates', () => {
    const script = buildStaticHtmlServeScript()
    expect(script).toContain('3000')
    expect(script).toContain('5173')
    expect(script).toContain('8080')
  })

  it('uses custom port candidates', () => {
    const script = buildStaticHtmlServeScript([7777, 8888])
    expect(script).toContain('7777')
    expect(script).toContain('8888')
    expect(script).not.toContain('5173')
  })

  it('binds to 127.0.0.1', () => {
    const script = buildStaticHtmlServeScript()
    expect(script).toContain('127.0.0.1')
  })

  it('prints error and exits when no runtime found', () => {
    const script = buildStaticHtmlServeScript()
    expect(script).toContain('No static server runtime found')
    expect(script).toContain('exit 1')
  })
})
