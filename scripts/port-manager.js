#!/usr/bin/env node

/**
 * =============================================================================
 * SCRIPT NAME: port-manager.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Port management utility that ensures consistent port usage across frontend
 * and backend services. Uses obscure port 9876 and kills any existing processes.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-31
 * AUTHOR: Claude Code
 * 
 * USAGE:
 * node scripts/port-manager.js cleanup
 * node scripts/port-manager.js start-frontend
 * node scripts/port-manager.js start-backend
 * node scripts/port-manager.js start-all
 * =============================================================================
 */

import { exec, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  FRONTEND_PORT: 8766,  // Obscure port for frontend
  BACKEND_PORT: 8765,   // Obscure port for backend
  PROJECT_ROOT: path.resolve(__dirname, '..'),
  TIMEOUT: 10000 // 10 seconds timeout for operations
};

class PortManager {
  constructor() {
    this.isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[level]}[${timestamp}] ${message}${colors.reset}`);
  }

  async executeCommand(command, description) {
    return new Promise((resolve, reject) => {
      if (this.isVerbose) {
        this.log(`Executing: ${command}`, 'info');
      }
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          this.log(`${description} failed: ${error.message}`, 'error');
          reject(error);
          return;
        }
        
        if (stderr && this.isVerbose) {
          this.log(`${description} stderr: ${stderr}`, 'warning');
        }
        
        if (stdout && this.isVerbose) {
          this.log(`${description} stdout: ${stdout}`, 'info');
        }
        
        resolve(stdout.trim());
      });
    });
  }

  async findProcessesOnPort(port) {
    try {
      const command = `lsof -ti:${port}`;
      const result = await this.executeCommand(command, `Finding processes on port ${port}`);
      
      if (result) {
        return result.split('\n').filter(pid => pid.trim());
      }
      return [];
    } catch (error) {
      // No processes found on port (normal case)
      return [];
    }
  }

  async killProcessesOnPort(port) {
    const pids = await this.findProcessesOnPort(port);
    
    if (pids.length === 0) {
      this.log(`No processes found on port ${port}`, 'success');
      return true;
    }

    this.log(`Found ${pids.length} process(es) on port ${port}: ${pids.join(', ')}`, 'warning');
    
    for (const pid of pids) {
      try {
        await this.executeCommand(`kill -9 ${pid}`, `Killing process ${pid}`);
        this.log(`Successfully killed process ${pid}`, 'success');
      } catch (error) {
        this.log(`Failed to kill process ${pid}: ${error.message}`, 'error');
      }
    }

    // Wait a moment for processes to clean up
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify cleanup
    const remainingPids = await this.findProcessesOnPort(port);
    if (remainingPids.length === 0) {
      this.log(`Port ${port} successfully cleared`, 'success');
      return true;
    } else {
      this.log(`Warning: ${remainingPids.length} process(es) still on port ${port}`, 'warning');
      return false;
    }
  }

  async cleanupPorts() {
    this.log(`🧹 Cleaning up ports ${CONFIG.BACKEND_PORT} (backend) and ${CONFIG.FRONTEND_PORT} (frontend)...`, 'info');
    
    const backendSuccess = await this.killProcessesOnPort(CONFIG.BACKEND_PORT);
    const frontendSuccess = await this.killProcessesOnPort(CONFIG.FRONTEND_PORT);
    
    if (backendSuccess && frontendSuccess) {
      this.log(`✅ Both ports are ready for use`, 'success');
    } else if (!backendSuccess && !frontendSuccess) {
      this.log(`⚠️ Both ports had cleanup issues`, 'warning');
    } else {
      this.log(`⚠️ One port had cleanup issues (backend: ${backendSuccess ? 'OK' : 'issues'}, frontend: ${frontendSuccess ? 'OK' : 'issues'})`, 'warning');
    }
    
    return backendSuccess && frontendSuccess;
  }

  async cleanupPort(port) {
    this.log(`🧹 Cleaning up port ${port}...`, 'info');
    const success = await this.killProcessesOnPort(port);
    
    if (success) {
      this.log(`✅ Port ${port} is ready for use`, 'success');
    } else {
      this.log(`⚠️ Port ${port} cleanup had issues`, 'warning');
    }
    
    return success;
  }

  async waitForPort(port, maxWaitTime = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await fetch(`http://localhost:${port}/health`);
        if (response.ok) {
          return true;
        }
      } catch (error) {
        // Service not ready yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
  }

  async startFrontend() {
    this.log(`🚀 Starting frontend on port ${CONFIG.FRONTEND_PORT}...`, 'info');
    
    // Clean up frontend port first
    await this.cleanupPort(CONFIG.FRONTEND_PORT);
    
    // Set environment variables for port
    const env = {
      ...process.env,
      PORT: CONFIG.FRONTEND_PORT.toString(),
      VITE_API_BASE_URL: `http://localhost:${CONFIG.BACKEND_PORT}`,
      VITE_PORT: CONFIG.FRONTEND_PORT.toString()
    };

    return new Promise((resolve, reject) => {
      const frontend = spawn('npm', ['run', 'dev'], {
        cwd: CONFIG.PROJECT_ROOT,
        env,
        stdio: this.isVerbose ? 'inherit' : 'pipe'
      });

      frontend.on('error', (error) => {
        this.log(`Frontend start error: ${error.message}`, 'error');
        reject(error);
      });

      // Give it time to start
      setTimeout(() => {
        this.log('✅ Frontend started successfully', 'success');
        resolve(frontend);
      }, 5000);
    });
  }

  async startBackend() {
    this.log(`🚀 Starting backend on port ${CONFIG.BACKEND_PORT}...`, 'info');
    
    // Clean up backend port first
    await this.cleanupPort(CONFIG.BACKEND_PORT);
    
    // Set environment variables for port
    const env = {
      ...process.env,
      PORT: CONFIG.BACKEND_PORT.toString(),
      NODE_ENV: 'development'
    };

    return new Promise((resolve, reject) => {
      const backend = spawn('node', ['curate-events-api/server.js'], {
        cwd: CONFIG.PROJECT_ROOT,
        env,
        stdio: this.isVerbose ? 'inherit' : 'pipe'
      });

      backend.on('error', (error) => {
        this.log(`Backend start error: ${error.message}`, 'error');
        reject(error);
      });

      // Give it time to start
      setTimeout(() => {
        this.log('✅ Backend started successfully', 'success');
        resolve(backend);
      }, 3000);
    });
  }

  async startAll() {
    this.log(`🚀 Starting complete application stack (backend: ${CONFIG.BACKEND_PORT}, frontend: ${CONFIG.FRONTEND_PORT})...`, 'info');
    
    // First cleanup both ports
    await this.cleanupPorts();
    
    try {
      // Start backend first
      const backend = await this.startBackend();
      
      // Wait a moment for backend to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Then start frontend
      const frontend = await this.startFrontend();
      
      this.log('✅ Both frontend and backend started successfully', 'success');
      this.log(`🌐 Application available at: http://localhost:${CONFIG.FRONTEND_PORT}`, 'success');
      this.log(`🔧 API available at: http://localhost:${CONFIG.BACKEND_PORT}/api`, 'success');
      
      // Keep processes running
      process.on('SIGINT', () => {
        this.log('🛑 Shutting down services...', 'warning');
        backend.kill();
        frontend.kill();
        process.exit(0);
      });
      
      // Keep the script running
      return new Promise(() => {});
      
    } catch (error) {
      this.log(`Failed to start application stack: ${error.message}`, 'error');
      throw error;
    }
  }

  async checkPortStatus() {
    this.log(`🔍 Checking port status...`, 'info');
    
    const backendProcesses = await this.findProcessesOnPort(CONFIG.BACKEND_PORT);
    const frontendProcesses = await this.findProcessesOnPort(CONFIG.FRONTEND_PORT);
    
    this.log(`Backend port ${CONFIG.BACKEND_PORT}: ${backendProcesses.length === 0 ? '✅ Available' : `⚠️ In use by ${backendProcesses.length} process(es)`}`, backendProcesses.length === 0 ? 'success' : 'warning');
    this.log(`Frontend port ${CONFIG.FRONTEND_PORT}: ${frontendProcesses.length === 0 ? '✅ Available' : `⚠️ In use by ${frontendProcesses.length} process(es)`}`, frontendProcesses.length === 0 ? 'success' : 'warning');
    
    // Get detailed process information for both ports
    const allProcesses = [...backendProcesses, ...frontendProcesses];
    for (const pid of allProcesses) {
      try {
        const processInfo = await this.executeCommand(`ps -p ${pid} -o pid,comm,args`, `Getting info for PID ${pid}`);
        this.log(`Process ${pid}: ${processInfo}`, 'info');
      } catch (error) {
        this.log(`Could not get info for PID ${pid}`, 'warning');
      }
    }
    
    return backendProcesses.length === 0 && frontendProcesses.length === 0;
  }
}

