package rag

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// ChunkOptions configures the chunking behavior
type ChunkOptions struct {
	MaxChunkSize    int  // Maximum tokens per chunk (default 512)
	OverlapSize     int  // Token overlap between chunks (default 64)
	IncludeMetadata bool // Include file path, language in chunk text
}

// DefaultChunkOptions returns reasonable defaults
func DefaultChunkOptions() ChunkOptions {
	return ChunkOptions{
		MaxChunkSize:    512,
		OverlapSize:     64,
		IncludeMetadata: true,
	}
}

// Chunk represents a piece of a document
type Chunk struct {
	Text       string            `json:"text"`
	Index      int               `json:"index"`      // Position in source
	StartLine  int               `json:"start_line"`  // Line number in source
	EndLine    int               `json:"end_line"`
	Language   string            `json:"language,omitempty"`
	Symbol     string            `json:"symbol,omitempty"` // Function/class name if detected
	Metadata   map[string]string `json:"metadata,omitempty"`
}

// ChunkCode splits a source code file into semantic chunks.
// It tries to split on function/class boundaries first, then falls back to fixed-size.
func ChunkCode(content string, filePath string, opts ChunkOptions) []Chunk {
	if opts.MaxChunkSize == 0 {
		opts = DefaultChunkOptions()
	}

	lang := detectLanguage(filePath)
	lines := strings.Split(content, "\n")

	// Try semantic chunking based on code structure
	chunks := chunkByCodeBoundaries(lines, lang, opts)

	// If semantic chunking produced nothing useful, fall back to fixed-size
	if len(chunks) == 0 {
		chunks = chunkFixedSize(lines, opts)
	}

	// Add metadata to each chunk
	for i := range chunks {
		chunks[i].Language = lang
		if opts.IncludeMetadata {
			prefix := fmt.Sprintf("// File: %s (lines %d-%d)", filePath, chunks[i].StartLine, chunks[i].EndLine)
			if chunks[i].Symbol != "" {
				prefix += fmt.Sprintf(" [%s]", chunks[i].Symbol)
			}
			chunks[i].Text = prefix + "\n" + chunks[i].Text
		}
	}

	return chunks
}

// ChunkDocument splits a text document (markdown, notes) into chunks by sections.
func ChunkDocument(content string, title string, opts ChunkOptions) []Chunk {
	if opts.MaxChunkSize == 0 {
		opts = DefaultChunkOptions()
	}

	lines := strings.Split(content, "\n")

	// Try splitting by markdown headers
	chunks := chunkByHeaders(lines, opts)

	// Fallback to paragraph-based chunking
	if len(chunks) == 0 {
		chunks = chunkByParagraphs(lines, opts)
	}

	// If still nothing useful, fall back to fixed-size
	if len(chunks) == 0 {
		chunks = chunkFixedSize(lines, opts)
	}

	// Add title context
	for i := range chunks {
		if opts.IncludeMetadata && title != "" {
			chunks[i].Text = fmt.Sprintf("Document: %s\n\n%s", title, chunks[i].Text)
		}
	}

	return chunks
}

// ChunkDesign creates chunks from design/UI data
func ChunkDesign(designJSON string, designName string) []Chunk {
	return []Chunk{
		{
			Text:      fmt.Sprintf("Design: %s\n\n%s", designName, designJSON),
			Index:     0,
			StartLine: 0,
			EndLine:   0,
			Metadata:  map[string]string{"type": "design", "name": designName},
		},
	}
}

// ChunkTask creates a chunk from a task/ticket
func ChunkTask(title, description, status string, taskID int) []Chunk {
	text := fmt.Sprintf("Task #%d: %s\nStatus: %s\n\n%s", taskID, title, status, description)
	return []Chunk{
		{
			Text:      text,
			Index:     0,
			StartLine: 0,
			EndLine:   0,
			Metadata:  map[string]string{"type": "task", "task_id": fmt.Sprintf("%d", taskID), "status": status},
		},
	}
}

// --- Code boundary detection ---

