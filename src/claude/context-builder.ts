/**
 * Context Builder
 * Builds rich, intelligent context for Claude Code based on issue type and codebase structure
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import {
  LinearIssue,
  RouteResult,
  CodebaseAnalysis,
  CodeModule,
} from '../types';

export interface ContextOptions {
  maxFileContent: number;
  includeExamples: boolean;
  includeRelatedTests: boolean;
  includeTypeDefinitions: boolean;
  maxContextTokens: number;
}

const DEFAULT_OPTIONS: ContextOptions = {
  maxFileContent: 500,
  includeExamples: true,
  includeRelatedTests: true,
  includeTypeDefinitions: true,
  maxContextTokens: 50000,
};

export class ContextBuilder {
  private analysis: CodebaseAnalysis;
  private options: ContextOptions;

  constructor(analysis: CodebaseAnalysis, options?: Partial<ContextOptions>) {
    this.analysis = analysis;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Build comprehensive context for an issue
   */
  async buildContext(issue: LinearIssue, routeResult: RouteResult): Promise<string> {
    const sections: string[] = [];

    // 1. Issue overview
    sections.push(this.buildIssueOverview(issue));

    // 2. Codebase structure relevant to the issue
    sections.push(await this.buildCodebaseContext(routeResult));

    // 3. Relevant file contents (with smart truncation)
    sections.push(await this.buildFileContents(routeResult));

    // 4. Type definitions if relevant
    if (this.options.includeTypeDefinitions) {
      sections.push(await this.buildTypeContext(routeResult));
    }

    // 5. Related tests
    if (this.options.includeRelatedTests) {
      sections.push(await this.buildTestContext(routeResult));
    }

    // 6. Similar patterns/examples
    if (this.options.includeExamples) {
      sections.push(await this.buildExamplesContext(issue, routeResult));
    }

    // 7. Implementation guidelines
    sections.push(this.buildImplementationGuidelines(issue, routeResult));

    return sections.filter(s => s.length > 0).join('\n\n---\n\n');
  }

  /**
   * Build issue overview section
   */
  private buildIssueOverview(issue: LinearIssue): string {
    const lines: string[] = [
      '# Issue Context',
      '',
      `## ${issue.identifier}: ${issue.title}`,
      '',
    ];

    // Classify the issue
    const issueType = this.classifyIssue(issue);
    lines.push(`**Type:** ${issueType.type}`);
    lines.push(`**Complexity:** ${issueType.complexity}`);
    lines.push(`**Area:** ${issueType.area}`);
    lines.push('');

    // Description
    if (issue.description) {
      lines.push('### Description');
      lines.push('');
      lines.push(issue.description);
      lines.push('');
    }

    // Key points extracted from issue
    const keyPoints = this.extractKeyPoints(issue);
    if (keyPoints.length > 0) {
      lines.push('### Key Points');
      lines.push('');
      for (const point of keyPoints) {
        lines.push(`- ${point}`);
      }
      lines.push('');
    }

    // Acceptance criteria (if detectable)
    const criteria = this.extractAcceptanceCriteria(issue);
    if (criteria.length > 0) {
      lines.push('### Acceptance Criteria');
      lines.push('');
      for (const c of criteria) {
        lines.push(`- [ ] ${c}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build codebase context section
   */
  private async buildCodebaseContext(routeResult: RouteResult): Promise<string> {
    const lines: string[] = [
      '# Codebase Structure',
      '',
    ];

    // Relevant modules with their structure
    for (const { module, score, matchReasons } of routeResult.relevantModules.slice(0, 3)) {
      lines.push(`## ${module.name} (${module.path})`);
      lines.push('');
      lines.push(`*Relevance: ${(score * 100).toFixed(0)}%*`);
      lines.push('');
      lines.push(`**Why relevant:** ${matchReasons.join('; ')}`);
      lines.push('');

      // List key files in this module
      const moduleFiles = await this.getModuleFiles(module);
      if (moduleFiles.length > 0) {
        lines.push('**Key files:**');
        lines.push('```');
        for (const file of moduleFiles.slice(0, 15)) {
          lines.push(file);
        }
        if (moduleFiles.length > 15) {
          lines.push(`... and ${moduleFiles.length - 15} more files`);
        }
        lines.push('```');
        lines.push('');
      }
    }

    // Project structure overview
    lines.push('## Project Structure');
    lines.push('');
    lines.push('```');
    lines.push(this.formatProjectStructure());
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * Build relevant file contents section
   */
  private async buildFileContents(routeResult: RouteResult): Promise<string> {
    const lines: string[] = [
      '# Relevant File Contents',
      '',
      '*These files are most likely to be relevant to the issue:*',
      '',
    ];

    let totalLines = 0;
    const maxTotalLines = this.options.maxFileContent * 5; // Limit total content

    for (const file of routeResult.suggestedFiles.slice(0, 8)) {
      if (totalLines >= maxTotalLines) {
        lines.push(`\n*... additional files omitted for brevity*`);
        break;
      }

      try {
        const fullPath = path.join(this.analysis.config.rootPath, file.path);
        if (!fs.existsSync(fullPath)) continue;

        const content = fs.readFileSync(fullPath, 'utf-8');
        const contentLines = content.split('\n');
        const truncatedContent = contentLines.slice(0, this.options.maxFileContent).join('\n');

        lines.push(`## \`${file.path}\``);
        lines.push('');
        lines.push(`*${file.reason}*`);
        lines.push('');

        const ext = path.extname(file.path).slice(1);
        lines.push('```' + ext);
        lines.push(truncatedContent);
        if (contentLines.length > this.options.maxFileContent) {
          lines.push(`\n// ... ${contentLines.length - this.options.maxFileContent} more lines`);
        }
        lines.push('```');
        lines.push('');

        totalLines += Math.min(contentLines.length, this.options.maxFileContent);
      } catch {
        // Skip files that can't be read
      }
    }

    return lines.join('\n');
  }

  /**
   * Build type definitions context
   */
  private async buildTypeContext(routeResult: RouteResult): Promise<string> {
    if (!this.analysis.config.techStack.languages.includes('TypeScript')) {
      return '';
    }

    const lines: string[] = [
      '# Relevant Type Definitions',
      '',
    ];

    // Find type files related to the issue
    const typePatterns = ['**/types/**/*.ts', '**/*.d.ts', '**/interfaces/**/*.ts'];
    let foundTypes = false;

    for (const pattern of typePatterns) {
      const typeFiles = await glob(pattern, {
        cwd: this.analysis.config.rootPath,
        ignore: this.analysis.config.excludePatterns,
      });

      // Filter to files that might be relevant
      for (const file of typeFiles.slice(0, 5)) {
        try {
          const fullPath = path.join(this.analysis.config.rootPath, file);
          const content = fs.readFileSync(fullPath, 'utf-8');

          // Check if this file might be relevant
          const isRelevant = routeResult.relevantModules.some(m =>
            file.includes(m.module.path) || content.includes(m.module.name)
          );

          if (isRelevant) {
            foundTypes = true;
            lines.push(`## \`${file}\``);
            lines.push('');
            lines.push('```typescript');
            lines.push(content.split('\n').slice(0, 100).join('\n'));
            lines.push('```');
            lines.push('');
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }

    return foundTypes ? lines.join('\n') : '';
  }

  /**
   * Build test context
   */
  private async buildTestContext(routeResult: RouteResult): Promise<string> {
    const lines: string[] = [
      '# Related Tests',
      '',
      '*Existing tests that might be relevant or need updating:*',
      '',
    ];

    let foundTests = false;

    // Find tests for the suggested files
    for (const file of routeResult.suggestedFiles.slice(0, 5)) {
      const baseName = path.basename(file.path, path.extname(file.path));
      const testPatterns = [
        `**/${baseName}.test.*`,
        `**/${baseName}.spec.*`,
        `**/__tests__/${baseName}.*`,
        `**/test_${baseName}.*`,
      ];

      for (const pattern of testPatterns) {
        const testFiles = await glob(pattern, {
          cwd: this.analysis.config.rootPath,
          ignore: this.analysis.config.excludePatterns,
        });

        for (const testFile of testFiles.slice(0, 2)) {
          try {
            const fullPath = path.join(this.analysis.config.rootPath, testFile);
            const content = fs.readFileSync(fullPath, 'utf-8');

            foundTests = true;
            lines.push(`## \`${testFile}\``);
            lines.push('');
            lines.push('```' + path.extname(testFile).slice(1));
            lines.push(content.split('\n').slice(0, 80).join('\n'));
            lines.push('```');
            lines.push('');
          } catch {
            // Skip files that can't be read
          }
        }
      }
    }

    return foundTests ? lines.join('\n') : '';
  }

  /**
   * Build examples context
   */
  private async buildExamplesContext(
    issue: LinearIssue,
    routeResult: RouteResult
  ): Promise<string> {
    const issueType = this.classifyIssue(issue);
    const lines: string[] = [
      '# Similar Patterns & Examples',
      '',
    ];

    let foundExamples = false;

    // Find similar patterns based on issue type
    if (issueType.type === 'Feature' && issueType.area) {
      // Look for similar features in the same area
      const pattern = `**/*${issueType.area.toLowerCase()}*`;
      const similarFiles = await glob(pattern, {
        cwd: this.analysis.config.rootPath,
        ignore: this.analysis.config.excludePatterns,
        nodir: true,
      });

      if (similarFiles.length > 0) {
        foundExamples = true;
        lines.push(`## Similar ${issueType.area} implementations`);
        lines.push('');
        lines.push('*Look at these files for patterns to follow:*');
        lines.push('');
        for (const file of similarFiles.slice(0, 5)) {
          lines.push(`- \`${file}\``);
        }
        lines.push('');
      }
    }

    // For API-related issues, show API patterns
    if (issueType.area === 'API' || issueType.area === 'Backend') {
      const apiFiles = await glob('**/api/**/*.{ts,js}', {
        cwd: this.analysis.config.rootPath,
        ignore: this.analysis.config.excludePatterns,
      });

      if (apiFiles.length > 0) {
        foundExamples = true;
        lines.push('## API Pattern Examples');
        lines.push('');
        try {
          const content = fs.readFileSync(
            path.join(this.analysis.config.rootPath, apiFiles[0]),
            'utf-8'
          );
          lines.push('```typescript');
          lines.push(content.split('\n').slice(0, 50).join('\n'));
          lines.push('```');
        } catch {
          // Skip if can't read
        }
      }
    }

    return foundExamples ? lines.join('\n') : '';
  }

  /**
   * Build implementation guidelines
   */
  private buildImplementationGuidelines(
    issue: LinearIssue,
    routeResult: RouteResult
  ): string {
    const issueType = this.classifyIssue(issue);
    const lines: string[] = [
      '# Implementation Guidelines',
      '',
    ];

    // General guidelines
    lines.push('## General Requirements');
    lines.push('');
    lines.push('1. Follow existing code patterns and conventions in this codebase');
    lines.push('2. Ensure all changes are backwards compatible unless explicitly breaking');
    lines.push('3. Add appropriate error handling');
    lines.push('4. Update related documentation if needed');
    lines.push('');

    // Type-specific guidelines
    if (issueType.type === 'Bug Fix') {
      lines.push('## Bug Fix Specific');
      lines.push('');
      lines.push('1. First reproduce the bug to understand it fully');
      lines.push('2. Write a failing test that captures the bug');
      lines.push('3. Fix the bug with minimal code changes');
      lines.push('4. Verify the test passes');
      lines.push('5. Check for similar issues elsewhere in the code');
      lines.push('');
    } else if (issueType.type === 'Feature') {
      lines.push('## Feature Implementation');
      lines.push('');
      lines.push('1. Start by understanding existing similar features');
      lines.push('2. Design the implementation before coding');
      lines.push('3. Implement incrementally with tests');
      lines.push('4. Consider edge cases and error states');
      lines.push('5. Add appropriate logging/monitoring if applicable');
      lines.push('');
    } else if (issueType.type === 'Refactor') {
      lines.push('## Refactoring');
      lines.push('');
      lines.push('1. Ensure comprehensive test coverage before refactoring');
      lines.push('2. Make small, incremental changes');
      lines.push('3. Run tests after each change');
      lines.push('4. Keep the external interface stable');
      lines.push('');
    }

    // Tech stack specific guidelines
    const { techStack } = this.analysis.config;
    if (techStack.frameworks.includes('React')) {
      lines.push('## React Guidelines');
      lines.push('');
      lines.push('- Use functional components with hooks');
      lines.push('- Follow the existing state management patterns');
      lines.push('- Ensure proper cleanup in useEffect');
      lines.push('');
    }

    if (techStack.frameworks.includes('Next.js')) {
      lines.push('## Next.js Guidelines');
      lines.push('');
      lines.push('- Use appropriate rendering strategy (SSR/SSG/ISR)');
      lines.push('- Follow file-based routing conventions');
      lines.push('- Utilize built-in optimizations (Image, Link, etc.)');
      lines.push('');
    }

    // Suggested workflow
    lines.push('## Suggested Workflow');
    lines.push('');
    lines.push(routeResult.context.suggestedApproach);

    return lines.join('\n');
  }

  // ============ Helper Methods ============

  private classifyIssue(issue: LinearIssue): {
    type: string;
    complexity: string;
    area: string;
  } {
    const text = `${issue.title} ${issue.description || ''}`.toLowerCase();
    const labels = issue.labels.map(l => l.name.toLowerCase());

    // Determine type
    let type = 'Task';
    if (labels.includes('bug') || text.includes('bug') || text.includes('fix')) {
      type = 'Bug Fix';
    } else if (labels.includes('feature') || text.includes('add') || text.includes('implement') || text.includes('new')) {
      type = 'Feature';
    } else if (text.includes('refactor') || text.includes('improve') || text.includes('clean')) {
      type = 'Refactor';
    } else if (text.includes('test')) {
      type = 'Testing';
    } else if (text.includes('doc')) {
      type = 'Documentation';
    }

    // Determine complexity
    let complexity = 'Medium';
    if (text.includes('simple') || text.includes('typo') || text.includes('minor')) {
      complexity = 'Low';
    } else if (text.includes('complex') || text.includes('refactor') || text.includes('architecture')) {
      complexity = 'High';
    }

    // Determine area
    let area = 'General';
    const areaPatterns: Record<string, string[]> = {
      'Frontend': ['ui', 'component', 'style', 'css', 'button', 'form', 'page'],
      'Backend': ['api', 'server', 'endpoint', 'database', 'query'],
      'API': ['api', 'endpoint', 'rest', 'graphql'],
      'Database': ['database', 'db', 'query', 'migration', 'schema'],
      'Auth': ['auth', 'login', 'password', 'session', 'token'],
      'Testing': ['test', 'spec', 'coverage'],
      'Infrastructure': ['deploy', 'ci', 'docker', 'kubernetes'],
    };

    for (const [areaName, keywords] of Object.entries(areaPatterns)) {
      if (keywords.some(k => text.includes(k) || labels.includes(k))) {
        area = areaName;
        break;
      }
    }

    return { type, complexity, area };
  }

  private extractKeyPoints(issue: LinearIssue): string[] {
    const points: string[] = [];
    const text = issue.description || '';

    // Look for bullet points
    const bulletMatches = text.match(/^[\-\*]\s+(.+)$/gm);
    if (bulletMatches) {
      points.push(...bulletMatches.map(m => m.replace(/^[\-\*]\s+/, '')));
    }

    // Look for numbered items
    const numberedMatches = text.match(/^\d+[\.\)]\s+(.+)$/gm);
    if (numberedMatches) {
      points.push(...numberedMatches.map(m => m.replace(/^\d+[\.\)]\s+/, '')));
    }

    return points.slice(0, 10);
  }

  private extractAcceptanceCriteria(issue: LinearIssue): string[] {
    const criteria: string[] = [];
    const text = issue.description || '';

    // Look for "Acceptance Criteria" section
    const acMatch = text.match(/acceptance\s+criteria:?\s*([\s\S]*?)(?:\n\n|$)/i);
    if (acMatch) {
      const acText = acMatch[1];
      const items = acText.match(/^[\-\*\[\]]\s*(.+)$/gm);
      if (items) {
        criteria.push(...items.map(i => i.replace(/^[\-\*\[\]\s]+/, '')));
      }
    }

    // Look for checkbox items
    const checkboxMatches = text.match(/^\[[\sx]\]\s+(.+)$/gm);
    if (checkboxMatches) {
      criteria.push(...checkboxMatches.map(m => m.replace(/^\[[\sx]\]\s+/, '')));
    }

    return criteria.slice(0, 10);
  }

  private async getModuleFiles(module: CodeModule): Promise<string[]> {
    const files: string[] = [];

    for (const pattern of module.patterns) {
      const matches = await glob(pattern, {
        cwd: this.analysis.config.rootPath,
        ignore: this.analysis.config.excludePatterns,
        nodir: true,
      });
      files.push(...matches);
    }

    return [...new Set(files)].sort();
  }

  private formatProjectStructure(): string {
    const lines: string[] = [];

    const formatNode = (nodes: any[], prefix: string = ''): void => {
      for (let i = 0; i < nodes.length && i < 50; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1 || i === 49;
        const connector = isLast ? '└── ' : '├── ';
        const icon = node.type === 'directory' ? '📁' : '📄';

        lines.push(`${prefix}${connector}${icon} ${node.name}`);

        if (node.type === 'directory' && node.children && node.children.length > 0) {
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          formatNode(node.children.slice(0, 10), newPrefix);
          if (node.children.length > 10) {
            lines.push(`${newPrefix}... (${node.children.length - 10} more)`);
          }
        }
      }
    };

    formatNode(this.analysis.fileTree);
    return lines.join('\n');
  }
}

export default ContextBuilder;
