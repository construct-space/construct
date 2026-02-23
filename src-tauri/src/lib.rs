use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::ShellExt;


// Message ID counter
static MESSAGE_ID: AtomicU64 = AtomicU64::new(0);
static LSP_MESSAGE_ID: AtomicU64 = AtomicU64::new(1);
static CONTEXT_STARTING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

// Global state for context connection
struct ContextState {
    socket: Option<TcpStream>,
    host: String,
    port: u16,
    address: Option<String>, // Full address string for returning from start_context_service
    child: Option<tauri_plugin_shell::process::CommandChild>,
}

type SharedContextState = Arc<Mutex<ContextState>>;

// LSP Server state
struct LspServer {
    process: Child,
    #[allow(dead_code)]
    language_id: String,
    stdin: Option<BufWriter<std::process::ChildStdin>>,
}

struct LspState {
    servers: HashMap<String, LspServer>,
}

type SharedLspState = Arc<Mutex<LspState>>;

// LSP Message structures
#[derive(Clone, Serialize, Deserialize, Debug)]
struct LspMessage {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<serde_json::Value>,
}

#[derive(Clone, Serialize)]
struct LspServerInfo {
    language_id: String,
    running: bool,
}

// Start an LSP server for a specific language
#[tauri::command]
async fn lsp_start_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedLspState>,
    language_id: String,
    server_command: String,
    server_args: Vec<String>,
    root_path: String,
) -> Result<bool, String> {
    let mut lsp_state = state.lock().map_err(|_| "Lock error")?;

    // Check if server already running
    if lsp_state.servers.contains_key(&language_id) {
        return Ok(true);
    }

    eprintln!("[LSP] Starting server for {}: {} {:?}", language_id, server_command, server_args);

    // Spawn the language server process
    let mut child = Command::new(&server_command)
        .args(&server_args)
        .current_dir(&root_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn LSP server: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    let stdin_writer = BufWriter::new(stdin);

    // Store the server
    lsp_state.servers.insert(language_id.clone(), LspServer {
        process: child,
        language_id: language_id.clone(),
        stdin: Some(stdin_writer),
    });

    // Spawn thread to read stdout and emit events
    let app_clone = app.clone();
    let lang_id = language_id.clone();
    thread::spawn(move || {
        use std::io::Read;
        let mut reader = BufReader::new(stdout);
        let mut header_buf = String::new();

        loop {
            // Read headers
            let mut content_length: Option<usize> = None;
            header_buf.clear();

            // Read header lines until empty line
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) => {
                        eprintln!("[LSP {}] EOF while reading headers", lang_id);
                        return;
                    }
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            break; // End of headers
                        }
                        if let Some(len_str) = trimmed.strip_prefix("Content-Length:") {
                            content_length = len_str.trim().parse().ok();
                        }
                    }
                    Err(e) => {
                        eprintln!("[LSP {}] Error reading header: {}", lang_id, e);
                        return;
                    }
                }
            }

            // Read the JSON body
            if let Some(len) = content_length {
                let mut body = vec![0u8; len];
                match reader.read_exact(&mut body) {
                    Ok(_) => {
                        if let Ok(json_str) = String::from_utf8(body) {
                            if let Ok(msg) = serde_json::from_str::<LspMessage>(&json_str) {
                                eprintln!("[LSP {}] Received: {} (id: {:?})", lang_id,
                                    msg.method.as_deref().unwrap_or("response"), msg.id);
                                let _ = app_clone.emit(&format!("lsp-message-{}", lang_id), msg);
                            } else {
                                eprintln!("[LSP {}] Failed to parse JSON: {}", lang_id, &json_str[..json_str.len().min(200)]);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[LSP {}] Error reading body: {}", lang_id, e);
                        return;
                    }
                }
            } else {
                eprintln!("[LSP {}] No Content-Length in headers", lang_id);
            }
        }
    });

    // Spawn thread to read stderr
    let lang_id_err = language_id.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(line) => eprintln!("[LSP {} stderr] {}", lang_id_err, line),
                Err(_) => break,
            }
        }
    });

    eprintln!("[LSP] Server started for {}", language_id);
    Ok(true)
}

// Send a message to an LSP server
#[tauri::command]
fn lsp_send_message(
    state: tauri::State<'_, SharedLspState>,
    language_id: String,
    message: serde_json::Value,
) -> Result<(), String> {
    let mut lsp_state = state.lock().map_err(|_| "Lock error")?;

    let server = lsp_state.servers.get_mut(&language_id)
        .ok_or_else(|| format!("No LSP server for {}", language_id))?;

    let stdin = server.stdin.as_mut()
        .ok_or("Server stdin not available")?;

    let json = serde_json::to_string(&message).map_err(|e| e.to_string())?;
    let content = format!("Content-Length: {}\r\n\r\n{}", json.len(), json);

    stdin.write_all(content.as_bytes()).map_err(|e| format!("Write error: {}", e))?;
    stdin.flush().map_err(|e| format!("Flush error: {}", e))?;

    Ok(())
}

// Send LSP request and get next message ID
#[tauri::command]
fn lsp_next_id() -> u64 {
    LSP_MESSAGE_ID.fetch_add(1, Ordering::SeqCst)
}

// Stop an LSP server
#[tauri::command]
fn lsp_stop_server(
    state: tauri::State<'_, SharedLspState>,
    language_id: String,
) -> Result<(), String> {
    let mut lsp_state = state.lock().map_err(|_| "Lock error")?;

    if let Some(mut server) = lsp_state.servers.remove(&language_id) {
        let _ = server.process.kill();
        eprintln!("[LSP] Stopped server for {}", language_id);
    }

    Ok(())
}

// Stop all LSP servers
#[tauri::command]
fn lsp_stop_all(state: tauri::State<'_, SharedLspState>) -> Result<(), String> {
    let mut lsp_state = state.lock().map_err(|_| "Lock error")?;

    for (lang_id, mut server) in lsp_state.servers.drain() {
        let _ = server.process.kill();
        eprintln!("[LSP] Stopped server for {}", lang_id);
    }

    Ok(())
}

// List running LSP servers
#[tauri::command]
fn lsp_list_servers(state: tauri::State<'_, SharedLspState>) -> Result<Vec<LspServerInfo>, String> {
    let lsp_state = state.lock().map_err(|_| "Lock error")?;

    let servers: Vec<LspServerInfo> = lsp_state.servers.keys()
        .map(|lang_id| LspServerInfo {
            language_id: lang_id.clone(),
            running: true,
        })
        .collect();

    Ok(servers)
}

// Check if a command/binary exists on the system
#[tauri::command]
fn lsp_check_command(command: String) -> bool {
    Command::new("which")
        .arg(&command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

// Run a shell command in a specified directory (blocking - waits for completion)
#[tauri::command]
async fn run_shell_command(
    command: String,
    args: Vec<String>,
    cwd: String,
) -> Result<serde_json::Value, String> {
    let output = Command::new(&command)
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(serde_json::json!({
        "success": output.status.success(),
        "code": output.status.code(),
        "stdout": stdout,
        "stderr": stderr
    }))
}

// ==================== LONG-RUNNING PROCESS MANAGEMENT ====================

// State for managing spawned processes
struct ProcessState {
    processes: HashMap<String, Child>,
}

type SharedProcessState = Arc<Mutex<ProcessState>>;

// Event emitted for process output
#[derive(Clone, Serialize)]
struct ProcessOutput {
    process_id: String,
    stream: String, // "stdout" or "stderr"
    data: String,
}

// Event emitted when process exits
#[derive(Clone, Serialize)]
struct ProcessExit {
    process_id: String,
    code: Option<i32>,
    success: bool,
}

// Spawn a long-running shell command (non-blocking, streams output via events)
#[tauri::command]
async fn spawn_shell_command(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedProcessState>,
    process_id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
) -> Result<serde_json::Value, String> {
    eprintln!("[Shell] Spawning: {} {:?} in {} (id: {})", command, args, cwd, process_id);

    let mut child = Command::new(&command)
        .args(&args)
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Environment variables to ensure proper output without PTY
        .env("TERM", "dumb")
        .env("CI", "true")  // Flutter respects CI mode for cleaner output
        .env("FLUTTER_SUPPRESS_ANALYTICS", "true")
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let pid = child.id();
    eprintln!("[Shell] Spawned process with PID: {}", pid);

    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Store the child process
    {
        let mut proc_state = state.lock().map_err(|_| "Lock error")?;
        proc_state.processes.insert(process_id.clone(), child);
    }

    // Spawn thread to read stdout - use small buffer for responsive output
    let app_stdout = app.clone();
    let pid_stdout = process_id.clone();
    thread::spawn(move || {
        use std::io::Read;
        let mut reader = BufReader::with_capacity(256, stdout);
        let mut buffer = [0u8; 1024];
        let mut line_buffer = String::new();

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buffer[..n]);
                    line_buffer.push_str(&chunk);

                    // Emit complete lines
                    while let Some(newline_pos) = line_buffer.find('\n') {
                        let line = line_buffer[..newline_pos].to_string();
                        line_buffer = line_buffer[newline_pos + 1..].to_string();

                        if !line.is_empty() {
                            let _ = app_stdout.emit("process-output", ProcessOutput {
                                process_id: pid_stdout.clone(),
                                stream: "stdout".to_string(),
                                data: line,
                            });
                        }
                    }

                    // Also emit partial lines after a small delay (for real-time feel)
                    if !line_buffer.is_empty() && line_buffer.len() > 80 {
                        let partial = std::mem::take(&mut line_buffer);
                        let _ = app_stdout.emit("process-output", ProcessOutput {
                            process_id: pid_stdout.clone(),
                            stream: "stdout".to_string(),
                            data: partial,
                        });
                    }
                }
                Err(_) => break,
            }
        }

        // Emit any remaining content
        if !line_buffer.is_empty() {
            let _ = app_stdout.emit("process-output", ProcessOutput {
                process_id: pid_stdout.clone(),
                stream: "stdout".to_string(),
                data: line_buffer,
            });
        }
    });

    // Spawn thread to read stderr - use small buffer for responsive output
    let app_stderr = app.clone();
    let pid_stderr = process_id.clone();
    thread::spawn(move || {
        use std::io::Read;
        let mut reader = BufReader::with_capacity(256, stderr);
        let mut buffer = [0u8; 1024];
        let mut line_buffer = String::new();

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buffer[..n]);
                    line_buffer.push_str(&chunk);

                    // Emit complete lines
                    while let Some(newline_pos) = line_buffer.find('\n') {
                        let line = line_buffer[..newline_pos].to_string();
                        line_buffer = line_buffer[newline_pos + 1..].to_string();

                        if !line.is_empty() {
                            let _ = app_stderr.emit("process-output", ProcessOutput {
                                process_id: pid_stderr.clone(),
                                stream: "stderr".to_string(),
                                data: line,
                            });
                        }
                    }

                    // Also emit partial lines for long content
                    if !line_buffer.is_empty() && line_buffer.len() > 80 {
                        let partial = std::mem::take(&mut line_buffer);
                        let _ = app_stderr.emit("process-output", ProcessOutput {
                            process_id: pid_stderr.clone(),
                            stream: "stderr".to_string(),
                            data: partial,
                        });
                    }
                }
                Err(_) => break,
            }
        }

        // Emit any remaining content
        if !line_buffer.is_empty() {
            let _ = app_stderr.emit("process-output", ProcessOutput {
                process_id: pid_stderr.clone(),
                stream: "stderr".to_string(),
                data: line_buffer,
            });
        }
    });

    // Spawn thread to wait for process exit
    let app_exit = app.clone();
    let pid_exit = process_id.clone();
    let state_clone = state.inner().clone();
    thread::spawn(move || {
        // Wait a bit then start checking
        loop {
            thread::sleep(Duration::from_millis(500));

            let mut proc_state = match state_clone.lock() {
                Ok(s) => s,
                Err(_) => break,
            };

            if let Some(child) = proc_state.processes.get_mut(&pid_exit) {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let code = status.code();
                        let success = status.success();
                        eprintln!("[Shell] Process {} exited with code: {:?}", pid_exit, code);

                        let _ = app_exit.emit("process-exit", ProcessExit {
                            process_id: pid_exit.clone(),
                            code,
                            success,
                        });

                        proc_state.processes.remove(&pid_exit);
                        break;
                    }
                    Ok(None) => {
                        // Still running
                    }
                    Err(e) => {
                        eprintln!("[Shell] Error waiting for process {}: {}", pid_exit, e);
                        break;
                    }
                }
            } else {
                break;
            }
        }
    });

    Ok(serde_json::json!({
        "success": true,
        "pid": pid,
        "process_id": process_id
    }))
}