// Patterns for detecting function/class/method boundaries per language
var codePatterns = map[string][]*regexp.Regexp{
	"go": {
		regexp.MustCompile(`^func\s`),
		regexp.MustCompile(`^type\s+\w+\s+(struct|interface)`),
	},
	"typescript": {
		regexp.MustCompile(`^(export\s+)?(async\s+)?function\s`),
		regexp.MustCompile(`^(export\s+)?(default\s+)?class\s`),
		regexp.MustCompile(`^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(`),
		regexp.MustCompile(`^(export\s+)?interface\s`),
		regexp.MustCompile(`^(export\s+)?type\s+\w+\s*=`),
	},
	"javascript": {
		regexp.MustCompile(`^(export\s+)?(async\s+)?function\s`),
		regexp.MustCompile(`^(export\s+)?(default\s+)?class\s`),
		regexp.MustCompile(`^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(`),
	},
	"python": {
		regexp.MustCompile(`^(async\s+)?def\s`),
		regexp.MustCompile(`^class\s`),
	},
	"rust": {
		regexp.MustCompile(`^(pub\s+)?(async\s+)?fn\s`),
		regexp.MustCompile(`^(pub\s+)?struct\s`),
		regexp.MustCompile(`^(pub\s+)?enum\s`),
		regexp.MustCompile(`^(pub\s+)?trait\s`),
		regexp.MustCompile(`^impl\s`),
	},
	"java": {
		regexp.MustCompile(`^(public|private|protected)\s+(static\s+)?(abstract\s+)?(\w+\s+)+\w+\s*\(`),
		regexp.MustCompile(`^(public|private|protected)?\s*(abstract\s+)?class\s`),
		regexp.MustCompile(`^(public|private|protected)?\s*interface\s`),
	},
	"vue": {
		regexp.MustCompile(`^<script`),
		regexp.MustCompile(`^<template`),
		regexp.MustCompile(`^<style`),
		regexp.MustCompile(`^(export\s+)?(async\s+)?function\s`),
		regexp.MustCompile(`^(const|let|var)\s+\w+\s*=\s*(async\s+)?\(`),
	},
}

// symbolPattern extracts the symbol name from a boundary line
var symbolPatterns = map[string]*regexp.Regexp{
	"go_func":     regexp.MustCompile(`func\s+(?:\([^)]+\)\s+)?(\w+)`),
	"go_type":     regexp.MustCompile(`type\s+(\w+)`),
	"js_func":     regexp.MustCompile(`function\s+(\w+)`),
	"js_class":    regexp.MustCompile(`class\s+(\w+)`),
	"js_const":    regexp.MustCompile(`(?:const|let|var)\s+(\w+)`),
	"py_def":      regexp.MustCompile(`def\s+(\w+)`),
	"py_class":    regexp.MustCompile(`class\s+(\w+)`),
	"rust_fn":     regexp.MustCompile(`fn\s+(\w+)`),
	"rust_struct": regexp.MustCompile(`(?:struct|enum|trait)\s+(\w+)`),
	"rust_impl":   regexp.MustCompile(`impl\s+(?:<[^>]+>\s+)?(\w+)`),
}

