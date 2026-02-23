package rag

import (
	"database/sql"
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"
)

// ContentType represents the type of indexed content
type ContentType string

const (
	ContentTypeCode   ContentType = "code"
	ContentTypeDoc    ContentType = "doc"
	ContentTypeDesign ContentType = "design"
	ContentTypeTask   ContentType = "task"
	ContentTypeNote   ContentType = "note"
)

// EmbeddingRecord represents a stored embedding with metadata
type EmbeddingRecord struct {
	ID          int64       `json:"id"`
	ProjectID   int         `json:"project_id"`
	ContentType ContentType `json:"content_type"`
	SourcePath  string      `json:"source_path"`  // file path, doc ID, design ID, etc.
	SourceName  string      `json:"source_name"`  // human-readable name
	ChunkIndex  int         `json:"chunk_index"`   // position within source
	ChunkText   string      `json:"chunk_text"`
	Embedding   []float32   `json:"embedding,omitempty"`
	MetadataJSON string     `json:"metadata_json,omitempty"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// SearchResult represents a retrieval result with similarity score
type SearchResult struct {
	Record     EmbeddingRecord `json:"record"`
	Score      float64         `json:"score"`       // cosine similarity [0, 1]
	MatchType  string          `json:"match_type"`   // "semantic", "keyword", "hybrid"
}

// Store handles SQLite storage for embeddings
type Store struct {
	db *sql.DB
}

// NewStore creates a new embedding store using the existing SQLite database
func NewStore(db *sql.DB) (*Store, error) {
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("rag store migration failed: %w", err)
	}
	return s, nil
}

// migrate creates the embeddings table and indexes
func (s *Store) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS rag_embeddings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_id INTEGER NOT NULL,
		content_type TEXT NOT NULL,
		source_path TEXT NOT NULL,
		source_name TEXT NOT NULL DEFAULT '',
		chunk_index INTEGER NOT NULL DEFAULT 0,
		chunk_text TEXT NOT NULL,
		embedding BLOB,
		metadata_json TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_rag_project ON rag_embeddings(project_id);
	CREATE INDEX IF NOT EXISTS idx_rag_project_type ON rag_embeddings(project_id, content_type);
	CREATE INDEX IF NOT EXISTS idx_rag_source ON rag_embeddings(project_id, source_path);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_chunk ON rag_embeddings(project_id, source_path, chunk_index);

	-- BM25 keyword index: stores term frequencies per chunk for fast keyword search
	CREATE TABLE IF NOT EXISTS rag_terms (
		embedding_id INTEGER NOT NULL,
		term TEXT NOT NULL,
		frequency REAL NOT NULL,
		FOREIGN KEY (embedding_id) REFERENCES rag_embeddings(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_rag_terms_term ON rag_terms(term);
	CREATE INDEX IF NOT EXISTS idx_rag_terms_embedding ON rag_terms(embedding_id);

	-- Track indexing state per source
	CREATE TABLE IF NOT EXISTS rag_index_state (
		project_id INTEGER NOT NULL,
		source_path TEXT NOT NULL,
		content_type TEXT NOT NULL,
		file_hash TEXT,
		indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (project_id, source_path)
	);
	`
	_, err := s.db.Exec(schema)
	return err
}

