#!/usr/bin/env node

/**
 * Safety Validator for Repository Cleanup
 * 
 * This utility validates that files marked for removal won't break the application
 * by checking dependencies, build integrity, and running safety tests.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SafetyValidator {
  constructor(rootDir = path.resolve(process.cwd(), '../..')) {
    this.rootDir = rootDir;
    this.activeFiles = new Set();
    this.safeToRemove = [];
    this.loadAnalysisResults();
  }

  loadAnalysisResults() {
    try {
      // Load dependency analysis
      const depReportPath = path.join(__dirname, 'dependency-report.json');
      const depReport = JSON.parse(fs.readFileSync(depReportPath, 'utf-8'));
      this.activeFiles = new Set(depReport.activeFiles);

      // Load classification results
      const classReportPath = path.join(__dirname, 'classification-report.json');
      const classReport = JSON.parse(fs.readFileSync(classReportPath, 'utf-8'));
      this.safeToRemove = classReport.safeToRemove;

      console.log(`📋 Loaded ${this.activeFiles.size} active files`);
      console.log(`🗑️  Loaded ${this.safeToRemove.length} files marked for removal`);
    } catch (error) {
      console.error('❌ Could not load analysis results:', error.message);
      process.exit(1);
    }
  }

  async validateRemoval(filesToRemove = this.safeToRemove) {
    console.log('🔍 Starting safety validation...');
    
    const validationResults = {
      safe: [],
      unsafe: [],
      warnings: [],
      buildTest: null,
      dependencyCheck: null
    };

    // 1. Check for dependency violations
    console.log('🔗 Checking for dependency violations...');
    const dependencyViolations = await this.checkDependencyViolations(filesToRemove);
    validationResults.dependencyCheck = dependencyViolations;

    // 2. Validate each file individually
    console.log('📁 Validating individual files...');
    for (const filePath of filesToRemove) {
      const validation = this.validateSingleFile(filePath);
      
      if (validation.safe) {
        validationResults.safe.push(filePath);
      } else {
        validationResults.unsafe.push({
          file: filePath,
          reason: validation.reason
        });
      }

      if (validation.warning) {
        validationResults.warnings.push({
          file: filePath,
          warning: validation.warning
        });
      }
    }

    // 3. Test build integrity (before actual removal)
    console.log('🏗️  Testing build integrity...');
    const buildTest = await this.testBuildIntegrity();
    validationResults.buildTest = buildTest;

    return validationResults;
  }

  async checkDependencyViolations(filesToRemove) {
    console.log('🔍 Scanning for import statements that reference files to be removed...');
    
    const violations = [];
    const filesToRemoveSet = new Set(filesToRemove);

    // Scan all active files for imports
    for (const activeFile of this.activeFiles) {
      if (filesToRemoveSet.has(activeFile)) {
        continue; // Skip files that are being removed
      }

      const fullPath = path.join(this.rootDir, activeFile);
      
      if (!fs.existsSync(fullPath) || fs.lstatSync(fullPath).isDirectory()) {
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const imports = this.extractImports(content);

        for (const importPath of imports) {
          const resolvedPath = this.resolveImportPath(importPath, activeFile);
          
          if (resolvedPath && filesToRemoveSet.has(resolvedPath)) {
            violations.push({
              activeFile,
              importedFile: resolvedPath,
              importStatement: importPath
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not scan ${activeFile}: ${error.message}`);
      }
    }

    if (violations.length > 0) {
      console.log(`❌ Found ${violations.length} dependency violations:`);
      violations.forEach(v => {
        console.log(`  ${v.activeFile} imports ${v.importedFile}`);
      });
    } else {
      console.log('✅ No dependency violations found');
    }

    return violations;
  }

  extractImports(content) {
    const imports = [];
    
    // ES6 imports
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // CommonJS requires
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Dynamic imports
    const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  resolveImportPath(importPath, fromFile) {
    // Skip node_modules imports
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }

    const fromDir = path.dirname(fromFile);
    let resolvedPath = path.resolve(this.rootDir, fromDir, importPath);
    resolvedPath = path.relative(this.rootDir, resolvedPath);

    // Try different extensions
    const possibleExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json'];
    
    for (const ext of possibleExtensions) {
      const testPath = resolvedPath + ext;
      if (fs.existsSync(path.join(this.rootDir, testPath))) {
        return testPath;
      }

      // Check for index files
      const indexPath = path.join(testPath, 'index' + ext);
      if (fs.existsSync(path.join(this.rootDir, indexPath))) {
        return indexPath;
      }
    }

    return null;
  }

  validateSingleFile(filePath) {
    const fullPath = path.join(this.rootDir, filePath);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return {
        safe: true,
        reason: 'File does not exist'
      };
    }

    // Check if it's in active files (double-check)
    if (this.activeFiles.has(filePath)) {
      return {
        safe: false,
        reason: 'File is marked as active in dependency analysis'
      };
    }

    // Check for critical system files
    const criticalPatterns = [
      /package\.json$/,
      /package-lock\.json$/,
      /\.env$/,
      /\.gitignore$/,
      /tsconfig.*\.json$/,
      /vite\.config\./,
      /tailwind\.config\./,
      /postcss\.config\./,
      /eslint\.config\./
    ];

    for (const pattern of criticalPatterns) {
      if (pattern.test(filePath)) {
        return {
          safe: false,
          reason: 'File matches critical system file pattern'
        };
      }
    }

    // Check for files in critical directories
    const criticalDirs = ['src/', 'curate-events-api/src/', 'public/'];
    for (const dir of criticalDirs) {
      if (filePath.startsWith(dir)) {
        return {
          safe: false,
          reason: `File is in critical directory: ${dir}`,
          warning: 'Double-check this file is not needed'
        };
      }
    }

    // File appears safe to remove
    return {
      safe: true,
      reason: 'File passed all safety checks'
    };
  }

  async testBuildIntegrity() {
    console.log('🏗️  Testing frontend build...');
    
    try {
      // Test frontend build
      const frontendResult = this.runCommand('npm run build', { cwd: this.rootDir });
      
      // Test backend (basic syntax check)
      const backendResult = this.runCommand('node -c curate-events-api/server.js', { cwd: this.rootDir });

      return {
        success: true,
        frontend: frontendResult.success,
        backend: backendResult.success,
        details: {
          frontendOutput: frontendResult.output,
          backendOutput: backendResult.output
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  runCommand(command, options = {}) {
    try {
      const output = execSync(command, {
        cwd: options.cwd || this.rootDir,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      return {
        success: true,
        output: output.trim()
      };
    } catch (error) {
      return {
        success: false,
        output: error.message,
        stderr: error.stderr ? error.stderr.toString() : ''
      };
    }
  }

  async generateSafetyReport() {
    const validationResults = await this.validateRemoval();
    
    console.log('\n🛡️  Safety Validation Report');
    console.log('================================');
    console.log(`Total files validated: ${this.safeToRemove.length}`);
    console.log(`✅ Safe to remove: ${validationResults.safe.length}`);
    console.log(`❌ Unsafe to remove: ${validationResults.unsafe.length}`);
    console.log(`⚠️  Warnings: ${validationResults.warnings.length}`);

    if (validationResults.dependencyCheck.length > 0) {
      console.log('\n❌ Dependency Violations:');
      validationResults.dependencyCheck.forEach(violation => {
        console.log(`  ${violation.activeFile} → ${violation.importedFile}`);
      });
    }

    if (validationResults.unsafe.length > 0) {
      console.log('\n❌ Unsafe Files:');
      validationResults.unsafe.forEach(item => {
        console.log(`  ${item.file}: ${item.reason}`);
      });
    }

    if (validationResults.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      validationResults.warnings.forEach(item => {
        console.log(`  ${item.file}: ${item.warning}`);
      });
    }

    console.log('\n🏗️  Build Test Results:');
    if (validationResults.buildTest.success) {
      console.log('  ✅ Frontend build: ' + (validationResults.buildTest.frontend ? 'PASS' : 'FAIL'));
      console.log('  ✅ Backend syntax: ' + (validationResults.buildTest.backend ? 'PASS' : 'FAIL'));
    } else {
      console.log('  ❌ Build test failed:', validationResults.buildTest.error);
    }

    // Calculate final safe list (excluding violations and unsafe files)
    const violatedFiles = new Set(validationResults.dependencyCheck.map(v => v.importedFile));
    const unsafeFiles = new Set(validationResults.unsafe.map(u => u.file));
    
    const finalSafeList = validationResults.safe.filter(file => 
      !violatedFiles.has(file) && !unsafeFiles.has(file)
    );

    console.log(`\n🎯 Final Safe Removal List: ${finalSafeList.length} files`);

    // Save detailed report
    const reportPath = path.join(__dirname, 'safety-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        totalValidated: this.safeToRemove.length,
        safeCount: validationResults.safe.length,
        unsafeCount: validationResults.unsafe.length,
        warningCount: validationResults.warnings.length,
        violationCount: validationResults.dependencyCheck.length,
        finalSafeCount: finalSafeList.length
      },
      validationResults,
      finalSafeList,
      buildTest: validationResults.buildTest
    }, null, 2));

    console.log(`\n💾 Safety report saved to: ${reportPath}`);

    return {
      validationResults,
      finalSafeList
    };
  }

  // Get the final list of files that are completely safe to remove
  getFinalSafeList() {
    const reportPath = path.join(__dirname, 'safety-report.json');
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      return report.finalSafeList;
    }
    return [];
  }
}

// Run if called directly
if (require.main === module) {
  const validator = new SafetyValidator();
  validator.generateSafetyReport().catch(console.error);
}

module.exports = { SafetyValidator };