func chunkByCodeBoundaries(lines []string, lang string, opts ChunkOptions) []Chunk {
	patterns, ok := codePatterns[lang]
	if !ok {
		return nil
	}

	type boundary struct {
		lineNum int
		symbol  string
	}

	var boundaries []boundary

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		for _, pat := range patterns {
			if pat.MatchString(trimmed) {
				symbol := extractSymbol(trimmed, lang)
				boundaries = append(boundaries, boundary{lineNum: i, symbol: symbol})
				break
			}
		}
	}

	if len(boundaries) == 0 {
		return nil
	}

	var chunks []Chunk
	for i, b := range boundaries {
		endLine := len(lines) - 1
		if i+1 < len(boundaries) {
			endLine = boundaries[i+1].lineNum - 1
		}

		// Include a few lines before boundary for context (comments, decorators)
		startLine := b.lineNum
		contextLines := 3
		if startLine-contextLines > 0 {
			// Check if preceding lines are comments or decorators
			for j := startLine - 1; j >= startLine-contextLines && j >= 0; j-- {
				t := strings.TrimSpace(lines[j])
				if t == "" || strings.HasPrefix(t, "//") || strings.HasPrefix(t, "#") ||
					strings.HasPrefix(t, "/*") || strings.HasPrefix(t, "*") ||
					strings.HasPrefix(t, "@") || strings.HasPrefix(t, "///") {
					startLine = j
				} else {
					break
				}
			}
		}

		chunkText := strings.Join(lines[startLine:endLine+1], "\n")

		// If chunk is too large, split it further
		if estimateTokens(chunkText) > opts.MaxChunkSize*2 {
			subChunks := chunkFixedSize(lines[startLine:endLine+1], opts)
			for j, sc := range subChunks {
				sc.StartLine += startLine
				sc.EndLine += startLine
				sc.Symbol = b.symbol
				sc.Index = len(chunks) + j
				chunks = append(chunks, sc)
			}
		} else {
			chunks = append(chunks, Chunk{
				Text:      chunkText,
				Index:     len(chunks),
				StartLine: startLine + 1, // 1-indexed
				EndLine:   endLine + 1,
				Symbol:    b.symbol,
			})
		}
	}

	return chunks
}

func extractSymbol(line string, lang string) string {
	for key, pat := range symbolPatterns {
		if strings.HasPrefix(key, lang) || (lang == "typescript" && strings.HasPrefix(key, "js")) ||
			(lang == "javascript" && strings.HasPrefix(key, "js")) ||
			(lang == "vue" && strings.HasPrefix(key, "js")) {
			if m := pat.FindStringSubmatch(line); len(m) > 1 {
				return m[1]
			}
		}
	}
	// Generic fallback
	for _, pat := range symbolPatterns {
		if m := pat.FindStringSubmatch(line); len(m) > 1 {
			return m[1]
		}
	}
	return ""
}

// --- Markdown header chunking ---

var headerPattern = regexp.MustCompile(`^#{1,6}\s+`)

func chunkByHeaders(lines []string, opts ChunkOptions) []Chunk {
	type section struct {
		startLine int
		title     string
	}

	var sections []section
	for i, line := range lines {
		if headerPattern.MatchString(line) {
			sections = append(sections, section{startLine: i, title: strings.TrimSpace(line)})
		}
	}

	if len(sections) < 2 {
		return nil // Not enough headers to split meaningfully
	}

	var chunks []Chunk
	for i, sec := range sections {
		endLine := len(lines) - 1
		if i+1 < len(sections) {
			endLine = sections[i+1].startLine - 1
		}

		chunkText := strings.Join(lines[sec.startLine:endLine+1], "\n")
		chunkText = strings.TrimSpace(chunkText)
		if chunkText == "" {
			continue
		}

		// Split oversized sections
		if estimateTokens(chunkText) > opts.MaxChunkSize*2 {
			subLines := lines[sec.startLine : endLine+1]
			subChunks := chunkFixedSize(subLines, opts)
			for _, sc := range subChunks {
				sc.StartLine += sec.startLine
				sc.EndLine += sec.startLine
				sc.Symbol = sec.title
				sc.Index = len(chunks)
				chunks = append(chunks, sc)
			}
		} else {
			chunks = append(chunks, Chunk{
				Text:      chunkText,
				Index:     len(chunks),
				StartLine: sec.startLine + 1,
				EndLine:   endLine + 1,
				Symbol:    sec.title,
			})
		}
	}

	return chunks
}

// --- Paragraph chunking ---

