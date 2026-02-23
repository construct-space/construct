package tools

import (
	"bytes"
	"construct-context/providers"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// SystemTools - Tools for system information and operations
func init() {
	category := &ToolCategory{
		Name:        "system",
		Description: "System information and environment tools",
		Tools: []providers.Tool{
			// System info
			MakeTool("get_system_info", "Get information about the current system",
				map[string]providers.Property{}, nil),

			MakeTool("get_environment_variable", "Get the value of an environment variable",
				map[string]providers.Property{
					"name": {Type: "string", Description: "The name of the environment variable"},
				}, []string{"name"}),

			MakeTool("list_environment_variables", "List environment variables (optionally filtered by prefix)",
				map[string]providers.Property{
					"prefix": {Type: "string", Description: "Optional prefix to filter variables"},
				}, nil),

			// File system (read-only operations)
			MakeTool("list_directory", "List contents of a directory",
				map[string]providers.Property{
					"path": {Type: "string", Description: "Directory path to list"},
				}, []string{"path"}),

			MakeTool("file_info", "Get information about a file",
				map[string]providers.Property{
					"path": {Type: "string", Description: "Path to the file"},
				}, []string{"path"}),

			MakeTool("read_file", "Read contents of a text file",
				map[string]providers.Property{
					"path":      {Type: "string", Description: "Path to the file"},
					"max_lines": {Type: "number", Description: "Maximum lines to read (default 100)"},
				}, []string{"path"}),

			// Process info
			MakeTool("get_running_processes", "Get list of running processes",
				map[string]providers.Property{
					"filter": {Type: "string", Description: "Optional filter by process name"},
				}, nil),

			// Network info
			MakeTool("check_port", "Check if a port is open on a host",
				map[string]providers.Property{
					"host":    {Type: "string", Description: "Host to check (default: localhost)"},
					"port":    {Type: "number", Description: "Port number to check"},
					"timeout": {Type: "number", Description: "Timeout in seconds (default 5)"},
				}, []string{"port"}),

			MakeTool("get_network_interfaces", "Get list of network interfaces",
				map[string]providers.Property{}, nil),

			// Shell commands (safe/read-only)
			MakeTool("run_command", "Run a shell command (read-only commands only)",
				map[string]providers.Property{
					"command": {Type: "string", Description: "The command to run (restricted to safe commands)"},
					"timeout": {Type: "number", Description: "Timeout in seconds (default 30, max 120)"},
				}, []string{"command"}),

			// Clipboard
			MakeTool("get_clipboard", "Get current clipboard contents",
				map[string]providers.Property{}, nil),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	// Register executors
	DefaultRegistry.RegisterExecutor("get_system_info", executeGetSystemInfo)
	DefaultRegistry.RegisterExecutor("get_environment_variable", executeGetEnvVar)
	DefaultRegistry.RegisterExecutor("list_environment_variables", executeListEnvVars)
	DefaultRegistry.RegisterExecutor("list_directory", executeListDirectory)
	DefaultRegistry.RegisterExecutor("file_info", executeFileInfo)
	DefaultRegistry.RegisterExecutor("read_file", executeReadFile)
	DefaultRegistry.RegisterExecutor("get_running_processes", executeGetProcesses)
	DefaultRegistry.RegisterExecutor("check_port", executeCheckPort)
	DefaultRegistry.RegisterExecutor("get_network_interfaces", executeGetNetworkInterfaces)
	DefaultRegistry.RegisterExecutor("run_command", executeRunCommand)
	DefaultRegistry.RegisterExecutor("get_clipboard", executeGetClipboard)
}

func executeGetSystemInfo(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	hostname, _ := os.Hostname()

	info := map[string]interface{}{
		"os":           runtime.GOOS,
		"arch":         runtime.GOARCH,
		"num_cpu":      runtime.NumCPU(),
		"go_version":   runtime.Version(),
		"hostname":     hostname,
		"num_goroutine": runtime.NumGoroutine(),
	}

	// Get memory stats
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	info["memory"] = map[string]interface{}{
		"alloc_mb":       m.Alloc / 1024 / 1024,
		"total_alloc_mb": m.TotalAlloc / 1024 / 1024,
		"sys_mb":         m.Sys / 1024 / 1024,
	}

	return ToolResult{Content: fmt.Sprintf("%+v", info)}
}

func executeGetEnvVar(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	name, _ := args["name"].(string)

	// Block access to sensitive environment variables
	upperName := strings.ToUpper(name)
	sensitivePatterns := []string{
		"SECRET", "TOKEN", "PASSWORD", "CREDENTIAL", "API_KEY", "APIKEY",
		"PRIVATE_KEY", "ACCESS_KEY", "AUTH_KEY", "DATABASE_URL", "MONGO_URI",
		"REDIS_URL", "CONNECTION_STRING", "DSN",
	}
	for _, pattern := range sensitivePatterns {
		if strings.Contains(upperName, pattern) {
			return ToolResult{Content: fmt.Sprintf("Access to environment variable '%s' is blocked for security reasons", name), IsError: true}
		}
	}

	value := os.Getenv(name)
	if value == "" {
		return ToolResult{Content: fmt.Sprintf("Environment variable '%s' is not set or empty", name)}
	}
	return ToolResult{Content: value}
}

func executeListEnvVars(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	prefix, _ := args["prefix"].(string)

	var result []string
	for _, env := range os.Environ() {
		if prefix == "" || strings.HasPrefix(env, prefix) {
			// Only show variable names for security
			parts := strings.SplitN(env, "=", 2)
			if len(parts) > 0 {
				result = append(result, parts[0])
			}
		}
	}

	return ToolResult{Content: fmt.Sprintf("Environment variables%s: %s",
		func() string { if prefix != "" { return " (prefix: " + prefix + ")" }; return "" }(),
		strings.Join(result, ", "))}
}

func executeListDirectory(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	path := resolvePath(args["path"].(string), ctx)

	// Validate path stays within project directory
	if errMsg := validatePathWithinProject(path, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error reading directory: %v", err), IsError: true}
	}

	var items []string
	for _, entry := range entries {
		info, _ := entry.Info()
		typeStr := "file"
		if entry.IsDir() {
			typeStr = "dir"
		}
		size := int64(0)
		if info != nil {
			size = info.Size()
		}
		items = append(items, fmt.Sprintf("%s (%s, %d bytes)", entry.Name(), typeStr, size))
	}

	return ToolResult{Content: fmt.Sprintf("Contents of %s:\n%s", path, strings.Join(items, "\n"))}
}

func executeFileInfo(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	path := resolvePath(args["path"].(string), ctx)

	// Validate path stays within project directory
	if errMsg := validatePathWithinProject(path, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	info, err := os.Stat(path)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting file info: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"name":     info.Name(),
		"size":     info.Size(),
		"mode":     info.Mode().String(),
		"mod_time": info.ModTime().Format(time.RFC3339),
		"is_dir":   info.IsDir(),
	}

	return ToolResult{Content: fmt.Sprintf("%+v", result)}
}

func executeReadFile(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	path := resolvePath(args["path"].(string), ctx)

	// Validate path stays within project directory
	if errMsg := validatePathWithinProject(path, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	maxLines := 100
	if ml, ok := args["max_lines"].(float64); ok && ml > 0 {
		maxLines = int(ml)
		if maxLines > 1000 {
			maxLines = 1000
		}
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error reading file: %v", err), IsError: true}
	}

	lines := strings.Split(string(content), "\n")
	if len(lines) > maxLines {
		lines = lines[:maxLines]
		lines = append(lines, fmt.Sprintf("\n... [truncated, showing first %d lines]", maxLines))
	}

	return ToolResult{Content: strings.Join(lines, "\n")}
}

func executeGetProcesses(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	filter, _ := args["filter"].(string)

	// Validate filter to prevent command injection — only allow alphanumeric, dash, dot, underscore
	if filter != "" {
		for _, c := range filter {
			if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '.' || c == '_') {
				return ToolResult{Content: "Invalid filter: only alphanumeric characters, dashes, dots, and underscores are allowed", IsError: true}
			}
		}
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin", "linux":
		if filter != "" {
			// Use exec.Command with separate args instead of shell interpolation to prevent injection
			cmd = exec.Command("ps", "aux")
		} else {
			cmd = exec.Command("ps", "aux")
		}
	case "windows":
		if filter != "" {
			cmd = exec.Command("tasklist", "/FI", fmt.Sprintf("IMAGENAME eq *%s*", filter))
		} else {
			cmd = exec.Command("tasklist")
		}
	default:
		return ToolResult{Content: "Unsupported operating system", IsError: true}
	}

	output, err := cmd.Output()
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting processes: %v", err), IsError: true}
	}

	lines := strings.Split(string(output), "\n")

	// Apply filter in Go (safe, no shell injection possible)
	if filter != "" && (runtime.GOOS == "darwin" || runtime.GOOS == "linux") {
		filterLower := strings.ToLower(filter)
		var filtered []string
		for _, line := range lines {
			if strings.Contains(strings.ToLower(line), filterLower) {
				filtered = append(filtered, line)
				if len(filtered) >= 20 {
					break
				}
			}
		}
		lines = filtered
	}

	// Limit output
	if len(lines) > 50 {
		lines = lines[:50]
		lines = append(lines, "... [truncated]")
	}

	return ToolResult{Content: strings.Join(lines, "\n")}
}

func executeCheckPort(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	host, _ := args["host"].(string)
	if host == "" {
		host = "localhost"
	}
	port := int(args["port"].(float64))
	timeout := 5
	if t, ok := args["timeout"].(float64); ok && t > 0 {
		timeout = int(t)
		if timeout > 30 {
			timeout = 30
		}
	}

	// Use nc for port check
	cmd := exec.Command("nc", "-z", "-w", fmt.Sprintf("%d", timeout), host, fmt.Sprintf("%d", port))
	err := cmd.Run()

	if err != nil {
		return ToolResult{Content: fmt.Sprintf(`{"host": "%s", "port": %d, "open": false}`, host, port)}
	}
	return ToolResult{Content: fmt.Sprintf(`{"host": "%s", "port": %d, "open": true}`, host, port)}
}

func executeGetNetworkInterfaces(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("ifconfig", "-a")
	case "linux":
		cmd = exec.Command("ip", "addr")
	case "windows":
		cmd = exec.Command("ipconfig", "/all")
	default:
		return ToolResult{Content: "Unsupported operating system", IsError: true}
	}

	output, err := cmd.Output()
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting network interfaces: %v", err), IsError: true}
	}

	return ToolResult{Content: string(output)}
}

