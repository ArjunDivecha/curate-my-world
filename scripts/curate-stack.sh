#!/bin/bash

# =============================================================================
# CURATE STACK MANAGER - Bulletproof Development Environment
# =============================================================================
# 
# Unified script to manage the entire Curate-My-World application stack
# Provides bulletproof startup, monitoring, and recovery capabilities
# 
# VERSION: 1.0
# AUTHOR: Claude Code
# =============================================================================

set -e

# Configuration
PROJECT_DIR="/Users/macbook2024/Library/CloudStorage/Dropbox/AAA Backup/A Working/Curate-My-World"
BACKEND_DIR="$PROJECT_DIR/curate-events-api"
SCRIPTS_DIR="$PROJECT_DIR/scripts"
BACKEND_PORT=8765
FRONTEND_PORT=8766

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Enhanced logging with colors
log() {
    echo -e "${CYAN}[$(date '+%H:%M:%S')] $1${NC}"
}

log_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"
}

log_info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] ℹ️  $1${NC}"
}

# Banner display
show_banner() {
    echo -e "${CYAN}"
    echo "=================================================================="
    echo "🎭 CURATE-MY-WORLD DEVELOPMENT STACK"
    echo "=================================================================="
    echo "🚀 Bulletproof Frontend/Backend Integration System"
    echo "📍 Backend: http://localhost:$BACKEND_PORT"
    echo "🌐 Frontend: http://localhost:$FRONTEND_PORT"
    echo "=================================================================="
    echo -e "${NC}"
}