// Kill a spawned process
#[tauri::command]
fn kill_shell_process(
    state: tauri::State<'_, SharedProcessState>,
    process_id: String,
) -> Result<bool, String> {
    let mut proc_state = state.lock().map_err(|_| "Lock error")?;

    if let Some(mut child) = proc_state.processes.remove(&process_id) {
        eprintln!("[Shell] Killing process: {}", process_id);
        match child.kill() {
            Ok(_) => {
                let _ = child.wait(); // Clean up zombie process
                Ok(true)
            }
            Err(e) => Err(format!("Failed to kill process: {}", e))
        }
    } else {
        Ok(false)
    }
}

// Send input to a spawned process stdin
#[tauri::command]
fn send_process_input(
    state: tauri::State<'_, SharedProcessState>,
    process_id: String,
    input: String,
) -> Result<bool, String> {
    eprintln!("[Shell] Sending input '{}' to process: {}", input, process_id);

    let mut proc_state = state.lock().map_err(|_| "Lock error")?;

    // Debug: list available processes
    eprintln!("[Shell] Available processes: {:?}", proc_state.processes.keys().collect::<Vec<_>>());

    if let Some(child) = proc_state.processes.get_mut(&process_id) {
        if let Some(stdin) = child.stdin.as_mut() {
            use std::io::Write;
            // Add newline if not present - Flutter expects newline-terminated input
            let input_with_newline = if input.ends_with('\n') {
                input
            } else {
                format!("{}\n", input)
            };
            eprintln!("[Shell] Writing to stdin: {:?}", input_with_newline);
            stdin.write_all(input_with_newline.as_bytes()).map_err(|e| format!("Write error: {}", e))?;
            stdin.flush().map_err(|e| format!("Flush error: {}", e))?;
            eprintln!("[Shell] Input sent successfully");
            return Ok(true);
        } else {
            eprintln!("[Shell] No stdin available for process");
        }
    } else {
        eprintln!("[Shell] Process not found: {}", process_id);
    }

    Ok(false)
}

// List running processes
#[tauri::command]
fn list_shell_processes(
    state: tauri::State<'_, SharedProcessState>,
) -> Result<Vec<String>, String> {
    let proc_state = state.lock().map_err(|_| "Lock error")?;
    Ok(proc_state.processes.keys().cloned().collect())
}

// ==================== END PROCESS MANAGEMENT ====================

// ==================== PTY MANAGEMENT ====================

use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtyPair};

// PTY session state
struct PtySession {
    pair: PtyPair,
    writer: Box<dyn std::io::Write + Send>,
}

struct PtyState {
    sessions: HashMap<String, PtySession>,
}

type SharedPtyState = Arc<Mutex<PtyState>>;

// Event emitted for PTY output
#[derive(Clone, Serialize)]
struct PtyOutput {
    session_id: String,
    data: String,
}

// Event emitted when PTY exits
#[derive(Clone, Serialize)]
struct PtyExit {
    session_id: String,
    code: i32,
}

// Spawn a new PTY session
#[tauri::command]
async fn pty_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedPtyState>,
    session_id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<bool, String> {
    eprintln!("[PTY] Spawning session {} with shell {} in {}", session_id, shell, cwd);

    let pty_system = native_pty_system();

    // Create PTY with initial size
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to create PTY: {}", e))?;

    // Build command
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd);

    // Set environment variables for colors and proper terminal behavior
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");
    // macOS specific - enable colors for ls, grep, etc.
    cmd.env("CLICOLOR", "1");
    cmd.env("CLICOLOR_FORCE", "1");
    cmd.env("LSCOLORS", "GxFxCxDxBxegedabagaced");
    // Linux/GNU ls colors
    cmd.env("LS_COLORS", "di=1;36:ln=1;35:so=1;32:pi=1;33:ex=1;31:bd=34;46:cd=34;43:su=30;41:sg=30;46:tw=30;42:ow=30;43");

    // Spawn the shell in the PTY
    let mut child = pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    // Get writer for sending input
    let writer = pair.master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    // Get reader for receiving output
    let mut reader = pair.master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    // Store session
    {
        let mut pty_state = state.lock().map_err(|_| "Lock error")?;
        pty_state.sessions.insert(session_id.clone(), PtySession {
            pair,
            writer,
        });
    }

    // Spawn thread to read PTY output and emit events
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    thread::spawn(move || {
        use std::io::Read;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    eprintln!("[PTY {}] EOF", session_id_clone);
                    break;
                }
                Ok(n) => {
                    // Convert to string, handling invalid UTF-8
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("pty-output", PtyOutput {
                        session_id: session_id_clone.clone(),
                        data,
                    });
                }
                Err(e) => {
                    eprintln!("[PTY {}] Read error: {}", session_id_clone, e);
                    break;
                }
            }
        }
    });

    // Spawn thread to wait for process exit
    let app_exit = app.clone();
    let session_id_exit = session_id.clone();
    let state_clone = state.inner().clone();
    thread::spawn(move || {
        // Wait for child to exit
        let exit_status = child.wait();
        let code = match exit_status {
            Ok(status) => {
                if status.success() { 0 } else { 1 }
            }
            Err(_) => -1,
        };

        eprintln!("[PTY {}] Process exited with code {}", session_id_exit, code);

        // Emit exit event
        let _ = app_exit.emit("pty-exit", PtyExit {
            session_id: session_id_exit.clone(),
            code,
        });

        // Clean up session
        if let Ok(mut pty_state) = state_clone.lock() {
            pty_state.sessions.remove(&session_id_exit);
        }
    });

    eprintln!("[PTY] Session {} started", session_id);
    Ok(true)
}