func chunkByParagraphs(lines []string, opts ChunkOptions) []Chunk {
	var chunks []Chunk
	var currentLines []string
	startLine := 0
	emptyCount := 0

	for i, line := range lines {
		if strings.TrimSpace(line) == "" {
			emptyCount++
			if emptyCount >= 2 && len(currentLines) > 0 {
				// Double empty line = paragraph break
				text := strings.TrimSpace(strings.Join(currentLines, "\n"))
				if text != "" && estimateTokens(text) > 20 {
					chunks = append(chunks, Chunk{
						Text:      text,
						Index:     len(chunks),
						StartLine: startLine + 1,
						EndLine:   i,
					})
				}
				currentLines = nil
				startLine = i + 1
				emptyCount = 0
			}
			continue
		}
		emptyCount = 0
		if len(currentLines) == 0 {
			startLine = i
		}
		currentLines = append(currentLines, line)

		// Check if accumulated text exceeds max size
		if estimateTokens(strings.Join(currentLines, "\n")) > opts.MaxChunkSize {
			text := strings.TrimSpace(strings.Join(currentLines, "\n"))
			if text != "" {
				chunks = append(chunks, Chunk{
					Text:      text,
					Index:     len(chunks),
					StartLine: startLine + 1,
					EndLine:   i + 1,
				})
			}
			currentLines = nil
		}
	}

	// Final paragraph
	if len(currentLines) > 0 {
		text := strings.TrimSpace(strings.Join(currentLines, "\n"))
		if text != "" && estimateTokens(text) > 10 {
			chunks = append(chunks, Chunk{
				Text:      text,
				Index:     len(chunks),
				StartLine: startLine + 1,
				EndLine:   len(lines),
			})
		}
	}

	return chunks
}

// --- Fixed-size chunking (fallback) ---

func chunkFixedSize(lines []string, opts ChunkOptions) []Chunk {
	var chunks []Chunk
	tokenCount := 0
	var chunkLines []string
	startLine := 0

	for i, line := range lines {
		lineTokens := estimateTokens(line)
		if tokenCount+lineTokens > opts.MaxChunkSize && len(chunkLines) > 0 {
			chunks = append(chunks, Chunk{
				Text:      strings.Join(chunkLines, "\n"),
				Index:     len(chunks),
				StartLine: startLine + 1,
				EndLine:   i,
			})

			// Overlap: keep last N tokens worth of lines
			overlapTokens := 0
			overlapStart := len(chunkLines)
			for j := len(chunkLines) - 1; j >= 0 && overlapTokens < opts.OverlapSize; j-- {
				overlapTokens += estimateTokens(chunkLines[j])
				overlapStart = j
			}
			chunkLines = chunkLines[overlapStart:]
			tokenCount = overlapTokens
			startLine = i - len(chunkLines)
		}

		chunkLines = append(chunkLines, line)
		tokenCount += lineTokens
	}

	if len(chunkLines) > 0 {
		chunks = append(chunks, Chunk{
			Text:      strings.Join(chunkLines, "\n"),
			Index:     len(chunks),
			StartLine: startLine + 1,
			EndLine:   len(lines),
		})
	}

	return chunks
}

// --- Language detection ---

var langExtensions = map[string]string{
	".go":    "go",
	".ts":    "typescript",
	".tsx":   "typescript",
	".js":    "javascript",
	".jsx":   "javascript",
	".mjs":   "javascript",
	".py":    "python",
	".rs":    "rust",
	".java":  "java",
	".kt":    "java",
	".vue":   "vue",
	".svelte": "javascript",
	".rb":    "ruby",
	".php":   "php",
	".cs":    "csharp",
	".cpp":   "cpp",
	".c":     "cpp",
	".h":     "cpp",
	".hpp":   "cpp",
	".swift": "swift",
	".dart":  "dart",
	".lua":   "lua",
	".sh":    "bash",
	".bash":  "bash",
	".zsh":   "bash",
	".sql":   "sql",
	".md":    "markdown",
	".mdx":   "markdown",
	".yaml":  "yaml",
	".yml":   "yaml",
	".toml":  "toml",
	".json":  "json",
	".xml":   "xml",
	".html":  "html",
	".css":   "css",
	".scss":  "css",
	".less":  "css",
}

func detectLanguage(filePath string) string {
	ext := strings.ToLower(filepath.Ext(filePath))
	if lang, ok := langExtensions[ext]; ok {
		return lang
	}
	return "text"
}

// estimateTokens gives a rough token count (words * 1.3)
func estimateTokens(text string) int {
	words := len(strings.Fields(text))
	if words == 0 {
		return 0
	}
	// Rough estimate: ~1.3 tokens per word for code/text
	return int(float64(words) * 1.3)
}