// Main execution
async function main() {
  const portManager = new PortManager();
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'cleanup':
        await portManager.cleanupPorts();
        break;
        
      case 'start-frontend':
        await portManager.startFrontend();
        break;
        
      case 'start-backend':
        await portManager.startBackend();
        break;
        
      case 'start-all':
        await portManager.startAll();
        break;
        
      case 'status':
        await portManager.checkPortStatus();
        break;
        
      default:
        console.log(`
🔧 Port Manager for Curate My World

Usage: node scripts/port-manager.js <command> [options]

Commands:
  cleanup        - Kill all processes on ports ${CONFIG.BACKEND_PORT} and ${CONFIG.FRONTEND_PORT}
  start-frontend - Clean port and start frontend on port ${CONFIG.FRONTEND_PORT}
  start-backend  - Clean port and start backend on port ${CONFIG.BACKEND_PORT}
  start-all      - Clean ports and start both frontend and backend
  status         - Check what's running on ports ${CONFIG.BACKEND_PORT} and ${CONFIG.FRONTEND_PORT}

Options:
  --verbose, -v  - Show detailed output

Examples:
  node scripts/port-manager.js cleanup
  node scripts/port-manager.js start-all --verbose
  node scripts/port-manager.js status
        `);
        process.exit(1);
    }
  } catch (error) {
    portManager.log(`Command failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Main execution - check if this file is being run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('port-manager.js');

if (isMainModule) {
  main();
}

export default PortManager;