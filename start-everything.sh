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

########################################
# Clean up any existing processes
########################################
echo -e "${YELLOW}🧹 Cleaning up existing processes...${NC}"
# Kill experiment server on SH port first (less collateral)
if command -v lsof >/dev/null 2>&1; then
  lsof -ti:8799 -sTCP:LISTEN | xargs -r kill -9 2>/dev/null || true
fi
pkill -f "experiments/super-hybrid/server.js" 2>/dev/null || true
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "npm.*dev" 2>/dev/null || true
sleep 1

########################################
# Super-Hybrid tuning (coverage mode)
########################################
# Provider toggles and per-query sizes. Adjust to control coverage/cost.
export EXA_ENABLED=${EXA_ENABLED:-1}
export SERPER_ENABLED=${SERPER_ENABLED:-1}
export VENUE_EXA_ENABLED=${VENUE_EXA_ENABLED:-1}
export EXA_RESULTS_PER_QUERY=${EXA_RESULTS_PER_QUERY:-100}
export SERPER_RESULTS_PER_QUERY=${SERPER_RESULTS_PER_QUERY:-100}
# Keep content fetching off for speed/cost; flip to 1 if needed
export EXA_INCLUDE_CONTENT=${EXA_INCLUDE_CONTENT:-0}

########################################
# Start Super-Hybrid experiment server
########################################
echo -e "${YELLOW}🧪 Starting Super-Hybrid server (turbo + Sonoma)...${NC}"
pushd "experiments/super-hybrid" >/dev/null
nohup node server.js > server.log 2>&1 &
SH_PID=$!
popd >/dev/null

# Wait for Super-Hybrid to be ready
for i in {1..10}; do
  if curl -s http://127.0.0.1:8799/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Super-Hybrid ready on http://127.0.0.1:8799${NC}"
    break
  fi
  if [ $i -eq 10 ]; then
    echo -e "${RED}❌ Super-Hybrid server failed to start${NC}"
    # Do not exit; API can still fall back to turbo-only
  fi
  sleep 1
done

# Start API server
echo -e "${YELLOW}🚀 Starting API server...${NC}"
cd "curate-events-api"

# Load environment and start API in background
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

mkdir -p logs
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
SH_PID=$SH_PID
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
echo "  Super-Hybrid: http://127.0.0.1:8799 (health, /super-hybrid/search)"
echo ""
echo -e "${BLUE}🛑 To stop everything:${NC}"
echo "  ./stop-everything.sh"
echo ""
echo -e "${YELLOW}📋 Logs:${NC}"
echo "  API: curate-events-api/logs/combined.log"
echo "  Frontend: frontend.log"
echo ""
echo -e "${GREEN}Ready to test! 🚀${NC}"
