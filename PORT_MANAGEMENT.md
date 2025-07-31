# Port Management System

## Overview

This project uses a stable port management system to eliminate port conflicts and ensure consistent development experience.

**Ports Used:**
- **Backend API**: Port 8765 (obscure port to avoid conflicts)
- **Frontend Dev Server**: Port 8766 (obscure port to avoid conflicts)

## Quick Start

### Start Everything
```bash
npm start
# or
./scripts/start-all.sh
```

### Start Individual Services
```bash
# Frontend only
npm run start:frontend

# Backend only
npm run start:backend
```

### Port Management
```bash
# Check port status
npm run port:status

# Clean up ports (kill any processes)
npm run port:cleanup
# or
npm run stop
```

## Port Management Features

### ✅ Automatic Port Cleanup
- Automatically kills any existing processes on target ports before starting
- No more "port already in use" errors
- Clean slate every time you start the application

### ✅ Consistent Port Configuration
- Uses obscure ports (8765, 8766) to avoid common development conflicts
- All configuration is centralized in `scripts/port-manager.js`
- Environment variables are automatically set for both services

### ✅ Intelligent Process Management
- Backend starts first, then frontend (proper dependency order)
- Graceful shutdown with Ctrl+C
- Detailed logging and error handling

### ✅ Cross-Platform Compatibility
- Works on macOS, Linux, and Windows
- Uses Node.js for consistent behavior across platforms

## Scripts Overview

### Core Scripts

| Script | Purpose | Ports Used |
|--------|---------|------------|
| `scripts/start-all.sh` | Start both frontend and backend | 8765, 8766 |
| `scripts/start-frontend.sh` | Start frontend only | 8766 |
| `scripts/start-backend.sh` | Start backend only | 8765 |
| `scripts/port-manager.js` | Core port management utility | Both |

### NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start complete application stack |
| `npm run start:frontend` | Start frontend development server |
| `npm run start:backend` | Start backend API server |
| `npm run stop` | Stop all services and clean up ports |
| `npm run port:status` | Check what's running on our ports |
| `npm run port:cleanup` | Kill processes on our ports |

## Port Manager Commands

```bash
node scripts/port-manager.js <command> [options]
```

**Commands:**
- `cleanup` - Kill all processes on ports 8765 and 8766
- `start-frontend` - Clean port and start frontend on port 8766
- `start-backend` - Clean port and start backend on port 8765
- `start-all` - Clean ports and start both services
- `status` - Check what's running on both ports

**Options:**
- `--verbose`, `-v` - Show detailed output

## Troubleshooting

### Port Already in Use
The port management system automatically handles this, but if you encounter issues:

```bash
# Check what's using the ports
npm run port:status

# Force cleanup
npm run port:cleanup

# Try starting again
npm start
```

### Services Won't Start
1. Check if you have the required files:
   ```bash
   ls -la scripts/
   ls -la curate-events-api/server.js
   ```

2. Check Node.js version:
   ```bash
   node --version  # Should be v16+ 
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

### Services Start But Can't Connect
1. Check if both services are running:
   ```bash
   npm run port:status
   ```

2. Verify the ports in browser:
   - Frontend: http://localhost:8766
   - Backend API: http://localhost:8765/api

3. Check configuration in `src/components/FetchEventsButton.tsx`:
   ```typescript
   const API_BASE_URL = 'http://localhost:8765/api';
   ```

## Configuration

### Changing Ports
If you need different ports, update these files:

1. `scripts/port-manager.js` - Update CONFIG object
2. `package.json` - Update dev script port
3. `src/components/FetchEventsButton.tsx` - Update API_BASE_URL

### Environment Variables
The port manager automatically sets these environment variables:

**Frontend:**
- `PORT=8766`
- `VITE_PORT=8766` 
- `VITE_API_BASE_URL=http://localhost:8765`

**Backend:**
- `PORT=8765`
- `NODE_ENV=development`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Port Management System                    │  
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Frontend      │    │    Backend      │                │
│  │   (React/Vite)  │    │   (Node.js)     │                │
│  │   Port: 8766    │◄──►│   Port: 8765    │                │
│  └─────────────────┘    └─────────────────┘                │
│           │                       │                         │
│           └───────────────────────┘                         │
│              Port Manager                                   │
│              - Auto cleanup                                 │
│              - Process management                           │
│              - Error handling                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Benefits

✅ **No More Port Conflicts** - Uses obscure ports that are rarely used by other services  
✅ **Consistent Development Experience** - Same ports every time  
✅ **Automatic Cleanup** - No manual port management needed  
✅ **Easy to Use** - Simple npm commands  
✅ **Robust Error Handling** - Graceful failures and recovery  
✅ **Cross-Platform** - Works on all operating systems  
✅ **Detailed Logging** - Know exactly what's happening  

## Previous Issues Solved

❌ **Before**: "ERR_CONNECTION_REFUSED" errors due to port mismatches  
❌ **Before**: Manual port cleanup required  
❌ **Before**: Inconsistent port usage across sessions  
❌ **Before**: "Port already in use" startup failures  

✅ **Now**: Reliable, consistent, automatic port management  

---

*Last Updated: 2025-01-31*  
*Port Management System Version: 1.0*