// Write data to a PTY session
#[tauri::command]
fn pty_write(
    state: tauri::State<'_, SharedPtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut pty_state = state.lock().map_err(|_| "Lock error")?;

    let session = pty_state.sessions.get_mut(&session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    session.writer.write_all(data.as_bytes())
        .map_err(|e| format!("Write error: {}", e))?;

    session.writer.flush()
        .map_err(|e| format!("Flush error: {}", e))?;

    Ok(())
}

// Resize a PTY session
#[tauri::command]
fn pty_resize(
    state: tauri::State<'_, SharedPtyState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_state = state.lock().map_err(|_| "Lock error")?;

    let session = pty_state.sessions.get(&session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    session.pair.master.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| format!("Resize error: {}", e))?;

    eprintln!("[PTY {}] Resized to {}x{}", session_id, cols, rows);
    Ok(())
}

// Kill a PTY session
#[tauri::command]
fn pty_kill(
    state: tauri::State<'_, SharedPtyState>,
    session_id: String,
) -> Result<(), String> {
    let mut pty_state = state.lock().map_err(|_| "Lock error")?;

    if pty_state.sessions.remove(&session_id).is_some() {
        eprintln!("[PTY] Killed session {}", session_id);
    }

    Ok(())
}

// List active PTY sessions
#[tauri::command]
fn pty_list(
    state: tauri::State<'_, SharedPtyState>,
) -> Result<Vec<String>, String> {
    let pty_state = state.lock().map_err(|_| "Lock error")?;
    Ok(pty_state.sessions.keys().cloned().collect())
}

// ==================== END PTY MANAGEMENT ====================

// Install an LSP server for a given language
#[tauri::command]
async fn lsp_install_server(language_id: String) -> Result<String, String> {
    let (install_cmd, args): (&str, Vec<&str>) = match language_id.as_str() {
        "typescript" | "javascript" => ("npm", vec!["install", "-g", "typescript-language-server", "typescript"]),
        "vue" => ("npm", vec!["install", "-g", "@vue/language-server"]),
        "json" => ("npm", vec!["install", "-g", "vscode-langservers-extracted"]),
        "css" | "html" => ("npm", vec!["install", "-g", "vscode-langservers-extracted"]),
        "python" => ("pip3", vec!["install", "--user", "python-lsp-server"]),
        "go" => ("go", vec!["install", "golang.org/x/tools/gopls@latest"]),
        "rust" => {
            // rust-analyzer is usually installed via rustup
            return Err("Install rust-analyzer via: rustup component add rust-analyzer".to_string());
        }
        _ => return Err(format!("No install command for language: {}", language_id)),
    };

    eprintln!("[LSP Install] Installing {} server: {} {:?}", language_id, install_cmd, args);

    let output = Command::new(install_cmd)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run install command: {}", e))?;

    if output.status.success() {
        let msg = format!("Successfully installed LSP server for {}", language_id);
        eprintln!("[LSP Install] {}", msg);
        Ok(msg)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!("Failed to install {}: {}", language_id, stderr);
        eprintln!("[LSP Install] {}", msg);
        Err(msg)
    }
}

// ==================== BROWSER WEBVIEW MANAGEMENT ====================

// Browser tab info sent to frontend
#[derive(Clone, Serialize)]
struct BrowserTabInfo {
    id: String,
    url: String,
    title: String,
    can_go_back: bool,
    can_go_forward: bool,
}

// Browser state - tracks all browser windows/tabs
struct BrowserState {
    tabs: HashMap<String, String>, // tab_id -> window_label mapping
}

type SharedBrowserState = Arc<Mutex<BrowserState>>;

// Create a new browser tab (frameless child window positioned to appear embedded)
#[tauri::command]
async fn browser_create_tab(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
    url: String,
) -> Result<BrowserTabInfo, String> {
    let window_label = format!("browser-{}", tab_id);

    eprintln!("[Browser] Creating tab {} with URL: {}", tab_id, url);

    // Parse URL, default to google if empty
    let nav_url = if url.is_empty() {
        "https://www.google.com".to_string()
    } else if !url.starts_with("http://") && !url.starts_with("https://") && !url.starts_with("about:") {
        format!("https://{}", url)
    } else {
        url.clone()
    };

    // Get main window for parenting
    let main_window = app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    // Create the webview URL
    let webview_url = WebviewUrl::External(nav_url.parse().map_err(|e| format!("Invalid URL: {}", e))?);

    // Create frameless child window - start hidden, frontend will position it
    let _window = WebviewWindowBuilder::new(&app, &window_label, webview_url)
        .title("Browser Tab")
        .decorations(false)  // No window decorations (frameless)
        .transparent(false)
        .resizable(false)    // Controlled by main window resize
        .skip_taskbar(true)  // Don't show in taskbar
        .visible(false)      // Start hidden until positioned
        .inner_size(800.0, 600.0)
        .parent(&main_window)
        .map_err(|e| format!("Failed to set parent: {}", e))?
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    // Store the tab
    {
        let mut browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.insert(tab_id.clone(), window_label);
    }

    Ok(BrowserTabInfo {
        id: tab_id,
        url: nav_url,
        title: "New Tab".to_string(),
        can_go_back: false,
        can_go_forward: false,
    })
}

// Close a browser tab
#[tauri::command]
async fn browser_close_tab(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
) -> Result<(), String> {
    let window_label = {
        let mut browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.remove(&tab_id)
    };

    if let Some(label) = window_label {
        if let Some(window) = app.get_webview_window(&label) {
            window.close().map_err(|e| format!("Failed to close window: {}", e))?;
        }
    }

    eprintln!("[Browser] Closed tab {}", tab_id);
    Ok(())
}

// Navigate to a URL in a tab
#[tauri::command]
async fn browser_navigate(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let window_label = {
        let browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.get(&tab_id).cloned()
    };

    let label = window_label.ok_or_else(|| format!("Tab {} not found", tab_id))?;
    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("Window {} not found", label))?;

    // Parse URL
    let nav_url = if !url.starts_with("http://") && !url.starts_with("https://") && !url.starts_with("about:") {
        format!("https://{}", url)
    } else {
        url
    };

    let parsed_url: tauri::Url = nav_url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    window.navigate(parsed_url).map_err(|e| format!("Navigation failed: {}", e))?;

    eprintln!("[Browser] Tab {} navigating to: {}", tab_id, nav_url);
    Ok(())
}

// Show/hide a browser tab
#[tauri::command]
async fn browser_set_tab_visible(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
    visible: bool,
) -> Result<(), String> {
    let window_label = {
        let browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.get(&tab_id).cloned()
    };

    let label = window_label.ok_or_else(|| format!("Tab {} not found", tab_id))?;
    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("Window {} not found", label))?;

    if visible {
        window.show().map_err(|e| format!("Show failed: {}", e))?;
        window.set_focus().map_err(|e| format!("Focus failed: {}", e))?;
    } else {
        window.hide().map_err(|e| format!("Hide failed: {}", e))?;
    }

    Ok(())
}

// Reload a tab
#[tauri::command]
async fn browser_reload(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
) -> Result<(), String> {
    let window_label = {
        let browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.get(&tab_id).cloned()
    };

    let label = window_label.ok_or_else(|| format!("Tab {} not found", tab_id))?;
    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("Window {} not found", label))?;

    // Execute reload via JavaScript
    window.eval("location.reload()").map_err(|e| format!("Reload failed: {}", e))?;

    eprintln!("[Browser] Reloading tab {}", tab_id);
    Ok(())
}

// Get current URL of a tab
#[tauri::command]
async fn browser_get_url(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
) -> Result<String, String> {
    let window_label = {
        let browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.get(&tab_id).cloned()
    };

    let label = window_label.ok_or_else(|| format!("Tab {} not found", tab_id))?;
    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("Window {} not found", label))?;

    window.url().map(|u| u.to_string()).map_err(|e| format!("Failed to get URL: {}", e))
}

// Toggle developer tools for a tab
// Note: Devtools API requires specific Tauri features enabled
#[tauri::command]
async fn browser_toggle_devtools(
    _app: tauri::AppHandle,
    _state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
) -> Result<(), String> {
    // Devtools toggle not available in this Tauri build configuration
    // In production builds, devtools are typically disabled
    eprintln!("[Browser] Devtools toggle requested for tab {} (not available in this build)", tab_id);
    Ok(())
}

// Close all browser tabs
#[tauri::command]
async fn browser_close_all(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
) -> Result<(), String> {
    let tabs: Vec<String> = {
        let mut browser_state = state.lock().map_err(|_| "Lock error")?;
        let labels: Vec<String> = browser_state.tabs.values().cloned().collect();
        browser_state.tabs.clear();
        labels
    };

    for label in tabs {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }

    eprintln!("[Browser] Closed all tabs");
    Ok(())
}

// Open a standalone browser window (with decorations, not embedded)
#[tauri::command]
async fn browser_open_standalone(
    app: tauri::AppHandle,
    url: String,
    title: String,
    width: f64,
    height: f64,
) -> Result<String, String> {
    let window_id = format!("standalone-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    eprintln!("[Browser] Opening standalone window: {} ({}x{})", url, width, height);

    // Parse URL
    let nav_url = if url.is_empty() {
        "https://www.google.com".to_string()
    } else if !url.starts_with("http://") && !url.starts_with("https://") {
        format!("https://{}", url)
    } else {
        url.clone()
    };

    let webview_url = WebviewUrl::External(nav_url.parse().map_err(|e| format!("Invalid URL: {}", e))?);

    // Create standalone window with decorations
    let _window = WebviewWindowBuilder::new(&app, &window_id, webview_url)
        .title(&title)
        .decorations(true)       // Window decorations (title bar, close button)
        .transparent(false)
        .resizable(true)         // Allow resizing
        .skip_taskbar(false)     // Show in taskbar
        .visible(true)           // Show immediately
        .inner_size(width, height)
        .center()                // Center on screen
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    eprintln!("[Browser] Standalone window created: {}", window_id);
    Ok(window_id)
}

// Go back in browser history
#[tauri::command]
async fn browser_go_back(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
) -> Result<(), String> {
    let window_label = {
        let browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.get(&tab_id).cloned()
    };

    let label = window_label.ok_or_else(|| format!("Tab {} not found", tab_id))?;
    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("Window {} not found", label))?;

    // Use JavaScript to go back
    window.eval("history.back()").map_err(|e| format!("Back failed: {}", e))?;

    eprintln!("[Browser] Tab {} going back", tab_id);
    Ok(())
}

// Go forward in browser history
#[tauri::command]
async fn browser_go_forward(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
) -> Result<(), String> {
    let window_label = {
        let browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.get(&tab_id).cloned()
    };

    let label = window_label.ok_or_else(|| format!("Tab {} not found", tab_id))?;
    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("Window {} not found", label))?;

    // Use JavaScript to go forward
    window.eval("history.forward()").map_err(|e| format!("Forward failed: {}", e))?;

    eprintln!("[Browser] Tab {} going forward", tab_id);
    Ok(())
}

// Update browser tab position and size (called when main window moves/resizes)
#[tauri::command]
async fn browser_set_tab_bounds(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBrowserState>,
    tab_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window_label = {
        let browser_state = state.lock().map_err(|_| "Lock error")?;
        browser_state.tabs.get(&tab_id).cloned()
    };

    let label = window_label.ok_or_else(|| format!("Tab {} not found", tab_id))?;
    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("Window {} not found", label))?;

    // Update position and size
    use tauri::{LogicalPosition, LogicalSize};
    window.set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {}", e))?;
    window.set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {}", e))?;

    Ok(())
}

// ==================== END BROWSER MANAGEMENT ====================

// ==================== ANTHROPIC OAUTH ====================

// OAuth token response
#[derive(Clone, Serialize, Deserialize, Debug)]
struct OAuthTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

// State for OAuth flow
struct OAuthState {
    pending_auth: Option<OAuthPendingAuth>,
}

#[derive(Clone)]
struct OAuthPendingAuth {
    state: String,
    code_verifier: String,
    client_id: String,
    redirect_uri: String,
}

type SharedOAuthState = Arc<Mutex<OAuthState>>;

