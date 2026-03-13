import { describe, expect, it } from 'vitest'

import { generatePRD, generateREADME, generateARCHITECTURE, generateROADMAP, generateDataModels, generateUISpec, generateAIContext, type ArchitectPlan } from '@/utils/documentsGenerator'

// Legacy plan (flat prd)
const playUpPlan: ArchitectPlan = {
  name: 'PlayUp',
  description: 'Flutter app with Go backend for organizing pickup sports and real-time chat. Use GetX for state management.',
  decisions: {},
  prd: {
    overview: 'A social activity coordination app where players can create and join local games.',
    coreFeatures: [
      'Create activities with time, location, and player limits',
      'Discover nearby games on a map and in a feed',
      'Join and chat with participants in real time',
    ],
    mvpScope: [
      'Ship the activity feed and map discovery flow',
      'Allow hosts to create activities with slots and scheduling',
      'Enable join requests, confirmations, and realtime chat',
    ],
    sections: ['Feed', 'Map', 'Calendar', 'Profile'],
    designNotes: 'Energetic sporty visuals with fast motion, bold accents, and clear hierarchy.',
  },
}

// Rich plan (v2 docs)
const richPlan: ArchitectPlan = {
  name: 'TaskFlow',
  description: 'A task management app for small teams',
  decisions: { frontend: 'vue', backend: 'go' },
  techStack: {
    framework: 'Vue 3 with Vite',
    backend: 'Go with Chi router',
    database: 'PostgreSQL',
  },
  docs: {
    prd: {
      overview: 'TaskFlow is a lightweight task management tool for small teams.',
      targetUsers: 'Small teams of 2-10 people who need simple task tracking.',
      coreFeatures: ['Task CRUD', 'Board view', 'Team assignments'],
      userFlows: ['User opens app → sees board → creates task → assigns team member'],
      mvpScope: ['Task creation and editing', 'Board with drag-and-drop', 'User authentication'],
      futureConsiderations: ['Calendar view', 'Integrations with Slack'],
    },
    architecture: {
      overview: 'Monolithic Go backend with Vue 3 SPA frontend.',
      systemDiagram: '┌──────┐    ┌──────┐    ┌──────┐\n│ Vue  │───▶│  Go  │───▶│  PG  │\n└──────┘    └──────┘    └──────┘',
      stateManagement: 'Pinia for client state, server state via API calls.',
      constraints: ['All mutations via API', 'JWT auth required'],
      performanceTargets: { initialLoad: '<2s', interaction: '<100ms' },
      techRationale: 'Vue 3 for reactive UI, Go for fast API, PostgreSQL for reliability.',
    },
    dataModels: {
      overview: 'Relational schema with users, tasks, and boards.',
      entities: [
        {
          name: 'Task',
          description: 'A work item',
          fields: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'title', type: 'string', required: true, constraints: 'max 255 chars' },
            { name: 'status', type: 'enum', required: true },
          ],
          relationships: ['belongs to Board', 'assigned to User'],
        },
      ],
      enums: [{ name: 'TaskStatus', values: ['todo', 'in_progress', 'done'], description: 'Task lifecycle' }],
      apiContracts: [{ endpoint: 'POST /api/tasks', request: '{title, boardId}', response: '{id, title, status}' }],
    },
    uiSpec: {
      designSystem: {
        colors: { primary: '#3B82F6 — actions and links', background: '#0F172A — dark bg' },
        typography: { headingFont: 'Inter 600', bodyFont: 'Inter 400' },
      },
      screens: [{ name: 'Board View', layout: '[header]\n[columns: todo | in_progress | done]', components: ['TaskCard', 'Column'] }],
      animations: [{ element: 'TaskCard', trigger: 'drag', effect: 'scale 1.02 + shadow', duration: '0.15s' }],
    },
    roadmap: {
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1: Foundation',
          duration: '2 weeks',
          goal: 'Basic task CRUD',
          tasks: ['Set up Vue 3 + Vite', 'Create Go API', 'Design database schema'],
          definitionOfDone: ['User can create and view tasks'],
        },
      ],
    },
    aiContext: {
      projectStructure: 'frontend/ — Vue 3 SPA\nbackend/ — Go API',
      conventions: ['PascalCase components', 'camelCase utilities'],
      patterns: [{ name: 'Adding a page', steps: ['1. Create route', '2. Add component'] }],
      commonMistakes: [{ mistake: 'Direct state mutation', fix: 'Use Pinia actions' }],
      keyFiles: [{ path: 'frontend/src/router.ts', purpose: 'Route definitions' }],
      testingStrategy: 'Vitest for unit tests, Playwright for E2E.',
    },
  },
}

describe('documentsGenerator — legacy plans', () => {
  it('builds README with inferred stack details', () => {
    const readme = generateREADME(playUpPlan)
    expect(readme).toContain('PlayUp')
    expect(readme).toContain('Flutter')
    expect(readme).toContain('GetX')
  })

  it('generates PRD with core features and MVP scope', () => {
    const prd = generatePRD(playUpPlan)
    expect(prd).toContain('Create activities with time')
    expect(prd).toContain('- [ ] Ship the activity feed')
  })
})

describe('documentsGenerator — rich plans (v2)', () => {
  it('generates numbered PRD with overview, features, flows, and scope', () => {
    const prd = generatePRD(richPlan)
    expect(prd).toContain('Product Requirements')
    expect(prd).toContain('TaskFlow is a lightweight')
    expect(prd).toContain('Task CRUD')
    expect(prd).toContain('User opens app')
    expect(prd).toContain('- [ ] Task creation and editing')
    expect(prd).toContain('Calendar view')
  })

  it('generates architecture doc with system diagram and constraints', () => {
    const arch = generateARCHITECTURE(richPlan)
    expect(arch).toContain('Technical Architecture')
    expect(arch).toContain('Monolithic Go backend')
    expect(arch).toContain('┌──────┐')
    expect(arch).toContain('All mutations via API')
    expect(arch).toContain('<2s')
  })

  it('generates data models with entities, enums, and API contracts', () => {
    const dm = generateDataModels(richPlan)
    expect(dm).toContain('Data Models')
    expect(dm).toContain('Task')
    expect(dm).toContain('max 255 chars')
    expect(dm).toContain('TaskStatus')
    expect(dm).toContain('POST /api/tasks')
  })

  it('generates UI spec with design system and screens', () => {
    const ui = generateUISpec(richPlan)
    expect(ui).toContain('UI/UX Specification')
    expect(ui).toContain('#3B82F6')
    expect(ui).toContain('Board View')
    expect(ui).toContain('TaskCard')
  })

  it('generates roadmap with phases, tasks, and definition of done', () => {
    const roadmap = generateROADMAP(richPlan)
    expect(roadmap).toContain('Phase 1: Foundation')
    expect(roadmap).toContain('2 weeks')
    expect(roadmap).toContain('- [ ] Set up Vue 3 + Vite')
    expect(roadmap).toContain('- [ ] User can create and view tasks')
  })

  it('generates AI context with conventions and common mistakes', () => {
    const ai = generateAIContext(richPlan)
    expect(ai).toContain('AI Agent Context Guide')
    expect(ai).toContain('PascalCase components')
    expect(ai).toContain('Direct state mutation')
    expect(ai).toContain('Use Pinia actions')
    expect(ai).toContain('router.ts')
    expect(ai).toContain('Vitest for unit tests')
  })
})