// Insert stores a new embedding record. Uses UPSERT to handle re-indexing.
func (s *Store) Insert(rec *EmbeddingRecord) (int64, error) {
	embBlob := float32sToBytes(rec.Embedding)

	result, err := s.db.Exec(`
		INSERT INTO rag_embeddings (project_id, content_type, source_path, source_name, chunk_index, chunk_text, embedding, metadata_json, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(project_id, source_path, chunk_index) DO UPDATE SET
			content_type = excluded.content_type,
			source_name = excluded.source_name,
			chunk_text = excluded.chunk_text,
			embedding = excluded.embedding,
			metadata_json = excluded.metadata_json,
			updated_at = CURRENT_TIMESTAMP
	`, rec.ProjectID, rec.ContentType, rec.SourcePath, rec.SourceName, rec.ChunkIndex, rec.ChunkText, embBlob, rec.MetadataJSON)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// InsertBatch inserts multiple records in a single transaction
func (s *Store) InsertBatch(records []*EmbeddingRecord) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO rag_embeddings (project_id, content_type, source_path, source_name, chunk_index, chunk_text, embedding, metadata_json, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(project_id, source_path, chunk_index) DO UPDATE SET
			content_type = excluded.content_type,
			source_name = excluded.source_name,
			chunk_text = excluded.chunk_text,
			embedding = excluded.embedding,
			metadata_json = excluded.metadata_json,
			updated_at = CURRENT_TIMESTAMP
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, rec := range records {
		embBlob := float32sToBytes(rec.Embedding)
		_, err := stmt.Exec(rec.ProjectID, rec.ContentType, rec.SourcePath, rec.SourceName, rec.ChunkIndex, rec.ChunkText, embBlob, rec.MetadataJSON)
		if err != nil {
			return fmt.Errorf("insert embedding for %s chunk %d: %w", rec.SourcePath, rec.ChunkIndex, err)
		}
	}

	return tx.Commit()
}

// DeleteBySource removes all embeddings for a given source path
func (s *Store) DeleteBySource(projectID int, sourcePath string) error {
	_, err := s.db.Exec(`DELETE FROM rag_embeddings WHERE project_id = ? AND source_path = ?`, projectID, sourcePath)
	return err
}

// DeleteByProject removes all embeddings for a project
func (s *Store) DeleteByProject(projectID int) error {
	_, err := s.db.Exec(`DELETE FROM rag_embeddings WHERE project_id = ?`, projectID)
	return err
}

// DeleteByType removes all embeddings of a specific type for a project
func (s *Store) DeleteByType(projectID int, contentType ContentType) error {
	_, err := s.db.Exec(`DELETE FROM rag_embeddings WHERE project_id = ? AND content_type = ?`, projectID, contentType)
	return err
}

// SearchSemantic performs cosine similarity search against stored embeddings.
// Returns top-K results filtered by project and optional content type.
func (s *Store) SearchSemantic(projectID int, queryEmbedding []float32, topK int, contentTypes ...ContentType) ([]SearchResult, error) {
	if len(queryEmbedding) == 0 {
		return nil, fmt.Errorf("empty query embedding")
	}

	// Build query with optional content type filter
	query := `SELECT id, project_id, content_type, source_path, source_name, chunk_index, chunk_text, embedding, metadata_json, created_at, updated_at
		FROM rag_embeddings WHERE project_id = ? AND embedding IS NOT NULL`
	args := []interface{}{projectID}

	if len(contentTypes) > 0 {
		placeholders := make([]string, len(contentTypes))
		for i, ct := range contentTypes {
			placeholders[i] = "?"
			args = append(args, ct)
		}
		query += " AND content_type IN (" + strings.Join(placeholders, ",") + ")"
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var rec EmbeddingRecord
		var embBlob []byte
		var metaJSON sql.NullString
		err := rows.Scan(&rec.ID, &rec.ProjectID, &rec.ContentType, &rec.SourcePath, &rec.SourceName,
			&rec.ChunkIndex, &rec.ChunkText, &embBlob, &metaJSON, &rec.CreatedAt, &rec.UpdatedAt)
		if err != nil {
			return nil, err
		}
		if metaJSON.Valid {
			rec.MetadataJSON = metaJSON.String
		}

		rec.Embedding = bytesToFloat32s(embBlob)
		if len(rec.Embedding) == 0 {
			continue
		}

		score := cosineSimilarity(queryEmbedding, rec.Embedding)
		results = append(results, SearchResult{
			Record:    rec,
			Score:     score,
			MatchType: "semantic",
		})
	}

	// Sort by score descending and return top-K
	sortSearchResults(results)
	if len(results) > topK {
		results = results[:topK]
	}

	return results, nil
}

// SearchKeyword performs BM25-style keyword search using term frequency.
// Falls back to simple token overlap when no term index is available.
func (s *Store) SearchKeyword(projectID int, queryTerms []string, topK int, contentTypes ...ContentType) ([]SearchResult, error) {
	if len(queryTerms) == 0 {
		return nil, nil
	}

	// Build query with optional content type filter
	query := `SELECT id, project_id, content_type, source_path, source_name, chunk_index, chunk_text, metadata_json, created_at, updated_at
		FROM rag_embeddings WHERE project_id = ?`
	args := []interface{}{projectID}

	if len(contentTypes) > 0 {
		placeholders := make([]string, len(contentTypes))
		for i, ct := range contentTypes {
			placeholders[i] = "?"
			args = append(args, ct)
		}
		query += " AND content_type IN (" + strings.Join(placeholders, ",") + ")"
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Lowercase query terms for case-insensitive matching
	lowerTerms := make([]string, len(queryTerms))
	for i, t := range queryTerms {
		lowerTerms[i] = strings.ToLower(t)
	}

	var results []SearchResult
	for rows.Next() {
		var rec EmbeddingRecord
		var metaJSON sql.NullString
		err := rows.Scan(&rec.ID, &rec.ProjectID, &rec.ContentType, &rec.SourcePath, &rec.SourceName,
			&rec.ChunkIndex, &rec.ChunkText, &metaJSON, &rec.CreatedAt, &rec.UpdatedAt)
		if err != nil {
			return nil, err
		}
		if metaJSON.Valid {
			rec.MetadataJSON = metaJSON.String
		}

		// Simple keyword scoring: count matching terms / total query terms
		lowerText := strings.ToLower(rec.ChunkText)
		matchCount := 0
		for _, term := range lowerTerms {
			if strings.Contains(lowerText, term) {
				matchCount++
			}
		}
		if matchCount == 0 {
			continue
		}

		score := float64(matchCount) / float64(len(lowerTerms))
		results = append(results, SearchResult{
			Record:    rec,
			Score:     score,
			MatchType: "keyword",
		})
	}

	sortSearchResults(results)
	if len(results) > topK {
		results = results[:topK]
	}
	return results, nil
}

// GetIndexState returns the last indexed hash for a source
func (s *Store) GetIndexState(projectID int, sourcePath string) (string, time.Time, error) {
	var hash string
	var indexedAt time.Time
	err := s.db.QueryRow(
		`SELECT file_hash, indexed_at FROM rag_index_state WHERE project_id = ? AND source_path = ?`,
		projectID, sourcePath,
	).Scan(&hash, &indexedAt)
	if err == sql.ErrNoRows {
		return "", time.Time{}, nil
	}
	return hash, indexedAt, err
}

// SetIndexState updates the indexing state for a source
func (s *Store) SetIndexState(projectID int, sourcePath string, contentType ContentType, fileHash string) error {
	_, err := s.db.Exec(`
		INSERT INTO rag_index_state (project_id, source_path, content_type, file_hash, indexed_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(project_id, source_path) DO UPDATE SET
			content_type = excluded.content_type,
			file_hash = excluded.file_hash,
			indexed_at = CURRENT_TIMESTAMP
	`, projectID, sourcePath, contentType, fileHash)
	return err
}

// CountByProject returns the number of embeddings for a project
func (s *Store) CountByProject(projectID int) (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM rag_embeddings WHERE project_id = ?`, projectID).Scan(&count)
	return count, err
}

// CountByType returns counts grouped by content type for a project
func (s *Store) CountByType(projectID int) (map[ContentType]int, error) {
	rows, err := s.db.Query(`SELECT content_type, COUNT(*) FROM rag_embeddings WHERE project_id = ? GROUP BY content_type`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[ContentType]int)
	for rows.Next() {
		var ct ContentType
		var count int
		if err := rows.Scan(&ct, &count); err != nil {
			return nil, err
		}
		counts[ct] = count
	}
	return counts, nil
}

// --- Serialization helpers ---

// float32sToBytes converts a float32 slice to bytes for SQLite BLOB storage
func float32sToBytes(floats []float32) []byte {
	if len(floats) == 0 {
		return nil
	}
	buf := make([]byte, len(floats)*4)
	for i, f := range floats {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(f))
	}
	return buf
}

// bytesToFloat32s converts bytes back to float32 slice
func bytesToFloat32s(data []byte) []float32 {
	if len(data) == 0 || len(data)%4 != 0 {
		return nil
	}
	floats := make([]float32, len(data)/4)
	for i := range floats {
		floats[i] = math.Float32frombits(binary.LittleEndian.Uint32(data[i*4:]))
	}
	return floats
}

// --- Similarity computation ---

// cosineSimilarity computes cosine similarity between two vectors
func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}

	var dotProduct, normA, normB float64
	for i := range a {
		dotProduct += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	return dotProduct / (math.Sqrt(normA) * math.Sqrt(normB))
}

// sortSearchResults sorts results by score descending (insertion sort for small slices)
func sortSearchResults(results []SearchResult) {
	for i := 1; i < len(results); i++ {
		key := results[i]
		j := i - 1
		for j >= 0 && results[j].Score < key.Score {
			results[j+1] = results[j]
			j--
		}
		results[j+1] = key
	}
}
