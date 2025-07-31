#!/bin/bash

# =============================================================================
# SCRIPT NAME: start-backend.sh
# =============================================================================
# 
# DESCRIPTION:
# Starts the backend API server on port 9876, ensuring any existing
# processes on that port are killed first.
# 
# VERSION: 1.0
# LAST UPDATED: 2025-01-31
# AUTHOR: Claude Code
# 
# USAGE:
# ./scripts/start-backend.sh
# ./scripts/start-backend.sh --verbose
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_PORT=8765
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/curate-events-api"

log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "ERROR")
            echo -e "${RED}[${timestamp}] ERROR: ${message}${NC}" >&2
            ;;
        "SUCCESS")
            echo -e "${GREEN}[${timestamp}] SUCCESS: ${message}${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}[${timestamp}] WARNING: ${message}${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}[${timestamp}] INFO: ${message}${NC}"
            ;;
        *)
            echo "[${timestamp}] ${message}"
            ;;
    esac
}

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    log "ERROR" "Node.js is not installed or not in PATH"
    exit 1
fi

# Check if backend directory exists
if [ ! -d "$BACKEND_DIR" ]; then
    log "ERROR" "Backend directory not found: ${BACKEND_DIR}"
    log "INFO" "Expected backend structure: curate-events-api/server.js"
    exit 1
fi

# Check if server.js exists
if [ ! -f "$BACKEND_DIR/server.js" ]; then
    log "ERROR" "Backend server file not found: ${BACKEND_DIR}/server.js"
    exit 1
fi

log "INFO" "🧹 Cleaning up port ${BACKEND_PORT}..."

# Use our port manager to clean up
cd "$PROJECT_ROOT"
node scripts/port-manager.js cleanup

log "INFO" "🚀 Starting backend API server on port ${BACKEND_PORT}..."

# Set environment variables
export PORT=$BACKEND_PORT
export NODE_ENV=development

# Check if backend has its own package.json and install dependencies
if [ -f "$BACKEND_DIR/package.json" ]; then
    if [ ! -d "$BACKEND_DIR/node_modules" ]; then
        log "INFO" "📦 Installing backend dependencies..."
        cd "$BACKEND_DIR"
        npm install
        cd "$PROJECT_ROOT"
    fi
fi

# Start the backend with our port manager
if [[ "$*" == *"--verbose"* ]]; then
    log "INFO" "Starting in verbose mode..."
    node scripts/port-manager.js start-backend --verbose
else
    log "INFO" "Starting backend (use --verbose for detailed output)..."
    node scripts/port-manager.js start-backend
fi