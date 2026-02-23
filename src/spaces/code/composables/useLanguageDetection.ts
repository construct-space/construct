/**
 * Language detection composable — language selector, language for current file,
 * technology detection for AI completion.
 */

interface CodeEditorState {
  currentFile: string
  currentLanguage: string
  rootPath: string
}

export const availableLanguages = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'abap', label: 'ABAP' },
  { value: 'apex', label: 'Apex' },
  { value: 'azcli', label: 'Azure CLI' },
  { value: 'bat', label: 'Batch' },
  { value: 'bicep', label: 'Bicep' },
  { value: 'c', label: 'C' },
  { value: 'clojure', label: 'Clojure' },
  { value: 'coffeescript', label: 'CoffeeScript' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'cypher', label: 'Cypher' },
  { value: 'dart', label: 'Dart' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'elixir', label: 'Elixir' },
  { value: 'fsharp', label: 'F#' },
  { value: 'go', label: 'Go' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'handlebars', label: 'Handlebars' },
  { value: 'hcl', label: 'HCL / Terraform' },
  { value: 'html', label: 'HTML' },
  { value: 'ini', label: 'INI / Properties' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'julia', label: 'Julia' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'less', label: 'Less' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'lua', label: 'Lua' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'mdx', label: 'MDX' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'objective-c', label: 'Objective-C' },
  { value: 'pascal', label: 'Pascal' },
  { value: 'perl', label: 'Perl' },
  { value: 'pgsql', label: 'PostgreSQL' },
  { value: 'php', label: 'PHP' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'protobuf', label: 'Protocol Buffers' },
  { value: 'pug', label: 'Pug' },
  { value: 'python', label: 'Python' },
  { value: 'r', label: 'R' },
  { value: 'razor', label: 'Razor' },
  { value: 'restructuredtext', label: 'reStructuredText' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'rust', label: 'Rust' },
  { value: 'scala', label: 'Scala' },
  { value: 'scheme', label: 'Scheme' },
  { value: 'scss', label: 'SCSS' },
  { value: 'shell', label: 'Shell / Bash' },
  { value: 'sol', label: 'Solidity' },
  { value: 'sparql', label: 'SPARQL' },
  { value: 'sql', label: 'SQL' },
  { value: 'swift', label: 'Swift' },
  { value: 'systemverilog', label: 'SystemVerilog' },
  { value: 'tcl', label: 'Tcl' },
  { value: 'twig', label: 'Twig' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'vb', label: 'Visual Basic' },
  { value: 'vue', label: 'Vue' },
  { value: 'wgsl', label: 'WGSL' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
] as const

const langMap: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
  vue: 'vue', py: 'python', go: 'go', rs: 'rust', java: 'java', c: 'c', cpp: 'cpp',
  h: 'c', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift',
  kt: 'kotlin', scala: 'scala', sql: 'sql', html: 'html', css: 'css', scss: 'scss',
  less: 'less', json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown', xml: 'xml',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript',
}

export function getLanguageForFile(filePath: string): string {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return langMap[ext] || ext || 'plaintext'
}

export function getTechnologiesForFile(filePath: string, rootPath: string): string[] {
  const techs: string[] = []
  const file = filePath.toLowerCase()

  if (file.includes('.vue')) techs.push('vue', 'vue3')
  if (file.includes('.tsx') || file.includes('.jsx')) techs.push('react')
  if (file.includes('nuxt')) techs.push('nuxt')
  if (file.includes('tailwind')) techs.push('tailwindcss')
  if (rootPath?.includes('construct')) {
    techs.push('vue3', 'nuxt', 'tailwindcss', 'typescript')
  }

  return [...new Set(techs)]
}

export function useLanguageDetection(state: CodeEditorState) {
  const showLanguageSelector = ref(false)
  const languageSearch = ref('')

  const filteredLanguages = computed(() => {
    if (!languageSearch.value) return availableLanguages
    const search = languageSearch.value.toLowerCase()
    return availableLanguages.filter(lang =>
      lang.label.toLowerCase().includes(search) ||
      lang.value.toLowerCase().includes(search)
    )
  })

  const currentLanguageLabel = computed(() => {
    const lang = availableLanguages.find(l => l.value === state.currentLanguage)
    return lang?.label || state.currentLanguage
  })

  const setLanguage = (langValue: string) => {
    state.currentLanguage = langValue
    showLanguageSelector.value = false
    languageSearch.value = ''
  }

  const getLanguageForCurrentFile = (): string => {
    return getLanguageForFile(state.currentFile)
  }

  const getTechnologiesForCurrentFile = (): string[] => {
    return getTechnologiesForFile(state.currentFile, state.rootPath)
  }

  return {
    availableLanguages,
    filteredLanguages,
    languageSearch,
    currentLanguageLabel,
    showLanguageSelector,
    setLanguage,
    getLanguageForCurrentFile,
    getTechnologiesForCurrentFile,
  }
}
