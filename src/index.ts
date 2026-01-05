/**
 * Linear-Claude Code
 * Smart integration between Linear issues and Claude Code
 *
 * This package provides:
 * - Linear API client for fetching issues with flexible filtering
 * - Codebase analyzer for understanding project structure
 * - Intelligent issue router that maps issues to relevant code areas
 * - Claude Code invoker with rich context injection
 * - CLI for interactive issue solving
 */

// Core exports
export { LinearAPIClient } from './linear';
export { CodebaseAnalyzer } from './analyzer';
export { IssueRouter } from './router';
export { ClaudeCodeInvoker, ContextBuilder } from './claude';
export { ConfigManager, configManager } from './config';

// Type exports
export * from './types';

// Convenience function for programmatic usage
import { LinearAPIClient } from './linear';
import { CodebaseAnalyzer } from './analyzer';
import { IssueRouter } from './router';
import { ClaudeCodeInvoker, ContextBuilder } from './claude';
import { ConfigManager } from './config';
import { LinearIssue, IssueFilter, RouteResult, CodebaseAnalysis } from './types';

export interface SolveOptions {
  codebasePath: string;
  linearApiKey?: string;
  interactive?: boolean;
  dryRun?: boolean;
  createBranch?: boolean;
  branchPrefix?: string;
}

/**
 * Solve a Linear issue using Claude Code
 *
 * @example
 * ```typescript
 * import { solveIssue } from 'linear-claude-code';
 *
 * await solveIssue('ENG-123', {
 *   codebasePath: '/path/to/project',
 *   interactive: true,
 * });
 * ```
 */
export async function solveIssue(
  issueIdentifier: string,
  options: SolveOptions
): Promise<RouteResult> {
  // Initialize clients
  const linearClient = new LinearAPIClient(options.linearApiKey);
  const analyzer = new CodebaseAnalyzer(options.codebasePath);

  // Fetch the issue
  const issue = await linearClient.fetchIssueByIdentifier(issueIdentifier);
  if (!issue) {
    throw new Error(`Issue ${issueIdentifier} not found`);
  }

  // Analyze codebase
  const analysis = await analyzer.analyze();

  // Route issue to code
  const router = new IssueRouter(analysis);
  const routeResult = await router.routeIssue(issue);

  // Build context
  const contextBuilder = new ContextBuilder(analysis);
  const context = await contextBuilder.buildContext(issue, routeResult);

  // Invoke Claude Code
  const invoker = new ClaudeCodeInvoker();
  invoker.setAnalysis(analysis);

  await invoker.invoke(issue, routeResult, {
    workingDirectory: options.codebasePath,
    interactive: options.interactive ?? true,
    dryRun: options.dryRun ?? false,
    createBranch: options.createBranch ?? true,
    branchPrefix: options.branchPrefix ?? 'fix/',
    additionalContext: context,
  });

  return routeResult;
}

/**
 * Analyze a codebase and return its structure
 *
 * @example
 * ```typescript
 * import { analyzeCodebase } from 'linear-claude-code';
 *
 * const analysis = await analyzeCodebase('/path/to/project');
 * console.log(analysis.config.techStack);
 * ```
 */
export async function analyzeCodebase(codebasePath: string): Promise<CodebaseAnalysis> {
  const analyzer = new CodebaseAnalyzer(codebasePath);
  return analyzer.analyze();
}

/**
 * Fetch issues from Linear with filtering
 *
 * @example
 * ```typescript
 * import { fetchIssues } from 'linear-claude-code';
 *
 * const issues = await fetchIssues({
 *   teamKeys: ['ENG'],
 *   stateTypes: ['started'],
 *   limit: 10,
 * });
 * ```
 */
export async function fetchIssues(
  filter: IssueFilter,
  apiKey?: string
): Promise<LinearIssue[]> {
  const client = new LinearAPIClient(apiKey);
  return client.fetchIssues(filter);
}

/**
 * Route an issue to relevant code areas
 *
 * @example
 * ```typescript
 * import { routeIssue, analyzeCodebase, fetchIssues } from 'linear-claude-code';
 *
 * const analysis = await analyzeCodebase('/path/to/project');
 * const issues = await fetchIssues({ limit: 1 });
 * const route = await routeIssue(issues[0], analysis);
 *
 * console.log('Relevant modules:', route.relevantModules);
 * console.log('Suggested files:', route.suggestedFiles);
 * ```
 */
export async function routeIssue(
  issue: LinearIssue,
  analysis: CodebaseAnalysis
): Promise<RouteResult> {
  const router = new IssueRouter(analysis);
  return router.routeIssue(issue);
}
