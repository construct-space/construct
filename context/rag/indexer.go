package rag

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Indexer handles background indexing of project content
type Indexer struct {
	store    *Store
	embedder *EmbeddingManager
	opts     IndexerOptions

	mu       sync.Mutex
	running  bool
	cancel   chan struct{}
	stats    IndexStats
}

// IndexerOptions configures the indexer behavior
type IndexerOptions struct {
	ChunkOptions  ChunkOptions
	MaxFileSize   int64    // Skip files larger than this (default 500KB)
	MaxFiles      int      // Maximum files to index (default 5000)
	SkipDirs      []string // Directories to skip
	SkipExts      []string // File extensions to skip
	BatchSize     int      // Embeddings batch size (default 50)
}

// DefaultIndexerOptions returns reasonable defaults
func DefaultIndexerOptions() IndexerOptions {
	return IndexerOptions{
		ChunkOptions: DefaultChunkOptions(),
		MaxFileSize:  500 * 1024, // 500KB
		MaxFiles:     5000,
		SkipDirs: []string{
			"node_modules", ".git", ".svn", ".hg", "vendor", "__pycache__",
			".next", ".nuxt", "dist", "build", ".output", "coverage",
			".vscode", ".idea", ".cache", "tmp", ".tmp",
		},
		SkipExts: []string{
			".exe", ".dll", ".so", ".dylib", ".o", ".a",
			".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
			".mp3", ".mp4", ".wav", ".avi", ".mov",
			".zip", ".tar", ".gz", ".bz2", ".rar",
			".woff", ".woff2", ".ttf", ".eot",
			".lock", ".sum",
			".min.js", ".min.css",
			".map",
		},
		BatchSize: 50,
	}
}

// IndexStats tracks indexing progress
type IndexStats struct {
	TotalFiles    int           `json:"total_files"`
	IndexedFiles  int           `json:"indexed_files"`
	SkippedFiles  int           `json:"skipped_files"`
	TotalChunks   int           `json:"total_chunks"`
	EmbeddedChunks int          `json:"embedded_chunks"`
	Duration      time.Duration `json:"duration"`
	Errors        []string      `json:"errors,omitempty"`
}

// NewIndexer creates a new background indexer
func NewIndexer(store *Store, embedder *EmbeddingManager, opts IndexerOptions) *Indexer {
	if opts.MaxFileSize == 0 {
		opts = DefaultIndexerOptions()
	}
	return &Indexer{
		store:    store,
		embedder: embedder,
		opts:     opts,
		cancel:   make(chan struct{}),
	}
}

