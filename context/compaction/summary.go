package compaction

// SummaryPrompt is the structured prompt for conversation summarization.
const SummaryPrompt = `Summarize this conversation for a continuation agent. Be concise but preserve critical details.

## Template

### Goal
What is the user trying to accomplish?

### Instructions
Important user instructions still relevant going forward.

### What Was Done
- Key actions completed (files changed, elements created, tasks done)
- Important decisions made

### Current State
What is the current state of the work?

### What's Next
What was the user about to do or asked for next?

### Key Context
Design patterns, conventions, or constraints established.
Any errors encountered and how they were resolved.`
