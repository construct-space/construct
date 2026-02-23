/**
 * Custom language registrations for Monaco — Vue, Svelte, Astro, Prisma, Dockerfile, TOML.
 * Pure function, no reactive state.
 */
import type * as Monaco from 'monaco-editor'

export function registerCustomLanguages(monaco: typeof Monaco): void {
  // ── Vue ────────────────────────────────────────────────────────────
  monaco.languages.register({ id: 'vue', extensions: ['.vue'], aliases: ['Vue', 'vue'] })

  monaco.languages.setMonarchTokensProvider('vue', {
    defaultToken: '',
    tokenPostfix: '.vue',
    keywords: ['template', 'script', 'style', 'setup', 'lang', 'scoped', 'module', 'src'],
    tokenizer: {
      root: [
        [/<template(\s+[^>]*)?>/, { token: 'tag.vue', next: '@template' }],
        [/<script(\s+[^>]*)?>/, { token: 'tag.vue', next: '@script' }],
        [/<style(\s+[^>]*)?>/, { token: 'tag.vue', next: '@style' }],
        [/<\/?[\w-]+/, 'tag'],
        [/[^<]+/, ''],
      ],
      template: [
        [/v-[\w-]+/, 'attribute.name.vue'],
        [/@[\w-]+/, 'attribute.name.vue'],
        [/:[\w-]+/, 'attribute.name.vue'],
        [/#[\w-]+/, 'attribute.name.vue'],
        [/\{\{/, { token: 'delimiter.vue', next: '@interpolation' }],
        [/<\/template>/, { token: 'tag.vue', next: '@root' }],
        [/<\/?[\w-]+/, 'tag'],
        [/"([^"]*)"/, 'attribute.value'],
        [/'([^']*)'/, 'attribute.value'],
        [/[\w-]+(?==)/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/>/, 'tag'],
        [/[^<{]+/, ''],
      ],
      interpolation: [
        [/\}\}/, { token: 'delimiter.vue', next: '@template' }],
        [/[\w.]+/, 'variable'],
        [/[()[\]{}]/, 'delimiter'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/\d+/, 'number'],
      ],
      script: [
        [/<\/script>/, { token: 'tag.vue', next: '@root' }],
        [/\b(import|export|from|const|let|var|function|return|if|else|for|while|class|interface|type|extends|implements|async|await|try|catch|throw|new|this|super|static|public|private|protected|readonly|enum|namespace|module|declare|abstract|as|is|keyof|typeof|infer|never|unknown|any|void|null|undefined|true|false)\b/, 'keyword'],
        [/\b(ref|reactive|computed|watch|watchEffect|onMounted|onUnmounted|onBeforeMount|onBeforeUnmount|defineProps|defineEmits|defineExpose|withDefaults|toRef|toRefs|unref|isRef|shallowRef|triggerRef|customRef|shallowReactive|shallowReadonly|toRaw|markRaw|effectScope|getCurrentScope|onScopeDispose|provide|inject|nextTick|defineComponent|h|createApp|createSSRApp|resolveComponent|resolveDirective|withDirectives|defineAsyncComponent|defineCustomElement|useCssModule|useCssVars|useSlots|useAttrs)\b/, 'function'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/`[^`]*`/, 'string'],
        [/\d+(\.\d+)?/, 'number'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, { token: 'comment', next: '@scriptComment' }],
        [/\b[A-Z][\w]*\b/, 'type'],
        [/[\w$]+/, 'variable'],
      ],
      scriptComment: [
        [/\*\//, { token: 'comment', next: '@script' }],
        [/./, 'comment'],
      ],
      style: [
        [/<\/style>/, { token: 'tag.vue', next: '@root' }],
        [/[\w-]+(?=\s*:)/, 'attribute.name'],
        [/:/, 'delimiter'],
        [/;/, 'delimiter'],
        [/\{/, 'delimiter.curly'],
        [/\}/, 'delimiter.curly'],
        [/[.#][\w-]+/, 'tag'],
        [/[\w-]+(?=\s*\{)/, 'tag'],
        [/#[0-9a-fA-F]+/, 'number.hex'],
        [/\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms)?/, 'number'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/\/\*/, { token: 'comment', next: '@styleComment' }],
      ],
      styleComment: [
        [/\*\//, { token: 'comment', next: '@style' }],
        [/./, 'comment'],
      ],
    },
  })

  monaco.languages.setLanguageConfiguration('vue', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [
      ['{', '}'], ['[', ']'], ['(', ')'], ['<', '>'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
      { open: '{{', close: '}}' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
    ],
    folding: {
      markers: {
        start: /^\s*<!--\s*#?region\b.*-->/,
        end: /^\s*<!--\s*#?endregion\b.*-->/,
      },
    },
    wordPattern: /(-?\d*\.\d\w*)|([^\s`~!@#%^&*()\-=+[\]{}\\|;:'",.<>/?]+)/g,
  })

  // ── Svelte ─────────────────────────────────────────────────────────
  monaco.languages.register({ id: 'svelte', extensions: ['.svelte'], aliases: ['Svelte', 'svelte'] })

  monaco.languages.setMonarchTokensProvider('svelte', {
    defaultToken: '',
    tokenPostfix: '.svelte',
    tokenizer: {
      root: [
        [/<script(\s+[^>]*)?>/, { token: 'tag.svelte', next: '@script' }],
        [/<style(\s+[^>]*)?>/, { token: 'tag.svelte', next: '@style' }],
        [/\{#(if|each|await|key)\b/, 'keyword.svelte'],
        [/\{:(else|then|catch)\b/, 'keyword.svelte'],
        [/\{\/(if|each|await|key)\}/, 'keyword.svelte'],
        [/\{@(html|debug|const)\b/, 'keyword.svelte'],
        [/\$:/, 'keyword.svelte'],
        [/\{/, { token: 'delimiter.svelte', next: '@interpolation' }],
        [/<\/?[\w-]+/, 'tag'],
        [/on:[\w]+/, 'attribute.name.svelte'],
        [/bind:[\w]+/, 'attribute.name.svelte'],
        [/class:[\w]+/, 'attribute.name.svelte'],
        [/use:[\w]+/, 'attribute.name.svelte'],
        [/transition:[\w]+/, 'attribute.name.svelte'],
        [/animate:[\w]+/, 'attribute.name.svelte'],
        [/in:[\w]+/, 'attribute.name.svelte'],
        [/out:[\w]+/, 'attribute.name.svelte'],
        [/"([^"]*)"/, 'attribute.value'],
        [/'([^']*)'/, 'attribute.value'],
        [/[\w-]+(?==)/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/>/, 'tag'],
        [/[^<{]+/, ''],
      ],
      interpolation: [
        [/\}/, { token: 'delimiter.svelte', next: '@root' }],
        [/[\w.]+/, 'variable'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/\d+/, 'number'],
      ],
      script: [
        [/<\/script>/, { token: 'tag.svelte', next: '@root' }],
        [/\b(import|export|from|const|let|var|function|return|if|else|for|while|class|async|await)\b/, 'keyword'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/`[^`]*`/, 'string'],
        [/\d+(\.\d+)?/, 'number'],
        [/\/\/.*$/, 'comment'],
        [/\/\*[\s\S]*?\*\//, 'comment'],
        [/[\w$]+/, 'variable'],
      ],
      style: [
        [/<\/style>/, { token: 'tag.svelte', next: '@root' }],
        [/[\w-]+(?=\s*:)/, 'attribute.name'],
        [/[.#][\w-]+/, 'tag'],
        [/#[0-9a-fA-F]+/, 'number.hex'],
        [/\d+(\.\d+)?(px|em|rem|%)?/, 'number'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/\/\*[\s\S]*?\*\//, 'comment'],
      ],
    },
  })

  // ── Astro ──────────────────────────────────────────────────────────
  monaco.languages.register({ id: 'astro', extensions: ['.astro'], aliases: ['Astro', 'astro'] })

  monaco.languages.setMonarchTokensProvider('astro', {
    defaultToken: '',
    tokenPostfix: '.astro',
    tokenizer: {
      root: [
        [/^---$/, { token: 'delimiter.astro', next: '@frontmatter' }],
        [/<\/?[\w-]+/, 'tag'],
        [/\{/, { token: 'delimiter.astro', next: '@interpolation' }],
        [/"([^"]*)"/, 'attribute.value'],
        [/'([^']*)'/, 'attribute.value'],
        [/[\w-]+(?==)/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/>/, 'tag'],
        [/[^<{]+/, ''],
      ],
      frontmatter: [
        [/^---$/, { token: 'delimiter.astro', next: '@root' }],
        [/\b(import|export|from|const|let|var|function|return|if|else|for|while|class|async|await|interface|type)\b/, 'keyword'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/`[^`]*`/, 'string'],
        [/\d+(\.\d+)?/, 'number'],
        [/\/\/.*$/, 'comment'],
        [/\/\*[\s\S]*?\*\//, 'comment'],
        [/\b[A-Z][\w]*\b/, 'type'],
        [/[\w$]+/, 'variable'],
      ],
      interpolation: [
        [/\}/, { token: 'delimiter.astro', next: '@root' }],
        [/[\w.]+/, 'variable'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/\d+/, 'number'],
      ],
    },
  })

  // ── Prisma ─────────────────────────────────────────────────────────
  monaco.languages.register({ id: 'prisma', extensions: ['.prisma'], aliases: ['Prisma', 'prisma'] })

  monaco.languages.setMonarchTokensProvider('prisma', {
    defaultToken: '',
    tokenPostfix: '.prisma',
    keywords: ['model', 'enum', 'datasource', 'generator', 'type'],
    typeKeywords: ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'Decimal', 'BigInt'],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\b(model|enum|datasource|generator|type)\b/, 'keyword'],
        [/\b(String|Int|Float|Boolean|DateTime|Json|Bytes|Decimal|BigInt)\b/, 'type'],
        [/@[\w.]+/, 'annotation'],
        [/"[^"]*"/, 'string'],
        [/\b\d+\b/, 'number'],
        [/[\w]+/, 'variable'],
      ],
    },
  })

  // ── Dockerfile ─────────────────────────────────────────────────────
  monaco.languages.register({ id: 'dockerfile', extensions: ['Dockerfile', '.dockerfile'], aliases: ['Dockerfile', 'dockerfile'] })

  monaco.languages.setMonarchTokensProvider('dockerfile', {
    defaultToken: '',
    tokenPostfix: '.dockerfile',
    instructions: ['FROM', 'MAINTAINER', 'RUN', 'CMD', 'LABEL', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'],
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\b(FROM|MAINTAINER|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b/i, 'keyword'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\$[\w]+/, 'variable'],
        [/\$\{[\w]+\}/, 'variable'],
      ],
    },
  })

  // ── TOML ───────────────────────────────────────────────────────────
  monaco.languages.register({ id: 'toml', extensions: ['.toml'], aliases: ['TOML', 'toml'] })

  monaco.languages.setMonarchTokensProvider('toml', {
    defaultToken: '',
    tokenPostfix: '.toml',
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\[[\w.-]+\]/, 'type'],
        [/\[\[[\w.-]+\]\]/, 'type'],
        [/[\w-]+(?=\s*=)/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"""[\s\S]*?"""/, 'string'],
        [/'''[\s\S]*?'''/, 'string'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\b(true|false)\b/, 'keyword'],
        [/\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/, 'number'],
        [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
      ],
    },
  })
}
