#!/bin/bash
# =============================================================================
# SCRIPT NAME: start-everything.sh
# =============================================================================
# 
# DESCRIPTION:
# One-step startup script that starts API server, frontend, and opens browser.
# This is what "buttoned up tight" actually means.
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

echo -e "${BLUE}🎭 Curate My World - One-Step Startup${NC}"
echo "========================================"

# Kill any existing processes
echo -e "${YELLOW}🧹 Cleaning up existing processes...${NC}"
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "npm.*dev" 2>/dev/null || true
sleep 2

# Start API server
echo -e "${YELLOW}🚀 Starting API server...${NC}"
cd "curate-events-api"

# Load environment and start API in background
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

nohup node server.js > logs/combined.log 2>&1 &
API_PID=$!
echo $API_PID > curate-events-api.pid

cd ..

# Wait for API to be ready
echo -e "${YELLOW}⏳ Waiting for API server...${NC}"
for i in {1..10}; do
  if curl -s http://127.0.0.1:8765/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API server ready${NC}"
    break
  fi
  if [ $i -eq 10 ]; then
    echo -e "${RED}❌ API server failed to start${NC}"
    exit 1
  fi
  sleep 1
done

# Start frontend
echo -e "${YELLOW}🎨 Starting frontend...${NC}"
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to be ready
echo -e "${YELLOW}⏳ Waiting for frontend...${NC}"
for i in {1..15}; do
  if curl -s http://localhost:8766 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend ready${NC}"
    break
  fi
  if [ $i -eq 15 ]; then
    echo -e "${RED}❌ Frontend failed to start${NC}"
    exit 1
  fi
  sleep 1
done

# Save PIDs for cleanup
cat > .running_processes << EOF
API_PID=$API_PID
FRONTEND_PID=$FRONTEND_PID
EOF

# Open browser
echo -e "${YELLOW}🌐 Opening browser...${NC}"
if command -v open &> /dev/null; then
  open http://localhost:8766
elif command -v xdg-open &> /dev/null; then
  xdg-open http://localhost:8766
fi

echo ""
echo -e "${GREEN}🎉 Curate My World is now running!${NC}"
echo "========================================"
echo -e "${BLUE}📊 Services:${NC}"
echo "  Frontend: http://localhost:8766"
echo "  API:      http://127.0.0.1:8765"
echo "  Health:   http://127.0.0.1:8765/api/health"
echo ""
echo -e "${BLUE}🛑 To stop everything:${NC}"
echo "  ./stop-everything.sh"
echo ""
echo -e "${YELLOW}📋 Logs:${NC}"
echo "  API: curate-events-api/logs/combined.log"
echo "  Frontend: frontend.log"
echo ""
echo -e "${GREEN}Ready to test! 🚀${NC}"