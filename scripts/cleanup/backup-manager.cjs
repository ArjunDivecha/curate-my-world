#!/usr/bin/env node

/**
 * Backup Manager for Repository Cleanup
 * 
 * This utility creates backups and archives before cleanup operations
 * to ensure we can restore if needed.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BackupManager {
  constructor(rootDir = path.resolve(process.cwd(), '../..')) {
    this.rootDir = rootDir;
    this.backupDir = path.join(this.rootDir, '.cleanup-backups');
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  }

  async createFullBackup() {
    console.log('💾 Creating full repository backup...');
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    const backupPath = path.join(this.backupDir, `full-backup-${this.timestamp}`);
    
    try {
      // Create backup using git archive if possible, otherwise copy
      if (fs.existsSync(path.join(this.rootDir, '.git'))) {
        console.log('📦 Using git archive for backup...');
        execSync(`git archive --format=tar.gz --output="${backupPath}.tar.gz" HEAD`, {
          cwd: this.rootDir
        });
        console.log(`✅ Git backup created: ${backupPath}.tar.gz`);
      } else {
        console.log('📁 Creating directory backup...');
        this.copyDirectory(this.rootDir, backupPath, [
          'node_modules',
          '.git',
          'dist',
          'build',
          '.cleanup-backups'
        ]);
        console.log(`✅ Directory backup created: ${backupPath}`);
      }

      return backupPath;
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw error;
    }
  }

  async archiveExperimentalCode() {
    console.log('🔬 Archiving experimental code...');
    
    const archivePath = path.join(this.backupDir, `experimental-archive-${this.timestamp}`);
    fs.mkdirSync(archivePath, { recursive: true });

    const experimentalDirs = [
      'experiments',
      'demo_outputs',
      'bench'
    ];

    const experimentalFiles = [
      'demo_user_input.py',
      'multi-provider-tester.py',
      'performance-test-providers.js',
      'fixed-provider-test.py',
      'quick-provider-test.py'
    ];

    let archivedCount = 0;

    // Archive experimental directories
    for (const dir of experimentalDirs) {
      const sourcePath = path.join(this.rootDir, dir);
      if (fs.existsSync(sourcePath)) {
        const destPath = path.join(archivePath, dir);
        this.copyDirectory(sourcePath, destPath);
        console.log(`📁 Archived directory: ${dir}`);
        archivedCount++;
      }
    }

    // Archive experimental files
    for (const file of experimentalFiles) {
      const sourcePath = path.join(this.rootDir, file);
      if (fs.existsSync(sourcePath)) {
        const destPath = path.join(archivePath, file);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`📄 Archived file: ${file}`);
        archivedCount++;
      }
    }

    // Create archive documentation
    const readmePath = path.join(archivePath, 'ARCHIVE_README.md');
    const readmeContent = `# Experimental Code Archive

This archive contains experimental code and research that was removed during repository cleanup on ${new Date().toISOString()}.

## Contents

### Directories
${experimentalDirs.map(dir => `- \`${dir}/\` - ${this.getDirectoryDescription(dir)}`).join('\n')}

### Files
${experimentalFiles.map(file => `- \`${file}\` - ${this.getFileDescription(file)}`).join('\n')}

## Purpose

This code was archived rather than deleted because it may contain valuable research, experiments, or prototypes that could be useful in the future.

## Restoration

To restore any of this code:
1. Copy the desired files/directories back to the main repository
2. Update any import paths or dependencies as needed
3. Test thoroughly before committing

## Cleanup Details

- Archive created: ${new Date().toISOString()}
- Original cleanup timestamp: ${this.timestamp}
- Total items archived: ${archivedCount}
`;

    fs.writeFileSync(readmePath, readmeContent);
    console.log(`✅ Experimental archive created: ${archivePath}`);
    console.log(`📚 Archive documentation: ${readmePath}`);

    return archivePath;
  }

  getDirectoryDescription(dir) {
    const descriptions = {
      'experiments': 'Various experimental implementations and prototypes',
      'demo_outputs': 'Output files from demo runs and testing',
      'bench': 'Benchmarking and performance testing code'
    };
    return descriptions[dir] || 'Experimental code directory';
  }

  getFileDescription(file) {
    const descriptions = {
      'demo_user_input.py': 'Demo script for user input processing',
      'multi-provider-tester.py': 'Testing script for multiple API providers',
      'performance-test-providers.js': 'Performance testing for API providers',
      'fixed-provider-test.py': 'Fixed version of provider testing',
      'quick-provider-test.py': 'Quick testing script for providers'
    };
    return descriptions[file] || 'Experimental code file';
  }

  copyDirectory(source, destination, excludeDirs = []) {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const items = fs.readdirSync(source);

    for (const item of items) {
      if (excludeDirs.includes(item)) {
        continue;
      }

      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);

      const stat = fs.lstatSync(sourcePath);

      if (stat.isDirectory()) {
        this.copyDirectory(sourcePath, destPath, excludeDirs);
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    }
  }

  async createRemovalManifest(filesToRemove) {
    console.log('📋 Creating removal manifest...');
    
    const manifestPath = path.join(this.backupDir, `removal-manifest-${this.timestamp}.json`);
    
    const manifest = {
      timestamp: new Date().toISOString(),
      totalFiles: filesToRemove.length,
      categories: {},
      files: []
    };

    // Load classification data for context
    let classifications = {};
    try {
      const classReportPath = path.join(__dirname, 'classification-report.json');
      const classReport = JSON.parse(fs.readFileSync(classReportPath, 'utf-8'));
      classifications = classReport.classifications;
    } catch (error) {
      console.warn('⚠️  Could not load classification data');
    }

    // Process each file
    for (const filePath of filesToRemove) {
      const fullPath = path.join(this.rootDir, filePath);
      const classification = classifications[filePath];
      
      let fileInfo = {
        path: filePath,
        exists: fs.existsSync(fullPath),
        category: classification?.category || 'unknown',
        confidence: classification?.confidence || 0,
        reason: classification?.reason || 'No classification data',
        size: 0
      };

      if (fileInfo.exists) {
        try {
          const stats = fs.lstatSync(fullPath);
          fileInfo.size = stats.size;
          fileInfo.modified = stats.mtime.toISOString();
        } catch (error) {
          fileInfo.error = error.message;
        }
      }

      manifest.files.push(fileInfo);

      // Count by category
      if (!manifest.categories[fileInfo.category]) {
        manifest.categories[fileInfo.category] = 0;
      }
      manifest.categories[fileInfo.category]++;
    }

    // Calculate total size
    manifest.totalSize = manifest.files.reduce((sum, file) => sum + (file.size || 0), 0);

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✅ Removal manifest created: ${manifestPath}`);
    console.log(`📊 Total size to be removed: ${this.formatBytes(manifest.totalSize)}`);

    return manifestPath;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async createRestoreScript() {
    console.log('🔧 Creating restore script...');
    
    const scriptPath = path.join(this.backupDir, `restore-${this.timestamp}.sh`);
    const scriptContent = `#!/bin/bash

# Repository Cleanup Restore Script
# Generated: ${new Date().toISOString()}
# Backup timestamp: ${this.timestamp}

set -e

BACKUP_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BACKUP_DIR/.." && pwd)"

echo "🔄 Repository Cleanup Restore Script"
echo "===================================="
echo "Backup directory: $BACKUP_DIR"
echo "Repository root: $REPO_ROOT"
echo ""

# Check if backup exists
FULL_BACKUP="$BACKUP_DIR/full-backup-${this.timestamp}"
if [ -f "$FULL_BACKUP.tar.gz" ]; then
    echo "📦 Found git backup: $FULL_BACKUP.tar.gz"
    echo "To restore from git backup:"
    echo "  cd $REPO_ROOT"
    echo "  tar -xzf $FULL_BACKUP.tar.gz"
    echo ""
elif [ -d "$FULL_BACKUP" ]; then
    echo "📁 Found directory backup: $FULL_BACKUP"
    echo "To restore from directory backup:"
    echo "  cp -r $FULL_BACKUP/* $REPO_ROOT/"
    echo ""
else
    echo "❌ No full backup found!"
    exit 1
fi

# Check experimental archive
EXPERIMENTAL_ARCHIVE="$BACKUP_DIR/experimental-archive-${this.timestamp}"
if [ -d "$EXPERIMENTAL_ARCHIVE" ]; then
    echo "🔬 Found experimental archive: $EXPERIMENTAL_ARCHIVE"
    echo "To restore experimental code:"
    echo "  cp -r $EXPERIMENTAL_ARCHIVE/* $REPO_ROOT/"
    echo ""
fi

# Show manifest
MANIFEST="$BACKUP_DIR/removal-manifest-${this.timestamp}.json"
if [ -f "$MANIFEST" ]; then
    echo "📋 Removal manifest available: $MANIFEST"
    echo "This file contains details of what was removed."
    echo ""
fi

echo "⚠️  WARNING: Restoring will overwrite current files!"
echo "Make sure to backup current state before restoring."
echo ""
echo "To proceed with full restore:"
echo "  1. Backup current state if needed"
echo "  2. Run the appropriate restore command above"
echo "  3. Run 'npm install' to restore dependencies"
echo "  4. Test the application"
`;

    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, '755'); // Make executable
    
    console.log(`✅ Restore script created: ${scriptPath}`);
    return scriptPath;
  }

  async generateBackupReport() {
    console.log('🚀 Starting backup and archiving process...');
    
    // Load files to remove
    let filesToRemove = [];
    try {
      const safetyReportPath = path.join(__dirname, 'safety-report.json');
      const safetyReport = JSON.parse(fs.readFileSync(safetyReportPath, 'utf-8'));
      filesToRemove = safetyReport.finalSafeList;
    } catch (error) {
      console.error('❌ Could not load safety report');
      return;
    }

    const results = {
      timestamp: this.timestamp,
      backupDir: this.backupDir,
      filesToRemove: filesToRemove.length
    };

    try {
      // 1. Create full backup
      results.fullBackup = await this.createFullBackup();
      
      // 2. Archive experimental code
      results.experimentalArchive = await this.archiveExperimentalCode();
      
      // 3. Create removal manifest
      results.manifest = await this.createRemovalManifest(filesToRemove);
      
      // 4. Create restore script
      results.restoreScript = await this.createRestoreScript();

      console.log('\n💾 Backup and Archive Report');
      console.log('================================');
      console.log(`Backup directory: ${this.backupDir}`);
      console.log(`Full backup: ${results.fullBackup}`);
      console.log(`Experimental archive: ${results.experimentalArchive}`);
      console.log(`Removal manifest: ${results.manifest}`);
      console.log(`Restore script: ${results.restoreScript}`);
      console.log(`Files to be removed: ${results.filesToRemove}`);

      // Save backup report
      const reportPath = path.join(__dirname, 'backup-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
      console.log(`\n📊 Backup report saved: ${reportPath}`);

      return results;
    } catch (error) {
      console.error('❌ Backup process failed:', error.message);
      throw error;
    }
  }
}

// Run if called directly
if (require.main === module) {
  const backupManager = new BackupManager();
  backupManager.generateBackupReport().catch(console.error);
}

module.exports = { BackupManager };