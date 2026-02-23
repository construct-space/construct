package rag

import (
	"database/sql"
	"fmt"
	"os"
	"sync"
)

// Service is the main RAG service that provides context enrichment
type Service struct {
	store    *Store
	embedder *EmbeddingManager
	indexer  *Indexer
	retriever *Retriever
	builder  *ContextBuilder

	mu sync.RWMutex
}

// NewService creates a new RAG service from an existing SQLite database connection
func NewService(db *sql.DB) (*Service, error) {
	// Initialize store (creates tables if needed)
	store, err := NewStore(db)
	if err != nil {
		return nil, fmt.Errorf("rag store init: %w", err)
	}

	// Initialize embedding manager (auto-detects available providers)
	embedder := NewEmbeddingManager()
	fmt.Fprintf(os.Stderr, "[rag] embedding provider: %s (dims: %d)\n", embedder.ActiveProvider(), embedder.Dimensions())

	// Initialize retriever
	retriever := NewRetriever(store, embedder)

	// Initialize indexer
	indexer := NewIndexer(store, embedder, DefaultIndexerOptions())

	// Initialize context builder
	builder := NewContextBuilder(retriever, DefaultContextBuilderOptions())

	return &Service{
		store:     store,
		embedder:  embedder,
		indexer:   indexer,
		retriever: retriever,
		builder:   builder,
	}, nil
}

// Store returns the underlying store
func (s *Service) Store() *Store {
	return s.store
}

// Indexer returns the indexer
func (s *Service) Indexer() *Indexer {
	return s.indexer
}

// Retriever returns the retriever
func (s *Service) Retriever() *Retriever {
	return s.retriever
}

// Builder returns the context builder
func (s *Service) Builder() *ContextBuilder {
	return s.builder
}

// EnrichSystemPrompt is the main entry point for context enrichment.
// It takes the agent's base system prompt and enriches it with:
// - Project context from local_data
// - RAG retrieval results relevant to the user's message
// - Space-specific context
func (s *Service) EnrichSystemPrompt(agentPrompt string, localData map[string]interface{}, userMessage string, space string) string {
	return s.builder.BuildContext(agentPrompt, localData, userMessage, space)
}

// IndexProjectAsync starts background indexing of a project directory
func (s *Service) IndexProjectAsync(projectID int, projectDir string) {
	go func() {
		stats, err := s.indexer.IndexProject(projectID, projectDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[rag] background indexing failed: %v\n", err)
			return
		}
		fmt.Fprintf(os.Stderr, "[rag] background indexing complete: %d files, %d chunks, %d embedded in %v\n",
			stats.IndexedFiles, stats.TotalChunks, stats.EmbeddedChunks, stats.Duration)
	}()
}

// Search performs a semantic+keyword hybrid search
func (s *Service) Search(projectID int, query string, opts ...RetrievalOptions) ([]SearchResult, error) {
	o := DefaultRetrievalOptions()
	if len(opts) > 0 {
		o = opts[0]
	}
	return s.retriever.Search(projectID, query, o)
}

// GetStats returns indexing statistics for a project
func (s *Service) GetStats(projectID int) (map[string]interface{}, error) {
	counts, err := s.store.CountByType(projectID)
	if err != nil {
		return nil, err
	}

	total := 0
	typeCounts := make(map[string]int)
	for ct, count := range counts {
		total += count
		typeCounts[string(ct)] = count
	}

	return map[string]interface{}{
		"total_chunks":     total,
		"by_type":          typeCounts,
		"embedding_provider": s.embedder.ActiveProvider(),
		"embedding_dims":   s.embedder.Dimensions(),
		"indexing_active":  s.indexer.IsRunning(),
	}, nil
}