// Generate PKCE code verifier and challenge
fn generate_pkce() -> (String, String) {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use sha2::{Sha256, Digest};

    // Generate 32 random bytes for verifier
    let mut verifier_bytes = [0u8; 32];
    getrandom::getrandom(&mut verifier_bytes).unwrap_or_default();
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    // SHA256 hash of verifier, then base64url encode
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    let challenge = URL_SAFE_NO_PAD.encode(hash);

    (verifier, challenge)
}

// Generate random state for OAuth
fn generate_state() -> String {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    let mut state_bytes = [0u8; 32];
    getrandom::getrandom(&mut state_bytes).unwrap_or_default();
    URL_SAFE_NO_PAD.encode(state_bytes)
}

// Start OAuth flow - opens system browser and returns auth URL
// User must complete login in browser, then the callback page will show instructions
#[tauri::command]
async fn oauth_start(
    _app: tauri::AppHandle,
    oauth_state: tauri::State<'_, SharedOAuthState>,
    client_id: String,
    scopes: Vec<String>,
) -> Result<String, String> {
    let (code_verifier, code_challenge) = generate_pkce();
    let state = generate_state();

    // Use the console.anthropic.com callback - this will show the auth code to copy
    let redirect_uri = "https://console.anthropic.com/oauth/code/callback".to_string();

    // Use all scopes that Claude Code uses for MAX subscription
    // Scopes need to have colons URL-encoded, but joined with + (which represents space)
    let default_scopes = vec![
        "org%3Acreate_api_key",
        "user%3Aprofile",
        "user%3Ainference",
        "user%3Asessions%3Aclaude_code",
    ];
    let scope = if scopes.is_empty() {
        default_scopes.join("+")
    } else {
        // URL-encode colons in custom scopes
        scopes.iter()
            .map(|s| s.replace(":", "%3A"))
            .collect::<Vec<_>>()
            .join("+")
    };

    // Build authorization URL exactly like Claude Code does
    let auth_url = format!(
        "https://claude.ai/oauth/authorize?code=true&client_id={}&response_type=code&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
        client_id,
        urlencoding::encode(&redirect_uri),
        scope,
        code_challenge,
        state
    );

    // Store pending auth state
    {
        let mut oauth = oauth_state.lock().map_err(|_| "Lock error")?;
        oauth.pending_auth = Some(OAuthPendingAuth {
            state: state.clone(),
            code_verifier,
            client_id,
            redirect_uri,
        });
    }

    eprintln!("[OAuth] Starting OAuth flow with state: {}", state);
    eprintln!("[OAuth] Auth URL: {}", auth_url);

    // Open the URL in the system's default browser
    // This avoids the webview popup blocking issues
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg(&auth_url)
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&auth_url)
            .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("rundll32")
            .args(&["url.dll,FileProtocolHandler", &auth_url])
            .spawn();
    }

    // Return the state so the frontend can track the OAuth flow
    // The user will need to copy the code from the callback page
    Ok(state)
}

// Get pending OAuth info (used by frontend to get code_verifier for manual exchange)
#[tauri::command]
fn oauth_get_pending(
    oauth_state: tauri::State<'_, SharedOAuthState>,
) -> Result<serde_json::Value, String> {
    let oauth = oauth_state.lock().map_err(|_| "Lock error")?;

    if let Some(ref pending) = oauth.pending_auth {
        Ok(serde_json::json!({
            "state": pending.state,
            "code_verifier": pending.code_verifier,
            "client_id": pending.client_id,
            "redirect_uri": pending.redirect_uri
        }))
    } else {
        Err("No pending OAuth flow".to_string())
    }
}

// Exchange authorization code for tokens
// First tries console.anthropic.com (no Cloudflare), falls back to webview if needed
#[tauri::command]
async fn oauth_exchange(
    app: tauri::AppHandle,
    oauth_state: tauri::State<'_, SharedOAuthState>,
    code: String,
    state: String,
) -> Result<OAuthTokenResponse, String> {
    eprintln!("[OAuth] Starting token exchange for code, state: {}", state);

    // Get and validate pending auth
    let pending = {
        let oauth = oauth_state.lock().map_err(|_| "Lock error")?;
        oauth.pending_auth.clone()
    }.ok_or("No pending OAuth flow")?;

    // Note: We don't validate state here because the user may copy just the code
    // The code contains embedded state validation via PKCE

    eprintln!("[OAuth] Got pending auth, trying direct HTTP exchange first...");

    // The code format is: actual_code#state (from callback URL)
    let (actual_code, code_state) = if code.contains('#') {
        let parts: Vec<&str> = code.splitn(2, '#').collect();
        (parts[0].to_string(), Some(parts.get(1).map(|s| s.to_string()).unwrap_or_default()))
    } else {
        (code.clone(), None)
    };

    eprintln!("[OAuth] Code split: actual_code={}, has_state={}",
        &actual_code[..20.min(actual_code.len())],
        code_state.is_some());

    // Build the token request body
    let mut token_body = serde_json::json!({
        "grant_type": "authorization_code",
        "code": actual_code,
        "client_id": pending.client_id,
        "redirect_uri": pending.redirect_uri,
        "code_verifier": pending.code_verifier
    });

    // Add state if present
    if let Some(ref s) = code_state {
        token_body["state"] = serde_json::json!(s);
    }

    // First try: Direct HTTP request to console.anthropic.com (no Cloudflare)
    let client = reqwest::Client::builder()
        .user_agent("claude-cli/2.1.2 (external, cli)")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Try console.anthropic.com endpoint first
    eprintln!("[OAuth] Trying console.anthropic.com endpoint...");
    let console_result = client
        .post("https://console.anthropic.com/v1/oauth/token")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&token_body)
        .send()
        .await;

    match console_result {
        Ok(response) => {
            let status = response.status();
            eprintln!("[OAuth] Console response status: {}", status);
            if status.is_success() {
                match response.json::<OAuthTokenResponse>().await {
                    Ok(token_response) => {
                        if token_response.error.is_none() && !token_response.access_token.is_empty() {
                            eprintln!("[OAuth] Console endpoint succeeded!");
                            let mut oauth = oauth_state.lock().map_err(|_| "Lock error")?;
                            oauth.pending_auth = None;
                            return Ok(token_response);
                        }
                        eprintln!("[OAuth] Console got error in response: {:?}", token_response.error);
                    }
                    Err(e) => eprintln!("[OAuth] Console parse error: {}", e),
                }
            } else {
                let body = response.text().await.unwrap_or_default();
                eprintln!("[OAuth] Console error body: {}", body);
            }
        }
        Err(e) => eprintln!("[OAuth] Console request error: {}", e),
    }

    // Second try: Direct HTTP request to claude.ai with browser-like headers
    eprintln!("[OAuth] Trying claude.ai endpoint with browser headers...");
    let claude_result = client
        .post("https://claude.ai/oauth/token")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("Origin", "https://claude.ai")
        .header("Referer", "https://claude.ai/")
        .json(&token_body)
        .send()
        .await;

    match claude_result {
        Ok(response) => {
            let status = response.status();
            eprintln!("[OAuth] Claude.ai response status: {}", status);
            if status.is_success() {
                match response.json::<OAuthTokenResponse>().await {
                    Ok(token_response) => {
                        if token_response.error.is_none() && !token_response.access_token.is_empty() {
                            eprintln!("[OAuth] Claude.ai endpoint succeeded!");
                            let mut oauth = oauth_state.lock().map_err(|_| "Lock error")?;
                            oauth.pending_auth = None;
                            return Ok(token_response);
                        }
                        eprintln!("[OAuth] Claude.ai got error in response: {:?}", token_response.error);
                    }
                    Err(e) => eprintln!("[OAuth] Claude.ai parse error: {}", e),
                }
            } else {
                let body = response.text().await.unwrap_or_default();
                eprintln!("[OAuth] Claude.ai error body: {}", body);
            }
        }
        Err(e) => eprintln!("[OAuth] Claude.ai request error: {}", e),
    }

    eprintln!("[OAuth] Direct HTTP failed, falling back to webview...");

    // Webview approach to bypass Cloudflare (HTTP clients get blocked)
    let window_label = format!("oauth-exchange-{}", state);
    eprintln!("[OAuth] Creating off-screen webview for token exchange");

    let exchange_window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External("https://claude.ai".parse().unwrap())
    )
    .title("Authenticating...")
    .inner_size(400.0, 300.0)
    .position(-2000.0, -2000.0)  // Off-screen so user doesn't see it
    .build()
    .map_err(|e| format!("Failed to create exchange window: {}", e))?;

    // Wait for Cloudflare challenge
    eprintln!("[OAuth] Waiting for Cloudflare to pass...");
    tokio::time::sleep(Duration::from_secs(5)).await;

    // For webview, we also need to use the split code
    let exchange_js = format!(
        r#"
        (async () => {{
            try {{
                document.title = 'OAUTH_WORKING...';
                const body = {{
                    grant_type: 'authorization_code',
                    code: '{}',
                    client_id: '{}',
                    redirect_uri: '{}',
                    code_verifier: '{}'
                }};
                {}
                const response = await fetch('https://claude.ai/oauth/token', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify(body)
                }});
                const data = await response.json();
                document.title = 'OAUTH_DONE:' + JSON.stringify(data);
            }} catch (e) {{
                document.title = 'OAUTH_DONE:' + JSON.stringify({{ error: e.message }});
            }}
        }})()
        "#,
        actual_code,
        pending.client_id,
        pending.redirect_uri,
        pending.code_verifier,
        // Add state if present
        if let Some(ref s) = code_state { format!("body.state = '{}';", s) } else { String::new() }
    );

    eprintln!("[OAuth] Executing token exchange fetch...");

    let result = exchange_window.eval(&exchange_js);
    if let Err(e) = result {
        let _ = exchange_window.close();
        return Err(format!("Failed to execute exchange: {}", e));
    }

    // Poll for completion
    for _ in 0..30 {
        tokio::time::sleep(Duration::from_millis(500)).await;

        if let Ok(title) = exchange_window.title() {
            if title.starts_with("OAUTH_DONE:") {
                let json_str = title.trim_start_matches("OAUTH_DONE:");
                eprintln!("[OAuth] Got result: {}", json_str);

                let _ = exchange_window.close();

                // Clear pending auth
                {
                    let mut oauth = oauth_state.lock().map_err(|_| "Lock error")?;
                    oauth.pending_auth = None;
                }

                let token_response: OAuthTokenResponse = serde_json::from_str(json_str)
                    .map_err(|e| format!("Failed to parse token response: {}", e))?;

                if token_response.error.is_some() {
                    return Err(format!("OAuth error: {} - {}",
                        token_response.error.unwrap_or_default(),
                        token_response.error_description.unwrap_or_default()
                    ));
                }

                return Ok(token_response);
            }
        }
    }

    let _ = exchange_window.close();
    Err("Token exchange timed out".to_string())
}

