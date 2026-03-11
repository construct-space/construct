import { describe, expect, it } from 'vitest'

import { generatePRD, generateREADME, type ArchitectPlan } from '@/utils/documentsGenerator'

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

describe('documentsGenerator', () => {
  it('builds README content from inferred stack details', () => {
    const readme = generateREADME(playUpPlan)

    expect(readme).toContain('**Primary client**: Flutter (GetX) for mobile users')
    expect(readme).toContain('- **Backend**: Go')
    expect(readme).toContain('- GetX')
    expect(readme).toContain('│   ├── frontend/        # Mobile application')
    expect(readme).toContain('## Definition of Done')
  })

  it('includes delivery tracks and completion criteria in the PRD', () => {
    const prd = generatePRD(playUpPlan)

    expect(prd).toContain('## Delivery Tracks')
    expect(prd).toContain('### Product Owner')
    expect(prd).toContain('### DevOps')
    expect(prd).toContain('- [ ] Ship the activity feed and map discovery flow')
    expect(prd).toContain('Launch checklist reviewed by product, design, engineering, and operations')
  })
})
