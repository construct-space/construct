#!/bin/bash
# Build universal macOS binary for brain service (arm64 + x86_64)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BRAIN_DIR="$(cd "$PROJECT_ROOT/../construct-brain" && pwd)"
BIN_DIR="$PROJECT_ROOT/src-tauri/bin"

echo "Building universal macOS brain service..."

# Ensure bin directory exists
mkdir -p "$BIN_DIR"

cd "$BRAIN_DIR"

# Build for arm64
echo "  Building for arm64..."
GOOS=darwin GOARCH=arm64 go build -o "$BIN_DIR/construct-brain-aarch64-apple-darwin" .

# Build for x86_64
echo "  Building for x86_64..."
GOOS=darwin GOARCH=amd64 go build -o "$BIN_DIR/construct-brain-x86_64-apple-darwin" .

# Create universal binary using lipo
echo "  Creating universal binary..."
lipo -create \
    "$BIN_DIR/construct-brain-aarch64-apple-darwin" \
    "$BIN_DIR/construct-brain-x86_64-apple-darwin" \
    -output "$BIN_DIR/construct-brain-universal-apple-darwin"

echo "Universal brain service built successfully!"
echo "  - construct-brain-aarch64-apple-darwin"
echo "  - construct-brain-x86_64-apple-darwin"
echo "  - construct-brain-universal-apple-darwin"