// Close OAuth window (no-op now since we use system browser)
#[tauri::command]
async fn oauth_close_window(_app: tauri::AppHandle) -> Result<(), String> {
    // No-op - system browser window is managed by the OS
    Ok(())
}

// Read tokens from Claude Code keychain (if user has Claude Code installed and authenticated)
#[tauri::command]
fn oauth_read_keychain() -> Result<OAuthTokenResponse, String> {
    use std::process::Command;

    eprintln!("[OAuth] Reading tokens from Claude Code keychain...");

    // Use macOS security command to read from keychain
    let output = Command::new("security")
        .args(&["find-generic-password", "-s", "Claude Code-credentials", "-w"])
        .output()
        .map_err(|e| format!("Failed to read keychain: {}", e))?;

    if !output.status.success() {
        return Err("Claude Code credentials not found in keychain. Please authenticate with Claude Code first.".to_string());
    }

    let json_str = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid keychain data: {}", e))?;

    // Parse the Claude Code credential format
    #[derive(Deserialize)]
    struct ClaudeCodeOAuth {
        #[serde(rename = "accessToken")]
        access_token: String,
        #[serde(rename = "refreshToken")]
        refresh_token: Option<String>,
        #[serde(rename = "expiresAt")]
        expires_at: Option<u64>,
    }

    #[derive(Deserialize)]
    struct ClaudeCodeCredentials {
        #[serde(rename = "claudeAiOauth")]
        claude_ai_oauth: Option<ClaudeCodeOAuth>,
    }

    let creds: ClaudeCodeCredentials = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse credentials: {}", e))?;

    let oauth = creds.claude_ai_oauth
        .ok_or("No Claude AI OAuth credentials found")?;

    // Check if token is expired
    if let Some(expires_at) = oauth.expires_at {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        if expires_at < now {
            return Err("Claude Code token is expired. Please re-authenticate with Claude Code.".to_string());
        }
    }

    eprintln!("[OAuth] Successfully read token from keychain");

    Ok(OAuthTokenResponse {
        access_token: oauth.access_token,
        refresh_token: oauth.refresh_token,
        expires_in: None,
        token_type: Some("Bearer".to_string()),
        error: None,
        error_description: None,
    })
}

// ==================== END ANTHROPIC OAUTH ====================

// Detect languages used in a project by scanning files
#[tauri::command]
fn lsp_detect_languages(root_path: String) -> Vec<String> {
    use std::collections::HashSet;
    use std::fs;

    let mut languages = HashSet::new();

    // Check for config files that indicate language usage
    let config_indicators = [
        ("go.mod", "go"),
        ("Cargo.toml", "rust"),
        ("package.json", "typescript"),  // Assume TS for JS projects
        ("tsconfig.json", "typescript"),
        ("pyproject.toml", "python"),
        ("requirements.txt", "python"),
        ("setup.py", "python"),
    ];

    for (file, lang) in config_indicators.iter() {
        let path = std::path::Path::new(&root_path).join(file);
        if path.exists() {
            languages.insert(lang.to_string());
        }
    }

    // Scan for file extensions (limit depth for performance)
    fn scan_dir(dir: &std::path::Path, languages: &mut HashSet<String>, depth: u32) {
        if depth > 3 { return; }

        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            // Skip common non-source directories
            if name.starts_with('.') || name == "node_modules" || name == "vendor"
                || name == "target" || name == "dist" || name == "build" {
                continue;
            }

            if path.is_dir() {
                scan_dir(&path, languages, depth + 1);
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                match ext {
                    "go" => { languages.insert("go".to_string()); }
                    "rs" => { languages.insert("rust".to_string()); }
                    "ts" | "tsx" => { languages.insert("typescript".to_string()); }
                    "js" | "jsx" | "mjs" => { languages.insert("typescript".to_string()); }
                    "vue" => { languages.insert("vue".to_string()); }
                    "py" => { languages.insert("python".to_string()); }
                    "json" => { languages.insert("json".to_string()); }
                    "css" | "scss" | "less" => { languages.insert("css".to_string()); }
                    "html" | "htm" => { languages.insert("html".to_string()); }
                    _ => {}
                }
            }
        }
    }

    scan_dir(std::path::Path::new(&root_path), &mut languages, 0);

    eprintln!("[LSP] Detected languages in {}: {:?}", root_path, languages);
    languages.into_iter().collect()
}

#[derive(Clone, Serialize, Deserialize)]
struct ContextRequest {
    id: String,
    #[serde(rename = "type")]
    request_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
}

#[derive(Clone, Serialize, Deserialize)]
struct ContextResponse {
    id: Option<String>,
    success: Option<bool>,
    data: Option<serde_json::Value>,
    error: Option<String>,
    #[serde(rename = "type")]
    message_type: Option<String>,
}

// Start the context service sidecar (idempotent - returns existing address if already connected)
#[tauri::command]
async fn start_context_service(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedContextState>,
) -> Result<String, String> {
    // If another call is already starting the sidecar, wait for it to finish.
    // MCP auto-connect can take 3-5s, so we wait up to 15s before giving up.
    if CONTEXT_STARTING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        eprintln!("[context-service] start_context_service: another spawn in progress, waiting for address...");
        for i in 0..150 {
            // Check if the spawning call finished (flag cleared) and stored an address
            if let Ok(ctx) = state.lock() {
                if let Some(addr) = ctx.address.clone() {
                    // Address stored — verify it's reachable before returning
                    if TcpStream::connect(&addr).is_ok() {
                        eprintln!("[context-service] start_context_service: reusing address {} after {}ms wait", addr, i * 100);
                        return Ok(addr);
                    }
                }
            }
            // If the spawning call already finished (flag is false) but no address is available,
            // break out and try to become the spawner ourselves.
            if !CONTEXT_STARTING.load(Ordering::SeqCst) {
                // Double-check for address one more time (it may have been stored just before flag cleared)
                if let Ok(ctx) = state.lock() {
                    if let Some(addr) = ctx.address.clone() {
                        if TcpStream::connect(&addr).is_ok() {
                            eprintln!("[context-service] start_context_service: reusing address {} (flag cleared)", addr);
                            return Ok(addr);
                        }
                    }
                }
                eprintln!("[context-service] start_context_service: previous spawn finished without address, will retry as spawner");
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        // Either timed out or previous spawn failed — try to become the spawner
        if CONTEXT_STARTING
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("Context service start already in progress (timed out waiting)".to_string());
        }
        // Fall through to spawn logic below
        eprintln!("[context-service] start_context_service: acquired spawner lock after wait");
    }

    // Reuse known address when possible to avoid spawning duplicate sidecars.
    let existing_addr = {
        let ctx = state.lock().map_err(|_| "Lock error".to_string())?;
        ctx.address.clone()
    };

    if let Some(addr) = existing_addr {
        if TcpStream::connect(&addr).is_ok() {
            eprintln!("[context-service] start_context_service: reusing existing address {}", addr);
            CONTEXT_STARTING.store(false, Ordering::SeqCst);
            return Ok(addr);
        }
        // Stale address (old sidecar died): clear and fall through to spawn a new one.
        eprintln!("[context-service] start_context_service: existing address {} unreachable, spawning new sidecar", addr);
        let mut ctx = state.lock().map_err(|_| "Lock error".to_string())?;
        ctx.socket = None;
        ctx.address = None;
        ctx.child = None;
    }

    eprintln!("[context-service] start_context_service: spawning new sidecar process");

    let sidecar = app
        .shell()
        .sidecar("construct-context")
        .map_err(|e| {
            CONTEXT_STARTING.store(false, Ordering::SeqCst);
            format!("Failed to create sidecar: {}", e)
        })?;

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| {
            CONTEXT_STARTING.store(false, Ordering::SeqCst);
            format!("Failed to spawn sidecar: {}", e)
        })?;

    // Keep child handle alive to prevent sidecar process from being dropped.
    {
        let mut ctx = state.lock().map_err(|_| {
            CONTEXT_STARTING.store(false, Ordering::SeqCst);
            "Lock error".to_string()
        })?;
        ctx.child = Some(child);
    }

    // Wait for the address output
    use tauri_plugin_shell::process::CommandEvent;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line);
                if let Some(addr) = line_str.strip_prefix("CONTEXT_ADDR=") {
                    let address = addr.trim().to_string();
                    eprintln!("[context-service] start_context_service: sidecar ready at {}", address);
                    // Store address immediately so subsequent start calls can reuse it.
                    if let Ok(mut ctx) = state.lock() {
                        ctx.address = Some(address.clone());
                    }
                    CONTEXT_STARTING.store(false, Ordering::SeqCst);
                    return Ok(address);
                }
            }
            CommandEvent::Stderr(line) => {
                eprintln!("[context-service] {}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Error(err) => {
                eprintln!("[context-service] start_context_service: sidecar error: {}", err);
                if let Ok(mut ctx) = state.lock() {
                    ctx.child = None;
                    ctx.address = None;
                    ctx.socket = None;
                }
                CONTEXT_STARTING.store(false, Ordering::SeqCst);
                return Err(format!("Sidecar error: {}", err));
            }
            CommandEvent::Terminated(status) => {
                eprintln!("[context-service] start_context_service: sidecar terminated: {:?}", status);
                if let Ok(mut ctx) = state.lock() {
                    ctx.child = None;
                    ctx.address = None;
                    ctx.socket = None;
                }
                CONTEXT_STARTING.store(false, Ordering::SeqCst);
                return Err(format!("Sidecar terminated: {:?}", status));
            }
            _ => {}
        }
    }

    CONTEXT_STARTING.store(false, Ordering::SeqCst);
    Err("Failed to get context service address".to_string())
}

