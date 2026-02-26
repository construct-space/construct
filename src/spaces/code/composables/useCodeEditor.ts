/**
 * Shared state for the Code Editor panels
 * Allows FileExplorer and Editor to communicate
 */

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

interface CodeEditorState {
  rootPath: string
  currentFile: string
  fileContent: string
  originalContent: string
  isDirty: boolean
  isLoading: boolean
  currentLanguage: string
  fileTree: FileEntry[]
  expandedFolders: Set<string>
  selectedFile: string | null
}

interface LoadDirectoryOptions {
  preserveExpanded?: boolean
}

const state = reactive<CodeEditorState>({
  rootPath: '',
  currentFile: '',
  fileContent: '',
  originalContent: '',
  isDirty: false,
  isLoading: false,
  currentLanguage: 'typescript',
  fileTree: [],
  expandedFolders: new Set(),
  selectedFile: null,
})

// Module-level selection state (shared — updated by Code.vue, read by AssistantFloat)
const selection = ref<{ text: string; startLine: number; endLine: number } | null>(null)

// Module-level Tauri APIs (shared across all useCodeEditor calls)
let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null
let tauriDialog: typeof import('@tauri-apps/plugin-dialog') | null = null

const normalizePath = (path: string): string => path.replace(/\/+/g, '/').replace(/\/$/, '')

