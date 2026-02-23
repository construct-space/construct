---
id: builtin.smart-router
name: Smart Router (Conductor)
category: core
description: Conductor selects optimal model based on task complexity, context, and cost
version: 2.0.0
author: Construct
icon: route
enabled: true

keywords:
  - model selection
  - cost optimization
  - routing
  - conductor
  - llm
  - ai model
  - budget
  - premium

examples:
  - title: Simple Query Routing
    description: Route a greeting to a free model
    input: Hey, how are you?
    output: Routed to GLM 4.7 Flash (free tier)
  - title: Code Task Routing
    description: Route a code task to a balanced model
    input: Write a function to parse JSON
    output: Routed to Grok Code (balanced tier)
  - title: Complex Task Routing
    description: Route a complex design task to premium model
    input: Design a microservices architecture for e-commerce
    output: Routed to Claude Sonnet 4.5 (premium tier)

settings:
  enableCostOptimization:
    type: boolean
    description: Prefer cheaper models for simple tasks
    default: true
  defaultTier:
    type: string
    description: Default model tier (free, budget, balanced, premium)
    default: balanced

models:
  # Free tier
  free:
    - id: zai:glm-4.7-flash
      cost: 0
      strengths: [general, fast, chinese]

  # Budget tier - cheap, fast
  budget:
    - id: gemini:gemini-2.5-flash
      cost: 0.15
      strengths: [fast, vision, tools]
    - id: deepseek:deepseek-chat
      cost: 0.27
      strengths: [general, code, tools]
    - id: kimi:moonshot-v1-128k
      cost: 0.80
      strengths: [long_context, general]

  # Balanced tier - good quality/cost ratio
  balanced:
    - id: anthropic-oauth:claude-haiku-4-5
      cost: 0.80
      strengths: [fast, tools]
    - id: xai:grok-code-fast-1
      cost: 1.50
      strengths: [code, tools, fast]
    - id: zai:glm-5
      cost: 2.00
      strengths: [reasoning, flagship]
    - id: gemini:gemini-2.5-pro
      cost: 2.50
      strengths: [reasoning, vision, tools]

  # Premium tier - best quality
  premium:
    - id: deepseek:deepseek-reasoner
      cost: 2.19
      strengths: [reasoning, math]
    - id: anthropic-oauth:claude-sonnet-4-6
      cost: 3.00
      strengths: [coding, vision, tools, balanced]
    - id: anthropic-oauth:claude-sonnet-4-5
      cost: 3.00
      strengths: [coding, vision, tools, balanced]
    - id: xai:grok-4-1-fast-reasoning
      cost: 3.00
      strengths: [vision, reasoning]
    - id: kimi:kimi-k2.5
      cost: 3.50
      strengths: [vision, reasoning]
    - id: anthropic-oauth:claude-opus-4-6
      cost: 15.00
      strengths: [complex_reasoning, flagship]

routing_rules:
  # Simple queries -> Free/Budget
  simple_patterns:
    - "hi, hello, hey"
    - "what is, how do I"
    - "explain, define, list"
    - "thanks, thank you"

  # Code tasks -> Balanced
  code_patterns:
    - "write code, create function"
    - "fix bug, debug, refactor"
    - "typescript, python, go"

  # Complex reasoning -> Premium
  complex_patterns:
    - "analyze, architect, audit"
    - "compare and contrast"
    - "security review, optimize"
    - "design system, microservices"

  # Vision -> Vision-capable models
  vision_patterns:
    - "screenshot, image, photo"
    - "UI design, mockup, wireframe"
---

# Smart Router (Conductor)

Automatically selects the most cost-effective model for each task.

## How It Works

Two-phase routing:

### Phase 1: Regex (instant, free)
Pattern matching classifies obvious tasks immediately:
- Greetings → free tier
- Code keywords → balanced tier
- Architecture/analysis → premium tier
- Image content → vision-capable model

### Phase 2: LLM Conductor (when uncertain)
When regex confidence is low (<60%), a cheap model (GLM 4.7 Flash or Haiku)
analyzes the task and selects the optimal model from the full catalog.

The conductor model receives descriptions of every available model and picks
the cheapest one that can handle the task.

## Model Tiers

| Tier | Models | Cost | Best For |
|------|--------|------|----------|
| **Free** | GLM 4.7 Flash | $0/1M | Simple chat, Q&A, translations |
| **Budget** | Gemini Flash, DeepSeek V3 | $0.15-0.80/1M | General tasks, basic code |
| **Balanced** | Haiku, Grok Code, GLM-5 | $0.80-2.50/1M | Code, moderate reasoning |
| **Premium** | Sonnet, Grok 4.1, Opus | $2-15/1M | Complex reasoning, architecture |

## Space-Aware Routing

| Space | Default Tier | Reason |
|-------|-------------|--------|
| kanban, calendar | free/budget | Simple CRUD operations |
| code | balanced | Code generation needs quality |
| ui/design | balanced/vision | May need image understanding |
| chat (general) | varies | Analyzed per-message |

## Cost Savings

| Without Router | With Router | Savings |
|---------------|-------------|---------|
| All tasks → Claude Sonnet ($3/1M) | Mixed routing | ~70-80% |

Simple greetings: $0 instead of $3/1M
Code tasks: $1.50 instead of $3/1M
Only complex tasks use expensive models.
