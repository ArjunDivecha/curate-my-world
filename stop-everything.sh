#!/bin/bash
# =============================================================================
# SCRIPT NAME: stop-everything.sh
# =============================================================================
# 
# DESCRIPTION:
# One-step shutdown script that stops all services cleanly.
# 
# VERSION: 1.0
# LAST UPDATED: 2025-01-29
# AUTHOR: Claude Code
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎭 Curate My World - Shutdown${NC}"
echo "==============================="

# Read saved PIDs if available
if [ -f ".running_processes" ]; then
  source .running_processes
  
  # Stop API server
  if [ ! -z "$API_PID" ] && ps -p $API_PID > /dev/null 2>&1; then
    echo -e "${YELLOW}🛑 Stopping API server (PID: $API_PID)...${NC}"
    kill -TERM $API_PID 2>/dev/null || true
  fi
  
  # Stop frontend
  if [ ! -z "$FRONTEND_PID" ] && ps -p $FRONTEND_PID > /dev/null 2>&1; then
    echo -e "${YELLOW}🛑 Stopping frontend (PID: $FRONTEND_PID)...${NC}"
    kill -TERM $FRONTEND_PID 2>/dev/null || true
  fi
  
  rm -f .running_processes
fi

# Kill any remaining processes
echo -e "${YELLOW}🧹 Cleaning up remaining processes...${NC}"
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true  
pkill -f "npm.*dev" 2>/dev/null || true

# Remove PID files
rm -f curate-events-api/curate-events-api.pid

echo -e "${GREEN}✅ All services stopped${NC}"
echo -e "${BLUE}Ready for restart with ./start-everything.sh${NC}"