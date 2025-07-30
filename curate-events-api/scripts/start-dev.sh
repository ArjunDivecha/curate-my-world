#!/bin/bash
# =============================================================================
# SCRIPT NAME: start-dev.sh
# =============================================================================
# 
# DESCRIPTION:
# Development startup script for Curate Events API.
# Includes auto-restart and detailed logging for development.
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
API_DIR="/Users/macbook2024/Dropbox/AAA Backup/A Working/Curate-My-World/curate-events-api"

echo -e "${BLUE}🎭 Curate Events API - Development Mode${NC}"
echo "=================================="

cd "$API_DIR"

# Check if .env exists, if not copy from example
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo -e "${YELLOW}📋 Copying .env.example to .env${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env and add your PERPLEXITY_API_KEY${NC}"
  else
    echo -e "${RED}❌ No .env.example found${NC}"
    exit 1
  fi
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

# Set development environment
export NODE_ENV=development

# Start with nodemon if available, otherwise use node
if command -v nodemon &> /dev/null; then
  echo -e "${GREEN}🔄 Starting with nodemon (auto-restart enabled)${NC}"
  echo ""
  nodemon server.js
else
  echo -e "${YELLOW}📝 Starting with node (install nodemon for auto-restart)${NC}"
  echo ""
  node server.js
fi