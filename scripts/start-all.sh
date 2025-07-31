#!/bin/bash

# =============================================================================
# SCRIPT NAME: start-all.sh
# =============================================================================
# 
# DESCRIPTION:
# Starts both frontend and backend services on port 9876, ensuring any existing
# processes on that port are killed first. This is the master startup script.
# 
# VERSION: 1.0
# LAST UPDATED: 2025-01-31
# AUTHOR: Claude Code
# 
# USAGE:
# ./scripts/start-all.sh
# ./scripts/start-all.sh --verbose
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_PORT=8766
BACKEND_PORT=8765
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
        "HEADER")
            echo -e "${CYAN}[${timestamp}] ${message}${NC}"
            ;;
        *)
            echo "[${timestamp}] ${message}"
            ;;
    esac
}

print_banner() {
    echo -e "${MAGENTA}"
    echo "=================================================================="
    echo "🚀 CURATE MY WORLD - UNIFIED STARTUP SCRIPT"
    echo "=================================================================="
    echo "📍 Backend Port: ${BACKEND_PORT}"
    echo "📍 Frontend Port: ${FRONTEND_PORT}"
    echo "🏠 Project Root: ${PROJECT_ROOT}"
    echo "⏰ Started: $(date)"
    echo "=================================================================="
    echo -e "${NC}"
}

cleanup_on_exit() {
    log "WARNING" "🛑 Received interrupt signal, cleaning up..."
    
    # Kill any processes on our target ports
    log "INFO" "🧹 Cleaning up ports ${BACKEND_PORT} and ${FRONTEND_PORT}..."
    cd "$PROJECT_ROOT"
    node scripts/port-manager.js cleanup
    
    log "SUCCESS" "✅ Cleanup completed"
    exit 0
}

# Set up signal handlers
trap cleanup_on_exit SIGINT SIGTERM

# Check prerequisites
check_prerequisites() {
    log "INFO" "🔍 Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is not installed or not in PATH"
        exit 1
    fi
    local node_version=$(node --version)
    log "SUCCESS" "✅ Node.js found: ${node_version}"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log "ERROR" "npm is not installed or not in PATH"
        exit 1
    fi
    local npm_version=$(npm --version)
    log "SUCCESS" "✅ npm found: ${npm_version}"
    
    # Check project files
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log "ERROR" "Frontend package.json not found in ${PROJECT_ROOT}"
        exit 1
    fi
    log "SUCCESS" "✅ Frontend package.json found"
    
    if [ ! -f "$PROJECT_ROOT/curate-events-api/server.js" ]; then
        log "ERROR" "Backend server.js not found in ${PROJECT_ROOT}/curate-events-api/"
        exit 1
    fi
    log "SUCCESS" "✅ Backend server.js found"
    
    # Check port manager
    if [ ! -f "$PROJECT_ROOT/scripts/port-manager.js" ]; then
        log "ERROR" "Port manager not found: ${PROJECT_ROOT}/scripts/port-manager.js"
        exit 1
    fi
    log "SUCCESS" "✅ Port manager found"
}

# Main execution
main() {
    print_banner
    
    # Check prerequisites
    check_prerequisites
    
    log "HEADER" "🚀 Starting Curate My World application stack..."
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    # Check current port status
    log "INFO" "🔍 Checking port status..."
    node scripts/port-manager.js status
    
    # Start the complete application stack
    if [[ "$*" == *"--verbose"* ]]; then
        log "INFO" "🔊 Starting in verbose mode..."
        node scripts/port-manager.js start-all --verbose
    else
        log "INFO" "🤫 Starting in quiet mode (use --verbose for detailed output)..."
        node scripts/port-manager.js start-all
    fi
}

# Show usage if help requested
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo "🔧 Curate My World - Unified Startup Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --verbose, -v    Show detailed output from all processes"
    echo "  --help, -h       Show this help message"
    echo ""
    echo "Description:"
    echo "  This script starts both the frontend and backend services on separate ports."
    echo "  It automatically kills any existing processes on those ports first."
    echo ""
    echo "Services:"
    echo "  • Frontend: React development server (Vite) on port ${FRONTEND_PORT}"
    echo "  • Backend: Node.js API server on port ${BACKEND_PORT}"
    echo ""
    echo "Access:"
    echo "  • Web App: http://localhost:${FRONTEND_PORT}"
    echo "  • API: http://localhost:${BACKEND_PORT}/api"
    echo ""
    echo "To stop:"
    echo "  Press Ctrl+C or send SIGTERM to this process"
    echo ""
    exit 0
fi

# Run main function
main "$@"