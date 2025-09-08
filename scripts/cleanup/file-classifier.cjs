#!/usr/bin/env node

/**
 * File Classifier for Repository Cleanup
 * 
 * This utility classifies files into categories: active, test, experimental, legacy, config
 * Uses the dependency analysis results and pattern matching to make classification decisions.
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const FileCategory = {
  ACTIVE_PRODUCTION: 'active',
  UNUSED_TEST: 'test',
  EXPERIMENTAL: 'experimental',
  LEGACY: 'legacy',
  CONFIGURATION: 'config',
  DOCUMENTATION: 'docs',
  TEMPORARY: 'temporary'
};

class FileClassifier {
  constructor(rootDir = path.resolve(process.cwd(), '../..')) {
    this.rootDir = rootDir;
    this.activeFiles = new Set();
    this.classificationRules = this.initializeRules();
    this.loadActiveFiles();
  }

  loadActiveFiles() {
    try {
      const reportPath = path.join(__dirname, 'dependency-report.json');
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      this.activeFiles = new Set(report.activeFiles);
      console.log(`📋 Loaded ${this.activeFiles.size} active files from dependency analysis`);
    } catch (error) {
      console.warn('⚠️  Could not load dependency report, using empty active files set');
    }
  }

  initializeRules() {
    return [
      // Test files - highest priority
      {
        name: 'test-files',
        category: FileCategory.UNUSED_TEST,
        confidence: 0.95,
        patterns: [
          /^test-.*\.(js|py|html)$/,
          /^.*\.test\.(js|ts|tsx)$/,
          /^.*\.spec\.(js|ts|tsx)$/,
          /test.*\.py$/,
          /debug.*\.(js|ts|py)$/
        ]
      },
      
      // Temporary and log files
      {
        name: 'temporary-files',
        category: FileCategory.TEMPORARY,
        confidence: 0.98,
        patterns: [
          /.*\.log$/,
          /.*\.pid$/,
          /.*conflicted copy.*$/,
          /^\.DS_Store$/,
          /.*\.tmp$/,
          /.*\.temp$/
        ]
      },
      
      // Experimental code
      {
        name: 'experimental-code',
        category: FileCategory.EXPERIMENTAL,
        confidence: 0.90,
        patterns: [
          /^experiments\//,
          /^demo_outputs\//,
          /demo.*\.py$/,
          /.*-test\.py$/,
          /performance-test.*\.js$/,
          /multi-provider-tester\.py$/,
          /bench\//
        ]
      },
      
      // Legacy systems
      {
        name: 'legacy-systems',
        category: FileCategory.LEGACY,
        confidence: 0.85,
        patterns: [
          /.*\.sql$/,
          /apply-.*\.js$/,
          /migration-.*\.(js|html)$/,
          /clear-.*\.js$/,
          /force-.*\.js$/,
          /kill-.*\.sql$/,
          /disable-.*\.sql$/,
          /verify-.*\.js$/,
          /check-.*\.js$/
        ]
      },
      
      // Python scripts (mostly unused)
      {
        name: 'python-scripts',
        category: FileCategory.LEGACY,
        confidence: 0.80,
        patterns: [
          /.*\.py$/,
          /requirements\.txt$/
        ]
      },
      
      // Configuration files
      {
        name: 'configuration-files',
        category: FileCategory.CONFIGURATION,
        confidence: 0.95,
        patterns: [
          /package.*\.json$/,
          /tsconfig.*\.json$/,
          /.*\.config\.(js|ts)$/,
          /\.env.*$/,
          /\.gitignore$/,
          /components\.json$/,
          /index\.html$/,
          /bun\.lockb$/
        ]
      },
      
      // Documentation
      {
        name: 'documentation',
        category: FileCategory.DOCUMENTATION,
        confidence: 0.90,
        patterns: [
          /README.*\.md$/,
          /.*\.md$/,
          /ENVIRONMENT\.md$/,
          /PORT_MANAGEMENT\.md$/,
          /PRD\.md$/,
          /CLAUDE\.md$/
        ]
      },
      
      // Active production code (lowest priority, catches remaining)
      {
        name: 'production-code',
        category: FileCategory.ACTIVE_PRODUCTION,
        confidence: 0.70,
        patterns: [
          /^src\//,
          /^curate-events-api\/src\//,
          /^scripts\/.*\.(js|sh)$/,
          /^public\//
        ]
      }
    ];
  }

  classifyFile(filePath) {
    // First check if file is in active files list
    if (this.activeFiles.has(filePath)) {
      return {
        category: FileCategory.ACTIVE_PRODUCTION,
        confidence: 0.99,
        reason: 'File is actively referenced by dependency analysis',
        rule: 'dependency-analysis'
      };
    }

    // Apply classification rules in order
    for (const rule of this.classificationRules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(filePath)) {
          return {
            category: rule.category,
            confidence: rule.confidence,
            reason: `Matches pattern: ${pattern.source}`,
            rule: rule.name
          };
        }
      }
    }

    // Default classification for unmatched files
    return {
      category: FileCategory.LEGACY,
      confidence: 0.30,
      reason: 'No specific pattern matched, defaulting to legacy',
      rule: 'default'
    };
  }

  async classifyAllFiles() {
    console.log('🔍 Scanning all files in repository...');
    
    // Get all files in the repository (excluding node_modules and .git)
    const allFiles = await glob('**/*', {
      cwd: this.rootDir,
      ignore: [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '**/.DS_Store'
      ],
      dot: true
    });

    console.log(`📁 Found ${allFiles.length} files to classify`);

    const classifications = {};
    const categoryCounts = {};

    for (const filePath of allFiles) {
      const fullPath = path.join(this.rootDir, filePath);
      
      // Skip directories
      if (fs.lstatSync(fullPath).isDirectory()) {
        continue;
      }

      const classification = this.classifyFile(filePath);
      classifications[filePath] = classification;

      // Count categories
      if (!categoryCounts[classification.category]) {
        categoryCounts[classification.category] = 0;
      }
      categoryCounts[classification.category]++;
    }

    return {
      classifications,
      categoryCounts,
      totalFiles: Object.keys(classifications).length
    };
  }

  async generateReport() {
    const results = await this.classifyAllFiles();
    
    console.log('\n📊 File Classification Report');
    console.log('================================');
    console.log(`Total files classified: ${results.totalFiles}`);
    
    // Show category counts
    console.log('\n📈 Category Distribution:');
    for (const [category, count] of Object.entries(results.categoryCounts)) {
      const percentage = ((count / results.totalFiles) * 100).toFixed(1);
      console.log(`  ${this.getCategoryEmoji(category)} ${category}: ${count} files (${percentage}%)`);
    }

    // Show files by category
    console.log('\n📁 Files by Category:');
    for (const category of Object.values(FileCategory)) {
      const filesInCategory = Object.entries(results.classifications)
        .filter(([_, classification]) => classification.category === category)
        .sort(([a], [b]) => a.localeCompare(b));

      if (filesInCategory.length > 0) {
        console.log(`\n${this.getCategoryEmoji(category)} ${category.toUpperCase()} (${filesInCategory.length} files):`);
        filesInCategory.forEach(([filePath, classification]) => {
          const confidenceBar = '█'.repeat(Math.round(classification.confidence * 10));
          console.log(`  ${confidenceBar.padEnd(10)} ${filePath}`);
        });
      }
    }

    // Identify files safe to remove
    const safeToRemove = Object.entries(results.classifications)
      .filter(([_, classification]) => 
        [FileCategory.UNUSED_TEST, FileCategory.TEMPORARY, FileCategory.EXPERIMENTAL, FileCategory.LEGACY].includes(classification.category) &&
        classification.confidence > 0.7
      )
      .map(([filePath]) => filePath);

    console.log(`\n🗑️  Files Safe to Remove: ${safeToRemove.length}`);
    console.log('Files with high confidence for removal:');
    safeToRemove.slice(0, 20).forEach(file => console.log(`  🗑️  ${file}`));
    if (safeToRemove.length > 20) {
      console.log(`  ... and ${safeToRemove.length - 20} more files`);
    }

    // Save detailed report
    const reportPath = path.join(__dirname, 'classification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: results.totalFiles,
        categoryCounts: results.categoryCounts,
        safeToRemoveCount: safeToRemove.length
      },
      classifications: results.classifications,
      safeToRemove,
      rules: this.classificationRules.map(rule => ({
        name: rule.name,
        category: rule.category,
        confidence: rule.confidence,
        patternCount: rule.patterns.length
      }))
    }, null, 2));

    console.log(`\n💾 Detailed report saved to: ${reportPath}`);

    return results;
  }

  getCategoryEmoji(category) {
    const emojis = {
      [FileCategory.ACTIVE_PRODUCTION]: '✅',
      [FileCategory.UNUSED_TEST]: '🧪',
      [FileCategory.EXPERIMENTAL]: '🔬',
      [FileCategory.LEGACY]: '📜',
      [FileCategory.CONFIGURATION]: '⚙️',
      [FileCategory.DOCUMENTATION]: '📚',
      [FileCategory.TEMPORARY]: '🗑️'
    };
    return emojis[category] || '❓';
  }

  // Get files that can be safely removed
  getSafeToRemoveFiles(classifications) {
    return Object.entries(classifications)
      .filter(([_, classification]) => 
        [FileCategory.UNUSED_TEST, FileCategory.TEMPORARY, FileCategory.EXPERIMENTAL, FileCategory.LEGACY].includes(classification.category) &&
        classification.confidence > 0.7 &&
        !this.activeFiles.has(_) // Double-check not in active files
      )
      .map(([filePath]) => filePath);
  }
}

// Run if called directly
if (require.main === module) {
  const classifier = new FileClassifier();
  classifier.generateReport().catch(console.error);
}

module.exports = { FileClassifier, FileCategory };