# Check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Kill processes on a specific port
kill_port() {
    local port=$1
    local pids
    pids=$(lsof -ti :$port 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        log_warning "Killing processes on port $port: $pids"
        kill -9 $pids 2>/dev/null || true
        sleep 2
    fi
}

# Start backend with health verification
start_backend() {
    log "Starting backend server..."
    
    # Ensure clean state
    kill_port $BACKEND_PORT
    
    # Navigate to backend directory
    cd "$BACKEND_DIR"
    
    # Start backend
    PORT=$BACKEND_PORT nohup node server.js > backend-stack.log 2>&1 &
    local backend_pid=$!
    
    log_info "Backend started with PID: $backend_pid"
    
    # Wait for backend to be ready
    local attempts=0
    local max_attempts=30
    
    while [ $attempts -lt $max_attempts ]; do
        if curl -s http://localhost:$BACKEND_PORT/api/health >/dev/null 2>&1; then
            log_success "Backend is healthy and ready!"
            
            # Test API functionality
            local test_response
            test_response=$(curl -s "http://localhost:$BACKEND_PORT/api/events/theatre?location=San%20Francisco,%20CA&date_range=next%2030%20days" 2>/dev/null || echo '{"success": false}')
            
            if echo "$test_response" | jq -e '.success' >/dev/null 2>&1; then
                local event_count
                event_count=$(echo "$test_response" | jq '.events | length' 2>/dev/null || echo "0")
                log_success "API is functional - $event_count sample events available"
                return 0
            else
                log_warning "Backend is running but API test failed"
                return 1
            fi
        fi
        
        sleep 1
        attempts=$((attempts + 1))
        
        if [ $((attempts % 10)) -eq 0 ]; then
            log_info "Still waiting for backend... ($attempts/$max_attempts)"
        fi
    done
    
    log_error "Backend failed to start within ${max_attempts} seconds"
    return 1
}

# Start frontend with health verification
start_frontend() {
    log "Starting frontend server..."
    
    # Ensure clean state
    kill_port $FRONTEND_PORT
    
    # Navigate to project directory
    cd "$PROJECT_DIR"
    
    # Start frontend
    nohup npm run dev -- --port $FRONTEND_PORT > frontend-stack.log 2>&1 &
    local frontend_pid=$!
    
    log_info "Frontend started with PID: $frontend_pid"
    
    # Wait for frontend to be ready
    local attempts=0
    local max_attempts=30
    
    while [ $attempts -lt $max_attempts ]; do
        if curl -s http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
            log_success "Frontend is ready and accessible!"
            return 0
        fi
        
        sleep 1
        attempts=$((attempts + 1))
        
        if [ $((attempts % 10)) -eq 0 ]; then
            log_info "Still waiting for frontend... ($attempts/$max_attempts)"
        fi
    done
    
    log_error "Frontend failed to start within ${max_attempts} seconds"
    return 1
}

# Start health monitor in background
start_health_monitor() {
    if [ -f "$SCRIPTS_DIR/health-monitor.sh" ]; then
        log "Starting health monitor..."
        nohup "$SCRIPTS_DIR/health-monitor.sh" monitor > health-monitor-stack.log 2>&1 &
        local monitor_pid=$!
        log_success "Health monitor started with PID: $monitor_pid"
    else
        log_warning "Health monitor script not found, skipping..."
    fi
}

# Stop all services
stop_stack() {
    log "Stopping all services..."
    
    # Stop health monitor
    if [ -f "$SCRIPTS_DIR/health-monitor.pid" ]; then
        local monitor_pid
        monitor_pid=$(cat "$SCRIPTS_DIR/health-monitor.pid" 2>/dev/null || true)
        if [ -n "$monitor_pid" ]; then
            kill "$monitor_pid" 2>/dev/null || true
            log_info "Health monitor stopped"
        fi
    fi
    
    # Kill processes on ports
    kill_port $BACKEND_PORT
    kill_port $FRONTEND_PORT
    
    log_success "All services stopped"
}

# Show current status
show_status() {
    echo
    log_info "Current System Status:"
    
    # Check backend
    if check_port $BACKEND_PORT; then
        if curl -s http://localhost:$BACKEND_PORT/api/health >/dev/null 2>&1; then
            log_success "Backend: Running and healthy on port $BACKEND_PORT"
        else
            log_warning "Backend: Running on port $BACKEND_PORT but health check failed"
        fi
    else
        log_error "Backend: Not running on port $BACKEND_PORT"
    fi
    
    # Check frontend
    if check_port $FRONTEND_PORT; then
        if curl -s http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
            log_success "Frontend: Running and accessible on port $FRONTEND_PORT"
        else
            log_warning "Frontend: Process on port $FRONTEND_PORT but not responding"
        fi
    else
        log_error "Frontend: Not running on port $FRONTEND_PORT"
    fi
    
    # Check health monitor
    if [ -f "$SCRIPTS_DIR/health-monitor.pid" ]; then
        local monitor_pid
        monitor_pid=$(cat "$SCRIPTS_DIR/health-monitor.pid" 2>/dev/null || true)
        if [ -n "$monitor_pid" ] && kill -0 "$monitor_pid" 2>/dev/null; then
            log_success "Health Monitor: Running (PID: $monitor_pid)"
        else
            log_warning "Health Monitor: PID file exists but process not running"
        fi
    else
        log_info "Health Monitor: Not running"
    fi
    
    echo
}

# Full startup sequence
start_stack() {
    show_banner
    
    log "🚀 Starting Curate-My-World development stack..."
    
    # Ensure scripts directory exists and is executable
    mkdir -p "$SCRIPTS_DIR"
    
    # Start backend first
    if start_backend; then
        log_success "Backend startup completed"
        
        # Small delay before starting frontend
        sleep 2
        
        # Start frontend
        if start_frontend; then
            log_success "Frontend startup completed"
            
            # Start health monitoring
            start_health_monitor
            
            # Show final status
            sleep 3
            show_status
            
            echo
            log_success "🎉 Stack startup completed successfully!"
            echo -e "${GREEN}=================================================================="
            echo "🎭 Your Curate-My-World application is ready!"
            echo "🌐 Frontend: http://localhost:$FRONTEND_PORT"
            echo "📡 Backend API: http://localhost:$BACKEND_PORT/api"
            echo "🏥 Health Monitor: Running in background"
            echo "=================================================================="
            echo -e "${NC}"
            
            return 0
        else
            log_error "Frontend startup failed"
            return 1
        fi
    else
        log_error "Backend startup failed"
        return 1
    fi
}

# Restart the entire stack
restart_stack() {
    log "🔄 Restarting Curate-My-World stack..."
    stop_stack
    sleep 3
    start_stack
}

# Quick health check
health_check() {
    log "🏥 Performing quick health check..."
    
    local backend_ok=false
    local frontend_ok=false
    local api_ok=false
    
    # Check backend
    if curl -s http://localhost:$BACKEND_PORT/api/health >/dev/null 2>&1; then
        backend_ok=true
        log_success "Backend: Healthy"
        
        # Test API
        local test_response
        test_response=$(curl -s "http://localhost:$BACKEND_PORT/api/events/theatre?location=San%20Francisco,%20CA&date_range=next%2030%20days" 2>/dev/null || echo '{"success": false}')
        
        if echo "$test_response" | jq -e '.success' >/dev/null 2>&1; then
            api_ok=true
            local event_count
            event_count=$(echo "$test_response" | jq '.events | length' 2>/dev/null || echo "0")
            log_success "API: Functional ($event_count events available)"
        else
            log_error "API: Not functional"
        fi
    else
        log_error "Backend: Not healthy"
    fi
    
    # Check frontend
    if curl -s http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
        frontend_ok=true
        log_success "Frontend: Accessible"
    else
        log_error "Frontend: Not accessible"
    fi
    
    # Overall status
    if [ "$backend_ok" = true ] && [ "$frontend_ok" = true ] && [ "$api_ok" = true ]; then
        log_success "🎉 All systems healthy!"
        return 0
    else
        log_warning "⚠️  Some systems need attention"
        return 1
    fi
}

# Main command handling
case "${1:-start}" in
    "start")
        start_stack
        ;;
    "stop")
        stop_stack
        ;;
    "restart")
        restart_stack
        ;;
    "status")
        show_status
        ;;
    "health")
        health_check
        ;;
    "logs")
        case "${2:-all}" in
            "backend")
                echo "=== Backend Logs ==="
                tail -n 50 "$BACKEND_DIR/backend-stack.log" 2>/dev/null || echo "No backend logs found"
                ;;
            "frontend")
                echo "=== Frontend Logs ==="
                tail -n 50 "$PROJECT_DIR/frontend-stack.log" 2>/dev/null || echo "No frontend logs found"
                ;;
            "monitor")
                echo "=== Health Monitor Logs ==="
                tail -n 50 "$PROJECT_DIR/health-monitor-stack.log" 2>/dev/null || echo "No monitor logs found"
                ;;
            "all"|*)
                echo "=== Backend Logs ==="
                tail -n 20 "$BACKEND_DIR/backend-stack.log" 2>/dev/null || echo "No backend logs found"
                echo -e "\n=== Frontend Logs ==="
                tail -n 20 "$PROJECT_DIR/frontend-stack.log" 2>/dev/null || echo "No frontend logs found"
                echo -e "\n=== Health Monitor Logs ==="
                tail -n 20 "$PROJECT_DIR/health-monitor-stack.log" 2>/dev/null || echo "No monitor logs found"
                ;;
        esac
        ;;
    "help"|"-h"|"--help")
        echo "Curate-My-World Stack Manager"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  start     Start the full development stack (default)"
        echo "  stop      Stop all services"
        echo "  restart   Restart the entire stack"
        echo "  status    Show current status of all services"
        echo "  health    Perform quick health check"
        echo "  logs      Show logs [all|backend|frontend|monitor]"
        echo "  help      Show this help message"
        echo ""
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac