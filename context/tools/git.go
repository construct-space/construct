package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// GitTools - Tools for Git operations in a project repository
func init() {
	category := &ToolCategory{
		Name:        "git",
		Description: "Git tools for repository status, staging, commits, branches, and file operations",
		Tools: []providers.Tool{
			// Repository status
			MakeTool("git_status",
				"Get the current git status of a repository. Returns staged, unstaged, and untracked files.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
				}, []string{"repo_path"}),

			// Staging operations
			MakeTool("git_stage",
				"Stage files for commit. Use '.' to stage all files.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"files":     {Type: "array", Description: "Array of file paths to stage (use ['.'] for all)"},
				}, []string{"repo_path", "files"}),

			MakeTool("git_unstage",
				"Unstage files (remove from staging area).",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"files":     {Type: "array", Description: "Array of file paths to unstage"},
				}, []string{"repo_path", "files"}),

			MakeTool("git_discard",
				"Discard changes to files in the working directory. Warning: This cannot be undone!",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"files":     {Type: "array", Description: "Array of file paths to discard changes"},
				}, []string{"repo_path", "files"}),

			// Commit operations
			MakeTool("git_commit",
				"Create a commit with the staged changes.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"message":   {Type: "string", Description: "Commit message"},
				}, []string{"repo_path", "message"}),

			MakeTool("git_log",
				"Get commit history for the repository.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"limit":     {Type: "number", Description: "Maximum number of commits to return (default: 50)"},
					"skip":      {Type: "number", Description: "Number of commits to skip (for pagination)"},
				}, []string{"repo_path"}),

			// Branch operations
			MakeTool("git_branches",
				"List all branches (local and remote) in the repository.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
				}, []string{"repo_path"}),

			MakeTool("git_checkout",
				"Switch to a different branch.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"branch":    {Type: "string", Description: "Branch name to checkout"},
					"create":    {Type: "boolean", Description: "Create branch if it doesn't exist"},
				}, []string{"repo_path", "branch"}),

			MakeTool("git_create_branch",
				"Create a new branch.",
				map[string]providers.Property{
					"repo_path":   {Type: "string", Description: "Path to the git repository"},
					"branch_name": {Type: "string", Description: "Name of the new branch"},
					"start_point": {Type: "string", Description: "Starting point (commit/branch) for new branch"},
				}, []string{"repo_path", "branch_name"}),

			MakeTool("git_delete_branch",
				"Delete a branch.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"branch":    {Type: "string", Description: "Branch name to delete"},
					"force":     {Type: "boolean", Description: "Force delete even if not fully merged"},
				}, []string{"repo_path", "branch"}),

			// Remote operations
			MakeTool("git_fetch",
				"Fetch changes from remote without merging.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"remote":    {Type: "string", Description: "Remote name (default: origin)"},
				}, []string{"repo_path"}),

			MakeTool("git_pull",
				"Pull changes from remote and merge.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"remote":    {Type: "string", Description: "Remote name (default: origin)"},
					"branch":    {Type: "string", Description: "Branch name (default: current branch)"},
				}, []string{"repo_path"}),

			MakeTool("git_push",
				"Push commits to remote repository.",
				map[string]providers.Property{
					"repo_path":  {Type: "string", Description: "Path to the git repository"},
					"remote":     {Type: "string", Description: "Remote name (default: origin)"},
					"branch":     {Type: "string", Description: "Branch name (default: current branch)"},
					"set_upstream": {Type: "boolean", Description: "Set upstream tracking (-u flag)"},
				}, []string{"repo_path"}),

			// Gitignore operations
			MakeTool("git_ignore",
				"Add a pattern to .gitignore file.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"pattern":   {Type: "string", Description: "Pattern to add (e.g., '*.log', 'node_modules/', 'src/temp/')"},
				}, []string{"repo_path", "pattern"}),

			// Diff operations
			MakeTool("git_diff",
				"Get diff for a file or all changes.",
				map[string]providers.Property{
					"repo_path": {Type: "string", Description: "Path to the git repository"},
					"file":      {Type: "string", Description: "Specific file path (optional, shows all if omitted)"},
					"staged":    {Type: "boolean", Description: "Show staged changes instead of unstaged"},
					"commit":    {Type: "string", Description: "Show diff for specific commit hash"},
				}, []string{"repo_path"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	// Register executors
	DefaultRegistry.RegisterExecutor("git_status", executeGitStatus)
	DefaultRegistry.RegisterExecutor("git_stage", executeGitStage)
	DefaultRegistry.RegisterExecutor("git_unstage", executeGitUnstage)
	DefaultRegistry.RegisterExecutor("git_discard", executeGitDiscard)
	DefaultRegistry.RegisterExecutor("git_commit", executeGitCommit)
	DefaultRegistry.RegisterExecutor("git_log", executeGitLog)
	DefaultRegistry.RegisterExecutor("git_branches", executeGitBranches)
	DefaultRegistry.RegisterExecutor("git_checkout", executeGitCheckout)
	DefaultRegistry.RegisterExecutor("git_create_branch", executeGitCreateBranch)
	DefaultRegistry.RegisterExecutor("git_delete_branch", executeGitDeleteBranch)
	DefaultRegistry.RegisterExecutor("git_fetch", executeGitFetch)
	DefaultRegistry.RegisterExecutor("git_pull", executeGitPull)
	DefaultRegistry.RegisterExecutor("git_push", executeGitPush)
	DefaultRegistry.RegisterExecutor("git_ignore", executeGitIgnore)
	DefaultRegistry.RegisterExecutor("git_diff", executeGitDiff)
}

// Helper to run git commands
func runGitCommand(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath
	output, err := cmd.CombinedOutput()
	return string(output), err
}

func executeGitStatus(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)

	// Get porcelain status for parsing
	output, err := runGitCommand(repoPath, "status", "--porcelain", "-uall")
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting status: %v\n%s", err, output), IsError: true}
	}

	// Get current branch
	branch, _ := runGitCommand(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	branch = strings.TrimSpace(branch)

	// Parse status
	staged := []map[string]string{}
	unstaged := []map[string]string{}
	untracked := []string{}

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if len(line) < 3 {
			continue
		}
		indexStatus := string(line[0])
		workTreeStatus := string(line[1])
		path := strings.TrimSpace(line[3:])

		if indexStatus == "?" {
			untracked = append(untracked, path)
		} else {
			if indexStatus != " " {
				staged = append(staged, map[string]string{"path": path, "status": indexStatus})
			}
			if workTreeStatus != " " {
				unstaged = append(unstaged, map[string]string{"path": path, "status": workTreeStatus})
			}
		}
	}

	result := map[string]interface{}{
		"branch":    branch,
		"staged":    staged,
		"unstaged":  unstaged,
		"untracked": untracked,
	}
	respJSON, _ := json.Marshal(result)
	return ToolResult{Content: string(respJSON)}
}

func executeGitStage(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	filesRaw, _ := args["files"].([]interface{})

	files := make([]string, len(filesRaw))
	for i, f := range filesRaw {
		files[i] = f.(string)
	}

	gitArgs := append([]string{"add"}, files...)
	output, err := runGitCommand(repoPath, gitArgs...)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error staging files: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: fmt.Sprintf("Staged %d file(s)", len(files))}
}

func executeGitUnstage(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	filesRaw, _ := args["files"].([]interface{})

	files := make([]string, len(filesRaw))
	for i, f := range filesRaw {
		files[i] = f.(string)
	}

	gitArgs := append([]string{"reset", "HEAD", "--"}, files...)
	output, err := runGitCommand(repoPath, gitArgs...)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error unstaging files: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: fmt.Sprintf("Unstaged %d file(s)", len(files))}
}

func executeGitDiscard(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	filesRaw, _ := args["files"].([]interface{})

	files := make([]string, len(filesRaw))
	for i, f := range filesRaw {
		files[i] = f.(string)
	}

	gitArgs := append([]string{"checkout", "--"}, files...)
	output, err := runGitCommand(repoPath, gitArgs...)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error discarding changes: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: fmt.Sprintf("Discarded changes in %d file(s)", len(files))}
}

func executeGitCommit(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	message, _ := args["message"].(string)

	output, err := runGitCommand(repoPath, "commit", "-m", message)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error creating commit: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: output}
}

func executeGitLog(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	limit := 50
	skip := 0

	if l, ok := args["limit"].(float64); ok {
		limit = int(l)
	}
	if s, ok := args["skip"].(float64); ok {
		skip = int(s)
	}

	// Use a custom format for parsing
	format := "%H|%h|%s|%an|%ae|%ai|%cn|%ce|%ci|%P"
	output, err := runGitCommand(repoPath, "log",
		fmt.Sprintf("-n%d", limit),
		fmt.Sprintf("--skip=%d", skip),
		"--format="+format)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting log: %v\n%s", err, output), IsError: true}
	}

	commits := []map[string]interface{}{}
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) >= 10 {
			commits = append(commits, map[string]interface{}{
				"hash":           parts[0],
				"short_hash":     parts[1],
				"subject":        parts[2],
				"author":         parts[3],
				"author_email":   parts[4],
				"author_date":    parts[5],
				"committer":      parts[6],
				"committer_email": parts[7],
				"committer_date": parts[8],
				"parents":        strings.Fields(parts[9]),
			})
		}
	}

	respJSON, _ := json.Marshal(map[string]interface{}{
		"commits": commits,
		"limit":   limit,
		"skip":    skip,
	})
	return ToolResult{Content: string(respJSON)}
}