// IndexProject indexes all files in a project directory.
// Only re-indexes files that have changed since last index.
func (idx *Indexer) IndexProject(projectID int, projectDir string) (*IndexStats, error) {
	idx.mu.Lock()
	if idx.running {
		idx.mu.Unlock()
		return nil, fmt.Errorf("indexing already in progress")
	}
	idx.running = true
	idx.cancel = make(chan struct{})
	idx.stats = IndexStats{}
	idx.mu.Unlock()

	defer func() {
		idx.mu.Lock()
		idx.running = false
		idx.mu.Unlock()
	}()

	start := time.Now()
	fmt.Fprintf(os.Stderr, "[rag] starting project indexing: %s (project %d)\n", projectDir, projectID)

	// Collect files to index
	files, err := idx.collectFiles(projectDir)
	if err != nil {
		return nil, fmt.Errorf("collecting files: %w", err)
	}
	idx.stats.TotalFiles = len(files)
	fmt.Fprintf(os.Stderr, "[rag] found %d indexable files\n", len(files))

	// Process files in batches
	var allChunks []*EmbeddingRecord
	for _, file := range files {
		select {
		case <-idx.cancel:
			fmt.Fprintf(os.Stderr, "[rag] indexing cancelled\n")
			idx.stats.Duration = time.Since(start)
			return &idx.stats, nil
		default:
		}

		relPath, _ := filepath.Rel(projectDir, file)
		if relPath == "" {
			relPath = file
		}

		// Check if file has changed since last index
		hash, err := fileHash(file)
		if err != nil {
			idx.stats.SkippedFiles++
			continue
		}

		lastHash, _, err := idx.store.GetIndexState(projectID, relPath)
		if err == nil && lastHash == hash {
			idx.stats.SkippedFiles++
			continue // File hasn't changed
		}

		// Read and chunk file
		content, err := os.ReadFile(file)
		if err != nil {
			idx.stats.Errors = append(idx.stats.Errors, fmt.Sprintf("read %s: %v", relPath, err))
			idx.stats.SkippedFiles++
			continue
		}

		chunks := ChunkCode(string(content), relPath, idx.opts.ChunkOptions)
		if len(chunks) == 0 {
			idx.stats.SkippedFiles++
			continue
		}

		// Create embedding records
		for _, chunk := range chunks {
			rec := &EmbeddingRecord{
				ProjectID:   projectID,
				ContentType: ContentTypeCode,
				SourcePath:  relPath,
				SourceName:  filepath.Base(file),
				ChunkIndex:  chunk.Index,
				ChunkText:   chunk.Text,
			}
			allChunks = append(allChunks, rec)
		}

		// Update index state
		if err := idx.store.SetIndexState(projectID, relPath, ContentTypeCode, hash); err != nil {
			idx.stats.Errors = append(idx.stats.Errors, fmt.Sprintf("set index state %s: %v", relPath, err))
		}

		idx.stats.IndexedFiles++
		idx.stats.TotalChunks += len(chunks)

		// Batch embed when we have enough chunks
		if len(allChunks) >= idx.opts.BatchSize {
			if err := idx.embedAndStore(allChunks); err != nil {
				idx.stats.Errors = append(idx.stats.Errors, fmt.Sprintf("embed batch: %v", err))
			}
			allChunks = nil
		}
	}

	// Process remaining chunks
	if len(allChunks) > 0 {
		if err := idx.embedAndStore(allChunks); err != nil {
			idx.stats.Errors = append(idx.stats.Errors, fmt.Sprintf("embed final batch: %v", err))
		}
	}

	idx.stats.Duration = time.Since(start)
	fmt.Fprintf(os.Stderr, "[rag] indexing complete: %d files, %d chunks in %v\n",
		idx.stats.IndexedFiles, idx.stats.TotalChunks, idx.stats.Duration)

	return &idx.stats, nil
}