// Get language from file extension - uses Monaco's built-in language IDs
// See: https://microsoft.github.io/monaco-editor/
const getLanguage = (fileName: string): string => {
  // Handle special filenames first
  const name = fileName.split('/').pop()?.toLowerCase() || ''
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile'
  if (name === '.env' || name.startsWith('.env.')) return 'ini'
  if (name === 'makefile' || name === 'gnumakefile') return 'shell'
  if (name === 'gemfile' || name === 'rakefile') return 'ruby'
  if (name === 'podfile') return 'ruby'
  if (name === 'cmakelists.txt') return 'plaintext'
  if (name === 'vagrantfile') return 'ruby'

  const ext = fileName.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    // TypeScript/JavaScript (Monaco built-in)
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    mts: 'typescript',
    cts: 'typescript',

    // Web (Monaco built-in)
    html: 'html',
    htm: 'html',
    xhtml: 'html',
    xml: 'xml',
    xsd: 'xml',
    xsl: 'xml',
    xslt: 'xml',
    svg: 'xml',
    rss: 'xml',
    atom: 'xml',
    plist: 'xml',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',

    // Data formats (Monaco built-in)
    json: 'json',
    jsonc: 'json',
    json5: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    ini: 'ini',
    cfg: 'ini',
    conf: 'ini',
    properties: 'ini',
    editorconfig: 'ini',

    // Markdown (Monaco built-in)
    md: 'markdown',
    mdx: 'mdx',
    markdown: 'markdown',
    rst: 'restructuredtext',

    // Python (Monaco built-in)
    py: 'python',
    pyw: 'python',
    pyi: 'python',
    pyx: 'python',
    pxd: 'python',
    gyp: 'python',
    gypi: 'python',

    // Go (Monaco built-in)
    go: 'go',
    mod: 'go',

    // Rust (Monaco built-in)
    rs: 'rust',

    // Ruby (Monaco built-in)
    rb: 'ruby',
    erb: 'ruby',
    rake: 'ruby',
    gemspec: 'ruby',

    // PHP (Monaco built-in)
    php: 'php',
    phtml: 'php',
    php3: 'php',
    php4: 'php',
    php5: 'php',
    phps: 'php',

    // Java (Monaco built-in)
    java: 'java',
    jsp: 'java',

    // Kotlin (Monaco built-in)
    kt: 'kotlin',
    kts: 'kotlin',

    // Swift (Monaco built-in)
    swift: 'swift',

    // Scala (Monaco built-in)
    scala: 'scala',
    sc: 'scala',
    sbt: 'scala',

    // Clojure (Monaco built-in)
    clj: 'clojure',
    cljs: 'clojure',
    cljc: 'clojure',
    edn: 'clojure',

    // Elixir (Monaco built-in)
    ex: 'elixir',
    exs: 'elixir',

    // Lua (Monaco built-in)
    lua: 'lua',

    // R (Monaco built-in)
    r: 'r',
    rmd: 'r',

    // Julia (Monaco built-in)
    jl: 'julia',

    // F# (Monaco built-in)
    fs: 'fsharp',
    fsi: 'fsharp',
    fsx: 'fsharp',
    fsscript: 'fsharp',

    // C# (Monaco built-in)
    cs: 'csharp',
    csx: 'csharp',

    // VB (Monaco built-in)
    vb: 'vb',
    vbs: 'vb',

    // Dart (Monaco built-in)
    dart: 'dart',

    // Perl (Monaco built-in)
    pl: 'perl',
    pm: 'perl',
    pod: 'perl',
    t: 'perl',

    // C/C++ (Monaco built-in)
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    hxx: 'cpp',
    hh: 'cpp',
    ino: 'cpp',

    // Objective-C (Monaco built-in)
    m: 'objective-c',
    mm: 'objective-c',

    // Shell (Monaco built-in)
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    ksh: 'shell',
    csh: 'shell',
    tcsh: 'shell',

    // PowerShell (Monaco built-in)
    ps1: 'powershell',
    psm1: 'powershell',
    psd1: 'powershell',

    // Batch (Monaco built-in)
    bat: 'bat',
    cmd: 'bat',

    // SQL variants (Monaco built-in)
    sql: 'sql',
    mysql: 'mysql',
    pgsql: 'pgsql',

    // GraphQL (Monaco built-in)
    graphql: 'graphql',
    gql: 'graphql',

    // HCL/Terraform (Monaco built-in)
    tf: 'hcl',
    tfvars: 'hcl',
    hcl: 'hcl',

    // Handlebars (Monaco built-in)
    hbs: 'handlebars',
    handlebars: 'handlebars',

    // Pug (Monaco built-in)
    pug: 'pug',
    jade: 'pug',

    // Twig (Monaco built-in)
    twig: 'twig',

    // CoffeeScript (Monaco built-in)
    coffee: 'coffeescript',
    cson: 'coffeescript',

    // Solidity (Monaco built-in)
    sol: 'sol',

    // Protocol Buffers (Monaco built-in)
    proto: 'protobuf',

    // Pascal (Monaco built-in)
    pas: 'pascal',
    pp: 'pascal',
    inc: 'pascal',

    // Scheme (Monaco built-in)
    scm: 'scheme',
    ss: 'scheme',
    sch: 'scheme',
    rkt: 'scheme',

    // TCL (Monaco built-in)
    tcl: 'tcl',

    // ABAP (Monaco built-in)
    abap: 'abap',

    // Apex (Monaco built-in)
    apex: 'apex',
    cls: 'apex',
    trigger: 'apex',

    // Azure CLI (Monaco built-in)
    azcli: 'azcli',

    // Bicep (Monaco built-in)
    bicep: 'bicep',

    // Cypher (Monaco built-in)
    cypher: 'cypher',

    // Liquid (Monaco built-in)
    liquid: 'liquid',

    // Razor (Monaco built-in)
    cshtml: 'razor',
    razor: 'razor',

    // SPARQL (Monaco built-in)
    sparql: 'sparql',
    rq: 'sparql',

    // SystemVerilog (Monaco built-in)
    sv: 'systemverilog',
    svh: 'systemverilog',
    v: 'systemverilog',
    vh: 'systemverilog',

    // WGSL (Monaco built-in)
    wgsl: 'wgsl',

    // TypeSpec (Monaco built-in)
    tsp: 'typespec',

    // Custom/Vue (registered in Code.vue)
    vue: 'vue',
    svelte: 'html',
    astro: 'html',

    // Fallback to similar languages
    toml: 'ini',
    lock: 'json',
    log: 'plaintext',
    txt: 'plaintext',

    // Construct Design Files (JSON-based)
    ui: 'json',
    ux: 'json',
  }
  return langMap[ext || ''] || 'plaintext'
}