// Connect to context service
#[tauri::command]
fn connect_context(
    state: tauri::State<'_, SharedContextState>,
    address: String,
) -> Result<(), String> {
    // Check if already connected to this address
    {
        let ctx = state.lock().map_err(|_| "Lock error".to_string())?;
        if ctx.socket.is_some() && ctx.address.as_ref() == Some(&address) {
            return Ok(()); // Already connected to same address
        }
    }

    let parts: Vec<&str> = address.split(':').collect();
    if parts.len() != 2 {
        return Err("Invalid address format".to_string());
    }

    let host = parts[0].to_string();
    let port: u16 = parts[1]
        .parse()
        .map_err(|_| "Invalid port number".to_string())?;

    let socket = TcpStream::connect(&address).map_err(|e| format!("Connection failed: {}", e))?;

    let mut ctx = state.lock().map_err(|_| "Lock error".to_string())?;
    ctx.socket = Some(socket);
    ctx.host = host;
    ctx.port = port;
    ctx.address = Some(address);

    Ok(())
}

// Check if connected
#[tauri::command]
fn is_connected(state: tauri::State<'_, SharedContextState>) -> bool {
    state
        .lock()
        .map(|ctx| ctx.socket.is_some())
        .unwrap_or(false)
}

// Get timeout based on request type (AI requests need longer timeout)
fn get_request_timeout(request_type: &str) -> Duration {
    if request_type.starts_with("ai.") {
        Duration::from_secs(300) // 5 minutes for AI requests
    } else {
        Duration::from_secs(30) // 30 seconds for other requests
    }
}

// Send request to context service with timeout
fn send_request_internal(
    socket: &mut TcpStream,
    request_type: String,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let id = MESSAGE_ID.fetch_add(1, Ordering::SeqCst).to_string();

    let request = ContextRequest {
        id: id.clone(),
        request_type: request_type.clone(),
        payload,
    };

    // Set read timeout based on request type (non-fatal if it fails on some platforms)
    let timeout = get_request_timeout(&request_type);
    let _ = socket.set_read_timeout(Some(timeout));

    // Send request
    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    socket
        .write_all(format!("{}\n", request_json).as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;

    // Read response with timeout
    let mut reader = BufReader::new(socket.try_clone().map_err(|e| e.to_string())?);
    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => return Err("Connection closed".to_string()),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                return Err(format!("Request timeout after {:?}", timeout));
            }
            Err(e) => return Err(format!("Read failed: {}", e)),
        }

        if line.trim().is_empty() {
            continue;
        }

        let response: ContextResponse =
            serde_json::from_str(&line).map_err(|e| format!("Parse failed: {}", e))?;

        if response.id.as_ref() == Some(&id) {
            if response.success.unwrap_or(false) {
                return Ok(response.data.unwrap_or(serde_json::Value::Null));
            } else {
                return Err(response.error.unwrap_or_else(|| "Unknown error".to_string()));
            }
        }
    }
}

// Send request to context service with auto-reconnect on broken pipe
#[tauri::command]
fn send_context_request(
    state: tauri::State<'_, SharedContextState>,
    request_type: String,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let mut ctx = state.lock().map_err(|_| "Lock error".to_string())?;

    // Get the address for potential reconnection
    let address = ctx.address.clone();

    let socket = ctx
        .socket
        .as_mut()
        .ok_or_else(|| "Not connected".to_string())?;

    // Try the request
    match send_request_internal(socket, request_type.clone(), payload.clone()) {
        Ok(result) => Ok(result),
        Err(e) if e.contains("Broken pipe") || e.contains("Connection reset") => {
            // Connection was lost - try to reconnect
            eprintln!("[Context] Connection lost, attempting reconnect...");

            if let Some(addr) = address {
                match TcpStream::connect(&addr) {
                    Ok(new_socket) => {
                        ctx.socket = Some(new_socket);
                        eprintln!("[Context] Reconnected successfully");

                        // Retry the request with new socket
                        let socket = ctx.socket.as_mut().unwrap();
                        send_request_internal(socket, request_type, payload)
                    }
                    Err(reconnect_err) => {
                        ctx.socket = None;
                        Err(format!("Connection lost and reconnect failed: {}", reconnect_err))
                    }
                }
            } else {
                ctx.socket = None;
                Err("Connection lost and no address available for reconnect".to_string())
            }
        }
        Err(e) => Err(e),
    }
}

// Context operations
#[tauri::command]
fn context_get(state: tauri::State<'_, SharedContextState>) -> Result<serde_json::Value, String> {
    send_context_request(state, "context.get".to_string(), None)
}

#[tauri::command]
fn context_set_mode(
    state: tauri::State<'_, SharedContextState>,
    mode: String,
) -> Result<serde_json::Value, String> {
    send_context_request(
        state,
        "context.set_mode".to_string(),
        Some(serde_json::json!({ "mode": mode })),
    )
}

#[tauri::command]
fn context_set_component(
    state: tauri::State<'_, SharedContextState>,
    component: serde_json::Value,
) -> Result<serde_json::Value, String> {
    send_context_request(state, "context.set_component".to_string(), Some(component))
}

#[tauri::command]
fn context_set_project(
    state: tauri::State<'_, SharedContextState>,
    project: serde_json::Value,
) -> Result<serde_json::Value, String> {
    send_context_request(state, "context.set_project".to_string(), Some(project))
}

#[tauri::command]
fn context_set_selection(
    state: tauri::State<'_, SharedContextState>,
    selection: serde_json::Value,
) -> Result<serde_json::Value, String> {
    send_context_request(state, "context.set_selection".to_string(), Some(selection))
}

#[tauri::command]
fn context_ping(state: tauri::State<'_, SharedContextState>) -> Result<serde_json::Value, String> {
    send_context_request(state, "system.ping".to_string(), None)
}

#[tauri::command]
fn list_models(state: tauri::State<'_, SharedContextState>) -> Result<serde_json::Value, String> {
    send_context_request(state, "ai.models".to_string(), None)
}

#[tauri::command]
fn list_providers(state: tauri::State<'_, SharedContextState>) -> Result<serde_json::Value, String> {
    send_context_request(state, "ai.providers".to_string(), None)
}

#[tauri::command]
fn list_agents(state: tauri::State<'_, SharedContextState>) -> Result<serde_json::Value, String> {
    send_context_request(state, "agents.list".to_string(), None)
}

#[tauri::command]
fn chat_direct(
    state: tauri::State<'_, SharedContextState>,
    model: String,
    messages: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    send_context_request(
        state,
        "ai.chat_direct".to_string(),
        Some(serde_json::json!({
            "model": model,
            "messages": messages
        })),
    )
}

// Model routing info from smart router
#[derive(Clone, Serialize, Deserialize)]
struct ModelRoute {
    tier: Option<String>,
    model: Option<String>,
    reason: Option<String>,
    #[serde(rename = "hasVision")]
    has_vision: Option<bool>,
    complexity: Option<String>,
}

// Streaming chat response
#[derive(Clone, Serialize)]
struct StreamChunk {
    content: String,
    done: bool,
    error: Option<String>,
    #[serde(rename = "type")]
    message_type: Option<String>,
    route: Option<ModelRoute>,
}

#[tauri::command]
async fn chat_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedContextState>,
    model: String,
    messages: Vec<serde_json::Value>,
    token: Option<String>,
    agent_id: Option<String>,              // Agent ID from registry (e.g. "design")
    local_data: Option<serde_json::Value>, // Frontend-provided local data (designs, canvas state, etc.)
    max_iterations: Option<i32>,           // Override max agentic loop iterations
) -> Result<(), String> {
    use std::thread;

    eprintln!("[chat_stream] Called with model: {}", model);

    // Clone what we need for the thread
    let state_clone = {
        let ctx = state.lock().map_err(|_| "Lock error".to_string())?;
        if ctx.socket.is_none() {
            eprintln!("[chat_stream] Error: Not connected");
            return Err("Not connected".to_string());
        }
        eprintln!("[chat_stream] Connected to {}:{}", ctx.host, ctx.port);
        (ctx.host.clone(), ctx.port)
    };

    let app_clone = app.clone();

    // Spawn a thread for streaming to avoid blocking
    thread::spawn(move || {
        eprintln!("[chat_stream thread] Started");
        // Create a new connection for streaming
        let address = format!("{}:{}", state_clone.0, state_clone.1);
        eprintln!("[chat_stream thread] Connecting to {}", address);
        let mut socket = match TcpStream::connect(&address) {
            Ok(s) => {
                eprintln!("[chat_stream thread] Connected successfully");
                s
            }
            Err(e) => {
                eprintln!("[chat_stream thread] Connection failed: {}", e);
                let _ = app_clone.emit("chat-stream-chunk", StreamChunk {
                    content: String::new(),
                    done: true,
                    error: Some(format!("Connection failed: {}", e)),
                    message_type: None,
                    route: None,
                });
                return;
            }
        };

        // Set read timeout for streaming (5 minutes)
        let _ = socket.set_read_timeout(Some(Duration::from_secs(300)));

        let id = MESSAGE_ID.fetch_add(1, Ordering::SeqCst).to_string();

        let request = ContextRequest {
            id: id.clone(),
            request_type: "ai.chat_stream".to_string(),
            payload: Some(serde_json::json!({
                "model": model,
                "messages": messages,
                "token": token.unwrap_or_default(),
                "agent_id": agent_id.unwrap_or_default(),
                "local_data": local_data,
                "max_iterations": max_iterations.unwrap_or(0)
            })),
        };

        // Send request
        let request_json = match serde_json::to_string(&request) {
            Ok(json) => json,
            Err(e) => {
                let _ = app_clone.emit("chat-stream-chunk", StreamChunk {
                    content: String::new(),
                    done: true,
                    error: Some(format!("Serialize failed: {}", e)),
                    message_type: None,
                    route: None,
                });
                return;
            }
        };

        eprintln!("[chat_stream thread] Sending request: {}", request_json);
        if let Err(e) = socket.write_all(format!("{}\n", request_json).as_bytes()) {
            eprintln!("[chat_stream thread] Write failed: {}", e);
            let _ = app_clone.emit("chat-stream-chunk", StreamChunk {
                content: String::new(),
                done: true,
                error: Some(format!("Write failed: {}", e)),
                message_type: None,
                route: None,
            });
            return;
        }
        eprintln!("[chat_stream thread] Request sent, waiting for responses...");

        // Read streaming responses
        let mut reader = BufReader::new(socket);
        let mut line = String::new();

        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    let _ = app_clone.emit("chat-stream-chunk", StreamChunk {
                        content: String::new(),
                        done: true,
                        error: Some("Connection closed".to_string()),
                        message_type: None,
                        route: None,
                    });
                    break;
                }
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                    let _ = app_clone.emit("chat-stream-chunk", StreamChunk {
                        content: String::new(),
                        done: true,
                        error: Some("Request timeout".to_string()),
                        message_type: None,
                        route: None,
                    });
                    break;
                }
                Err(e) => {
                    let _ = app_clone.emit("chat-stream-chunk", StreamChunk {
                        content: String::new(),
                        done: true,
                        error: Some(format!("Read failed: {}", e)),
                        message_type: None,
                        route: None,
                    });
                    break;
                }
            }

            if line.trim().is_empty() {
                continue;
            }

            eprintln!("[chat_stream thread] Received line: {}", line.trim());

            // Parse the streaming response
            if let Ok(response) = serde_json::from_str::<serde_json::Value>(&line) {
                // Check if this is a stream message for our request
                if response.get("id").and_then(|v| v.as_str()) == Some(&id) {
                    let content = response.get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let done = response.get("done")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let error = response.get("error")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let message_type = response.get("type")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    // Parse route info if present (sent in first chunk when auto-routed)
                    let route = response.get("route").and_then(|r| {
                        serde_json::from_value::<ModelRoute>(r.clone()).ok()
                    });

                    let _ = app_clone.emit("chat-stream-chunk", StreamChunk {
                        content,
                        done,
                        error: error.clone(),
                        message_type,
                        route,
                    });

                    if done || error.is_some() {
                        break;
                    }
                }
            }
        }
    });

    Ok(())
}

