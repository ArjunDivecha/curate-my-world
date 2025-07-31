#!/bin/bash

# =============================================================================
# SCRIPT NAME: start-frontend.sh
# =============================================================================
# 
# DESCRIPTION:
# Starts the frontend development server on port 9876, ensuring any existing
# processes on that port are killed first.
# 
# VERSION: 1.0
# LAST UPDATED: 2025-01-31
# AUTHOR: Claude Code
# 
# USAGE:
# ./scripts/start-frontend.sh
# ./scripts/start-frontend.sh --verbose
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_PORT=8766
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

# Check if npm is available
if ! command -v npm &> /dev/null; then
    log "ERROR" "npm is not installed or not in PATH"
    exit 1
fi

log "INFO" "🧹 Cleaning up port ${FRONTEND_PORT}..."

# Use our port manager to clean up
cd "$PROJECT_ROOT"
node scripts/port-manager.js cleanup

log "INFO" "🚀 Starting frontend development server on port ${FRONTEND_PORT}..."

# Set environment variables
export PORT=$FRONTEND_PORT
export VITE_PORT=$FRONTEND_PORT
export VITE_API_BASE_URL="http://localhost:8765"  # Backend port

# Check if package.json exists
if [ ! -f "package.json" ]; then
    log "ERROR" "package.json not found in ${PROJECT_ROOT}"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    log "INFO" "📦 Installing dependencies..."
    npm install
fi

# Start the frontend with our port manager
if [[ "$*" == *"--verbose"* ]]; then
    log "INFO" "Starting in verbose mode..."
    node scripts/port-manager.js start-frontend --verbose
else
    log "INFO" "Starting frontend (use --verbose for detailed output)..."
    node scripts/port-manager.js start-frontend
fi