func executeRunCommand(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	command, _ := args["command"].(string)
	timeout := 30
	if t, ok := args["timeout"].(float64); ok && t > 0 {
		timeout = int(t)
		if timeout > 120 {
			timeout = 120
		}
	}

	// Don't allow command chaining or redirection (check BEFORE allowlist to prevent bypass)
	if strings.Contains(command, ";") || strings.Contains(command, "&&") || strings.Contains(command, "||") ||
		strings.Contains(command, "|") || strings.Contains(command, ">") || strings.Contains(command, "<") ||
		strings.Contains(command, "`") || strings.Contains(command, "$(") || strings.Contains(command, "${") {
		return ToolResult{Content: "Command chaining, piping, redirection, and subshells not allowed", IsError: true}
	}

	// Allowlist of safe base commands (single commands only)
	safeBaseCommands := map[string]bool{
		"ls": true, "pwd": true, "whoami": true, "date": true, "uname": true,
		"hostname": true, "uptime": true, "df": true, "du": true, "free": true,
		"top": true, "ps": true, "cat": true, "head": true, "tail": true, "wc": true,
		"echo": true, "env": true, "printenv": true, "which": true, "type": true,
		"file": true, "stat": true, "git": true, "npm": true, "node": true,
		"go": true, "python": true, "curl": true, "ping": true, "dig": true,
		"nslookup": true, "traceroute": true,
	}

	// Safe subcommands for multi-word commands (base command -> allowed subcommands)
	safeSubCommands := map[string]map[string]bool{
		"git":    {"status": true, "log": true, "branch": true, "remote": true, "diff": true, "show": true},
		"npm":    {"list": true, "version": true, "ls": true},
		"node":   {"-v": true, "--version": true},
		"go":     {"version": true},
		"python": {"--version": true},
		"curl":   {"-I": true, "--head": true},
		"ping":   {"-c": true},
	}

	// Split command into tokens and check the base command (first token only)
	cmdParts := strings.Fields(command)
	if len(cmdParts) == 0 {
		return ToolResult{Content: "Empty command", IsError: true}
	}

	baseCmd := cmdParts[0]
	if !safeBaseCommands[baseCmd] {
		return ToolResult{Content: fmt.Sprintf("Command '%s' not allowed for security reasons", baseCmd), IsError: true}
	}

	// For commands with restricted subcommands, validate the subcommand too
	if allowedSubs, hasRestrictions := safeSubCommands[baseCmd]; hasRestrictions {
		if len(cmdParts) > 1 {
			subCmd := cmdParts[1]
			if !allowedSubs[subCmd] {
				return ToolResult{Content: fmt.Sprintf("Subcommand '%s %s' not allowed. Allowed: %s %v", baseCmd, subCmd, baseCmd, allowedSubs), IsError: true}
			}
		}
	}

	// Execute using exec.Command with split args (no shell interpolation)
	var cmd *exec.Cmd
	if len(cmdParts) == 1 {
		cmd = exec.Command(cmdParts[0])
	} else {
		cmd = exec.Command(cmdParts[0], cmdParts[1:]...)
	}

	// Capture combined output with timeout.
	// Use cmd.Start() + cmd.Wait() instead of cmd.Output() so we can
	// impose a timeout and kill the process without conflicting calls.
	var outBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &outBuf

	if err := cmd.Start(); err != nil {
		return ToolResult{Content: fmt.Sprintf("Command start error: %v", err), IsError: true}
	}

	// Buffered channel (capacity 1) so the goroutine can always write
	// and exit, even if we've already returned on timeout.
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-time.After(time.Duration(timeout) * time.Second):
		cmd.Process.Kill()
		// Drain the goroutine so it doesn't leak; Wait will return
		// quickly after Kill.
		<-done
		return ToolResult{Content: "Command timed out", IsError: true}
	case err := <-done:
		if err != nil {
			return ToolResult{Content: fmt.Sprintf("Command error: %v\nOutput: %s", err, outBuf.String()), IsError: true}
		}
	}

	return ToolResult{Content: outBuf.String()}
}

func executeGetClipboard(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("pbpaste")
	case "linux":
		cmd = exec.Command("xclip", "-selection", "clipboard", "-o")
	case "windows":
		cmd = exec.Command("powershell", "-command", "Get-Clipboard")
	default:
		return ToolResult{Content: "Clipboard not supported on this OS", IsError: true}
	}

	output, err := cmd.Output()
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting clipboard: %v", err), IsError: true}
	}

	content := string(output)
	if len(content) > 10000 {
		content = content[:10000] + "\n... [truncated]"
	}

	return ToolResult{Content: content}
}
