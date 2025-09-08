#!/usr/bin/env node

/**
 * Dependency Analyzer for Repository Cleanup
 * 
 * This utility scans the codebase to identify all actively used files
 * by analyzing import statements, file references, and package.json scripts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface DependencyAnalysis {
  activeFiles: Set<string>;
  importedFiles: Set<string>;
  scriptFiles: Set<string>;
  configFiles: Set<string>;
  referencedFiles: Set<string>;
  analysis: {
    totalScanned: number;
    importsFound: number;
    scriptsAnalyzed: number;
    configsFound: number;
  };
}

class DependencyAnalyzer {
  private rootDir: string;
  private activeFiles = new Set<string>();
  private importedFiles = new Set<string>();
  private scriptFiles = new Set<string>();
  private configFiles = new Set<string>();
  private referencedFiles = new Set<string>();

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
  }

  async analyze(): Promise<DependencyAnalysis> {
    console.log('🔍 Starting dependency analysis...');
    
    // Scan source files for imports
    await this.scanSourceFiles();
    
    // Analyze package.json scripts
    await this.analyzePackageScripts();
    
    // Identify configuration files
    await this.identifyConfigFiles();
    
    // Scan for file references in configs
    await this.scanConfigReferences();
    
    // Combine all active files
    this.combineActiveFiles();
    
    return {
      activeFiles: this.activeFiles,
      importedFiles: this.importedFiles,
      scriptFiles: this.scriptFiles,
      configFiles: this.configFiles,
      referencedFiles: this.referencedFiles,
      analysis: {
        totalScanned: this.importedFiles.size + this.scriptFiles.size + this.configFiles.size,
        importsFound: this.importedFiles.size,
        scriptsAnalyzed: this.scriptFiles.size,
        configsFound: this.configFiles.size
      }
    };
  }

  private async scanSourceFiles(): Promise<void> {
    console.log('📁 Scanning source files for imports...');
    
    // Scan frontend source files
    const frontendFiles = await glob('src/**/*.{ts,tsx,js,jsx}', { cwd: this.rootDir });
    
    // Scan backend source files
    const backendFiles = await glob('curate-events-api/src/**/*.{ts,js}', { cwd: this.rootDir });
    
    const allSourceFiles = [...frontendFiles, ...backendFiles];
    
    for (const file of allSourceFiles) {
      await this.analyzeFileImports(file);
    }
    
    console.log(`✅ Scanned ${allSourceFiles.length} source files`);
  }

  private async analyzeFileImports(filePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.rootDir, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      // Add the file itself as active
      this.activeFiles.add(filePath);
      
      // Extract import statements
      const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
      const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
      
      let match;
      
      // Process ES6 imports
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        this.processImportPath(importPath, filePath);
      }
      
      // Process CommonJS requires
      while ((match = requireRegex.exec(content)) !== null) {
        const requirePath = match[1];
        this.processImportPath(requirePath, filePath);
      }
      
      // Process dynamic imports
      while ((match = dynamicImportRegex.exec(content)) !== null) {
        const dynamicPath = match[1];
        this.processImportPath(dynamicPath, filePath);
      }
      
    } catch (error) {
      console.warn(`⚠️  Could not analyze ${filePath}: ${error}`);
    }
  }

  private processImportPath(importPath: string, fromFile: string): void {
    // Skip node_modules imports
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return;
    }
    
    // Resolve relative imports
    const fromDir = path.dirname(fromFile);
    let resolvedPath = path.resolve(this.rootDir, fromDir, importPath);
    
    // Make relative to root
    resolvedPath = path.relative(this.rootDir, resolvedPath);
    
    // Try different extensions if file doesn't exist
    const possibleExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json'];
    
    for (const ext of possibleExtensions) {
      const testPath = resolvedPath + ext;
      const fullTestPath = path.join(this.rootDir, testPath);
      
      if (fs.existsSync(fullTestPath)) {
        this.importedFiles.add(testPath);
        this.activeFiles.add(testPath);
        break;
      }
      
      // Check for index files
      const indexPath = path.join(testPath, 'index' + ext);
      const fullIndexPath = path.join(this.rootDir, indexPath);
      
      if (fs.existsSync(fullIndexPath)) {
        this.importedFiles.add(indexPath);
        this.activeFiles.add(indexPath);
        break;
      }
    }
  }

  private async analyzePackageScripts(): Promise<void> {
    console.log('📦 Analyzing package.json scripts...');
    
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      console.warn('⚠️  package.json not found');
      return;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const scripts = packageJson.scripts || {};
      
      for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
        if (typeof scriptCommand === 'string') {
          this.extractScriptFiles(scriptCommand);
        }
      }
      
      console.log(`✅ Analyzed ${Object.keys(scripts).length} package.json scripts`);
    } catch (error) {
      console.warn(`⚠️  Could not analyze package.json: ${error}`);
    }
  }

  private extractScriptFiles(scriptCommand: string): void {
    // Extract file references from script commands
    const filePatterns = [
      /\.\/([^\\s]+\\.(?:js|ts|sh|py))/g,
      /([^\\s]+\\.(?:js|ts|sh|py))/g,
      /node\\s+([^\\s]+\\.js)/g
    ];
    
    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(scriptCommand)) !== null) {
        const filePath = match[1];
        if (fs.existsSync(path.join(this.rootDir, filePath))) {
          this.scriptFiles.add(filePath);
          this.activeFiles.add(filePath);
        }
      }
    }
  }

  private async identifyConfigFiles(): Promise<void> {
    console.log('⚙️  Identifying configuration files...');
    
    const configPatterns = [
      'package.json',
      'package-lock.json',
      'bun.lockb',
      'tsconfig*.json',
      'vite.config.*',
      'postcss.config.*',
      'tailwind.config.*',
      'eslint.config.*',
      '.env.example',
      '.gitignore',
      'components.json',
      'index.html'
    ];
    
    for (const pattern of configPatterns) {
      const files = await glob(pattern, { cwd: this.rootDir });
      for (const file of files) {
        this.configFiles.add(file);
        this.activeFiles.add(file);
      }
    }
    
    console.log(`✅ Found ${this.configFiles.size} configuration files`);
  }

  private async scanConfigReferences(): Promise<void> {
    console.log('🔗 Scanning configuration files for references...');
    
    for (const configFile of this.configFiles) {
      try {
        const fullPath = path.join(this.rootDir, configFile);
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // Look for file references in JSON configs
        if (configFile.endsWith('.json')) {
          this.extractJsonReferences(content);
        }
        
        // Look for file references in other configs
        this.extractGeneralReferences(content, configFile);
        
      } catch (error) {
        console.warn(`⚠️  Could not scan ${configFile}: ${error}`);
      }
    }
  }

  private extractJsonReferences(content: string): void {
    try {
      const json = JSON.parse(content);
      this.extractReferencesFromObject(json);
    } catch (error) {
      // Not valid JSON, skip
    }
  }

  private extractReferencesFromObject(obj: any): void {
    if (typeof obj === 'string') {
      // Check if string looks like a file path
      if (obj.includes('/') && (obj.endsWith('.js') || obj.endsWith('.ts') || obj.endsWith('.json'))) {
        if (fs.existsSync(path.join(this.rootDir, obj))) {
          this.referencedFiles.add(obj);
          this.activeFiles.add(obj);
        }
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => this.extractReferencesFromObject(item));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => this.extractReferencesFromObject(value));
    }
  }

  private extractGeneralReferences(content: string, configFile: string): void {
    // Extract file references from config files
    const fileRefRegex = /['"]([^'"]*\\.(?:js|ts|tsx|jsx|json|sh|py))['\"]/g;
    let match;
    
    while ((match = fileRefRegex.exec(content)) !== null) {
      const filePath = match[1];
      const fullPath = path.join(this.rootDir, filePath);
      
      if (fs.existsSync(fullPath)) {
        this.referencedFiles.add(filePath);
        this.activeFiles.add(filePath);
      }
    }
  }

  private combineActiveFiles(): void {
    // Ensure all core directories are marked as active
    const coreDirectories = ['src', 'curate-events-api/src', 'scripts'];
    
    for (const dir of coreDirectories) {
      if (fs.existsSync(path.join(this.rootDir, dir))) {
        this.activeFiles.add(dir);
      }
    }
  }

  async generateReport(): Promise<void> {
    const analysis = await this.analyze();
    
    console.log('\n📊 Dependency Analysis Report');
    console.log('================================');
    console.log(`Total active files identified: ${analysis.activeFiles.size}`);
    console.log(`Files imported by source code: ${analysis.importedFiles.size}`);
    console.log(`Files referenced in scripts: ${analysis.scriptFiles.size}`);
    console.log(`Configuration files: ${analysis.configFiles.size}`);
    console.log(`Files referenced in configs: ${analysis.referencedFiles.size}`);
    
    console.log('\n📁 Active Files:');
    const sortedActiveFiles = Array.from(analysis.activeFiles).sort();
    sortedActiveFiles.forEach(file => console.log(`  ✅ ${file}`));
    
    // Save report to file
    const reportPath = path.join(this.rootDir, 'scripts/cleanup/dependency-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      activeFiles: Array.from(analysis.activeFiles),
      importedFiles: Array.from(analysis.importedFiles),
      scriptFiles: Array.from(analysis.scriptFiles),
      configFiles: Array.from(analysis.configFiles),
      referencedFiles: Array.from(analysis.referencedFiles),
      analysis: analysis.analysis
    }, null, 2));
    
    console.log(`\n💾 Report saved to: ${reportPath}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new DependencyAnalyzer();
  analyzer.generateReport().catch(console.error);
}

export { DependencyAnalyzer, DependencyAnalysis };