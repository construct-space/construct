# RAG Context System Implementation Plan

## Overview

Move context building from Vue frontend to Go backend with RAG (Retrieval-Augmented Generation) support. Currently, `AssistantFloat.vue` builds ~250 lines of system prompt with hardcoded project context, git state, docs, route descriptions. This should move to Go where it can be enriched with semantic search results.

## Architecture

```
Current:  Vue builds prompt + Go builds prompt → concatenated mess
Target:   Vue sends structured data → Go builds ONE complete prompt with RAG
```

### New Package: `context/rag/`

```
context/rag/
├── embeddings.go      # Embedding generation via providers
├── chunker.go         # Document chunking strategies
├── indexer.go         # Background indexing pipeline
├── retriever.go       # Similarity search and retrieval
├── context_builder.go # Unified context builder (replaces Vue buildSystemPrompt)
└── store.go           # SQLite storage for embeddings
```

---

## Phase 1: RAG Infrastructure (Go)

### 1.1 Embeddings Storage (`rag/store.go`)
- New SQLite table `embeddings` with: id, project_id, content_type (code/doc/design/task),
  source_path, chunk_text, embedding (BLOB), metadata_json, created_at, updated_at
- Index on (project_id, content_type) for filtered retrieval
- CRUD operations: Insert, Delete by source, Search by similarity

### 1.2 Embedding Generation (`rag/embeddings.go`)
- Use existing provider infrastructure to generate embeddings
- Support multiple backends: Gemini (text-embedding-004), DeepSeek, OpenAI
- Add `SupportsEmbeddings()` and `Embed(texts []string)` to provider interface
- Fallback: simple TF-IDF/BM25 for offline use (no API needed)

### 1.3 Document Chunking (`rag/chunker.go`)
- Code files: chunk by function/class boundaries using tree-sitter-like heuristics
  (detect function/class patterns per language, fall back to fixed-size 512-token chunks with 64-token overlap)
- Docs/notes: chunk by section headers or paragraph boundaries
- Design data: serialize screen descriptions as text chunks
- Tasks: each task becomes a chunk with title + description + status

### 1.4 Similarity Search (`rag/retriever.go`)
- Cosine similarity in Go (brute-force, fast enough for project-scale ~10K chunks)
- Top-K retrieval with configurable K (default 5)
- Filter by content_type and project_id
- Hybrid: combine embedding similarity with keyword BM25 for better recall

### 1.5 Background Indexing (`rag/indexer.go`)
- Index on project open (scan project files)
- Re-index on file save events (incremental)
- Index docs, tasks, designs when they change
- Debounced indexing (don't re-index on every keystroke)
- Skip binary files, node_modules, .git, vendor

---

## Phase 2: Unified Context Builder (Go)

### 2.1 Context Builder (`rag/context_builder.go`)
- Receives: agent config, local_data, user message, conversation history
- Builds ONE complete system prompt:
  1. Agent behavioral prompt (from .md file)
  2. Project context (from local_data: project name, team, framework)
  3. RAG results (semantically relevant code/docs/designs for the user's query)
  4. Live state (current file, git status, canvas state -- from local_data)
  5. Reference resolution (@design, #task, ^doc, !file -- parsed from user message)
- Token budget: configurable max context tokens, prioritize by relevance

### 2.2 Streaming Handler Integration
- Modify `HandleStreamingChat()` to call context builder before agent dispatch
- Pass RAG-enriched system prompt to agent loop
- Add `rag_context` to stream chunks so Vue can show "Found 5 relevant files"

### 2.3 New Tools for RAG
- `search_project_knowledge`: Semantic search across all indexed content
- `index_file`: Manually trigger indexing of a specific file/directory
- `get_related_code`: Find code related to current context

---

## Phase 3: New Agent Tools

### 3.1 Progress & Checkpointing Tools (from Anthropic harness patterns)
- `save_progress`: Write progress state to a structured file for session continuity
- `read_progress`: Read progress from previous sessions
- `create_feature_list`: Create structured JSON feature list for multi-session work

### 3.2 Enhanced Context Tools
- `get_project_structure`: Return project file tree with type annotations
- `get_space_context`: Return current space state (what Vue currently hardcodes)
- `search_codebase_semantic`: RAG-powered semantic code search

### 3.3 Cross-Space Reference Tools
- `resolve_reference`: Resolve @design, #task, ^doc references to actual content
- `list_references`: List all available cross-space references

---

## Phase 4: Vue Cleanup

### 4.1 Strip `buildSystemPrompt()` from AssistantFloat.vue
- Remove the ~250-line function
- Vue sends raw `local_data` only -- Go builds all context
- Keep only: UI rendering, chunk handling, message management

### 4.2 Remove Duplicate Agent Routing
- Remove `resolveAssistantAgentId()` from `spaceBehavior.ts`
- Go's `resolveAgentFromSpace()` is the single source of truth
- Vue just sends `space` parameter, Go resolves the agent

### 4.3 Move Architect to Go Agent System
- Create `context/agents/builtin/architect.md` with JARVIS system prompt
- Move `architect-knowledge.ts` content to Go-side knowledge base
- Architect tools registered in Go tool registry
- Vue `useArchitect.ts` becomes thin wrapper calling standard `chatStream()`

---

## Implementation Order

1. **Phase 1.1-1.2**: Embeddings storage + generation (foundation)
2. **Phase 1.3-1.4**: Chunking + retrieval (makes RAG functional)
3. **Phase 2.1**: Context builder (integrates RAG into agent flow)
4. **Phase 1.5**: Background indexer (auto-indexes project content)
5. **Phase 2.2**: Streaming handler integration (wires it all together)
6. **Phase 2.3 + 3.x**: New tools (agents can use RAG)
7. **Phase 4.x**: Vue cleanup (remove duplication)

---

## Key Design Decisions

1. **Embeddings in SQLite**: Store as BLOBs, brute-force cosine similarity.
   At project scale (~10K chunks), this is fast enough (<100ms).
   No need for external vector DB.

2. **Fallback to BM25**: When no embedding API is available (offline/no API key),
   use keyword-based BM25 search. Still useful, just not semantic.

3. **Token Budget**: Context builder enforces a token budget (default 8K tokens for RAG context).
   Chunks are ranked by relevance and included until budget exhausted.

4. **Incremental Indexing**: File watcher triggers re-indexing of changed files only.
   Full re-index on project open. Debounced to avoid thrashing.

5. **Provider Agnostic**: Embedding generation works with any provider that supports it.
   Graceful degradation when no embedding provider is available.