// IndexFile indexes a single file (for incremental updates)
func (idx *Indexer) IndexFile(projectID int, projectDir, filePath string) error {
	relPath, _ := filepath.Rel(projectDir, filePath)
	if relPath == "" {
		relPath = filePath
	}

	// Check if file should be skipped
	if idx.shouldSkipFile(filePath) {
		return nil
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	hash := hashBytes(content)
	lastHash, _, _ := idx.store.GetIndexState(projectID, relPath)
	if lastHash == hash {
		return nil // No changes
	}

	// Delete old embeddings for this source
	if err := idx.store.DeleteBySource(projectID, relPath); err != nil {
		return fmt.Errorf("delete old embeddings: %w", err)
	}

	chunks := ChunkCode(string(content), relPath, idx.opts.ChunkOptions)
	if len(chunks) == 0 {
		return nil
	}

	var records []*EmbeddingRecord
	for _, chunk := range chunks {
		records = append(records, &EmbeddingRecord{
			ProjectID:   projectID,
			ContentType: ContentTypeCode,
			SourcePath:  relPath,
			SourceName:  filepath.Base(filePath),
			ChunkIndex:  chunk.Index,
			ChunkText:   chunk.Text,
		})
	}

	if err := idx.embedAndStore(records); err != nil {
		return err
	}

	return idx.store.SetIndexState(projectID, relPath, ContentTypeCode, hash)
}

// IndexDocument indexes a document or note
func (idx *Indexer) IndexDocument(projectID int, docID, title, content string, contentType ContentType) error {
	if content == "" {
		return nil
	}

	hash := hashBytes([]byte(content))
	lastHash, _, _ := idx.store.GetIndexState(projectID, docID)
	if lastHash == hash {
		return nil
	}

	// Delete old embeddings
	if err := idx.store.DeleteBySource(projectID, docID); err != nil {
		return err
	}

	chunks := ChunkDocument(content, title, idx.opts.ChunkOptions)
	if len(chunks) == 0 {
		return nil
	}

	var records []*EmbeddingRecord
	for _, chunk := range chunks {
		records = append(records, &EmbeddingRecord{
			ProjectID:   projectID,
			ContentType: contentType,
			SourcePath:  docID,
			SourceName:  title,
			ChunkIndex:  chunk.Index,
			ChunkText:   chunk.Text,
		})
	}

	if err := idx.embedAndStore(records); err != nil {
		return err
	}

	return idx.store.SetIndexState(projectID, docID, contentType, hash)
}

// IndexTask indexes a task/ticket
func (idx *Indexer) IndexTask(projectID int, taskID int, title, description, status string) error {
	sourcePath := fmt.Sprintf("task-%d", taskID)
	content := title + "\n" + description

	hash := hashBytes([]byte(content))
	lastHash, _, _ := idx.store.GetIndexState(projectID, sourcePath)
	if lastHash == hash {
		return nil
	}

	if err := idx.store.DeleteBySource(projectID, sourcePath); err != nil {
		return err
	}

	chunks := ChunkTask(title, description, status, taskID)
	var records []*EmbeddingRecord
	for _, chunk := range chunks {
		records = append(records, &EmbeddingRecord{
			ProjectID:   projectID,
			ContentType: ContentTypeTask,
			SourcePath:  sourcePath,
			SourceName:  fmt.Sprintf("Task #%d: %s", taskID, title),
			ChunkIndex:  chunk.Index,
			ChunkText:   chunk.Text,
		})
	}

	if err := idx.embedAndStore(records); err != nil {
		return err
	}

	return idx.store.SetIndexState(projectID, sourcePath, ContentTypeTask, hash)
}

// Cancel stops an in-progress indexing operation
func (idx *Indexer) Cancel() {
	idx.mu.Lock()
	defer idx.mu.Unlock()
	if idx.running {
		close(idx.cancel)
	}
}

// IsRunning returns whether indexing is in progress
func (idx *Indexer) IsRunning() bool {
	idx.mu.Lock()
	defer idx.mu.Unlock()
	return idx.running
}

// Stats returns current indexing statistics
func (idx *Indexer) Stats() IndexStats {
	idx.mu.Lock()
	defer idx.mu.Unlock()
	return idx.stats
}

// --- Internal helpers ---

func (idx *Indexer) embedAndStore(records []*EmbeddingRecord) error {
	// Extract texts for embedding
	texts := make([]string, len(records))
	for i, rec := range records {
		texts[i] = rec.ChunkText
	}

	// Generate embeddings
	embeddings, err := idx.embedder.Embed(texts)
	if err != nil {
		// Store without embeddings (keyword search still works)
		fmt.Fprintf(os.Stderr, "[rag] embedding failed, storing without vectors: %v\n", err)
		return idx.store.InsertBatch(records)
	}

	// Attach embeddings to records
	for i, emb := range embeddings {
		if i < len(records) {
			records[i].Embedding = emb
		}
	}

	idx.mu.Lock()
	idx.stats.EmbeddedChunks += len(embeddings)
	idx.mu.Unlock()

	return idx.store.InsertBatch(records)
}

func (idx *Indexer) collectFiles(dir string) ([]string, error) {
	var files []string
	skipDirs := make(map[string]bool)
	for _, d := range idx.opts.SkipDirs {
		skipDirs[d] = true
	}

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			name := d.Name()
			if strings.HasPrefix(name, ".") || skipDirs[name] {
				return filepath.SkipDir
			}
			return nil
		}

		if len(files) >= idx.opts.MaxFiles {
			return filepath.SkipAll
		}

		if idx.shouldSkipFile(path) {
			return nil
		}

		// Check file size
		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.Size() > idx.opts.MaxFileSize || info.Size() == 0 {
			return nil
		}

		files = append(files, path)
		return nil
	})

	return files, err
}

func (idx *Indexer) shouldSkipFile(path string) bool {
	lower := strings.ToLower(path)

	// Check skip extensions
	for _, ext := range idx.opts.SkipExts {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}

	// Check if it's a known code/text file
	ext := filepath.Ext(lower)
	if _, ok := langExtensions[ext]; ok {
		return false
	}

	// Skip files without recognized extensions
	// but allow common config files
	base := filepath.Base(lower)
	allowed := map[string]bool{
		"makefile": true, "dockerfile": true, "readme": true,
		".env.example": true, ".gitignore": true, ".eslintrc": true,
		"tsconfig.json": true, "package.json": true, "cargo.toml": true,
	}
	if allowed[base] {
		return false
	}

	return ext == "" || ext == "." // Skip extensionless files
}

// --- Hashing ---

func fileHash(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return hashBytes(data), nil
}

func hashBytes(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:16]) // First 128 bits is sufficient
}
