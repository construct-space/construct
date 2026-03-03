#!/bin/bash
# Build the Go context service for the current platform

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTEXT_DIR="$(cd "$PROJECT_ROOT/../construct-brain" && pwd)"
BIN_DIR="$PROJECT_ROOT/src-tauri/bin"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
case "$ARCH" in
    x86_64)
        GOARCH="amd64"
        TAURI_ARCH="x86_64"
        ;;
    arm64|aarch64)
        GOARCH="arm64"
        TAURI_ARCH="aarch64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# Map OS names
case "$OS" in
    darwin)
        GOOS="darwin"
        TAURI_OS="apple-darwin"
        EXT=""
        ;;
    linux)
        GOOS="linux"
        TAURI_OS="unknown-linux-gnu"
        EXT=""
        ;;
    mingw*|msys*|cygwin*)
        GOOS="windows"
        TAURI_OS="pc-windows-msvc"
        EXT=".exe"
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Tauri expects binary named: <name>-<target-triple>
# e.g., construct-context-aarch64-apple-darwin
BINARY_NAME="construct-context-${TAURI_ARCH}-${TAURI_OS}${EXT}"

echo "Building context service..."
echo "  OS: $GOOS, Arch: $GOARCH"
echo "  Output: $BIN_DIR/$BINARY_NAME"

# Ensure bin directory exists
mkdir -p "$BIN_DIR"

# Version injection via ldflags
VERSION="${CONSTRUCT_VERSION:-dev}"
COMMIT="$(cd "$CONTEXT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LDFLAGS="-X main.Version=$VERSION -X main.Commit=$COMMIT -X main.BuildDate=$BUILD_DATE"

# Build the Go binary
cd "$CONTEXT_DIR"
GOOS=$GOOS GOARCH=$GOARCH go build -ldflags "$LDFLAGS" -o "$BIN_DIR/$BINARY_NAME" .

echo "Context service built successfully: $BINARY_NAME"