// Vision analysis streaming (screenshot-to-UI, no tools)
#[tauri::command]
async fn vision_analyze(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedContextState>,
    model: String,
    image_url: String,
    detail_level: String,
    canvas_context: Option<serde_json::Value>,
) -> Result<(), String> {
    use std::thread;

    eprintln!("[vision_analyze] Called with model: {}, detail_level: {}", model, detail_level);

    let state_clone = {
        let ctx = state.lock().map_err(|_| "Lock error".to_string())?;
        if ctx.socket.is_none() {
            eprintln!("[vision_analyze] Error: Not connected");
            return Err("Not connected".to_string());
        }
        (ctx.host.clone(), ctx.port)
    };

    let app_clone = app.clone();

    thread::spawn(move || {
        let address = format!("{}:{}", state_clone.0, state_clone.1);
        let mut socket = match TcpStream::connect(&address) {
            Ok(s) => s,
            Err(e) => {
                let _ = app_clone.emit("vision-stream-chunk", StreamChunk {
                    content: String::new(),
                    done: true,
                    error: Some(format!("Connection failed: {}", e)),
                    message_type: None,
                    route: None,
                });
                return;
            }
        };

        // Vision analysis can take a while (large images)
        let _ = socket.set_read_timeout(Some(Duration::from_secs(300)));

        let id = MESSAGE_ID.fetch_add(1, Ordering::SeqCst).to_string();

        let request = ContextRequest {
            id: id.clone(),
            request_type: "ai.vision_analyze".to_string(),
            payload: Some(serde_json::json!({
                "model": model,
                "image_url": image_url,
                "detail_level": detail_level,
                "canvas_context": canvas_context,
            })),
        };

        let request_json = match serde_json::to_string(&request) {
            Ok(json) => json,
            Err(e) => {
                let _ = app_clone.emit("vision-stream-chunk", StreamChunk {
                    content: String::new(),
                    done: true,
                    error: Some(format!("Serialize failed: {}", e)),
                    message_type: None,
                    route: None,
                });
                return;
            }
        };

        eprintln!("[vision_analyze] Sending request (image_url len: {})", image_url.len());
        if let Err(e) = socket.write_all(format!("{}\n", request_json).as_bytes()) {
            let _ = app_clone.emit("vision-stream-chunk", StreamChunk {
                content: String::new(),
                done: true,
                error: Some(format!("Write failed: {}", e)),
                message_type: None,
                route: None,
            });
            return;
        }

        let mut reader = BufReader::new(socket);
        let mut line = String::new();

        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    let _ = app_clone.emit("vision-stream-chunk", StreamChunk {
                        content: String::new(),
                        done: true,
                        error: Some("Connection closed".to_string()),
                        message_type: None,
                        route: None,
                    });
                    break;
                }
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                    let _ = app_clone.emit("vision-stream-chunk", StreamChunk {
                        content: String::new(),
                        done: true,
                        error: Some("Request timeout".to_string()),
                        message_type: None,
                        route: None,
                    });
                    break;
                }
                Err(e) => {
                    let _ = app_clone.emit("vision-stream-chunk", StreamChunk {
                        content: String::new(),
                        done: true,
                        error: Some(format!("Read failed: {}", e)),
                        message_type: None,
                        route: None,
                    });
                    break;
                }
            }

            if line.trim().is_empty() {
                continue;
            }

            if let Ok(response) = serde_json::from_str::<serde_json::Value>(&line) {
                if response.get("id").and_then(|v| v.as_str()) == Some(&id) {
                    let content = response.get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let done = response.get("done")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let error = response.get("error")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    let _ = app_clone.emit("vision-stream-chunk", StreamChunk {
                        content,
                        done,
                        error: error.clone(),
                        message_type: None,
                        route: None,
                    });

                    if done || error.is_some() {
                        break;
                    }
                }
            }
        }
    });

    Ok(())
}

// ==================== MENU ====================

// Menu is handled by Tauri's default menu system
// ==================== MENU IMPLEMENTATION ====================

fn build_app_menu(app: &tauri::AppHandle, space: &str) -> Result<Menu<tauri::Wry>, tauri::Error> {
    // App menu (macOS only shows this)
    let app_menu = SubmenuBuilder::new(app, "Construct")
        .item(&MenuItemBuilder::with_id("about", "About Construct").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("check_updates", "Check for Updates...").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    // File menu
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("new_project", "New Project").accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("open_project", "Open Project...").accelerator("CmdOrCtrl+O").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+S").build(app)?)
        .item(&MenuItemBuilder::with_id("save_as", "Save As...").accelerator("CmdOrCtrl+Shift+S").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    // Edit menu
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    // View menu - common items
    let mut view_menu_builder = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar").accelerator("CmdOrCtrl+B").build(app)?)
        .item(&MenuItemBuilder::with_id("toggle_assistant", "Toggle Assistant").accelerator("CmdOrCtrl+\\").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?);

    // Add space-specific view items
    match space {
        "code" => {
            view_menu_builder = view_menu_builder
                .separator()
                .item(&MenuItemBuilder::with_id("toggle_terminal", "Toggle Terminal").accelerator("CmdOrCtrl+`").build(app)?)
                .item(&MenuItemBuilder::with_id("toggle_problems", "Toggle Problems").accelerator("CmdOrCtrl+Shift+M").build(app)?);
        }
        "ui" => {
            view_menu_builder = view_menu_builder
                .separator()
                .item(&MenuItemBuilder::with_id("zoom_in", "Zoom In").accelerator("CmdOrCtrl+=").build(app)?)
                .item(&MenuItemBuilder::with_id("zoom_out", "Zoom Out").accelerator("CmdOrCtrl+-").build(app)?)
                .item(&MenuItemBuilder::with_id("zoom_fit", "Zoom to Fit").accelerator("CmdOrCtrl+0").build(app)?);
        }
        "kanban" => {
            view_menu_builder = view_menu_builder
                .separator()
                .item(&MenuItemBuilder::with_id("collapse_all", "Collapse All Columns").build(app)?)
                .item(&MenuItemBuilder::with_id("expand_all", "Expand All Columns").build(app)?);
        }
        _ => {}
    }

    let view_menu = view_menu_builder.build()?;

    // Space-specific menu
    let space_menu = match space {
        "code" => Some(SubmenuBuilder::new(app, "Code")
            .item(&MenuItemBuilder::with_id("go_to_file", "Go to File...").accelerator("CmdOrCtrl+P").build(app)?)
            .item(&MenuItemBuilder::with_id("go_to_symbol", "Go to Symbol...").accelerator("CmdOrCtrl+Shift+O").build(app)?)
            .separator()
            .item(&MenuItemBuilder::with_id("find_in_files", "Find in Files...").accelerator("CmdOrCtrl+Shift+F").build(app)?)
            .item(&MenuItemBuilder::with_id("replace_in_files", "Replace in Files...").accelerator("CmdOrCtrl+Shift+H").build(app)?)
            .separator()
            .item(&MenuItemBuilder::with_id("format_document", "Format Document").accelerator("CmdOrCtrl+Shift+I").build(app)?)
            .build()?),
        "ui" => Some(SubmenuBuilder::new(app, "Design")
            .item(&MenuItemBuilder::with_id("add_frame", "Add Frame").accelerator("F").build(app)?)
            .item(&MenuItemBuilder::with_id("add_text", "Add Text").accelerator("T").build(app)?)
            .item(&MenuItemBuilder::with_id("add_rectangle", "Add Rectangle").accelerator("R").build(app)?)
            .separator()
            .item(&MenuItemBuilder::with_id("align_left", "Align Left").build(app)?)
            .item(&MenuItemBuilder::with_id("align_center", "Align Center").build(app)?)
            .item(&MenuItemBuilder::with_id("align_right", "Align Right").build(app)?)
            .separator()
            .item(&MenuItemBuilder::with_id("export_selection", "Export Selection...").accelerator("CmdOrCtrl+Shift+E").build(app)?)
            .build()?),
        "kanban" => Some(SubmenuBuilder::new(app, "Board")
            .item(&MenuItemBuilder::with_id("new_column", "New Column").build(app)?)
            .item(&MenuItemBuilder::with_id("new_card", "New Card").accelerator("CmdOrCtrl+Enter").build(app)?)
            .separator()
            .item(&MenuItemBuilder::with_id("filter_cards", "Filter Cards...").accelerator("CmdOrCtrl+F").build(app)?)
            .build()?),
        _ => None,
    };

    // Window menu
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("projects", "Projects").accelerator("CmdOrCtrl+1").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("settings", "Settings...").accelerator("CmdOrCtrl+,").build(app)?)
        .build()?;

    // Help menu
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("documentation", "Documentation").build(app)?)
        .item(&MenuItemBuilder::with_id("keyboard_shortcuts", "Keyboard Shortcuts").accelerator("CmdOrCtrl+Shift+/").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("report_issue", "Report Issue...").build(app)?)
        .item(&MenuItemBuilder::with_id("check_updates_help", "Check for Updates...").build(app)?)
        .build()?;

    // Build the complete menu
    let mut menu_builder = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu);

    if let Some(space_submenu) = space_menu {
        menu_builder = menu_builder.item(&space_submenu);
    }

    menu_builder
        .item(&window_menu)
        .item(&help_menu)
        .build()
}

