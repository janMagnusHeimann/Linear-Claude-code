/**
 * Issue Router
 * Intelligently routes Linear issues to relevant code areas using multiple strategies
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import {
  LinearIssue,
  CodebaseConfig,
  CodebaseAnalysis,
  RouteResult,
  RelevantModule,
  SuggestedFile,
  IssueContext,
  CodeModule,
  RoutingStrategy,
} from '../types';

export class IssueRouter {
  private analysis: CodebaseAnalysis;
  private strategies: RoutingStrategy[];
  private confidenceThreshold: number;
  private maxSuggestedFiles: number;

  constructor(
    analysis: CodebaseAnalysis,
    options: {
      strategies?: RoutingStrategy[];
      confidenceThreshold?: number;
      maxSuggestedFiles?: number;
    } = {}
  ) {
    this.analysis = analysis;
    this.strategies = options.strategies || [
      'label-mapping',
      'keyword-extraction',
      'file-mention',
      'component-detection',
    ];
    this.confidenceThreshold = options.confidenceThreshold || 0.3;
    this.maxSuggestedFiles = options.maxSuggestedFiles || 10;
  }

  /**
   * Route an issue to relevant code areas
   */
  async routeIssue(issue: LinearIssue): Promise<RouteResult> {
    const moduleScores: Map<string, { score: number; reasons: string[] }> = new Map();
    const suggestedFiles: SuggestedFile[] = [];
    let usedStrategy = 'combined';

    // Apply each routing strategy
    for (const strategy of this.strategies) {
      const result = await this.applyStrategy(strategy, issue);

      // Merge module scores
      for (const [moduleName, data] of result.moduleScores) {
        const existing = moduleScores.get(moduleName);
        if (existing) {
          existing.score += data.score;
          existing.reasons.push(...data.reasons);
        } else {
          moduleScores.set(moduleName, { ...data });
        }
      }

      // Merge file suggestions
      suggestedFiles.push(...result.suggestedFiles);
    }

    // Sort and deduplicate modules
    const relevantModules: RelevantModule[] = [...moduleScores.entries()]
      .map(([name, data]) => {
        const module = this.analysis.config.modules.find(m => m.name === name);
        if (!module) return null;
        return {
          module,
          score: Math.min(data.score, 1), // Cap at 1
          matchReasons: [...new Set(data.reasons)],
        };
      })
      .filter((m): m is RelevantModule => m !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Sort and deduplicate files
    const uniqueFiles = this.deduplicateFiles(suggestedFiles)
      .slice(0, this.maxSuggestedFiles);

    // Generate context
    const context = await this.generateContext(issue, relevantModules);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(relevantModules, uniqueFiles);

    return {
      issue,
      confidence,
      relevantModules,
      suggestedFiles: uniqueFiles,
      context,
      routingStrategy: usedStrategy,
    };
  }

  /**
   * Apply a specific routing strategy
   */
  private async applyStrategy(
    strategy: RoutingStrategy,
    issue: LinearIssue
  ): Promise<{
    moduleScores: Map<string, { score: number; reasons: string[] }>;
    suggestedFiles: SuggestedFile[];
  }> {
    switch (strategy) {
      case 'label-mapping':
        return this.labelMappingStrategy(issue);
      case 'keyword-extraction':
        return this.keywordExtractionStrategy(issue);
      case 'file-mention':
        return this.fileMentionStrategy(issue);
      case 'component-detection':
        return this.componentDetectionStrategy(issue);
      default:
        return { moduleScores: new Map(), suggestedFiles: [] };
    }
  }

  /**
   * Strategy: Map Linear labels to code modules
   */
  private async labelMappingStrategy(issue: LinearIssue): Promise<{
    moduleScores: Map<string, { score: number; reasons: string[] }>;
    suggestedFiles: SuggestedFile[];
  }> {
    const moduleScores = new Map<string, { score: number; reasons: string[] }>();
    const suggestedFiles: SuggestedFile[] = [];

    for (const label of issue.labels) {
      const labelLower = label.name.toLowerCase();

      for (const module of this.analysis.config.modules) {
        // Check if label is in module's configured labels
        if (module.labels.some(l => l.toLowerCase() === labelLower)) {
          this.addModuleScore(moduleScores, module.name, 0.5, `Label "${label.name}" maps to ${module.name}`);
        }

        // Check if label matches module keywords
        if (module.keywords.some(k => labelLower.includes(k) || k.includes(labelLower))) {
          this.addModuleScore(moduleScores, module.name, 0.3, `Label "${label.name}" matches keyword in ${module.name}`);
        }
      }

      // Common label-to-code patterns
      const labelPatterns: Record<string, string[]> = {
        'bug': ['tests', 'src'],
        'feature': ['src'],
        'ui': ['components', 'pages', 'styles'],
        'api': ['api', 'services', 'controllers'],
        'database': ['database', 'models', 'migrations'],
        'auth': ['auth', 'authentication', 'middleware'],
        'performance': ['utils', 'lib', 'core'],
        'security': ['auth', 'middleware', 'security'],
        'documentation': ['docs', 'README'],
        'testing': ['tests', '__tests__', 'spec'],
        'frontend': ['components', 'pages', 'hooks', 'styles'],
        'backend': ['api', 'services', 'controllers', 'database'],
        'mobile': ['mobile', 'app', 'screens'],
        'infrastructure': ['infra', 'deploy', 'ci', 'docker'],
      };

      for (const [pattern, dirs] of Object.entries(labelPatterns)) {
        if (labelLower.includes(pattern)) {
          for (const dir of dirs) {
            const matchingModule = this.analysis.config.modules.find(
              m => m.path.includes(dir) || m.name.toLowerCase().includes(dir)
            );
            if (matchingModule) {
              this.addModuleScore(
                moduleScores,
                matchingModule.name,
                0.2,
                `Label "${label.name}" suggests ${matchingModule.name}`
              );
            }
          }
        }
      }
    }

    return { moduleScores, suggestedFiles };
  }

  /**
   * Strategy: Extract keywords from issue and match to code
   */
  private async keywordExtractionStrategy(issue: LinearIssue): Promise<{
    moduleScores: Map<string, { score: number; reasons: string[] }>;
    suggestedFiles: SuggestedFile[];
  }> {
    const moduleScores = new Map<string, { score: number; reasons: string[] }>();
    const suggestedFiles: SuggestedFile[] = [];

    // Extract keywords from issue
    const issueText = `${issue.title} ${issue.description || ''}`.toLowerCase();
    const keywords = this.extractKeywords(issueText);

    for (const module of this.analysis.config.modules) {
      let matchCount = 0;
      const matchedKeywords: string[] = [];

      for (const keyword of keywords) {
        // Check module keywords
        if (module.keywords.some(k => k.includes(keyword) || keyword.includes(k))) {
          matchCount++;
          matchedKeywords.push(keyword);
        }

        // Check module name and path
        if (
          module.name.toLowerCase().includes(keyword) ||
          module.path.toLowerCase().includes(keyword)
        ) {
          matchCount++;
          matchedKeywords.push(keyword);
        }
      }

      if (matchCount > 0) {
        const score = Math.min(matchCount * 0.15, 0.6);
        this.addModuleScore(
          moduleScores,
          module.name,
          score,
          `Keywords [${[...new Set(matchedKeywords)].slice(0, 3).join(', ')}] match ${module.name}`
        );
      }
    }

    // Also search for keywords in actual file names
    const files = await this.searchFilesForKeywords(keywords);
    for (const file of files) {
      suggestedFiles.push({
        path: file.path,
        relevance: file.score,
        reason: `Filename contains keyword: ${file.matchedKeyword}`,
      });
    }

    return { moduleScores, suggestedFiles };
  }

  /**
   * Strategy: Look for file paths mentioned in issue
   */
  private async fileMentionStrategy(issue: LinearIssue): Promise<{
    moduleScores: Map<string, { score: number; reasons: string[] }>;
    suggestedFiles: SuggestedFile[];
  }> {
    const moduleScores = new Map<string, { score: number; reasons: string[] }>();
    const suggestedFiles: SuggestedFile[] = [];

    const text = `${issue.title} ${issue.description || ''} ${issue.comments.map(c => c.body).join(' ')}`;

    // Look for file path patterns
    const filePatterns = [
      /(?:^|\s|`)((?:src|lib|app|pages|components|api)\/[\w\-\/\.]+\.\w+)/gi,
      /(?:^|\s|`)([A-Z][a-zA-Z]+(?:Component|Service|Controller|Model|Handler|Utils?))/g,
      /(?:in|at|file|see)\s+[`"]?([a-zA-Z0-9_\-\/]+\.[a-zA-Z]{2,4})[`"]?/gi,
      /[`]([^`]+\.(ts|tsx|js|jsx|py|go|rs))[`]/gi,
    ];

    const mentionedPaths: Set<string> = new Set();
    const mentionedComponents: Set<string> = new Set();

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const mentioned = match[1];
        if (mentioned.includes('/') || mentioned.includes('.')) {
          mentionedPaths.add(mentioned);
        } else {
          mentionedComponents.add(mentioned);
        }
      }
    }

    // Try to find mentioned files
    for (const mentionedPath of mentionedPaths) {
      const found = await this.findFile(mentionedPath);
      if (found) {
        suggestedFiles.push({
          path: found,
          relevance: 0.9,
          reason: `Directly mentioned in issue: "${mentionedPath}"`,
        });

        // Add the module containing this file
        const containingModule = this.findContainingModule(found);
        if (containingModule) {
          this.addModuleScore(
            moduleScores,
            containingModule.name,
            0.4,
            `Contains mentioned file: ${found}`
          );
        }
      }
    }

    // Try to find mentioned components/classes
    for (const component of mentionedComponents) {
      const files = await this.searchFilesForKeywords([component.toLowerCase()]);
      for (const file of files.slice(0, 3)) {
        suggestedFiles.push({
          path: file.path,
          relevance: 0.7,
          reason: `Contains mentioned component: ${component}`,
        });
      }
    }

    return { moduleScores, suggestedFiles };
  }

  /**
   * Strategy: Detect UI components and features from issue description
   */
  private async componentDetectionStrategy(issue: LinearIssue): Promise<{
    moduleScores: Map<string, { score: number; reasons: string[] }>;
    suggestedFiles: SuggestedFile[];
  }> {
    const moduleScores = new Map<string, { score: number; reasons: string[] }>();
    const suggestedFiles: SuggestedFile[] = [];

    const text = `${issue.title} ${issue.description || ''}`.toLowerCase();

    // UI/Component patterns
    const componentPatterns: Record<string, string[]> = {
      'button': ['button', 'btn'],
      'form': ['form', 'input', 'field', 'validation'],
      'modal': ['modal', 'dialog', 'popup', 'overlay'],
      'table': ['table', 'grid', 'list', 'datatable'],
      'navigation': ['nav', 'menu', 'sidebar', 'header', 'footer'],
      'card': ['card', 'tile', 'widget'],
      'auth': ['login', 'signup', 'signin', 'register', 'password', 'authentication'],
      'search': ['search', 'filter', 'query'],
      'notification': ['notification', 'toast', 'alert', 'message'],
      'settings': ['settings', 'preferences', 'config', 'options'],
      'profile': ['profile', 'user', 'account'],
      'dashboard': ['dashboard', 'overview', 'analytics', 'stats'],
      'checkout': ['checkout', 'cart', 'payment', 'billing'],
      'upload': ['upload', 'file', 'image', 'attachment'],
    };

    for (const [component, keywords] of Object.entries(componentPatterns)) {
      if (keywords.some(k => text.includes(k))) {
        // Look for files matching this component
        const searchPatterns = [
          `**/*${component}*`,
          `**/*${keywords[0]}*`,
        ];

        for (const pattern of searchPatterns) {
          const matches = await glob(pattern, {
            cwd: this.analysis.config.rootPath,
            nodir: true,
            ignore: this.analysis.config.excludePatterns,
          });

          for (const match of matches.slice(0, 3)) {
            suggestedFiles.push({
              path: match,
              relevance: 0.5,
              reason: `Related to ${component} (detected from issue)`,
            });

            const containingModule = this.findContainingModule(match);
            if (containingModule) {
              this.addModuleScore(
                moduleScores,
                containingModule.name,
                0.2,
                `Contains ${component}-related files`
              );
            }
          }
        }
      }
    }

    // Detect page/route references
    const pagePatterns = [
      /(?:page|route|screen|view)\s+(?:for\s+)?["']?([a-zA-Z0-9_\-\/]+)["']?/gi,
      /(?:\/[a-z][a-z0-9\-\/]*){2,}/gi, // URL paths
    ];

    for (const pattern of pagePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const pageName = match[1] || match[0].split('/').pop();
        if (pageName) {
          const pageFiles = await glob(`**/*${pageName}*`, {
            cwd: this.analysis.config.rootPath,
            nodir: true,
            ignore: this.analysis.config.excludePatterns,
          });

          for (const file of pageFiles.slice(0, 2)) {
            suggestedFiles.push({
              path: file,
              relevance: 0.4,
              reason: `Related to page/route: ${pageName}`,
            });
          }
        }
      }
    }

    return { moduleScores, suggestedFiles };
  }

  /**
   * Generate context for Claude Code based on routing results
   */
  private async generateContext(
    issue: LinearIssue,
    relevantModules: RelevantModule[]
  ): Promise<IssueContext> {
    // Analyze issue complexity
    const complexity = this.estimateComplexity(issue);

    // Determine required skills
    const skills = this.determineRequiredSkills(issue, relevantModules);

    // Generate technical summary
    const technicalDetails: string[] = [];

    if (issue.labels.length > 0) {
      technicalDetails.push(`Labels: ${issue.labels.map(l => l.name).join(', ')}`);
    }

    if (relevantModules.length > 0) {
      technicalDetails.push(`Primary modules: ${relevantModules.slice(0, 3).map(m => m.module.name).join(', ')}`);
    }

    if (issue.parentIssue) {
      technicalDetails.push(`Part of: ${issue.parentIssue.identifier}`);
    }

    if (issue.subIssues.length > 0) {
      technicalDetails.push(`Has ${issue.subIssues.length} sub-issue(s)`);
    }

    // Generate suggested approach
    const suggestedApproach = this.generateApproach(issue, relevantModules, complexity);

    return {
      summary: this.generateSummary(issue),
      technicalDetails,
      suggestedApproach,
      estimatedComplexity: complexity,
      requiredSkills: skills,
    };
  }

  // ============ Helper Methods ============

  private addModuleScore(
    scores: Map<string, { score: number; reasons: string[] }>,
    moduleName: string,
    score: number,
    reason: string
  ): void {
    const existing = scores.get(moduleName);
    if (existing) {
      existing.score += score;
      existing.reasons.push(reason);
    } else {
      scores.set(moduleName, { score, reasons: [reason] });
    }
  }

  private extractKeywords(text: string): string[] {
    // Remove common words and extract meaningful terms
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with',
      'to', 'for', 'of', 'as', 'by', 'that', 'this', 'it', 'from', 'be', 'are', 'was',
      'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'when', 'where', 'why', 'how', 'what', 'who', 'all', 'each', 'every', 'both',
      'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same',
      'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
      'add', 'fix', 'update', 'change', 'make', 'get', 'set', 'new', 'use', 'using',
      'create', 'implement', 'remove', 'delete', 'issue', 'bug', 'feature', 'request',
    ]);

    const words = text
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Also extract camelCase and PascalCase parts
    const camelCaseWords: string[] = [];
    for (const word of words) {
      const parts = word.split(/(?=[A-Z])/).map(p => p.toLowerCase());
      camelCaseWords.push(...parts.filter(p => p.length > 2));
    }

    return [...new Set([...words, ...camelCaseWords])];
  }

  private async searchFilesForKeywords(
    keywords: string[]
  ): Promise<{ path: string; score: number; matchedKeyword: string }[]> {
    const results: { path: string; score: number; matchedKeyword: string }[] = [];

    for (const keyword of keywords.slice(0, 10)) {
      const pattern = `**/*${keyword}*`;
      try {
        const matches = await glob(pattern, {
          cwd: this.analysis.config.rootPath,
          nodir: true,
          ignore: this.analysis.config.excludePatterns,
          nocase: true,
        });

        for (const match of matches.slice(0, 5)) {
          results.push({
            path: match,
            score: 0.4,
            matchedKeyword: keyword,
          });
        }
      } catch {
        // Ignore glob errors
      }
    }

    return results;
  }

  private async findFile(partialPath: string): Promise<string | null> {
    // Try exact match first
    const exactPath = path.join(this.analysis.config.rootPath, partialPath);
    if (fs.existsSync(exactPath)) {
      return partialPath;
    }

    // Try glob search
    const pattern = `**/${partialPath}`;
    try {
      const matches = await glob(pattern, {
        cwd: this.analysis.config.rootPath,
        nodir: true,
        ignore: this.analysis.config.excludePatterns,
      });
      return matches[0] || null;
    } catch {
      return null;
    }
  }

  private findContainingModule(filePath: string): CodeModule | null {
    for (const module of this.analysis.config.modules) {
      if (filePath.startsWith(module.path)) {
        return module;
      }
    }
    return null;
  }

  private deduplicateFiles(files: SuggestedFile[]): SuggestedFile[] {
    const seen = new Map<string, SuggestedFile>();

    for (const file of files) {
      const existing = seen.get(file.path);
      if (!existing || existing.relevance < file.relevance) {
        seen.set(file.path, file);
      }
    }

    return [...seen.values()].sort((a, b) => b.relevance - a.relevance);
  }

  private calculateConfidence(modules: RelevantModule[], files: SuggestedFile[]): number {
    if (modules.length === 0 && files.length === 0) return 0;

    const moduleConfidence = modules.length > 0
      ? Math.min(modules[0].score + (modules.length - 1) * 0.1, 1)
      : 0;

    const fileConfidence = files.length > 0
      ? Math.min(files[0].relevance + (files.length - 1) * 0.05, 1)
      : 0;

    return Math.min((moduleConfidence + fileConfidence) / 2 + 0.1, 1);
  }

  private estimateComplexity(issue: LinearIssue): 'low' | 'medium' | 'high' {
    const text = `${issue.title} ${issue.description || ''}`.toLowerCase();

    // High complexity indicators
    const highIndicators = [
      'refactor', 'architecture', 'redesign', 'migrate', 'security',
      'performance', 'scale', 'system', 'infrastructure', 'database schema',
    ];

    // Low complexity indicators
    const lowIndicators = [
      'typo', 'copy', 'text', 'style', 'css', 'color', 'spacing',
      'padding', 'margin', 'font', 'rename', 'comment',
    ];

    if (highIndicators.some(ind => text.includes(ind))) return 'high';
    if (lowIndicators.some(ind => text.includes(ind))) return 'low';

    // Check estimate
    if (issue.estimate) {
      if (issue.estimate >= 5) return 'high';
      if (issue.estimate <= 1) return 'low';
    }

    // Check priority
    if (issue.priority === 1) return 'high'; // Urgent
    if (issue.priority === 4) return 'low';  // Low priority

    return 'medium';
  }

  private determineRequiredSkills(
    issue: LinearIssue,
    modules: RelevantModule[]
  ): string[] {
    const skills: Set<string> = new Set();
    const text = `${issue.title} ${issue.description || ''}`.toLowerCase();

    // From tech stack
    for (const lang of this.analysis.config.techStack.languages) {
      skills.add(lang);
    }

    for (const framework of this.analysis.config.techStack.frameworks) {
      if (text.includes(framework.toLowerCase())) {
        skills.add(framework);
      }
    }

    // From labels
    const skillLabels = ['frontend', 'backend', 'api', 'database', 'ui', 'ux', 'testing', 'devops'];
    for (const label of issue.labels) {
      if (skillLabels.some(s => label.name.toLowerCase().includes(s))) {
        skills.add(label.name);
      }
    }

    // From modules
    for (const { module } of modules) {
      if (module.name.includes('Test')) skills.add('Testing');
      if (module.name.includes('API')) skills.add('API Development');
      if (module.name.includes('Component')) skills.add('UI Development');
      if (module.name.includes('Database')) skills.add('Database');
    }

    return [...skills].slice(0, 6);
  }

  private generateSummary(issue: LinearIssue): string {
    const type = this.detectIssueType(issue);
    const area = issue.labels.length > 0 ? issue.labels[0].name : 'General';

    return `[${type}] ${issue.title} (${area})`;
  }

  private detectIssueType(issue: LinearIssue): string {
    const text = `${issue.title} ${issue.description || ''}`.toLowerCase();
    const labels = issue.labels.map(l => l.name.toLowerCase());

    if (labels.includes('bug') || text.includes('fix') || text.includes('bug')) return 'Bug Fix';
    if (labels.includes('feature') || text.includes('add') || text.includes('implement')) return 'Feature';
    if (text.includes('refactor') || text.includes('improve')) return 'Improvement';
    if (text.includes('test')) return 'Testing';
    if (text.includes('doc')) return 'Documentation';
    if (text.includes('performance') || text.includes('optimize')) return 'Performance';

    return 'Task';
  }

  private generateApproach(
    issue: LinearIssue,
    modules: RelevantModule[],
    complexity: 'low' | 'medium' | 'high'
  ): string {
    const approaches: string[] = [];

    // Based on complexity
    if (complexity === 'high') {
      approaches.push('1. Thoroughly understand the existing implementation');
      approaches.push('2. Design the solution architecture before coding');
      approaches.push('3. Implement incrementally with tests');
    } else if (complexity === 'medium') {
      approaches.push('1. Review the relevant code areas');
      approaches.push('2. Implement the changes with appropriate tests');
    } else {
      approaches.push('1. Make the targeted change');
      approaches.push('2. Verify the fix works correctly');
    }

    // Module-specific guidance
    if (modules.length > 0) {
      const primaryModule = modules[0].module;
      approaches.push(`3. Focus primarily on the ${primaryModule.name} module (${primaryModule.path})`);
    }

    // Type-specific guidance
    const type = this.detectIssueType(issue);
    if (type === 'Bug Fix') {
      approaches.push('4. Add a regression test to prevent future occurrences');
    } else if (type === 'Feature') {
      approaches.push('4. Update documentation and add comprehensive tests');
    }

    return approaches.join('\n');
  }
}

export default IssueRouter;
