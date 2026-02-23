import { describe, it, expect } from 'vitest'
import {
  availableLanguages,
  getLanguageForFile,
  getTechnologiesForFile,
  useLanguageDetection,
} from '../useLanguageDetection'

describe('getLanguageForFile', () => {
  it('returns typescript for .ts', () => {
    expect(getLanguageForFile('src/index.ts')).toBe('typescript')
  })

  it('returns typescriptreact for .tsx', () => {
    expect(getLanguageForFile('App.tsx')).toBe('typescriptreact')
  })

  it('returns javascript for .js', () => {
    expect(getLanguageForFile('app.js')).toBe('javascript')
  })

  it('returns vue for .vue', () => {
    expect(getLanguageForFile('Component.vue')).toBe('vue')
  })

  it('returns python for .py', () => {
    expect(getLanguageForFile('main.py')).toBe('python')
  })

  it('returns go for .go', () => {
    expect(getLanguageForFile('main.go')).toBe('go')
  })

  it('returns rust for .rs', () => {
    expect(getLanguageForFile('lib.rs')).toBe('rust')
  })

  it('returns the extension itself for unknown types', () => {
    expect(getLanguageForFile('file.zig')).toBe('zig')
  })

  it('returns plaintext for empty path', () => {
    expect(getLanguageForFile('')).toBe('plaintext')
  })

  it('returns shellscript for .sh', () => {
    expect(getLanguageForFile('deploy.sh')).toBe('shellscript')
  })

  it('returns yaml for .yml', () => {
    expect(getLanguageForFile('config.yml')).toBe('yaml')
  })
})

describe('getTechnologiesForFile', () => {
  it('returns vue and vue3 for .vue files', () => {
    const techs = getTechnologiesForFile('Component.vue', '/some/project')
    expect(techs).toContain('vue')
    expect(techs).toContain('vue3')
  })

  it('returns react for .tsx files', () => {
    const techs = getTechnologiesForFile('App.tsx', '/some/project')
    expect(techs).toContain('react')
  })

  it('returns react for .jsx files', () => {
    const techs = getTechnologiesForFile('App.jsx', '/some/project')
    expect(techs).toContain('react')
  })

  it('detects nuxt from path', () => {
    const techs = getTechnologiesForFile('nuxt.config.ts', '/some/project')
    expect(techs).toContain('nuxt')
  })

  it('detects tailwindcss from path', () => {
    const techs = getTechnologiesForFile('tailwind.config.js', '/some/project')
    expect(techs).toContain('tailwindcss')
  })

  it('adds construct project technologies', () => {
    const techs = getTechnologiesForFile('app.vue', '/home/user/construct')
    expect(techs).toContain('vue3')
    expect(techs).toContain('nuxt')
    expect(techs).toContain('tailwindcss')
    expect(techs).toContain('typescript')
  })

  it('deduplicates technologies', () => {
    // .vue in a construct project would add vue3 twice without dedup
    const techs = getTechnologiesForFile('Component.vue', '/home/user/construct')
    const vue3Count = techs.filter(t => t === 'vue3').length
    expect(vue3Count).toBe(1)
  })

  it('returns empty array for plain files outside construct', () => {
    const techs = getTechnologiesForFile('readme.md', '/some/other/project')
    expect(techs).toEqual([])
  })
})

describe('availableLanguages', () => {
  it('is an array', () => {
    expect(Array.isArray(availableLanguages)).toBe(true)
  })

  it('has required entries', () => {
    const values = availableLanguages.map(l => l.value)
    expect(values).toContain('typescript')
    expect(values).toContain('javascript')
    expect(values).toContain('vue')
    expect(values).toContain('python')
    expect(values).toContain('go')
    expect(values).toContain('rust')
    expect(values).toContain('html')
    expect(values).toContain('css')
  })

  it('each entry has value and label', () => {
    for (const lang of availableLanguages) {
      expect(lang.value).toBeTruthy()
      expect(lang.label).toBeTruthy()
    }
  })
})

describe('useLanguageDetection composable', () => {
  function createState() {
    return {
      currentFile: 'index.ts',
      currentLanguage: 'typescript',
      rootPath: '/project',
    }
  }

  it('filteredLanguages returns all when search is empty', () => {
    const state = createState()
    const { filteredLanguages } = useLanguageDetection(state)
    expect(filteredLanguages.value.length).toBe(availableLanguages.length)
  })

  it('filteredLanguages filters by label', () => {
    const state = createState()
    const { filteredLanguages, languageSearch } = useLanguageDetection(state)
    languageSearch.value = 'Python'
    expect(filteredLanguages.value.some(l => l.value === 'python')).toBe(true)
    expect(filteredLanguages.value.length).toBeLessThan(availableLanguages.length)
  })

  it('filteredLanguages filters by value', () => {
    const state = createState()
    const { filteredLanguages, languageSearch } = useLanguageDetection(state)
    languageSearch.value = 'typescript'
    expect(filteredLanguages.value.some(l => l.value === 'typescript')).toBe(true)
  })

  it('currentLanguageLabel maps value to label', () => {
    const state = createState()
    state.currentLanguage = 'python'
    const { currentLanguageLabel } = useLanguageDetection(state)
    expect(currentLanguageLabel.value).toBe('Python')
  })

  it('currentLanguageLabel falls back to value for unknown', () => {
    const state = createState()
    state.currentLanguage = 'some-unknown-lang'
    const { currentLanguageLabel } = useLanguageDetection(state)
    expect(currentLanguageLabel.value).toBe('some-unknown-lang')
  })

  it('setLanguage updates state and closes selector', () => {
    const state = createState()
    const { setLanguage, showLanguageSelector, languageSearch } = useLanguageDetection(state)
    showLanguageSelector.value = true
    languageSearch.value = 'py'
    setLanguage('python')
    expect(state.currentLanguage).toBe('python')
    expect(showLanguageSelector.value).toBe(false)
    expect(languageSearch.value).toBe('')
  })
})