#[tauri::command]
fn set_app_menu(app: tauri::AppHandle, space: String) -> Result<(), String> {
    // Use write! instead of eprintln! to avoid panic when stderr is unavailable
    // (common in bundled .app where stderr may be closed)
    let _ = write!(std::io::stderr(), "[Menu] Setting menu for space: {}\n", space);

    match build_app_menu(&app, &space) {
        Ok(menu) => {
            if let Err(e) = app.set_menu(menu) {
                let _ = write!(std::io::stderr(), "[Menu] Failed to set menu: {}\n", e);
                return Err(format!("Failed to set menu: {}", e));
            }
            Ok(())
        }
        Err(e) => {
            let _ = write!(std::io::stderr(), "[Menu] Failed to build menu: {}\n", e);
            Err(format!("Failed to build menu: {}", e))
        }
    }
}

// ==================== END MENU ====================

// macOS traffic lights visibility control
#[cfg(target_os = "macos")]
#[tauri::command]
fn set_traffic_lights_visible(window: tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    use objc2_app_kit::{NSWindow, NSWindowButton};

    let ns_window: *mut NSWindow = window.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;

    unsafe {
        let ns_window = &*ns_window;

        // Get and set visibility for each traffic light button
        if let Some(close_button) = ns_window.standardWindowButton(NSWindowButton::CloseButton) {
            close_button.setHidden(!visible);
        }
        if let Some(miniaturize_button) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) {
            miniaturize_button.setHidden(!visible);
        }
        if let Some(zoom_button) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) {
            zoom_button.setHidden(!visible);
        }
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn set_traffic_lights_visible(_visible: bool) -> Result<(), String> {
    Ok(()) // No-op on non-macOS platforms
}

#[cfg(target_os = "macos")]
fn hex_to_rgb16(hex: &str) -> Option<(u16, u16, u16)> {
    let value = hex.trim().strip_prefix('#').unwrap_or(hex.trim());
    let expanded = if value.len() == 3 {
        let mut out = String::with_capacity(6);
        for ch in value.chars() {
            out.push(ch);
            out.push(ch);
        }
        out
    } else if value.len() == 6 {
        value.to_string()
    } else {
        return None;
    };

    let r8 = u8::from_str_radix(&expanded[0..2], 16).ok()?;
    let g8 = u8::from_str_radix(&expanded[2..4], 16).ok()?;
    let b8 = u8::from_str_radix(&expanded[4..6], 16).ok()?;

    Some((
        u16::from(r8) * 257,
        u16::from(g8) * 257,
        u16::from(b8) * 257,
    ))
}

#[cfg(target_os = "macos")]
fn rgb16_to_hex(r16: u16, g16: u16, b16: u16) -> String {
    let r8 = ((u32::from(r16) + 128) / 257) as u8;
    let g8 = ((u32::from(g16) + 128) / 257) as u8;
    let b8 = ((u32::from(b16) + 128) / 257) as u8;
    format!("#{:02X}{:02X}{:02X}", r8, g8, b8)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_system_color_picker(initial_hex: Option<String>) -> Result<Option<String>, String> {
    let default_clause = initial_hex
        .as_deref()
        .and_then(hex_to_rgb16)
        .map(|(r, g, b)| format!(" default color {{{}, {}, {}}}", r, g, b))
        .unwrap_or_default();

    let script = format!("choose color{}", default_clause);
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to launch macOS color picker: {}", e))?;

    // User cancelled color picker.
    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid picker response: {}", e))?;
    let parts: Vec<&str> = stdout.trim().split(',').collect();
    if parts.len() < 3 {
        return Err("Unexpected color picker response".to_string());
    }

    let r16 = parts[0].trim().parse::<u16>()
        .map_err(|_| "Invalid red channel from color picker".to_string())?;
    let g16 = parts[1].trim().parse::<u16>()
        .map_err(|_| "Invalid green channel from color picker".to_string())?;
    let b16 = parts[2].trim().parse::<u16>()
        .map_err(|_| "Invalid blue channel from color picker".to_string())?;

    Ok(Some(rgb16_to_hex(r16, g16, b16)))
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn open_system_color_picker(_initial_hex: Option<String>) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context_state: SharedContextState = Arc::new(Mutex::new(ContextState {
        socket: None,
        host: "127.0.0.1".to_string(),
        port: 0,
        address: None,
        child: None,
    }));

    let lsp_state: SharedLspState = Arc::new(Mutex::new(LspState {
        servers: HashMap::new(),
    }));

    let browser_state: SharedBrowserState = Arc::new(Mutex::new(BrowserState {
        tabs: HashMap::new(),
    }));

    let oauth_state: SharedOAuthState = Arc::new(Mutex::new(OAuthState {
        pending_auth: None,
    }));

    let process_state: SharedProcessState = Arc::new(Mutex::new(ProcessState {
        processes: HashMap::new(),
    }));

    let pty_state: SharedPtyState = Arc::new(Mutex::new(PtyState {
        sessions: HashMap::new(),
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(context_state)
        .manage(lsp_state)
        .manage(browser_state)
        .manage(oauth_state)
        .manage(process_state)
        .manage(pty_state)
        .setup(|app| {
            // Set up initial menu (default space)
            if let Ok(menu) = build_app_menu(app.handle(), "default") {
                let _ = app.set_menu(menu);
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            eprintln!("[Menu] Event: {}", id);

            // Emit menu events to the frontend
            match id {
                "check_updates" | "check_updates_help" => {
                    let _ = app.emit("menu:check-updates", ());
                }
                "about" => {
                    let _ = app.emit("menu:about", ());
                }
                "new_project" => {
                    let _ = app.emit("menu:new-project", ());
                }
                "open_project" => {
                    let _ = app.emit("menu:open-project", ());
                }
                "save" => {
                    let _ = app.emit("menu:save", ());
                }
                "save_as" => {
                    let _ = app.emit("menu:save-as", ());
                }
                "toggle_sidebar" => {
                    let _ = app.emit("menu:toggle-sidebar", ());
                }
                "toggle_assistant" => {
                    let _ = app.emit("menu:toggle-assistant", ());
                }
                "toggle_terminal" => {
                    let _ = app.emit("menu:toggle-terminal", ());
                }
                "toggle_problems" => {
                    let _ = app.emit("menu:toggle-problems", ());
                }
                "zoom_in" => {
                    let _ = app.emit("menu:zoom-in", ());
                }
                "zoom_out" => {
                    let _ = app.emit("menu:zoom-out", ());
                }
                "zoom_fit" => {
                    let _ = app.emit("menu:zoom-fit", ());
                }
                "go_to_file" => {
                    let _ = app.emit("menu:go-to-file", ());
                }
                "go_to_symbol" => {
                    let _ = app.emit("menu:go-to-symbol", ());
                }
                "find_in_files" => {
                    let _ = app.emit("menu:find-in-files", ());
                }
                "replace_in_files" => {
                    let _ = app.emit("menu:replace-in-files", ());
                }
                "format_document" => {
                    let _ = app.emit("menu:format-document", ());
                }
                "add_frame" | "add_text" | "add_rectangle" => {
                    let _ = app.emit(&format!("menu:{}", id.replace('_', "-")), ());
                }
                "export_selection" => {
                    let _ = app.emit("menu:export-selection", ());
                }
                "new_column" | "new_card" | "filter_cards" => {
                    let _ = app.emit(&format!("menu:{}", id.replace('_', "-")), ());
                }
                "projects" => {
                    let _ = app.emit("menu:projects", ());
                }
                "settings" => {
                    let _ = app.emit("menu:settings", ());
                }
                "documentation" => {
                    let _ = app.opener().open_url("https://construct.app/docs", None::<&str>);
                }
                "keyboard_shortcuts" => {
                    let _ = app.emit("menu:keyboard-shortcuts", ());
                }
                "report_issue" => {
                    let _ = app.opener().open_url("https://github.com/construct-base/construct-releases/issues", None::<&str>);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_context_service,
            connect_context,
            is_connected,
            send_context_request,
            context_get,
            context_set_mode,
            context_set_component,
            context_set_project,
            context_set_selection,
            context_ping,
            list_models,
            list_providers,
            list_agents,
            chat_direct,
            chat_stream,
            vision_analyze,
            set_traffic_lights_visible,
            open_system_color_picker,
            // LSP commands
            lsp_start_server,
            lsp_send_message,
            lsp_next_id,
            lsp_stop_server,
            lsp_stop_all,
            lsp_list_servers,
            lsp_check_command,
            lsp_install_server,
            lsp_detect_languages,
            // Browser commands
            browser_create_tab,
            browser_close_tab,
            browser_navigate,
            browser_set_tab_visible,
            browser_reload,
            browser_get_url,
            browser_toggle_devtools,
            browser_close_all,
            browser_open_standalone,
            browser_go_back,
            browser_go_forward,
            browser_set_tab_bounds,
            // OAuth commands
            oauth_start,
            oauth_get_pending,
            oauth_exchange,
            oauth_close_window,
            oauth_read_keychain,
            // Shell commands
            run_shell_command,
            spawn_shell_command,
            kill_shell_process,
            send_process_input,
            list_shell_processes,
            // PTY commands
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_list,
            // Menu commands
            set_app_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
