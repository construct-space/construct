package rag

import (
	"fmt"
	"os"
	"strings"
)

// RetrievalOptions configures search behavior
type RetrievalOptions struct {
	TopK         int           // Number of results to return (default 5)
	ContentTypes []ContentType // Filter by content type (empty = all)
	MinScore     float64       // Minimum relevance score (default 0.1)
	HybridAlpha  float64       // Weight for semantic vs keyword (0=keyword, 1=semantic, default 0.7)
}

// DefaultRetrievalOptions returns reasonable defaults
func DefaultRetrievalOptions() RetrievalOptions {
	return RetrievalOptions{
		TopK:        5,
		MinScore:    0.1,
		HybridAlpha: 0.7,
	}
}

// Retriever performs hybrid semantic+keyword search over indexed content
type Retriever struct {
	store    *Store
	embedder *EmbeddingManager
}

// NewRetriever creates a new retriever
func NewRetriever(store *Store, embedder *EmbeddingManager) *Retriever {
	return &Retriever{
		store:    store,
		embedder: embedder,
	}
}

// Search performs hybrid retrieval combining semantic and keyword search.
// Returns ranked results relevant to the query.
func (r *Retriever) Search(projectID int, query string, opts RetrievalOptions) ([]SearchResult, error) {
	if opts.TopK == 0 {
		opts = DefaultRetrievalOptions()
	}

	// Extract keyword terms
	queryTerms := ExtractKeyTerms(query)

	// Try semantic search
	var semanticResults []SearchResult
	queryEmbeddings, err := r.embedder.Embed([]string{query})
	if err != nil {
		fmt.Fprintf(os.Stderr, "[rag] semantic search unavailable: %v, falling back to keyword\n", err)
	} else if len(queryEmbeddings) > 0 {
		semanticResults, err = r.store.SearchSemantic(projectID, queryEmbeddings[0], opts.TopK*2, opts.ContentTypes...)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[rag] semantic search error: %v\n", err)
		}
	}

	// Always do keyword search as supplement
	keywordResults, err := r.store.SearchKeyword(projectID, queryTerms, opts.TopK*2, opts.ContentTypes...)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[rag] keyword search error: %v\n", err)
	}

	// Merge results with hybrid scoring
	merged := mergeResults(semanticResults, keywordResults, opts.HybridAlpha)

	// Filter by minimum score
	var filtered []SearchResult
	for _, r := range merged {
		if r.Score >= opts.MinScore {
			filtered = append(filtered, r)
		}
	}

	// Trim to topK
	if len(filtered) > opts.TopK {
		filtered = filtered[:opts.TopK]
	}

	return filtered, nil
}

// SearchSemantic performs pure semantic search (requires embedding provider)
func (r *Retriever) SearchSemantic(projectID int, query string, topK int, contentTypes ...ContentType) ([]SearchResult, error) {
	queryEmbeddings, err := r.embedder.Embed([]string{query})
	if err != nil {
		return nil, fmt.Errorf("embedding query failed: %w", err)
	}
	if len(queryEmbeddings) == 0 {
		return nil, fmt.Errorf("no embedding returned for query")
	}
	return r.store.SearchSemantic(projectID, queryEmbeddings[0], topK, contentTypes...)
}

// SearchKeyword performs pure keyword search (no API needed)
func (r *Retriever) SearchKeyword(projectID int, query string, topK int, contentTypes ...ContentType) ([]SearchResult, error) {
	terms := ExtractKeyTerms(query)
	return r.store.SearchKeyword(projectID, terms, topK, contentTypes...)
}

// FormatResults formats search results as context text for LLM consumption
func FormatResults(results []SearchResult, maxTokens int) string {
	if len(results) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("## Relevant Project Context (from RAG)\n\n")

	totalTokens := 0
	for i, r := range results {
		// Estimate tokens for this chunk
		chunkTokens := estimateTokens(r.Record.ChunkText)
		if totalTokens+chunkTokens > maxTokens && i > 0 {
			sb.WriteString(fmt.Sprintf("\n... (%d more results omitted due to token budget)\n", len(results)-i))
			break
		}

		// Format based on content type
		switch r.Record.ContentType {
		case ContentTypeCode:
			sb.WriteString(fmt.Sprintf("### %s (relevance: %.0f%%)\n", r.Record.SourcePath, r.Score*100))
			sb.WriteString("```\n")
			sb.WriteString(r.Record.ChunkText)
			sb.WriteString("\n```\n\n")
		case ContentTypeDoc:
			sb.WriteString(fmt.Sprintf("### Document: %s (relevance: %.0f%%)\n", r.Record.SourceName, r.Score*100))
			sb.WriteString(r.Record.ChunkText)
			sb.WriteString("\n\n")
		case ContentTypeDesign:
			sb.WriteString(fmt.Sprintf("### Design: %s (relevance: %.0f%%)\n", r.Record.SourceName, r.Score*100))
			sb.WriteString(r.Record.ChunkText)
			sb.WriteString("\n\n")
		case ContentTypeTask:
			sb.WriteString(fmt.Sprintf("### %s (relevance: %.0f%%)\n", r.Record.SourceName, r.Score*100))
			sb.WriteString(r.Record.ChunkText)
			sb.WriteString("\n\n")
		default:
			sb.WriteString(fmt.Sprintf("### %s (relevance: %.0f%%)\n", r.Record.SourcePath, r.Score*100))
			sb.WriteString(r.Record.ChunkText)
			sb.WriteString("\n\n")
		}

		totalTokens += chunkTokens
	}

	return sb.String()
}

// --- Hybrid merge ---

// mergeResults combines semantic and keyword results with weighted scoring
func mergeResults(semantic, keyword []SearchResult, alpha float64) []SearchResult {
	// Index results by unique key (source_path + chunk_index)
	type resultKey struct {
		path  string
		chunk int
	}

	merged := make(map[resultKey]*SearchResult)

	// Add semantic results
	for _, r := range semantic {
		key := resultKey{r.Record.SourcePath, r.Record.ChunkIndex}
		merged[key] = &SearchResult{
			Record:    r.Record,
			Score:     r.Score * alpha,
			MatchType: "semantic",
		}
	}

	// Merge keyword results
	for _, r := range keyword {
		key := resultKey{r.Record.SourcePath, r.Record.ChunkIndex}
		if existing, ok := merged[key]; ok {
			existing.Score += r.Score * (1 - alpha)
			existing.MatchType = "hybrid"
		} else {
			merged[key] = &SearchResult{
				Record:    r.Record,
				Score:     r.Score * (1 - alpha),
				MatchType: "keyword",
			}
		}
	}

	// Collect and sort
	var results []SearchResult
	for _, r := range merged {
		results = append(results, *r)
	}

	sortSearchResults(results)
	return results
}
