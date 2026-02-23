# Agent Prompts — Onboarding Series

## Overview

These prompts guide the AI assistant through the user onboarding flow. The agent should feel like a helpful companion, not a chatbot reading a script.

---

## Files

| File | Trigger | Purpose |
|------|---------|---------|
| `01-company-creation.md` | User clicks "Create a Company" | Guide through company setup, auto-fill form |
| `02-join-company.md` | User clicks "Join a Company" | Handle invite codes or waiting state |

---

## Shared Concepts

### AiFloatingModal

The modal that contains the AI conversation. It:
- Appears contextually based on user actions
- Can be summoned with **Shift + Shift** (double-tap)
- Maintains context based on where the user is in the app

### The Shift+Shift Pattern

After onboarding, users should know:
- **Double-tap Shift** = "I need help"
- AI appears with relevant context (current page, selected items, etc.)
- This is the primary way users interact with the assistant post-onboarding

---

## Tone Guidelines

Across all onboarding prompts:

✅ **Do:**
- Use the user's name naturally (not every message)
- Keep responses short (2-3 sentences max usually)
- Be helpful without being pushy
- Celebrate small wins ("Nice!", "You're in! 🎉")

❌ **Don't:**
- Sound like a form or wizard
- Over-explain or front-load information
- Use corporate jargon
- Be overly enthusiastic ("WOW! AMAZING!")

---

## Variables Reference

| Variable | Source | Example |
|----------|--------|---------|
| `{{user.firstName}}` | Registration data | "Flak" |
| `{{companyName}}` | User input during flow | "Nimbus" |
| `{{generatedDescription}}` | AI-generated | "Nimbus helps small businesses manage inventory." |
| `{{inviteCode}}` | User input | "NIMBUS-2024-XK" |

---

## State Transitions

```
[Account Created]
        │
        ▼
   ┌─────────────────┐
   │  Choose Path    │
   └─────────────────┘
        │         │
        ▼         ▼
   ┌────────┐  ┌────────┐
   │ Create │  │  Join  │
   │Company │  │Company │
   └────────┘  └────────┘
        │         │
        ▼         ▼
   ┌─────────────────┐
   │ Company Context │
   │   Established   │
   └─────────────────┘
        │
        ▼
   ┌─────────────────┐
   │ Introduce       │
   │ Shift+Shift     │
   └─────────────────┘
        │
        ▼
   [Onboarding Complete]
```

---

## Next Steps

After onboarding, the agent transitions to **Company Assistant** mode. See:
- `/agent-prompts/assistant/` (coming soon)

---

## Implementation Notes

1. **Modal behavior:**
   - Show typing indicator during AI responses
   - Animate form fields when auto-filled
   - Allow user to dismiss but keep accessible

2. **Shortcuts:**
   - Shift+Shift should work globally after onboarding
   - Consider a subtle first-use tooltip

3. **Fallbacks:**
   - If user types in form directly, AI should notice and adapt
   - Always allow manual override of AI suggestions
