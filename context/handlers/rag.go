package handlers

import (
	"encoding/json"

	"construct-context/rag"
	"construct-context/svc"
)

// HandleRAG handles RAG-related requests from the frontend
func HandleRAG(s *svc.Service, req svc.Request) svc.Response {
	if s.RAG == nil {
		return svc.Response{ID: req.ID, Success: false, Error: "RAG service not initialized"}
	}

	switch req.Type {
	case "rag.search":
		return handleRAGSearch(s, req)
	case "rag.index":
		return handleRAGIndex(s, req)
	case "rag.stats":
		return handleRAGStats(s, req)
	case "rag.index_file":
		return handleRAGIndexFile(s, req)
	case "rag.index_document":
		return handleRAGIndexDocument(s, req)
	default:
		return svc.Response{ID: req.ID, Success: false, Error: "Unknown RAG request type: " + req.Type}
	}
}

func handleRAGSearch(s *svc.Service, req svc.Request) svc.Response {
	var payload struct {
		Query       string `json:"query"`
		ProjectID   int    `json:"project_id"`
		ContentType string `json:"content_type,omitempty"`
		TopK        int    `json:"top_k,omitempty"`
	}
	if err := json.Unmarshal(req.Payload, &payload); err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Invalid payload: " + err.Error()}
	}
	if payload.Query == "" {
		return svc.Response{ID: req.ID, Success: false, Error: "Query is required"}
	}

	opts := rag.DefaultRetrievalOptions()
	if payload.TopK > 0 {
		opts.TopK = payload.TopK
	}
	if payload.ContentType != "" {
		opts.ContentTypes = []rag.ContentType{rag.ContentType(payload.ContentType)}
	}

	results, err := s.RAG.Search(payload.ProjectID, payload.Query, opts)
	if err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Search failed: " + err.Error()}
	}

	// Format results for frontend
	type searchResult struct {
		SourcePath  string  `json:"source_path"`
		SourceName  string  `json:"source_name"`
		ContentType string  `json:"content_type"`
		ChunkText   string  `json:"chunk_text"`
		Score       float64 `json:"score"`
		MatchType   string  `json:"match_type"`
	}
	var formattedResults []searchResult
	for _, r := range results {
		formattedResults = append(formattedResults, searchResult{
			SourcePath:  r.Record.SourcePath,
			SourceName:  r.Record.SourceName,
			ContentType: string(r.Record.ContentType),
			ChunkText:   r.Record.ChunkText,
			Score:       r.Score,
			MatchType:   r.MatchType,
		})
	}

	return svc.Response{ID: req.ID, Success: true, Data: formattedResults}
}

func handleRAGIndex(s *svc.Service, req svc.Request) svc.Response {
	var payload struct {
		ProjectID  int    `json:"project_id"`
		ProjectDir string `json:"project_dir"`
	}
	if err := json.Unmarshal(req.Payload, &payload); err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Invalid payload: " + err.Error()}
	}
	if payload.ProjectDir == "" {
		return svc.Response{ID: req.ID, Success: false, Error: "project_dir is required"}
	}
	if payload.ProjectID == 0 {
		return svc.Response{ID: req.ID, Success: false, Error: "project_id is required"}
	}

	if s.RAG.Indexer().IsRunning() {
		return svc.Response{ID: req.ID, Success: true, Data: map[string]interface{}{
			"status":  "already_running",
			"message": "Indexing is already in progress",
		}}
	}

	// Start async indexing
	s.RAG.IndexProjectAsync(payload.ProjectID, payload.ProjectDir)

	return svc.Response{ID: req.ID, Success: true, Data: map[string]interface{}{
		"status":  "started",
		"message": "Background indexing started",
	}}
}

func handleRAGStats(s *svc.Service, req svc.Request) svc.Response {
	var payload struct {
		ProjectID int `json:"project_id"`
	}
	if err := json.Unmarshal(req.Payload, &payload); err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Invalid payload: " + err.Error()}
	}

	stats, err := s.RAG.GetStats(payload.ProjectID)
	if err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Stats error: " + err.Error()}
	}

	return svc.Response{ID: req.ID, Success: true, Data: stats}
}

func handleRAGIndexFile(s *svc.Service, req svc.Request) svc.Response {
	var payload struct {
		ProjectID  int    `json:"project_id"`
		ProjectDir string `json:"project_dir"`
		FilePath   string `json:"file_path"`
	}
	if err := json.Unmarshal(req.Payload, &payload); err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Invalid payload: " + err.Error()}
	}

	err := s.RAG.Indexer().IndexFile(payload.ProjectID, payload.ProjectDir, payload.FilePath)
	if err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Index file error: " + err.Error()}
	}

	return svc.Response{ID: req.ID, Success: true, Data: map[string]string{"status": "indexed"}}
}

func handleRAGIndexDocument(s *svc.Service, req svc.Request) svc.Response {
	var payload struct {
		ProjectID   int    `json:"project_id"`
		DocID       string `json:"doc_id"`
		Title       string `json:"title"`
		Content     string `json:"content"`
		ContentType string `json:"content_type"`
	}
	if err := json.Unmarshal(req.Payload, &payload); err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Invalid payload: " + err.Error()}
	}

	ct := rag.ContentTypeDoc
	if payload.ContentType != "" {
		ct = rag.ContentType(payload.ContentType)
	}

	err := s.RAG.Indexer().IndexDocument(payload.ProjectID, payload.DocID, payload.Title, payload.Content, ct)
	if err != nil {
		return svc.Response{ID: req.ID, Success: false, Error: "Index doc error: " + err.Error()}
	}

	return svc.Response{ID: req.ID, Success: true, Data: map[string]string{"status": "indexed"}}
}
