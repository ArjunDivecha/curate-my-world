#!/bin/bash
# =============================================================================
# SCRIPT NAME: stop-production.sh  
# =============================================================================
# 
# DESCRIPTION:
# Production shutdown script for Curate Events API.
# Gracefully stops the server and cleans up processes.
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

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$API_DIR/curate-events-api.pid"

echo -e "${BLUE}🎭 Curate Events API - Production Shutdown${NC}"
echo "=================================="

# Try PM2 first
if command -v pm2 &> /dev/null; then
  if pm2 list | grep -q "curate-events-api"; then
    echo -e "${YELLOW}🛑 Stopping API server via PM2...${NC}"
    pm2 stop curate-events-api
    pm2 delete curate-events-api
    pm2 save
    echo -e "${GREEN}✅ Server stopped via PM2${NC}"
    exit 0
  fi
fi

# Try PID file
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  
  if ps -p $PID > /dev/null 2>&1; then
    echo -e "${YELLOW}🛑 Stopping API server (PID: $PID)...${NC}"
    
    # Try graceful shutdown first
    kill -TERM $PID
    
    # Wait up to 10 seconds for graceful shutdown
    for i in {1..10}; do
      if ! ps -p $PID > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Server stopped gracefully${NC}"
        rm -f "$PID_FILE"
        exit 0
      fi
      sleep 1
    done
    
    # Force kill if still running
    echo -e "${YELLOW}⚠️  Forcing shutdown...${NC}"
    kill -KILL $PID
    
    if ! ps -p $PID > /dev/null 2>&1; then
      echo -e "${GREEN}✅ Server stopped (forced)${NC}"
      rm -f "$PID_FILE"
    else
      echo -e "${RED}❌ Failed to stop server${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}🧹 Removing stale PID file${NC}"
    rm -f "$PID_FILE"
  fi
else
  echo -e "${YELLOW}⚠️  No PID file found${NC}"
fi

# Check for any remaining node processes
NODE_PROCESSES=$(pgrep -f "node.*server.js" || true)
if [ ! -z "$NODE_PROCESSES" ]; then
  echo -e "${YELLOW}🔍 Found remaining node processes:${NC}"
  echo "$NODE_PROCESSES"
  
  read -p "Kill these processes? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "$NODE_PROCESSES" | xargs kill -TERM
    echo -e "${GREEN}✅ Remaining processes terminated${NC}"
  fi
fi

echo -e "${GREEN}🎉 Curate Events API shutdown complete${NC}"