export const useCodeEditor = () => {
  const initTauri = async () => {
    try {
      tauriFs = await import('@tauri-apps/plugin-fs')
      tauriDialog = await import('@tauri-apps/plugin-dialog')
    } catch (err) {
      console.warn('Tauri APIs not available:', err)
    }
  }

  // Open folder dialog
  const openFolder = async () => {
    if (!tauriDialog || !tauriFs) {
      await initTauri()
    }
    if (!tauriDialog) return

    try {
      const selected = await tauriDialog.open({
        directory: true,
        multiple: false,
        title: 'Open Folder'
      })

      if (selected && typeof selected === 'string') {
        state.rootPath = selected
        await loadDirectory(selected)
      }
    } catch (err) {
      console.error('Failed to open folder:', err)
    }
  }

  // Load directory contents
  const loadDirectory = async (path: string, options: LoadDirectoryOptions = {}) => {
    if (!tauriFs) {
      await initTauri()
    }
    if (!tauriFs) return

    const samePath = normalizePath(state.rootPath) === normalizePath(path)
    const preserveExpanded = options.preserveExpanded ?? samePath
    const previouslyExpanded = preserveExpanded ? new Set(state.expandedFolders) : new Set<string>()

    state.isLoading = true
    state.rootPath = path  // Set the root path so FileExplorer knows a folder is open
    try {
      const entries = await tauriFs.readDir(path)
      const tree: FileEntry[] = []

      for (const entry of entries) {
        // Skip hidden files and common ignore patterns
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') {
          continue
        }

        tree.push({
          name: entry.name,
          path: `${path}/${entry.name}`,
          isDirectory: entry.isDirectory,
          children: entry.isDirectory ? [] : undefined
        })
      }

      // Sort: folders first, then files, alphabetically
      tree.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      state.fileTree = tree
      state.expandedFolders.clear()

      if (preserveExpanded && previouslyExpanded.size > 0) {
        const restoreExpanded = async (entries: FileEntry[]) => {
          for (const entry of entries) {
            if (!entry.isDirectory || !previouslyExpanded.has(entry.path)) {
              continue
            }

            state.expandedFolders.add(entry.path)
            entry.children = await loadSubdirectory(entry)
            if (entry.children.length > 0) {
              await restoreExpanded(entry.children)
            }
          }
        }

        await restoreExpanded(state.fileTree)
      }
    } catch (err) {
      const errMsg = String(err)
      console.error('Failed to load directory:', err)

      // If forbidden path (scope issue), prompt user to re-select the folder
      if (errMsg.includes('forbidden path') || errMsg.includes('not allowed on the scope')) {
        console.warn('[FileExplorer] Path outside Tauri scope, prompting user to grant access')
        try {
          if (!tauriDialog) await initTauri()
          if (tauriDialog) {
            const selected = await tauriDialog.open({
              directory: true,
              multiple: false,
              title: 'Grant Access to Project Folder',
              defaultPath: path,
            })
            if (selected && typeof selected === 'string') {
              // Dialog auto-grants scope access — retry with the selected path
              state.rootPath = selected
              await loadDirectory(selected)
              return
            }
          }
        } catch (dialogErr) {
          console.error('Failed to open folder dialog:', dialogErr)
        }
      }

      state.rootPath = ''  // Reset on error
    } finally {
      state.isLoading = false
    }
  }

  // Load subdirectory contents
  const loadSubdirectory = async (entry: FileEntry): Promise<FileEntry[]> => {
    if (!tauriFs) {
      await initTauri()
    }
    if (!tauriFs) return []

    try {
      const entries = await tauriFs.readDir(entry.path)
      const children: FileEntry[] = []

      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') {
          continue
        }

        children.push({
          name: e.name,
          path: `${entry.path}/${e.name}`,
          isDirectory: e.isDirectory,
          children: e.isDirectory ? [] : undefined
        })
      }

      children.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      return children
    } catch (err) {
      console.error('Failed to load subdirectory:', err)
      return []
    }
  }

  const findDirectoryEntryByPath = (entries: FileEntry[], targetPath: string): FileEntry | null => {
    const normalizedTarget = normalizePath(targetPath)

    for (const entry of entries) {
      if (entry.isDirectory && normalizePath(entry.path) === normalizedTarget) {
        return entry
      }
      if (entry.children && entry.children.length > 0) {
        const match = findDirectoryEntryByPath(entry.children, targetPath)
        if (match) return match
      }
    }

    return null
  }

  const refreshDirectoryInTree = async (directoryPath: string) => {
    if (!state.rootPath) return

    if (normalizePath(directoryPath) === normalizePath(state.rootPath)) {
      await loadDirectory(state.rootPath, { preserveExpanded: true })
      return
    }

    const directoryEntry = findDirectoryEntryByPath(state.fileTree, directoryPath)
    if (directoryEntry) {
      directoryEntry.children = await loadSubdirectory(directoryEntry)
      return
    }

    // Fallback if folder isn't currently loaded in the in-memory tree.
    await loadDirectory(state.rootPath, { preserveExpanded: true })
  }

  // Toggle folder expansion
  const toggleFolder = async (entry: FileEntry) => {
    const path = entry.path

    if (state.expandedFolders.has(path)) {
      state.expandedFolders.delete(path)
    } else {
      state.expandedFolders.add(path)
      // Load children if not loaded
      if (entry.children && entry.children.length === 0) {
        entry.children = await loadSubdirectory(entry)
      }
    }
  }

  // Open file
  const openFile = async (filePath: string) => {
    if (!tauriFs) {
      await initTauri()
    }
    if (!tauriFs) return

    state.isLoading = true
    try {
      const content = await tauriFs.readTextFile(filePath)
      state.currentFile = filePath
      state.fileContent = content
      state.originalContent = content
      state.currentLanguage = getLanguage(filePath)
      state.isDirty = false
      state.selectedFile = filePath
    } catch (err) {
      console.error('Failed to read file:', err)
    } finally {
      state.isLoading = false
    }
  }

  // Select file or toggle folder
  const selectFile = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      await toggleFolder(entry)
      return
    }

    await openFile(entry.path)
  }

  // Save current file
  const saveFile = async (): Promise<boolean> => {
    if (!state.currentFile) return false

    if (!tauriFs) {
      await initTauri()
    }
    if (!tauriFs) return false

    try {
      await tauriFs.writeTextFile(state.currentFile, state.fileContent)
      state.originalContent = state.fileContent
      state.isDirty = false
      return true
    } catch (err) {
      console.error('Failed to save file:', err)
      return false
    }
  }

  // Save file as (new path)
  const saveFileAs = async (): Promise<boolean> => {
    if (!tauriDialog || !tauriFs) {
      await initTauri()
    }
    if (!tauriDialog || !tauriFs) return false

    try {
      const filePath = await tauriDialog.save({
        title: 'Save As',
        defaultPath: state.currentFile || state.rootPath,
        filters: [{
          name: 'All Files',
          extensions: ['*']
        }]
      })

      if (filePath) {
        await tauriFs.writeTextFile(filePath, state.fileContent)
        state.currentFile = filePath
        state.originalContent = state.fileContent
        state.isDirty = false
        state.selectedFile = filePath
        state.currentLanguage = getLanguage(filePath)
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to save file as:', err)
      return false
    }
  }

  // Create new untitled file
  const newFile = () => {
    state.currentFile = ''
    state.fileContent = ''
    state.originalContent = ''
    state.isDirty = false
    state.selectedFile = null
    state.currentLanguage = 'plaintext'
  }

  // Save all dirty files (for future multi-tab support)
  const saveAllFiles = async (): Promise<boolean> => {
    // Currently only single file, just save it
    if (state.isDirty) {
      return saveFile()
    }
    return true
  }

  // Update content
  const updateContent = (value: string) => {
    state.fileContent = value
    state.isDirty = value !== state.originalContent
  }

  // Close file
  const closeFile = () => {
    state.currentFile = ''
    state.fileContent = ''
    state.originalContent = ''
    state.isDirty = false
    state.selectedFile = null
  }

  // Delete file or folder
  const deleteEntry = async (path: string, isDirectory: boolean) => {
    if (!tauriFs) await initTauri()
    if (!tauriFs) return false

    try {
      if (isDirectory) {
        await tauriFs.remove(path, { recursive: true })
      } else {
        await tauriFs.remove(path)
      }

      // If deleted file was open, close it
      if (state.currentFile === path) {
        closeFile()
      }

      // Refresh parent directory
      const parentPath = path.substring(0, path.lastIndexOf('/'))
      await refreshDirectoryInTree(parentPath)

      return true
    } catch (err) {
      console.error('Failed to delete:', err)
      return false
    }
  }

  // Rename file or folder
  const renameEntry = async (oldPath: string, newName: string) => {
    if (!tauriFs) await initTauri()
    if (!tauriFs) return false

    try {
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'))
      const newPath = `${parentPath}/${newName}`

      await tauriFs.rename(oldPath, newPath)

      // If renamed file was open, update path
      if (state.currentFile === oldPath) {
        state.currentFile = newPath
        state.selectedFile = newPath
      }

      // Refresh parent directory
      await refreshDirectoryInTree(parentPath)

      return true
    } catch (err) {
      console.error('Failed to rename:', err)
      return false
    }
  }

  // Copy path to clipboard
  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      return true
    } catch (err) {
      console.error('Failed to copy path:', err)
      return false
    }
  }

  // Copy relative path to clipboard
  const copyRelativePath = async (path: string) => {
    try {
      const relativePath = getRelativePath(path)
      await navigator.clipboard.writeText(relativePath)
      return true
    } catch (err) {
      console.error('Failed to copy path:', err)
      return false
    }
  }

  // Reveal in Finder/Explorer
  const revealInFinder = async (path: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // macOS: open -R reveals the file in Finder
      await invoke('run_shell_command', {
        command: 'open',
        args: ['-R', path],
        cwd: '/'
      })
      return true
    } catch (err) {
      console.error('Failed to reveal in finder:', err)
      return false
    }
  }

  // Create new file
  const createFile = async (parentPath: string, fileName: string) => {
    if (!tauriFs) await initTauri()
    if (!tauriFs) return false

    try {
      const filePath = `${parentPath}/${fileName}`
      await tauriFs.writeTextFile(filePath, '')

      // Refresh parent directory
      await refreshDirectoryInTree(parentPath)

      // Open the new file
      await openFile(filePath)
      return true
    } catch (err) {
      console.error('Failed to create file:', err)
      return false
    }
  }

  // Create new folder
  const createFolder = async (parentPath: string, folderName: string) => {
    if (!tauriFs) await initTauri()
    if (!tauriFs) return false

    try {
      const folderPath = `${parentPath}/${folderName}`
      await tauriFs.mkdir(folderPath)

      // Refresh parent directory
      await refreshDirectoryInTree(parentPath)

      return true
    } catch (err) {
      console.error('Failed to create folder:', err)
      return false
    }
  }

  // Get file name
  const fileName = computed(() => {
    if (!state.currentFile) return 'Untitled'
    return state.currentFile.split('/').pop() || 'Untitled'
  })

  // Get relative path
  const getRelativePath = (fullPath: string): string => {
    if (!state.rootPath) return fullPath.split('/').pop() || fullPath
    return fullPath.replace(state.rootPath + '/', '')
  }

  // Get file icon using vscode-icons
  const getFileIcon = (entry: FileEntry): string => {
    if (entry.isDirectory) {
      return state.expandedFolders.has(entry.path)
        ? 'i-vscode-icons-default-folder-opened'
        : 'i-vscode-icons-default-folder'
    }

    // Special filenames first
    const name = entry.name.toLowerCase()
    const specialFileIcons: Record<string, string> = {
      'dockerfile': 'i-vscode-icons-file-type-docker',
      'docker-compose.yml': 'i-vscode-icons-file-type-docker',
      'docker-compose.yaml': 'i-vscode-icons-file-type-docker',
      'package.json': 'i-vscode-icons-file-type-npm',
      'package-lock.json': 'i-vscode-icons-file-type-npm',
      'yarn.lock': 'i-vscode-icons-file-type-yarn',
      'pnpm-lock.yaml': 'i-vscode-icons-file-type-pnpm',
      'bun.lockb': 'i-vscode-icons-file-type-bun',
      'tsconfig.json': 'i-vscode-icons-file-type-tsconfig',
      'jsconfig.json': 'i-vscode-icons-file-type-jsconfig',
      '.gitignore': 'i-vscode-icons-file-type-git',
      '.gitattributes': 'i-vscode-icons-file-type-git',
      '.gitmodules': 'i-vscode-icons-file-type-git',
      '.npmrc': 'i-vscode-icons-file-type-npm',
      '.nvmrc': 'i-vscode-icons-file-type-node',
      '.editorconfig': 'i-vscode-icons-file-type-editorconfig',
      '.prettierrc': 'i-vscode-icons-file-type-prettier',
      '.prettierrc.json': 'i-vscode-icons-file-type-prettier',
      'prettier.config.js': 'i-vscode-icons-file-type-prettier',
      '.eslintrc': 'i-vscode-icons-file-type-eslint',
      '.eslintrc.js': 'i-vscode-icons-file-type-eslint',
      '.eslintrc.json': 'i-vscode-icons-file-type-eslint',
      'eslint.config.js': 'i-vscode-icons-file-type-eslint',
      'eslint.config.mjs': 'i-vscode-icons-file-type-eslint',
      'vite.config.ts': 'i-vscode-icons-file-type-vite',
      'vite.config.js': 'i-vscode-icons-file-type-vite',
      'nuxt.config.ts': 'i-vscode-icons-file-type-nuxt',
      'nuxt.config.js': 'i-vscode-icons-file-type-nuxt',
      'tailwind.config.js': 'i-vscode-icons-file-type-tailwind',
      'tailwind.config.ts': 'i-vscode-icons-file-type-tailwind',
      'postcss.config.js': 'i-vscode-icons-file-type-postcss',
      'readme.md': 'i-vscode-icons-file-type-readme',
      'license': 'i-vscode-icons-file-type-license',
      'license.md': 'i-vscode-icons-file-type-license',
      'changelog.md': 'i-vscode-icons-file-type-changelog',
      'contributing.md': 'i-vscode-icons-file-type-contributing',
      'makefile': 'i-vscode-icons-file-type-makefile',
      'cmakelists.txt': 'i-vscode-icons-file-type-cmake',
      'cargo.toml': 'i-vscode-icons-file-type-cargo',
      'cargo.lock': 'i-vscode-icons-file-type-cargo',
      'go.mod': 'i-vscode-icons-file-type-go-gopher',
      'go.sum': 'i-vscode-icons-file-type-go-gopher',
      'gemfile': 'i-vscode-icons-file-type-ruby',
      'rakefile': 'i-vscode-icons-file-type-ruby',
      'requirements.txt': 'i-vscode-icons-file-type-python-misc',
      'setup.py': 'i-vscode-icons-file-type-python-misc',
      'pipfile': 'i-vscode-icons-file-type-python-misc',
      'pyproject.toml': 'i-vscode-icons-file-type-python-misc',
    }

    if (specialFileIcons[name]) return specialFileIcons[name]
    if (name.startsWith('.env')) return 'i-vscode-icons-file-type-dotenv'
    if (name.startsWith('dockerfile')) return 'i-vscode-icons-file-type-docker'

    const ext = entry.name.split('.').pop()?.toLowerCase()
    const extIconMap: Record<string, string> = {
      // TypeScript/JavaScript
      ts: 'i-vscode-icons-file-type-typescript',
      tsx: 'i-vscode-icons-file-type-typescript',
      js: 'i-vscode-icons-file-type-js',
      jsx: 'i-vscode-icons-file-type-js',
      mjs: 'i-vscode-icons-file-type-js',
      cjs: 'i-vscode-icons-file-type-js',
      mts: 'i-vscode-icons-file-type-typescript',
      cts: 'i-vscode-icons-file-type-typescript',

      // Frontend frameworks
      vue: 'i-vscode-icons-file-type-vue',
      svelte: 'i-vscode-icons-file-type-svelte',
      astro: 'i-vscode-icons-file-type-astro',

      // Web
      html: 'i-vscode-icons-file-type-html',
      htm: 'i-vscode-icons-file-type-html',
      css: 'i-vscode-icons-file-type-css',
      scss: 'i-vscode-icons-file-type-scss',
      sass: 'i-vscode-icons-file-type-sass',
      less: 'i-vscode-icons-file-type-less',
      styl: 'i-vscode-icons-file-type-stylus',

      // Data formats
      json: 'i-vscode-icons-file-type-json',
      jsonc: 'i-vscode-icons-file-type-json',
      yaml: 'i-vscode-icons-file-type-yaml',
      yml: 'i-vscode-icons-file-type-yaml',
      toml: 'i-vscode-icons-file-type-toml',
      xml: 'i-vscode-icons-file-type-xml',
      ini: 'i-vscode-icons-file-type-ini',
      env: 'i-vscode-icons-file-type-dotenv',

      // Markdown
      md: 'i-vscode-icons-file-type-markdown',
      mdx: 'i-vscode-icons-file-type-mdx',
      rst: 'i-vscode-icons-file-type-rst',

      // Python
      py: 'i-vscode-icons-file-type-python',
      pyw: 'i-vscode-icons-file-type-python',
      pyi: 'i-vscode-icons-file-type-python',
      ipynb: 'i-vscode-icons-file-type-jupyter',

      // Go
      go: 'i-vscode-icons-file-type-go',

      // Rust
      rs: 'i-vscode-icons-file-type-rust',

      // Ruby
      rb: 'i-vscode-icons-file-type-ruby',
      erb: 'i-vscode-icons-file-type-erb',
      rake: 'i-vscode-icons-file-type-ruby',

      // PHP
      php: 'i-vscode-icons-file-type-php',

      // Java
      java: 'i-vscode-icons-file-type-java',
      jar: 'i-vscode-icons-file-type-jar',
      kt: 'i-vscode-icons-file-type-kotlin',
      kts: 'i-vscode-icons-file-type-kotlin',
      gradle: 'i-vscode-icons-file-type-gradle',

      // Swift
      swift: 'i-vscode-icons-file-type-swift',

      // Scala
      scala: 'i-vscode-icons-file-type-scala',

      // C#/F#
      cs: 'i-vscode-icons-file-type-csharp',
      fs: 'i-vscode-icons-file-type-fsharp',
      fsx: 'i-vscode-icons-file-type-fsharp',
      vb: 'i-vscode-icons-file-type-vb',

      // C/C++
      c: 'i-vscode-icons-file-type-c',
      h: 'i-vscode-icons-file-type-cheader',
      cpp: 'i-vscode-icons-file-type-cpp',
      cc: 'i-vscode-icons-file-type-cpp',
      cxx: 'i-vscode-icons-file-type-cpp',
      hpp: 'i-vscode-icons-file-type-cppheader',
      hxx: 'i-vscode-icons-file-type-cppheader',
      m: 'i-vscode-icons-file-type-objectivec',
      mm: 'i-vscode-icons-file-type-objectivecpp',

      // Other languages
      dart: 'i-vscode-icons-file-type-dart',
      lua: 'i-vscode-icons-file-type-lua',
      r: 'i-vscode-icons-file-type-r',
      jl: 'i-vscode-icons-file-type-julia',
      ex: 'i-vscode-icons-file-type-elixir',
      exs: 'i-vscode-icons-file-type-elixir',
      erl: 'i-vscode-icons-file-type-erlang',
      clj: 'i-vscode-icons-file-type-clojure',
      cljs: 'i-vscode-icons-file-type-clojure',
      hs: 'i-vscode-icons-file-type-haskell',
      pl: 'i-vscode-icons-file-type-perl',
      pm: 'i-vscode-icons-file-type-perl',

      // Shell
      sh: 'i-vscode-icons-file-type-shell',
      bash: 'i-vscode-icons-file-type-shell',
      zsh: 'i-vscode-icons-file-type-shell',
      fish: 'i-vscode-icons-file-type-shell',
      ps1: 'i-vscode-icons-file-type-powershell',
      psm1: 'i-vscode-icons-file-type-powershell',
      bat: 'i-vscode-icons-file-type-bat',
      cmd: 'i-vscode-icons-file-type-bat',

      // Database
      sql: 'i-vscode-icons-file-type-sql',
      prisma: 'i-vscode-icons-file-type-prisma',
      graphql: 'i-vscode-icons-file-type-graphql',
      gql: 'i-vscode-icons-file-type-graphql',

      // Config
      tf: 'i-vscode-icons-file-type-terraform',
      hcl: 'i-vscode-icons-file-type-terraform',

      // Images
      png: 'i-vscode-icons-file-type-image',
      jpg: 'i-vscode-icons-file-type-image',
      jpeg: 'i-vscode-icons-file-type-image',
      gif: 'i-vscode-icons-file-type-image',
      webp: 'i-vscode-icons-file-type-image',
      ico: 'i-vscode-icons-file-type-image',
      svg: 'i-vscode-icons-file-type-svg',

      // Fonts
      ttf: 'i-vscode-icons-file-type-font',
      otf: 'i-vscode-icons-file-type-font',
      woff: 'i-vscode-icons-file-type-font',
      woff2: 'i-vscode-icons-file-type-font',
      eot: 'i-vscode-icons-file-type-font',

      // Archives
      zip: 'i-vscode-icons-file-type-zip',
      tar: 'i-vscode-icons-file-type-zip',
      gz: 'i-vscode-icons-file-type-zip',
      rar: 'i-vscode-icons-file-type-zip',
      '7z': 'i-vscode-icons-file-type-zip',

      // Documents
      pdf: 'i-vscode-icons-file-type-pdf',
      doc: 'i-vscode-icons-file-type-word',
      docx: 'i-vscode-icons-file-type-word',
      xls: 'i-vscode-icons-file-type-excel',
      xlsx: 'i-vscode-icons-file-type-excel',
      ppt: 'i-vscode-icons-file-type-powerpoint',
      pptx: 'i-vscode-icons-file-type-powerpoint',

      // Other
      lock: 'i-vscode-icons-file-type-lock',
      log: 'i-vscode-icons-file-type-log',
      txt: 'i-vscode-icons-file-type-text',
      cert: 'i-vscode-icons-file-type-cert',
      pem: 'i-vscode-icons-file-type-cert',
      key: 'i-vscode-icons-file-type-key',
      sol: 'i-vscode-icons-file-type-solidity',
      wasm: 'i-vscode-icons-file-type-wasm',

      // Construct Design Files
      ui: 'i-lucide-layout',
      ux: 'i-lucide-play-circle',
    }

    return extIconMap[ext || ''] || 'i-vscode-icons-default-file'
  }

  // Get file icon color (vscode-icons have built-in colors, return empty for most)
  const getFileIconColor = (_entry: FileEntry): string => {
    // vscode-icons already have colors, so we don't need to add extra colors
    // Return empty string to use the icon's built-in colors
    return ''
  }

  // Duplicate a file (creates "name (copy).ext")
  const duplicateEntry = async (path: string) => {
    if (!tauriFs) await initTauri()
    if (!tauriFs) return false

    try {
      const fileName = path.split('/').pop() || 'file'
      const parentPath = path.substring(0, path.lastIndexOf('/'))
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
      const baseName = ext ? fileName.slice(0, -ext.length) : fileName
      const copyName = `${baseName} (copy)${ext}`
      const copyPath = `${parentPath}/${copyName}`

      const content = await tauriFs.readTextFile(path)
      await tauriFs.writeTextFile(copyPath, content)

      // Refresh parent directory
      await refreshDirectoryInTree(parentPath)

      return true
    } catch (err) {
      console.error('Failed to duplicate file:', err)
      return false
    }
  }

  // Open terminal at path
  const openInTerminal = async (path: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // macOS: open -a Terminal <path>
      await invoke('run_shell_command', {
        command: 'open',
        args: ['-a', 'Terminal', path],
        cwd: '/'
      })
      return true
    } catch (err) {
      console.error('Failed to open in terminal:', err)
      return false
    }
  }

  // Copy just the file/folder name to clipboard
  const copyName = async (path: string) => {
    try {
      const name = path.split('/').pop() || ''
      await navigator.clipboard.writeText(name)
      return true
    } catch (err) {
      console.error('Failed to copy name:', err)
      return false
    }
  }

  return {
    // State
    state,
    selection,
    fileName,

    // Actions
    initTauri,
    openFolder,
    loadDirectory,
    selectFile,
    openFile,
    saveFile,
    saveFileAs,
    saveAllFiles,
    newFile,
    updateContent,
    closeFile,
    toggleFolder,

    // File operations
    deleteEntry,
    renameEntry,
    duplicateEntry,
    copyPath,
    copyRelativePath,
    copyName,
    revealInFinder,
    openInTerminal,
    createFile,
    createFolder,

    // Helpers
    getRelativePath,
    getFileIcon,
    getFileIconColor,
  }
}
