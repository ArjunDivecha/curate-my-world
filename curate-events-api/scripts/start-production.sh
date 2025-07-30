#!/bin/bash
# =============================================================================
# SCRIPT NAME: start-production.sh
# =============================================================================
# 
# DESCRIPTION:
# Production startup script for Curate Events API.
# Includes environment validation, process management, and monitoring setup.
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
NODE_ENV=${NODE_ENV:-production}
API_DIR="/Users/macbook2024/Dropbox/AAA Backup/A Working/Curate-My-World/curate-events-api"
LOG_DIR="$API_DIR/logs"
PID_FILE="$API_DIR/curate-events-api.pid"

echo -e "${BLUE}🎭 Curate Events API - Production Startup${NC}"
echo "=================================="

# Create logs directory
mkdir -p "$LOG_DIR"

# Check if .env exists
if [ ! -f "$API_DIR/.env" ]; then
  echo -e "${RED}❌ Error: .env file not found${NC}"
  echo "Please copy .env.example to .env and configure your settings"
  exit 1
fi

# Validate environment variables
echo -e "${YELLOW}🔍 Validating environment...${NC}"

# Load .env file if it exists
if [ -f "$API_DIR/.env" ]; then
  echo -e "${YELLOW}📋 Loading environment from .env${NC}"
  export $(grep -v '^#' "$API_DIR/.env" | xargs)
fi

# Check for required environment variables
required_vars=("PERPLEXITY_API_KEY")
missing_vars=()

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
  echo -e "${RED}❌ Missing required environment variables:${NC}"
  for var in "${missing_vars[@]}"; do
    echo "  - $var"
  done
  exit 1
fi

# Check if API key format is valid
if [[ ! $PERPLEXITY_API_KEY =~ ^pplx- ]]; then
  echo -e "${YELLOW}⚠️  Warning: Perplexity API key format may be invalid${NC}"
fi

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p $PID > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  API server is already running (PID: $PID)${NC}"
    echo "Use ./scripts/stop-production.sh to stop it first"
    exit 1
  else
    echo -e "${YELLOW}🧹 Removing stale PID file${NC}"
    rm -f "$PID_FILE"
  fi
fi

# Install/update dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
cd "$API_DIR"
npm ci --only=production

# Start the server
echo -e "${GREEN}🚀 Starting Curate Events API...${NC}"

# Export environment variables
export NODE_ENV=production

# Start server with PM2 if available, otherwise use nohup
if command -v pm2 &> /dev/null; then
  echo -e "${GREEN}📊 Using PM2 for process management${NC}"
  pm2 start server.js --name "curate-events-api" \
    --log "$LOG_DIR/combined.log" \
    --error "$LOG_DIR/error.log" \
    --out "$LOG_DIR/output.log" \
    --time
  pm2 save
else
  echo -e "${YELLOW}📝 Using nohup (consider installing PM2 for better process management)${NC}"
  nohup node server.js > "$LOG_DIR/combined.log" 2>&1 &
  echo $! > "$PID_FILE"
fi

# Wait a moment for startup
sleep 3

# Check if server is running
PORT=${PORT:-3001}
HOST=${HOST:-127.0.0.1}

echo -e "${YELLOW}🏥 Checking server health...${NC}"
if curl -s "http://$HOST:$PORT/api/health" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Server is running and healthy${NC}"
  echo ""
  echo -e "${BLUE}📊 Server Information:${NC}"
  echo "  URL: http://$HOST:$PORT"
  echo "  Health Check: http://$HOST:$PORT/api/health"
  echo "  Deep Health: http://$HOST:$PORT/api/health/deep"
  echo "  Events API: http://$HOST:$PORT/api/events"
  echo "  Logs: $LOG_DIR/"
  
  if command -v pm2 &> /dev/null; then
    echo "  Process: pm2 list"
    echo "  Logs: pm2 logs curate-events-api"
    echo "  Stop: pm2 stop curate-events-api"
  else
    echo "  PID: $(cat $PID_FILE)"
    echo "  Stop: ./scripts/stop-production.sh"
  fi
else
  echo -e "${RED}❌ Server failed to start or is not responding${NC}"
  echo "Check logs in $LOG_DIR/ for details"
  exit 1
fi

echo ""
echo -e "${GREEN}🎉 Curate Events API started successfully!${NC}"