# Design Document

## Overview

The repository cleanup system will systematically analyze and clean up the Curate Events repository by categorizing files into active production code, unused legacy code, and experimental/test files. The cleanup process will preserve the core React frontend and Node.js backend functionality while removing the extensive collection of test files, experimental code, and legacy systems that are cluttering the repository.

Based on analysis of the codebase, the repository contains:
- **Active Production Code**: React frontend (src/), Node.js backend (curate-events-api/), configuration files
- **Extensive Test Files**: 40+ test-*.js files, test-*.py files, and test-*.html files
- **Experimental Code**: experiments/ directory with speed-demon and super-hybrid projects
- **Legacy Systems**: Various SQL files, migration scripts, and old configuration files
- **Development Artifacts**: Log files, PID files, conflicted copies, and temporary files

## Architecture

### Cleanup Analysis Engine

The cleanup system will use a multi-phase analysis approach:

1. **Dependency Analysis Phase**: Scan all active production code to identify imported/referenced files
2. **Categorization Phase**: Classify files into active, unused, experimental, and configuration categories
3. **Safety Validation Phase**: Verify that no active code depends on files marked for deletion
4. **Cleanup Execution Phase**: Remove unused files while preserving important configurations and documentation

### File Classification System

Files will be categorized using the following classification rules:

#### Active Production Code
- All files in `src/` directory (React frontend)
- All files in `curate-events-api/src/` directory (backend core)
- Main configuration files: `package.json`, `vite.config.ts`, `tsconfig.json`, etc.
- Active scripts referenced in package.json: `scripts/start-*.sh`, `scripts/port-manager.js`
- Environment templates: `.env.example`
- Documentation for active systems: `README.md`, `PRD.md`

#### Unused Test Files (Safe to Remove)
- All `test-*.js` files (40+ files identified)
- All `test-*.py` files
- All `test-*.html` files
- Test data files: `sample_chat_history.json`
- Debug files: `debug-*.js`, `debug_*.ts`

#### Experimental Code (Archive then Remove)
- `experiments/` directory and all contents
- `demo_outputs/` directory
- Prototype files: `demo_*.py`, `*-test.py`
- Performance testing: `performance-test-*.js`, `multi-provider-tester.py`

#### Legacy Systems (Safe to Remove)
- SQL migration files: `*.sql` files
- Legacy API files: `apply-*.js`
- Old configuration: `migration-helper.html`
- Conflicted copies: Files with "conflicted copy" in name
- Log files: `*.log` files
- PID files: `*.pid` files

#### Configuration Files (Preserve)
- Package management: `package.json`, `package-lock.json`, `bun.lockb`
- TypeScript config: `tsconfig.*.json`
- Build tools: `vite.config.ts`, `postcss.config.js`, `tailwind.config.ts`
- Linting: `eslint.config.js`
- Environment: `.env.example`, `.gitignore`

## Components and Interfaces

### Dependency Scanner

```typescript
interface DependencyScanner {
  scanImports(directory: string): Set<string>
  scanReferences(directory: string): Set<string>
  getActiveDependencies(): Set<string>
}
```

The dependency scanner will:
- Parse all TypeScript/JavaScript files for import statements
- Scan for file references in configuration files
- Identify files referenced in package.json scripts
- Build a comprehensive list of actively used files

### File Classifier

```typescript
interface FileClassifier {
  classifyFile(filePath: string): FileCategory
  getClassificationRules(): ClassificationRule[]
  validateClassification(filePath: string, category: FileCategory): boolean
}

enum FileCategory {
  ACTIVE_PRODUCTION = 'active',
  UNUSED_TEST = 'test',
  EXPERIMENTAL = 'experimental',
  LEGACY = 'legacy',
  CONFIGURATION = 'config',
  DOCUMENTATION = 'docs'
}
```

### Safety Validator

```typescript
interface SafetyValidator {
  validateRemoval(filePaths: string[]): ValidationResult
  checkDependencies(filePath: string): DependencyCheck
  verifyBuildIntegrity(): boolean
}
```

### Cleanup Executor

```typescript
interface CleanupExecutor {
  createArchive(files: string[]): string
  removeFiles(files: string[]): CleanupResult
  updateDocumentation(removedFiles: string[]): void
  generateCleanupReport(): CleanupReport
}
```

## Data Models

### File Analysis Result

```typescript
interface FileAnalysisResult {
  filePath: string
  category: FileCategory
  size: number
  lastModified: Date
  isReferenced: boolean
  referencedBy: string[]
  confidence: number
  reason: string
}
```

### Cleanup Plan

```typescript
interface CleanupPlan {
  filesToRemove: FileAnalysisResult[]
  filesToArchive: FileAnalysisResult[]
  filesToPreserve: FileAnalysisResult[]
  estimatedSpaceSaved: number
  riskAssessment: RiskLevel
  validationResults: ValidationResult[]
}
```

### Cleanup Report

```typescript
interface CleanupReport {
  totalFilesAnalyzed: number
  filesRemoved: number
  spaceSaved: number
  categoriesProcessed: Record<FileCategory, number>
  preservedFiles: string[]
  archivedContent: string[]
  warnings: string[]
  recommendations: string[]
}
```

## Error Handling

### Validation Errors
- **Dependency Violation**: If a file marked for removal is referenced by active code
- **Build Failure**: If removal would break the build process
- **Configuration Loss**: If critical configuration files are accidentally marked for removal

### Recovery Mechanisms
- **Backup Creation**: Create full backup before any deletions
- **Incremental Removal**: Remove files in batches with validation between each batch
- **Rollback Capability**: Ability to restore files if issues are detected

### Safety Checks
- Verify main application builds successfully after each cleanup phase
- Ensure all package.json scripts remain functional
- Validate that environment configuration templates are preserved

## Testing Strategy

### Pre-Cleanup Validation
1. **Build Test**: Ensure current codebase builds successfully
2. **Dependency Analysis**: Verify all active dependencies are identified
3. **Classification Accuracy**: Validate file categorization against known active files

### Post-Cleanup Validation
1. **Build Integrity**: Verify frontend and backend build successfully
2. **Script Functionality**: Test all package.json scripts work correctly
3. **Development Environment**: Ensure development setup remains functional

### Safety Tests
1. **No Broken Imports**: Scan for any broken import statements
2. **Configuration Completeness**: Verify all necessary config files remain
3. **Documentation Accuracy**: Ensure documentation reflects cleaned structure

## Implementation Phases

### Phase 1: Analysis and Planning
- Scan all files and build dependency graph
- Classify files into categories
- Generate cleanup plan with risk assessment
- Create backup of current state

### Phase 2: Safe Removals
- Remove obvious test files (test-*.js, test-*.py)
- Remove log files and temporary artifacts
- Remove conflicted copies and PID files
- Validate build integrity after each removal batch

### Phase 3: Experimental Code Cleanup
- Archive valuable experimental work
- Remove experiments/ directory
- Remove demo and prototype files
- Update documentation to remove references

### Phase 4: Legacy System Cleanup
- Remove SQL migration files
- Remove legacy API files
- Clean up old configuration files
- Remove unused Python scripts

### Phase 5: Final Organization
- Organize remaining files logically
- Update documentation
- Generate final cleanup report
- Verify complete system functionality