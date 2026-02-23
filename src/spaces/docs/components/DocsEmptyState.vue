<script setup lang="ts">
/**
 * DocsEmptyState - Shown when no document is selected
 * Provides quick-start templates and a create button
 */
import type { DocumentType } from '~/stores/documents'

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'createFromTemplate', type: DocumentType, title: string, content: string): void
}>()

interface DocTemplate {
  type: DocumentType
  title: string
  icon: string
  description: string
  content: string
}

const templates: DocTemplate[] = [
  {
    type: 'prd',
    title: 'Product Requirements Document',
    icon: 'i-lucide-file-text',
    description: 'Define features, user stories, and requirements',
    content: `# Product Requirements Document

## Overview
Brief description of the product/feature.

## Problem Statement
What problem are we solving?

## Goals
- Goal 1
- Goal 2
- Goal 3

## User Stories
### As a [user type], I want to [action] so that [benefit]

## Requirements
### Functional Requirements
1.

### Non-Functional Requirements
1.

## Success Metrics
- Metric 1
- Metric 2

## Timeline
| Phase | Description | ETA |
| --- | --- | --- |
| Phase 1 | | |
| Phase 2 | | |

## Open Questions
-
`
  },
  {
    type: 'architecture',
    title: 'Technical Spec',
    icon: 'i-lucide-git-branch',
    description: 'System architecture and technical decisions',
    content: `# Technical Specification

## Overview
High-level description of the system/feature architecture.

## Architecture

### Components
- **Component A** - Description
- **Component B** - Description

### Data Flow
Describe how data flows through the system.

## API Design

### Endpoints
| Method | Path | Description |
| --- | --- | --- |
| GET | /api/resource | List resources |
| POST | /api/resource | Create resource |

## Database Schema
Describe schema changes if any.

## Security Considerations
-

## Performance Requirements
-

## Testing Strategy
- Unit tests
- Integration tests
- E2E tests

## Rollout Plan
1.
`
  },
  {
    type: 'custom',
    title: 'Meeting Notes',
    icon: 'i-lucide-users',
    description: 'Capture discussion points and action items',
    content: `# Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
**Attendees:**

## Agenda
1.
2.
3.

## Discussion Notes


## Decisions Made
-

## Action Items
- [ ] Action item 1 - @owner
- [ ] Action item 2 - @owner
- [ ] Action item 3 - @owner

## Next Steps

`
  },
  {
    type: 'setup',
    title: 'Setup Guide',
    icon: 'i-lucide-terminal',
    description: 'Installation and configuration steps',
    content: `# Setup Guide

## Prerequisites
- Node.js v18+
-

## Installation

\`\`\`bash
# Clone the repository
git clone <repo-url>
cd <project>

# Install dependencies
npm install
\`\`\`

## Configuration

### Environment Variables
| Variable | Description | Default |
| --- | --- | --- |
| DATABASE_URL | Database connection string | |
| API_KEY | API key for external service | |

## Running Locally

\`\`\`bash
npm run dev
\`\`\`

## Deployment

## Troubleshooting

### Common Issues
- **Issue:** Description
  **Solution:** Steps to fix
`
  }
]

function createFromTemplate(template: DocTemplate) {
  emit('createFromTemplate', template.type, template.title, template.content)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center h-full p-8 overflow-y-auto">
    <div class="max-w-lg w-full text-center">
      <!-- Icon -->
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center mx-auto mb-5">
        <Icon name="i-lucide-book-open" class="size-8 text-app-muted" />
      </div>

      <!-- Title -->
      <h3 class="text-lg font-semibold text-app mb-2">No Document Selected</h3>
      <p class="text-sm text-app-muted mb-8">
        Select a document from the sidebar or create a new one to get started.
      </p>

      <!-- Create Button -->
      <Button class="mb-8" @click="emit('create')">
        <template #leading>
          <Icon name="i-lucide-plus" class="size-4" />
        </template>
        New Document
      </Button>

      <!-- Templates -->
      <div class="text-left">
        <h4 class="text-xs font-semibold text-app-muted uppercase tracking-wider mb-3">Quick Start Templates</h4>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="template in templates"
            :key="template.type + template.title"
            class="flex items-start gap-3 p-3 rounded-lg border border-[var(--app-border)] hover:bg-white/[0.05] hover:border-[var(--app-muted)]/30 transition-all text-left group"
            @click="createFromTemplate(template)"
          >
            <div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-app-accent/10 transition-colors">
              <Icon :name="template.icon" class="size-4 text-app-muted group-hover:text-app-accent transition-colors" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium text-app truncate">{{ template.title }}</p>
              <p class="text-xs text-app-muted mt-0.5 line-clamp-2">{{ template.description }}</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
