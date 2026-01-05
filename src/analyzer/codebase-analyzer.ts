/**
 * Codebase Analyzer
 * Analyzes project structure to understand code organization and enable smart routing
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import ignore, { Ignore } from 'ignore';
import {
  CodebaseConfig,
  CodebaseAnalysis,
  FileNode,
  CodebaseStats,
  TechStack,
  CodeModule,
} from '../types';

export class CodebaseAnalyzer {
  private rootPath: string;
  private ignoreFilter: Ignore;
  private cache: Map<string, string> = new Map();

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.ignoreFilter = ignore();
    this.loadGitignore();
  }

  /**
   * Perform full codebase analysis
   */
  async analyze(): Promise<CodebaseAnalysis> {
    const techStack = await this.detectTechStack();
    const fileTree = await this.buildFileTree();
    const statistics = await this.computeStatistics(fileTree);
    const modules = await this.detectModules(techStack);

    const config: CodebaseConfig = {
      rootPath: this.rootPath,
      name: path.basename(this.rootPath),
      techStack,
      modules,
      entryPoints: await this.findEntryPoints(techStack),
      testPatterns: this.getTestPatterns(techStack),
      docPatterns: ['**/*.md', '**/docs/**', '**/documentation/**'],
      excludePatterns: this.getExcludePatterns(),
      customMappings: [],
    };

    return {
      config,
      fileTree,
      statistics,
      analyzedAt: new Date(),
    };
  }

  /**
   * Detect the technology stack used in the project
   */
  async detectTechStack(): Promise<TechStack> {
    const techStack: TechStack = {
      languages: [],
      frameworks: [],
      buildTools: [],
      testFrameworks: [],
      databases: [],
      infrastructure: [],
    };

    // Check for package.json (Node.js/JavaScript/TypeScript)
    if (await this.fileExists('package.json')) {
      const pkg = await this.readJSON('package.json');
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Languages
      if (await this.fileExists('tsconfig.json')) {
        techStack.languages.push('TypeScript');
      }
      techStack.languages.push('JavaScript');

      // Frameworks
      if (allDeps['react']) techStack.frameworks.push('React');
      if (allDeps['next']) techStack.frameworks.push('Next.js');
      if (allDeps['vue']) techStack.frameworks.push('Vue');
      if (allDeps['@angular/core']) techStack.frameworks.push('Angular');
      if (allDeps['express']) techStack.frameworks.push('Express');
      if (allDeps['fastify']) techStack.frameworks.push('Fastify');
      if (allDeps['nestjs'] || allDeps['@nestjs/core']) techStack.frameworks.push('NestJS');
      if (allDeps['svelte']) techStack.frameworks.push('Svelte');
      if (allDeps['electron']) techStack.frameworks.push('Electron');

      // Build tools
      if (allDeps['webpack']) techStack.buildTools.push('Webpack');
      if (allDeps['vite']) techStack.buildTools.push('Vite');
      if (allDeps['esbuild']) techStack.buildTools.push('esbuild');
      if (allDeps['rollup']) techStack.buildTools.push('Rollup');
      if (allDeps['turbo']) techStack.buildTools.push('Turborepo');

      // Test frameworks
      if (allDeps['jest']) techStack.testFrameworks.push('Jest');
      if (allDeps['mocha']) techStack.testFrameworks.push('Mocha');
      if (allDeps['vitest']) techStack.testFrameworks.push('Vitest');
      if (allDeps['@playwright/test']) techStack.testFrameworks.push('Playwright');
      if (allDeps['cypress']) techStack.testFrameworks.push('Cypress');

      // Databases
      if (allDeps['prisma'] || allDeps['@prisma/client']) techStack.databases!.push('Prisma');
      if (allDeps['mongoose']) techStack.databases!.push('MongoDB');
      if (allDeps['pg']) techStack.databases!.push('PostgreSQL');
      if (allDeps['mysql2']) techStack.databases!.push('MySQL');
      if (allDeps['redis']) techStack.databases!.push('Redis');
    }

    // Check for Python
    if (await this.fileExists('pyproject.toml') || await this.fileExists('requirements.txt')) {
      techStack.languages.push('Python');

      if (await this.fileExists('pyproject.toml')) {
        const content = await this.readFile('pyproject.toml');
        if (content.includes('django')) techStack.frameworks.push('Django');
        if (content.includes('fastapi')) techStack.frameworks.push('FastAPI');
        if (content.includes('flask')) techStack.frameworks.push('Flask');
        if (content.includes('pytest')) techStack.testFrameworks.push('pytest');
      }
    }

    // Check for Go
    if (await this.fileExists('go.mod')) {
      techStack.languages.push('Go');
      techStack.buildTools.push('Go Modules');
    }

    // Check for Rust
    if (await this.fileExists('Cargo.toml')) {
      techStack.languages.push('Rust');
      techStack.buildTools.push('Cargo');
    }

    // Check for Java/Kotlin
    if (await this.fileExists('pom.xml')) {
      techStack.languages.push('Java');
      techStack.buildTools.push('Maven');
    }
    if (await this.fileExists('build.gradle') || await this.fileExists('build.gradle.kts')) {
      if (!techStack.languages.includes('Java')) techStack.languages.push('Java');
      if (await this.fileExists('build.gradle.kts')) techStack.languages.push('Kotlin');
      techStack.buildTools.push('Gradle');
    }

    // Infrastructure
    if (await this.fileExists('Dockerfile')) techStack.infrastructure!.push('Docker');
    if (await this.fileExists('docker-compose.yml') || await this.fileExists('docker-compose.yaml')) {
      techStack.infrastructure!.push('Docker Compose');
    }
    if (await this.fileExists('kubernetes') || await this.globExists('**/k8s/**')) {
      techStack.infrastructure!.push('Kubernetes');
    }
    if (await this.fileExists('terraform') || await this.globExists('**/*.tf')) {
      techStack.infrastructure!.push('Terraform');
    }

    return techStack;
  }

  /**
   * Build a tree structure of the codebase
   */
  async buildFileTree(dir: string = this.rootPath, depth: number = 0): Promise<FileNode[]> {
    if (depth > 10) return []; // Prevent infinite recursion

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.rootPath, fullPath);

      // Skip ignored files
      if (this.shouldIgnore(relativePath)) continue;

      if (entry.isDirectory()) {
        const children = await this.buildFileTree(fullPath, depth + 1);
        nodes.push({
          path: relativePath,
          name: entry.name,
          type: 'directory',
          children,
        });
      } else if (entry.isFile()) {
        const stats = await fs.promises.stat(fullPath);
        const ext = path.extname(entry.name).toLowerCase();

        nodes.push({
          path: relativePath,
          name: entry.name,
          type: 'file',
          extension: ext || undefined,
          size: stats.size,
        });
      }
    }

    return nodes.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Compute statistics about the codebase
   */
  async computeStatistics(fileTree: FileNode[]): Promise<CodebaseStats> {
    const stats: CodebaseStats = {
      totalFiles: 0,
      totalDirectories: 0,
      filesByExtension: {},
      totalLines: 0,
      languageBreakdown: {},
    };

    const processNode = async (node: FileNode) => {
      if (node.type === 'directory') {
        stats.totalDirectories++;
        if (node.children) {
          for (const child of node.children) {
            await processNode(child);
          }
        }
      } else {
        stats.totalFiles++;
        if (node.extension) {
          stats.filesByExtension[node.extension] = (stats.filesByExtension[node.extension] || 0) + 1;

          // Map extensions to languages
          const language = this.extensionToLanguage(node.extension);
          if (language) {
            stats.languageBreakdown[language] = (stats.languageBreakdown[language] || 0) + 1;
          }
        }
      }
    };

    for (const node of fileTree) {
      await processNode(node);
    }

    return stats;
  }

  /**
   * Auto-detect modules/components in the codebase
   */
  async detectModules(techStack: TechStack): Promise<CodeModule[]> {
    const modules: CodeModule[] = [];

    // Common directory patterns that represent modules
    const modulePatterns = [
      { pattern: 'src/components/**', name: 'Components', keywords: ['ui', 'component', 'widget', 'button', 'form'] },
      { pattern: 'src/pages/**', name: 'Pages', keywords: ['page', 'route', 'view', 'screen'] },
      { pattern: 'src/api/**', name: 'API', keywords: ['api', 'endpoint', 'request', 'fetch', 'http'] },
      { pattern: 'src/services/**', name: 'Services', keywords: ['service', 'business logic', 'domain'] },
      { pattern: 'src/utils/**', name: 'Utilities', keywords: ['util', 'helper', 'utility', 'common'] },
      { pattern: 'src/hooks/**', name: 'Hooks', keywords: ['hook', 'use', 'react hook'] },
      { pattern: 'src/store/**', name: 'State Management', keywords: ['state', 'store', 'redux', 'zustand'] },
      { pattern: 'src/lib/**', name: 'Library', keywords: ['lib', 'library', 'core'] },
      { pattern: 'src/models/**', name: 'Models', keywords: ['model', 'entity', 'schema', 'type'] },
      { pattern: 'src/controllers/**', name: 'Controllers', keywords: ['controller', 'handler', 'route'] },
      { pattern: 'src/middleware/**', name: 'Middleware', keywords: ['middleware', 'interceptor'] },
      { pattern: 'src/database/**', name: 'Database', keywords: ['database', 'db', 'migration', 'query'] },
      { pattern: 'tests/**', name: 'Tests', keywords: ['test', 'spec', 'testing'] },
      { pattern: 'src/config/**', name: 'Configuration', keywords: ['config', 'configuration', 'settings'] },
      { pattern: 'src/types/**', name: 'Types', keywords: ['type', 'interface', 'typedef'] },
    ];

    for (const mp of modulePatterns) {
      const matches = await glob(mp.pattern, {
        cwd: this.rootPath,
        nodir: false,
        ignore: this.getExcludePatterns()
      });

      if (matches.length > 0) {
        const basePath = mp.pattern.replace('/**', '');
        modules.push({
          name: mp.name,
          path: basePath,
          description: `${mp.name} module`,
          keywords: mp.keywords,
          labels: [], // User can configure label mappings
          patterns: [mp.pattern],
          dependencies: [],
        });
      }
    }

    // Detect custom top-level directories as potential modules
    const topLevelDirs = await fs.promises.readdir(this.rootPath, { withFileTypes: true });
    for (const dir of topLevelDirs) {
      if (dir.isDirectory() && !this.shouldIgnore(dir.name)) {
        const existingModule = modules.find(m => m.path === dir.name || m.path.startsWith(dir.name + '/'));
        if (!existingModule && !['node_modules', 'dist', 'build', '.git', 'coverage'].includes(dir.name)) {
          // Check if it contains code files
          const hasCode = await this.globExists(`${dir.name}/**/*.{ts,tsx,js,jsx,py,go,rs,java}`);
          if (hasCode) {
            modules.push({
              name: this.formatModuleName(dir.name),
              path: dir.name,
              description: `${this.formatModuleName(dir.name)} module`,
              keywords: [dir.name.toLowerCase()],
              labels: [],
              patterns: [`${dir.name}/**`],
              dependencies: [],
            });
          }
        }
      }
    }

    return modules;
  }

  /**
   * Find entry points for the application
   */
  async findEntryPoints(techStack: TechStack): Promise<string[]> {
    const entryPoints: string[] = [];

    // Common entry point patterns
    const patterns = [
      'src/index.{ts,tsx,js,jsx}',
      'src/main.{ts,tsx,js,jsx}',
      'src/app.{ts,tsx,js,jsx}',
      'src/App.{ts,tsx,js,jsx}',
      'index.{ts,tsx,js,jsx}',
      'main.{ts,tsx,js,jsx,py,go,rs}',
      'app.{ts,tsx,js,jsx,py}',
      'src/server.{ts,js}',
      'server.{ts,js}',
      'cmd/main.go',
      'src/main.rs',
      'src/bin/*.rs',
    ];

    for (const pattern of patterns) {
      const matches = await glob(pattern, { cwd: this.rootPath });
      entryPoints.push(...matches);
    }

    // Check package.json for main entry
    if (await this.fileExists('package.json')) {
      const pkg = await this.readJSON('package.json');
      if (pkg.main) entryPoints.push(pkg.main);
      if (pkg.module) entryPoints.push(pkg.module);
      if (pkg.bin) {
        if (typeof pkg.bin === 'string') {
          entryPoints.push(pkg.bin);
        } else {
          entryPoints.push(...Object.values(pkg.bin) as string[]);
        }
      }
    }

    return [...new Set(entryPoints)];
  }

  /**
   * Get test file patterns based on tech stack
   */
  getTestPatterns(techStack: TechStack): string[] {
    const patterns: string[] = [
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}',
      '**/test/**/*.{ts,tsx,js,jsx}',
      '**/tests/**/*.{ts,tsx,js,jsx}',
      '**/__tests__/**/*.{ts,tsx,js,jsx}',
    ];

    if (techStack.testFrameworks.includes('pytest')) {
      patterns.push('**/test_*.py', '**/*_test.py', '**/tests/**/*.py');
    }

    if (techStack.languages.includes('Go')) {
      patterns.push('**/*_test.go');
    }

    if (techStack.languages.includes('Rust')) {
      patterns.push('**/tests/**/*.rs');
    }

    return patterns;
  }

  /**
   * Get patterns to exclude from analysis
   */
  getExcludePatterns(): string[] {
    return [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.git/**',
      '.next/**',
      '.nuxt/**',
      'target/**',
      '__pycache__/**',
      '*.pyc',
      '.pytest_cache/**',
      'vendor/**',
      '.idea/**',
      '.vscode/**',
      '*.min.js',
      '*.min.css',
      '*.map',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ];
  }

  /**
   * Extract keywords from a file's content
   */
  async extractFileKeywords(filePath: string): Promise<string[]> {
    try {
      const fullPath = path.join(this.rootPath, filePath);
      const content = await fs.promises.readFile(fullPath, 'utf-8');

      const keywords: Set<string> = new Set();

      // Extract function/class names
      const functionMatches = content.match(/(?:function|const|let|var|class|def|func)\s+(\w+)/g);
      if (functionMatches) {
        functionMatches.forEach(m => {
          const name = m.split(/\s+/).pop();
          if (name && name.length > 2) keywords.add(name.toLowerCase());
        });
      }

      // Extract imports
      const importMatches = content.match(/(?:import|from|require)\s*[\(\{]?\s*['"]([^'"]+)['"]/g);
      if (importMatches) {
        importMatches.forEach(m => {
          const parts = m.match(/['"]([^'"]+)['"]/);
          if (parts && parts[1]) {
            const importPath = parts[1].split('/').pop()?.replace(/\.\w+$/, '');
            if (importPath) keywords.add(importPath.toLowerCase());
          }
        });
      }

      // Extract comments that might indicate purpose
      const commentMatches = content.match(/(?:\/\/|#|\/\*|\*)\s*(TODO|FIXME|NOTE|HACK|BUG|FEATURE):\s*(.+)/gi);
      if (commentMatches) {
        commentMatches.forEach(m => {
          const words = m.split(/\s+/).slice(1);
          words.forEach(w => {
            if (w.length > 3) keywords.add(w.toLowerCase());
          });
        });
      }

      return [...keywords].slice(0, 50); // Limit keywords
    } catch {
      return [];
    }
  }

  /**
   * Generate a summary of a file's purpose
   */
  async generateFileSummary(filePath: string): Promise<string> {
    try {
      const fullPath = path.join(this.rootPath, filePath);
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      const lines = content.split('\n').slice(0, 30); // First 30 lines

      // Look for JSDoc/docstring at the top
      const docPattern = /^(?:\/\*\*[\s\S]*?\*\/|"""[\s\S]*?"""|'''[\s\S]*?'''|#.*)/;
      const match = lines.join('\n').match(docPattern);
      if (match) {
        return match[0].replace(/[/*#'"]+/g, '').trim().substring(0, 200);
      }

      // Extract main exports/classes
      const exports = content.match(/export\s+(?:default\s+)?(?:class|function|const|interface|type)\s+(\w+)/g);
      if (exports && exports.length > 0) {
        return `Exports: ${exports.map(e => e.split(/\s+/).pop()).join(', ')}`;
      }

      return '';
    } catch {
      return '';
    }
  }

  // ============ Helper Methods ============

  private loadGitignore(): void {
    const gitignorePath = path.join(this.rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      this.ignoreFilter.add(content);
    }
    // Always ignore these
    this.ignoreFilter.add(['node_modules', '.git', 'dist', 'build', 'coverage']);
  }

  private shouldIgnore(relativePath: string): boolean {
    return this.ignoreFilter.ignores(relativePath);
  }

  private async fileExists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.rootPath, relativePath);
    try {
      await fs.promises.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  private async globExists(pattern: string): Promise<boolean> {
    const matches = await glob(pattern, { cwd: this.rootPath, nodir: true });
    return matches.length > 0;
  }

  private async readFile(relativePath: string): Promise<string> {
    if (this.cache.has(relativePath)) {
      return this.cache.get(relativePath)!;
    }
    const fullPath = path.join(this.rootPath, relativePath);
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    this.cache.set(relativePath, content);
    return content;
  }

  private async readJSON(relativePath: string): Promise<any> {
    const content = await this.readFile(relativePath);
    return JSON.parse(content);
  }

  private extensionToLanguage(ext: string): string | null {
    const map: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.go': 'Go',
      '.rs': 'Rust',
      '.java': 'Java',
      '.kt': 'Kotlin',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.cs': 'C#',
      '.cpp': 'C++',
      '.c': 'C',
      '.swift': 'Swift',
      '.dart': 'Dart',
    };
    return map[ext] || null;
  }

  private formatModuleName(dirName: string): string {
    return dirName
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

export default CodebaseAnalyzer;
