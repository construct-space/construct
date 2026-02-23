#!/bin/bash
# Build universal macOS binary for context service (arm64 + x86_64)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTEXT_DIR="$(cd "$PROJECT_ROOT/../context" && pwd)"
BIN_DIR="$PROJECT_ROOT/src-tauri/bin"

echo "Building universal macOS context service..."

# Ensure bin directory exists
mkdir -p "$BIN_DIR"

cd "$CONTEXT_DIR"

# Build for arm64
echo "  Building for arm64..."
GOOS=darwin GOARCH=arm64 go build -o "$BIN_DIR/construct-context-aarch64-apple-darwin" .

# Build for x86_64
echo "  Building for x86_64..."
GOOS=darwin GOARCH=amd64 go build -o "$BIN_DIR/construct-context-x86_64-apple-darwin" .

# Create universal binary using lipo
echo "  Creating universal binary..."
lipo -create \
    "$BIN_DIR/construct-context-aarch64-apple-darwin" \
    "$BIN_DIR/construct-context-x86_64-apple-darwin" \
    -output "$BIN_DIR/construct-context-universal-apple-darwin"

echo "Universal context service built successfully!"
echo "  - construct-context-aarch64-apple-darwin"
echo "  - construct-context-x86_64-apple-darwin"
echo "  - construct-context-universal-apple-darwin"