func executeGitBranches(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)

	// Get all branches with details
	output, err := runGitCommand(repoPath, "branch", "-a", "-v")
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error listing branches: %v\n%s", err, output), IsError: true}
	}

	// Get current branch
	current, _ := runGitCommand(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	current = strings.TrimSpace(current)

	local := []map[string]interface{}{}
	remote := []map[string]interface{}{}

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		isCurrent := strings.HasPrefix(line, "*")
		line = strings.TrimPrefix(line, "* ")
		line = strings.TrimPrefix(line, "  ")

		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}

		name := parts[0]
		isRemote := strings.HasPrefix(name, "remotes/")

		branch := map[string]interface{}{
			"name":      strings.TrimPrefix(name, "remotes/"),
			"is_current": isCurrent,
			"commit":    parts[1],
		}

		if isRemote {
			remote = append(remote, branch)
		} else {
			local = append(local, branch)
		}
	}

	respJSON, _ := json.Marshal(map[string]interface{}{
		"current": current,
		"local":   local,
		"remote":  remote,
	})
	return ToolResult{Content: string(respJSON)}
}

func executeGitCheckout(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	branch, _ := args["branch"].(string)
	create, _ := args["create"].(bool)

	gitArgs := []string{"checkout"}
	if create {
		gitArgs = append(gitArgs, "-b")
	}
	gitArgs = append(gitArgs, branch)

	output, err := runGitCommand(repoPath, gitArgs...)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error checking out branch: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: fmt.Sprintf("Switched to branch '%s'", branch)}
}

func executeGitCreateBranch(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	branchName, _ := args["branch_name"].(string)
	startPoint, _ := args["start_point"].(string)

	gitArgs := []string{"branch", branchName}
	if startPoint != "" {
		gitArgs = append(gitArgs, startPoint)
	}

	output, err := runGitCommand(repoPath, gitArgs...)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error creating branch: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: fmt.Sprintf("Created branch '%s'", branchName)}
}

func executeGitDeleteBranch(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	branch, _ := args["branch"].(string)
	force, _ := args["force"].(bool)

	flag := "-d"
	if force {
		flag = "-D"
	}

	output, err := runGitCommand(repoPath, "branch", flag, branch)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error deleting branch: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: fmt.Sprintf("Deleted branch '%s'", branch)}
}

func executeGitFetch(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	remote, _ := args["remote"].(string)
	if remote == "" {
		remote = "origin"
	}

	output, err := runGitCommand(repoPath, "fetch", remote)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error fetching: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: fmt.Sprintf("Fetched from '%s'", remote)}
}

func executeGitPull(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	remote, _ := args["remote"].(string)
	branch, _ := args["branch"].(string)

	gitArgs := []string{"pull"}
	if remote != "" {
		gitArgs = append(gitArgs, remote)
		if branch != "" {
			gitArgs = append(gitArgs, branch)
		}
	}

	output, err := runGitCommand(repoPath, gitArgs...)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error pulling: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: output}
}

func executeGitPush(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	remote, _ := args["remote"].(string)
	branch, _ := args["branch"].(string)
	setUpstream, _ := args["set_upstream"].(bool)

	gitArgs := []string{"push"}
	if setUpstream {
		gitArgs = append(gitArgs, "-u")
	}
	if remote != "" {
		gitArgs = append(gitArgs, remote)
		if branch != "" {
			gitArgs = append(gitArgs, branch)
		}
	}

	output, err := runGitCommand(repoPath, gitArgs...)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error pushing: %v\n%s", err, output), IsError: true}
	}

	return ToolResult{Content: output}
}

func executeGitIgnore(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	pattern, _ := args["pattern"].(string)

	gitignorePath := filepath.Join(repoPath, ".gitignore")

	// Read existing content using os.ReadFile (safe, no shell execution)
	existingBytes, _ := os.ReadFile(gitignorePath)
	existing := string(existingBytes)

	// Check if pattern already exists
	for _, line := range strings.Split(existing, "\n") {
		if strings.TrimSpace(line) == pattern {
			return ToolResult{Content: fmt.Sprintf("Pattern '%s' already in .gitignore", pattern)}
		}
	}

	// Append new pattern
	newContent := existing
	if !strings.HasSuffix(existing, "\n") && existing != "" {
		newContent += "\n"
	}
	newContent += pattern + "\n"

	// Write back using os.WriteFile (safe, no shell execution)
	if err := os.WriteFile(gitignorePath, []byte(newContent), 0644); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error updating .gitignore: %v", err), IsError: true}
	}

	return ToolResult{Content: fmt.Sprintf("Added '%s' to .gitignore", pattern)}
}

func executeGitDiff(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	repoPath, _ := args["repo_path"].(string)
	file, _ := args["file"].(string)
	staged, _ := args["staged"].(bool)
	commit, _ := args["commit"].(string)

	gitArgs := []string{"diff"}

	if commit != "" {
		gitArgs = append(gitArgs, commit+"^", commit)
	} else if staged {
		gitArgs = append(gitArgs, "--cached")
	}

	if file != "" {
		gitArgs = append(gitArgs, "--", file)
	}

	output, err := runGitCommand(repoPath, gitArgs...)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting diff: %v\n%s", err, output), IsError: true}
	}

	if output == "" {
		return ToolResult{Content: "No changes"}
	}

	return ToolResult{Content: output}
}
