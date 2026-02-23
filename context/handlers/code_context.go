package handlers

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"construct-context/providers"
)

// enrichCodeSystemPrompt appends project context from local_data to the agent
// system prompt so the code-assistant knows about the current project, folder,
// file, and any !filename references in the user message.
func enrichCodeSystemPrompt(systemPrompt string, localData map[string]interface{}, messages []providers.ChatMessage) string {
	var sb strings.Builder
	sb.WriteString(systemPrompt)

	// --- Project context from local_data ---
	projectName, _ := localData["project_name"].(string)
	projectFramework, _ := localData["project_framework"].(string)
	currentFolder, _ := localData["current_folder"].(string)

	var currentFileName string
	var currentFileContent string
	if cf, ok := localData["current_file"].(map[string]interface{}); ok {
		currentFileName, _ = cf["path"].(string)
		currentFileContent, _ = cf["content"].(string)
	}

	hasContext := projectName != "" || currentFolder != "" || currentFileName != ""
	if hasContext {
		sb.WriteString("\n\n## Project Context\n")
		if projectName != "" {
			sb.WriteString(fmt.Sprintf("- **Project:** %s\n", projectName))
		}
		if projectFramework != "" {
			sb.WriteString(fmt.Sprintf("- **Framework:** %s\n", projectFramework))
		}
		if currentFolder != "" {
			sb.WriteString(fmt.Sprintf("- **Working directory:** %s\n", currentFolder))
		}
		if currentFileName != "" {
			sb.WriteString(fmt.Sprintf("- **Current file:** %s\n", currentFileName))
			if currentFileContent != "" {
				// Truncate to first 300 lines
				lines := strings.SplitN(currentFileContent, "\n", 301)
				if len(lines) > 300 {
					lines = lines[:300]
					lines = append(lines, "... (truncated)")
				}
				sb.WriteString(fmt.Sprintf("\n### Current File Content (%s)\n```\n%s\n```\n", currentFileName, strings.Join(lines, "\n")))
			}
		}
	}

	// --- Resolve !filename references from last user message ---
	if currentFolder != "" && len(messages) > 0 {
		var lastUserMsg string
		for i := len(messages) - 1; i >= 0; i-- {
			if messages[i].Role == "user" {
				lastUserMsg = messages[i].GetContentString()
				break
			}
		}
		if lastUserMsg != "" {
			refs := resolveFileReferences(lastUserMsg, currentFolder)
			if refs != "" {
				sb.WriteString("\n" + refs)
			}
		}
	}

	return sb.String()
}

// fileRefPattern matches !filename patterns (e.g., !index.html, !src/main.ts)
var fileRefPattern = regexp.MustCompile(`(?:^|\s)!([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`)

// resolveFileReferences parses !filename patterns from the user message,
// finds matching files in the project directory, and returns formatted content.
func resolveFileReferences(userMessage string, projectDir string) string {
	matches := fileRefPattern.FindAllStringSubmatch(userMessage, 10)
	if len(matches) == 0 {
		return ""
	}

	seen := make(map[string]bool)
	var sb strings.Builder
	sb.WriteString("## Referenced Files\n")
	found := 0

	for _, match := range matches {
		if found >= 5 {
			break
		}
		filename := match[1]
		if seen[filename] {
			continue
		}
		seen[filename] = true

		// Try exact path first
		fullPath := filepath.Join(projectDir, filename)
		content, err := readFileLimited(fullPath, 500)
		if err != nil {
			// Try finding the file by walking the directory (max depth 4)
			foundPath := findFileInDir(projectDir, filename, 4)
			if foundPath != "" {
				content, err = readFileLimited(foundPath, 500)
				if err != nil {
					continue
				}
				fullPath = foundPath
			} else {
				continue
			}
		}

		relPath, _ := filepath.Rel(projectDir, fullPath)
		if relPath == "" {
			relPath = filename
		}
		sb.WriteString(fmt.Sprintf("\n### %s\n```\n%s\n```\n", relPath, content))
		found++
	}

	if found == 0 {
		return ""
	}
	return sb.String()
}

// readFileLimited reads up to maxLines lines from a file.
func readFileLimited(path string, maxLines int) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	// Increase buffer for long lines
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		if len(lines) >= maxLines {
			lines = append(lines, "... (truncated)")
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return strings.Join(lines, "\n"), nil
}

// findFileInDir searches for a filename within a directory up to maxDepth levels.
// Returns the first match or empty string.
func findFileInDir(dir string, filename string, maxDepth int) string {
	base := filepath.Base(filename)
	var result string
	depth := strings.Count(dir, string(filepath.Separator))

	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip errors
		}
		if result != "" {
			return filepath.SkipAll
		}
		currentDepth := strings.Count(path, string(filepath.Separator)) - depth
		if currentDepth > maxDepth {
			return filepath.SkipDir
		}
		if info.IsDir() {
			// Skip hidden dirs and common large dirs
			name := info.Name()
			if strings.HasPrefix(name, ".") || name == "node_modules" || name == "vendor" || name == "__pycache__" {
				return filepath.SkipDir
			}
			return nil
		}
		if info.Name() == base {
			// If filename has path components, check they match
			if strings.Contains(filename, "/") {
				rel, _ := filepath.Rel(dir, path)
				if !strings.HasSuffix(rel, filename) {
					return nil
				}
			}
			result = path
			return filepath.SkipAll
		}
		return nil
	})
	return result
}
