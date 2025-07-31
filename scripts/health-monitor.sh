#!/bin/bash

# =============================================================================
# HEALTH MONITOR - Bulletproof Frontend/Backend Integration
# =============================================================================
# 
# This script continuously monitors and auto-recovers the application stack
# Prevents frontend/backend disconnections and port conflicts
# 
# VERSION: 1.0
# AUTHOR: Claude Code
# =============================================================================

set -e

# Configuration
BACKEND_PORT=8765
FRONTEND_PORT=8766
BACKEND_DIR="/Users/macbook2024/Dropbox/AAA Backup/A Working/Curate-My-World/curate-events-api"
FRONTEND_DIR="/Users/macbook2024/Dropbox/AAA Backup/A Working/Curate-My-World"
LOG_FILE="/Users/macbook2024/Dropbox/AAA Backup/A Working/Curate-My-World/scripts/health-monitor.log"
PID_FILE="/Users/macbook2024/Dropbox/AAA Backup/A Working/Curate-My-World/scripts/health-monitor.pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Color logging
log_error() {
    echo -e "${RED}$(date '+%Y-%m-%d %H:%M:%S') - ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}$(date '+%Y-%m-%d %H:%M:%S') - SUCCESS: $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}$(date '+%Y-%m-%d %H:%M:%S') - WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}$(date '+%Y-%m-%d %H:%M:%S') - INFO: $1${NC}" | tee -a "$LOG_FILE"
}

# Check if backend is running and healthy
check_backend() {
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null || echo "000")
    
    if [ "$status_code" = "200" ]; then
        return 0
    else
        return 1
    fi
}

# Check if frontend is running
check_frontend() {
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" 2>/dev/null || echo "000")
    
    if [ "$status_code" = "200" ]; then
        return 0
    else
        return 1
    fi
}

# Kill processes on ports
kill_port_processes() {
    local port=$1
    local pids
    pids=$(lsof -ti :$port 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        log_warning "Killing processes on port $port: $pids"
        kill -9 $pids 2>/dev/null || true
        sleep 2
    fi
}

# Start backend server
start_backend() {
    log_info "Starting backend server on port $BACKEND_PORT..."
    
    # Kill any existing processes on the port
    kill_port_processes $BACKEND_PORT
    
    # Start backend
    cd "$BACKEND_DIR"
    PORT=$BACKEND_PORT nohup node server.js > backend.log 2>&1 &
    local backend_pid=$!
    
    # Wait for backend to start
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if check_backend; then
            log_success "Backend started successfully on port $BACKEND_PORT (PID: $backend_pid)"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))
    done
    
    log_error "Backend failed to start after 30 seconds"
    return 1
}

# Start frontend server
start_frontend() {
    log_info "Starting frontend server on port $FRONTEND_PORT..."
    
    # Kill any existing processes on the port
    kill_port_processes $FRONTEND_PORT
    
    # Start frontend
    cd "$FRONTEND_DIR"
    nohup npm run dev -- --port $FRONTEND_PORT > frontend.log 2>&1 &
    local frontend_pid=$!
    
    # Wait for frontend to start
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if check_frontend; then
            log_success "Frontend started successfully on port $FRONTEND_PORT (PID: $frontend_pid)"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))
    done
    
    log_error "Frontend failed to start after 30 seconds"
    return 1
}

# Test API connectivity
test_api_connectivity() {
    local test_url="http://localhost:$BACKEND_PORT/api/events/theatre?location=San%20Francisco,%20CA&date_range=next%2030%20days"
    local response
    
    response=$(curl -s "$test_url" 2>/dev/null || echo '{"success": false}')
    
    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        local event_count
        event_count=$(echo "$response" | jq '.events | length' 2>/dev/null || echo "0")
        log_success "API connectivity test passed - $event_count events returned"
        return 0
    else
        log_error "API connectivity test failed"
        return 1
    fi
}

# Full system recovery
full_recovery() {
    log_warning "Initiating full system recovery..."
    
    # Stop everything
    kill_port_processes $BACKEND_PORT
    kill_port_processes $FRONTEND_PORT
    
    sleep 3
    
    # Start backend first
    if start_backend; then
        sleep 2
        
        # Test API
        if test_api_connectivity; then
            # Start frontend
            if start_frontend; then
                log_success "Full system recovery completed successfully"
                return 0
            else
                log_error "Frontend failed to start during recovery"
                return 1
            fi
        else
            log_error "API test failed during recovery"
            return 1
        fi
    else
        log_error "Backend failed to start during recovery"
        return 1
    fi
}

# Main monitoring loop
monitor() {
    log_info "Health monitor started - PID: $$"
    echo $$ > "$PID_FILE"
    
    while true; do
        local backend_ok=false
        local frontend_ok=false
        local api_ok=false
        
        # Check backend
        if check_backend; then
            backend_ok=true
        else
            log_error "Backend health check failed"
        fi
        
        # Check frontend
        if check_frontend; then
            frontend_ok=true
        else
            log_error "Frontend health check failed"
        fi
        
        # Check API connectivity if backend is up
        if [ "$backend_ok" = true ]; then
            if test_api_connectivity; then
                api_ok=true
            else
                log_error "API connectivity test failed"
            fi
        fi
        
        # Recovery logic
        if [ "$backend_ok" = false ] || [ "$frontend_ok" = false ] || [ "$api_ok" = false ]; then
            log_warning "System health check failed - Backend: $backend_ok, Frontend: $frontend_ok, API: $api_ok"
            
            if ! full_recovery; then
                log_error "Full recovery failed - will retry in 30 seconds"
                sleep 30
            else
                log_success "System recovered successfully"
            fi
        else
            log_info "All systems healthy - Backend: ✅ Frontend: ✅ API: ✅"
        fi
        
        # Wait before next check
        sleep 30
    done
}

# Handle script termination
cleanup() {
    log_info "Health monitor stopping..."
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGTERM SIGINT

# Main execution
case "${1:-monitor}" in
    "monitor")
        monitor
        ;;
    "start")
        full_recovery
        ;;
    "stop")
        if [ -f "$PID_FILE" ]; then
            local monitor_pid
            monitor_pid=$(cat "$PID_FILE")
            kill "$monitor_pid" 2>/dev/null || true
            rm -f "$PID_FILE"
            log_info "Health monitor stopped"
        else
            log_warning "Health monitor not running"
        fi
        ;;
    "status")
        if check_backend; then
            echo "✅ Backend: Healthy"
        else
            echo "❌ Backend: Down"
        fi
        
        if check_frontend; then
            echo "✅ Frontend: Healthy"
        else
            echo "❌ Frontend: Down"
        fi
        
        if test_api_connectivity; then
            echo "✅ API: Functional"
        else
            echo "❌ API: Failed"
        fi
        ;;
    *)
        echo "Usage: $0 {monitor|start|stop|status}"
        exit 1
        ;;
esac