package rag

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode"
)

// EmbeddingProvider generates vector embeddings from text
type EmbeddingProvider interface {
	// Embed generates embeddings for a batch of texts
	Embed(texts []string) ([][]float32, error)
	// Dimensions returns the embedding dimension size
	Dimensions() int
	// Name returns the provider name for logging
	Name() string
}

// --- Gemini Embedding Provider ---

// GeminiEmbedder uses Google's text-embedding-004 model
type GeminiEmbedder struct {
	apiKey string
	client *http.Client
}

// NewGeminiEmbedder creates a Gemini embedding provider
func NewGeminiEmbedder(apiKey string) *GeminiEmbedder {
	return &GeminiEmbedder{
		apiKey: apiKey,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (g *GeminiEmbedder) Name() string     { return "gemini" }
func (g *GeminiEmbedder) Dimensions() int   { return 768 }

func (g *GeminiEmbedder) Embed(texts []string) ([][]float32, error) {
	if g.apiKey == "" {
		return nil, fmt.Errorf("gemini API key not configured")
	}

	// Gemini batch embedding endpoint
	type contentPart struct {
		Text string `json:"text"`
	}
	type content struct {
		Parts []contentPart `json:"parts"`
	}
	type embedRequest struct {
		Content content `json:"content"`
	}
	type batchRequest struct {
		Requests []embedRequest `json:"requests"`
	}

	// Build batch request (Gemini supports up to 100 per batch)
	var allEmbeddings [][]float32
	batchSize := 100

	for i := 0; i < len(texts); i += batchSize {
		end := i + batchSize
		if end > len(texts) {
			end = len(texts)
		}
		batch := texts[i:end]

		requests := make([]embedRequest, len(batch))
		for j, text := range batch {
			requests[j] = embedRequest{
				Content: content{
					Parts: []contentPart{{Text: text}},
				},
			}
		}

		body, _ := json.Marshal(batchRequest{Requests: requests})
		url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=%s", g.apiKey)

		resp, err := g.client.Post(url, "application/json", bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("gemini embed request failed: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			bodyBytes, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("gemini embed error %d: %s", resp.StatusCode, string(bodyBytes))
		}

		var result struct {
			Embeddings []struct {
				Values []float32 `json:"values"`
			} `json:"embeddings"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return nil, fmt.Errorf("gemini embed decode failed: %w", err)
		}

		for _, emb := range result.Embeddings {
			allEmbeddings = append(allEmbeddings, emb.Values)
		}
	}

	return allEmbeddings, nil
}

// --- OpenAI-Compatible Embedding Provider ---

// OpenAIEmbedder works with OpenAI and compatible APIs (DeepSeek, etc.)
type OpenAIEmbedder struct {
	apiKey  string
	baseURL string
	model   string
	dims    int
	client  *http.Client
}

// NewOpenAIEmbedder creates an OpenAI-compatible embedding provider
func NewOpenAIEmbedder(apiKey, baseURL, model string, dims int) *OpenAIEmbedder {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "text-embedding-3-small"
	}
	if dims == 0 {
		dims = 1536
	}
	return &OpenAIEmbedder{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(baseURL, "/"),
		model:   model,
		dims:    dims,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (o *OpenAIEmbedder) Name() string     { return "openai" }
func (o *OpenAIEmbedder) Dimensions() int   { return o.dims }

func (o *OpenAIEmbedder) Embed(texts []string) ([][]float32, error) {
	if o.apiKey == "" {
		return nil, fmt.Errorf("openai API key not configured")
	}

	type embedReq struct {
		Input []string `json:"input"`
		Model string   `json:"model"`
	}

	var allEmbeddings [][]float32
	batchSize := 2048 // OpenAI supports up to 2048 inputs

	for i := 0; i < len(texts); i += batchSize {
		end := i + batchSize
		if end > len(texts) {
			end = len(texts)
		}
		batch := texts[i:end]

		body, _ := json.Marshal(embedReq{Input: batch, Model: o.model})
		req, _ := http.NewRequest("POST", o.baseURL+"/embeddings", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+o.apiKey)

		resp, err := o.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("openai embed request failed: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			bodyBytes, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("openai embed error %d: %s", resp.StatusCode, string(bodyBytes))
		}

		var result struct {
			Data []struct {
				Embedding []float32 `json:"embedding"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return nil, fmt.Errorf("openai embed decode failed: %w", err)
		}

		for _, d := range result.Data {
			allEmbeddings = append(allEmbeddings, d.Embedding)
		}
	}

	return allEmbeddings, nil
}

// --- Local TF-IDF Embedder (Offline Fallback) ---

// LocalEmbedder generates simple bag-of-words embeddings locally without API calls.
// Uses term frequency with IDF-like weighting. Useful as offline fallback.
type LocalEmbedder struct {
	vocabSize int
}

// NewLocalEmbedder creates a local embedding provider
func NewLocalEmbedder() *LocalEmbedder {
	return &LocalEmbedder{vocabSize: 512}
}

func (l *LocalEmbedder) Name() string     { return "local" }
func (l *LocalEmbedder) Dimensions() int   { return l.vocabSize }

func (l *LocalEmbedder) Embed(texts []string) ([][]float32, error) {
	results := make([][]float32, len(texts))
	for i, text := range texts {
		results[i] = l.embedSingle(text)
	}
	return results, nil
}

func (l *LocalEmbedder) embedSingle(text string) []float32 {
	tokens := tokenize(text)
	vec := make([]float32, l.vocabSize)

	for _, token := range tokens {
		// Hash token to bucket (simple feature hashing)
		h := fnv32(token)
		idx := int(h % uint32(l.vocabSize))
		// Alternate sign based on secondary hash to reduce collisions
		if h>>16&1 == 0 {
			vec[idx] += 1.0
		} else {
			vec[idx] -= 1.0
		}
	}

	// L2 normalize
	var norm float64
	for _, v := range vec {
		norm += float64(v) * float64(v)
	}
	if norm > 0 {
		norm = math.Sqrt(norm)
		for i := range vec {
			vec[i] = float32(float64(vec[i]) / norm)
		}
	}

	return vec
}

// --- Embedding Manager ---

// EmbeddingManager manages embedding providers with fallback chain
type EmbeddingManager struct {
	providers []EmbeddingProvider
}

// NewEmbeddingManager creates a manager with available embedding providers.
// It auto-detects configured API keys and falls back to local embeddings.
func NewEmbeddingManager() *EmbeddingManager {
	m := &EmbeddingManager{}

	// Try Gemini first (free tier, good quality)
	if key := os.Getenv("GEMINI_API_KEY"); key != "" {
		m.providers = append(m.providers, NewGeminiEmbedder(key))
	}

	// Try OpenAI
	if key := os.Getenv("OPENAI_API_KEY"); key != "" {
		m.providers = append(m.providers, NewOpenAIEmbedder(key, "", "", 0))
	}

	// Always have local fallback
	m.providers = append(m.providers, NewLocalEmbedder())

	return m
}

// AddProvider adds a custom embedding provider (highest priority)
func (m *EmbeddingManager) AddProvider(p EmbeddingProvider) {
	m.providers = append([]EmbeddingProvider{p}, m.providers...)
}

// Embed generates embeddings using the first available provider
func (m *EmbeddingManager) Embed(texts []string) ([][]float32, error) {
	if len(m.providers) == 0 {
		return nil, fmt.Errorf("no embedding providers configured")
	}

	var lastErr error
	for _, p := range m.providers {
		embeddings, err := p.Embed(texts)
		if err != nil {
			lastErr = err
			fmt.Fprintf(os.Stderr, "[rag] embedding provider %s failed: %v, trying next\n", p.Name(), err)
			continue
		}
		return embeddings, nil
	}

	return nil, fmt.Errorf("all embedding providers failed, last error: %w", lastErr)
}

// ActiveProvider returns the name of the first provider that would be used
func (m *EmbeddingManager) ActiveProvider() string {
	if len(m.providers) == 0 {
		return "none"
	}
	return m.providers[0].Name()
}

// Dimensions returns the embedding dimensions of the active provider
func (m *EmbeddingManager) Dimensions() int {
	if len(m.providers) == 0 {
		return 0
	}
	return m.providers[0].Dimensions()
}

// --- Tokenization helpers ---

// tokenize splits text into lowercase tokens, filtering short/stop words
func tokenize(text string) []string {
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_'
	})

	var tokens []string
	for _, w := range words {
		if len(w) < 2 || isStopWord(w) {
			continue
		}
		tokens = append(tokens, w)
	}
	return tokens
}

// extractKeyTerms extracts the most significant terms from text for keyword search
func ExtractKeyTerms(text string) []string {
	tokens := tokenize(text)
	// Deduplicate
	seen := make(map[string]bool)
	var unique []string
	for _, t := range tokens {
		if !seen[t] {
			seen[t] = true
			unique = append(unique, t)
		}
	}
	return unique
}

var stopWords = map[string]bool{
	"the": true, "a": true, "an": true, "and": true, "or": true, "but": true,
	"in": true, "on": true, "at": true, "to": true, "for": true, "of": true,
	"with": true, "by": true, "is": true, "it": true, "that": true, "this": true,
	"be": true, "as": true, "are": true, "was": true, "were": true, "been": true,
	"have": true, "has": true, "had": true, "do": true, "does": true, "did": true,
	"will": true, "would": true, "could": true, "should": true, "may": true,
	"can": true, "not": true, "no": true, "if": true, "from": true, "so": true,
	"we": true, "you": true, "he": true, "she": true, "they": true, "me": true,
	"my": true, "your": true, "its": true, "our": true, "their": true,
	"what": true, "which": true, "who": true, "when": true, "where": true,
	"how": true, "all": true, "each": true, "every": true, "both": true,
	"i": true, "am": true, "im": true,
}

func isStopWord(w string) bool {
	return stopWords[w]
}

// fnv32 computes FNV-1a hash for a string
func fnv32(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}
