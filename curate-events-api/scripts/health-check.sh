#!/bin/bash
# =============================================================================
# SCRIPT NAME: health-check.sh
# =============================================================================
# 
# DESCRIPTION:
# Comprehensive health check script for Curate Events API.
# Monitors server status, API endpoints, and system resources.
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
PORT=${PORT:-3001}
HOST=${HOST:-127.0.0.1}
BASE_URL="http://$HOST:$PORT"
TIMEOUT=10

echo -e "${BLUE}🏥 Curate Events API - Health Check${NC}"
echo "=================================="

# Function to check HTTP endpoint
check_endpoint() {
  local endpoint=$1
  local expected_status=${2:-200}
  local description=$3
  
  echo -ne "${YELLOW}🔍 Checking $description...${NC} "
  
  if response=$(curl -s -w "%{http_code}" -m $TIMEOUT "$BASE_URL$endpoint" 2>/dev/null); then
    status_code="${response: -3}"
    response_body="${response%???}"
    
    if [ "$status_code" = "$expected_status" ]; then
      echo -e "${GREEN}✅ OK ($status_code)${NC}"
      return 0
    else
      echo -e "${RED}❌ FAIL ($status_code)${NC}"
      return 1
    fi
  else
    echo -e "${RED}❌ TIMEOUT${NC}"
    return 1
  fi
}

# Function to test API functionality
test_api_functionality() {
  echo -e "\n${BLUE}🧪 Testing API Functionality${NC}"
  echo "----------------------------"
  
  # Test event fetching
  echo -ne "${YELLOW}🎭 Testing event fetch...${NC} "
  
  test_url="$BASE_URL/api/events/theatre?location=San Francisco, CA&limit=5"
  if response=$(curl -s -m 30 "$test_url" 2>/dev/null); then
    if echo "$response" | grep -q '"success":true'; then
      event_count=$(echo "$response" | grep -o '"count":[0-9]*' | cut -d':' -f2 || echo "0")
      echo -e "${GREEN}✅ OK (${event_count} events)${NC}"
    else
      echo -e "${YELLOW}⚠️  API responded but no events found${NC}"
    fi
  else
    echo -e "${RED}❌ FAIL${NC}"
  fi
}

# Function to check system resources
check_resources() {
  echo -e "\n${BLUE}📊 System Resources${NC}"
  echo "-------------------"
  
  # Memory usage
  if command -v free &> /dev/null; then
    memory_info=$(free -h | awk 'NR==2{printf "%.1f%%", $3/$2*100}')
    echo -e "${YELLOW}💾 Memory Usage:${NC} $memory_info"
  fi
  
  # Disk usage
  if command -v df &> /dev/null; then
    disk_usage=$(df -h . | awk 'NR==2{print $5}')
    echo -e "${YELLOW}💿 Disk Usage:${NC} $disk_usage"
  fi
  
  # Load average (Linux/Mac)
  if command -v uptime &> /dev/null; then
    load_avg=$(uptime | awk '{print $NF}')
    echo -e "${YELLOW}⚡ Load Average:${NC} $load_avg"
  fi
}

# Function to check logs for errors
check_logs() {
  local log_dir="/Users/macbook2024/Dropbox/AAA Backup/A Working/Curate-My-World/curate-events-api/logs"
  
  if [ -d "$log_dir" ]; then
    echo -e "\n${BLUE}📋 Recent Log Activity${NC}"
    echo "---------------------"
    
    # Check for recent errors
    if [ -f "$log_dir/error.log" ]; then
      error_count=$(tail -100 "$log_dir/error.log" 2>/dev/null | grep -c "ERROR" || echo "0")
      if [ "$error_count" -gt 0 ]; then
        echo -e "${RED}⚠️  Recent errors: $error_count${NC}"
        echo "   Latest error:"
        tail -1 "$log_dir/error.log" 2>/dev/null | head -c 100
        echo "..."
      else
        echo -e "${GREEN}✅ No recent errors${NC}"
      fi
    fi
    
    # Check log file sizes
    for log_file in "$log_dir"/*.log; do
      if [ -f "$log_file" ]; then
        size=$(du -h "$log_file" | cut -f1)
        basename_file=$(basename "$log_file")
        echo -e "${YELLOW}📄 $basename_file:${NC} $size"
      fi
    done
  fi
}

# Main health check
main() {
  local overall_status=0
  
  echo -e "${YELLOW}🌐 Server:${NC} $BASE_URL"
  echo -e "${YELLOW}⏰ Timeout:${NC} ${TIMEOUT}s"
  echo ""
  
  # Basic endpoint checks
  echo -e "${BLUE}🔍 Endpoint Checks${NC}"
  echo "------------------"
  
  check_endpoint "/" 200 "Root endpoint" || overall_status=1
  check_endpoint "/api/health" 200 "Health endpoint" || overall_status=1
  check_endpoint "/api/health/deep" 200 "Deep health endpoint" || overall_status=1
  check_endpoint "/api/events" 200 "Events categories endpoint" || overall_status=1
  
  # Test API functionality
  test_api_functionality
  
  # Check system resources
  check_resources
  
  # Check logs
  check_logs
  
  # Final status
  echo ""
  echo "=================================="
  if [ $overall_status -eq 0 ]; then
    echo -e "${GREEN}🎉 Overall Status: HEALTHY${NC}"
  else
    echo -e "${RED}⚠️  Overall Status: ISSUES DETECTED${NC}"
  fi
  
  return $overall_status
}

# Run the health check
main "$@"