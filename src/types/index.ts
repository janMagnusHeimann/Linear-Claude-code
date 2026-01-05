/**
 * Core types for Linear-Claude Code integration
 */

// ============ Linear Types ============

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "ENG-123"
  title: string;
  description: string | null;
  priority: number; // 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
  state: IssueState;
  labels: Label[];
  team: Team;
  project?: Project;
  assignee?: User;
  creator?: User;
  createdAt: Date;
  updatedAt: Date;
  estimate?: number;
  url: string;
  comments: Comment[];
  attachments: Attachment[];
  parentIssue?: { id: string; identifier: string };
  subIssues: { id: string; identifier: string }[];
}

export interface IssueState {
  id: string;
  name: string;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  color: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface Team {
  id: string;
  name: string;
  key: string; // e.g., "ENG"
}

export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: Date;
  user?: User;
}

export interface Attachment {
  id: string;
  title: string;
  url: string;
  metadata?: Record<string, unknown>;
}

// ============ Issue Filter Types ============

export interface IssueFilter {
  teamIds?: string[];
  teamKeys?: string[]; // e.g., ["ENG", "DESIGN"]
  projectIds?: string[];
  stateTypes?: ('backlog' | 'unstarted' | 'started' | 'completed' | 'canceled')[];
  stateNames?: string[]; // e.g., ["Todo", "In Progress"]
  labelNames?: string[];
  priorities?: number[];
  assigneeIds?: string[];
  assignedToMe?: boolean;
  createdAfter?: Date;
  updatedAfter?: Date;
  searchQuery?: string;
  limit?: number;
}

// ============ Codebase Analysis Types ============

export interface CodebaseConfig {
  rootPath: string;
  name: string;
  description?: string;
  techStack: TechStack;
  modules: CodeModule[];
  entryPoints: string[];
  testPatterns: string[];
  docPatterns: string[];
  excludePatterns: string[];
  customMappings: IssueCodeMapping[];
}

export interface TechStack {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  testFrameworks: string[];
  databases?: string[];
  infrastructure?: string[];
}

export interface CodeModule {
  name: string;
  path: string;
  description: string;
  keywords: string[];
  labels: string[]; // Linear labels that map to this module
  patterns: string[]; // File patterns within this module
  dependencies: string[]; // Other module names this depends on
  owners?: string[]; // Team or user IDs responsible
}

export interface IssueCodeMapping {
  // Match criteria
  labelPatterns?: string[];
  titlePatterns?: string[];
  keywordPatterns?: string[];
  teamKeys?: string[];

  // Target code areas
  modulePaths: string[];
  entryFiles?: string[];
  contextFiles?: string[];
  instructions?: string;
}

// ============ Analysis Results ============

export interface CodebaseAnalysis {
  config: CodebaseConfig;
  fileTree: FileNode[];
  statistics: CodebaseStats;
  analyzedAt: Date;
}

export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  children?: FileNode[];
  summary?: string;
  exports?: string[];
  imports?: string[];
  keywords?: string[];
}

export interface CodebaseStats {
  totalFiles: number;
  totalDirectories: number;
  filesByExtension: Record<string, number>;
  totalLines: number;
  languageBreakdown: Record<string, number>;
}

// ============ Issue Routing Types ============

export interface RouteResult {
  issue: LinearIssue;
  confidence: number; // 0-1 score
  relevantModules: RelevantModule[];
  suggestedFiles: SuggestedFile[];
  context: IssueContext;
  routingStrategy: string;
}

export interface RelevantModule {
  module: CodeModule;
  score: number;
  matchReasons: string[];
}

export interface SuggestedFile {
  path: string;
  relevance: number;
  reason: string;
  lineRange?: { start: number; end: number };
}

export interface IssueContext {
  summary: string;
  technicalDetails: string[];
  suggestedApproach: string;
  relatedIssues?: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  requiredSkills: string[];
}

// ============ Claude Code Integration ============

export interface ClaudeCodeSession {
  issueId: string;
  issueIdentifier: string;
  workingDirectory: string;
  context: SessionContext;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  error?: string;
}

export interface SessionContext {
  issueDetails: string;
  codebaseOverview: string;
  relevantFiles: string[];
  instructions: string;
  additionalContext?: string;
}

// ============ Configuration Types ============

export interface LinearClaudeConfig {
  linear: LinearConfig;
  codebases: CodebaseConfig[];
  routing: RoutingConfig;
  claudeCode: ClaudeCodeConfig;
  defaults: DefaultsConfig;
}

export interface LinearConfig {
  apiKey?: string; // Can also use LINER_API_KEY env var
  defaultTeamKey?: string;
  defaultFilters?: Partial<IssueFilter>;
}

export interface RoutingConfig {
  strategies: RoutingStrategy[];
  fallbackModule?: string;
  confidenceThreshold: number;
  maxSuggestedFiles: number;
}

export type RoutingStrategy =
  | 'label-mapping'      // Map Linear labels to code modules
  | 'keyword-extraction' // Extract keywords from issue and match to code
  | 'semantic-search'    // Use embeddings for semantic similarity
  | 'historical'         // Learn from past issue resolutions
  | 'file-mention'       // Look for file paths mentioned in issue
  | 'component-detection'; // Detect UI/component references

export interface ClaudeCodeConfig {
  maxConcurrentSessions: number;
  autoCommit: boolean;
  createBranch: boolean;
  branchPrefix: string;
  includeTests: boolean;
  reviewBeforeMerge: boolean;
}

export interface DefaultsConfig {
  issueLimit: number;
  autoSelectSingleMatch: boolean;
  verboseOutput: boolean;
  cacheAnalysis: boolean;
  cacheTTLHours: number;
}

// ============ CLI Types ============

export interface CLIOptions {
  team?: string;
  project?: string;
  status?: string;
  label?: string;
  priority?: string;
  assignee?: string;
  search?: string;
  limit?: number;
  codebase?: string;
  interactive?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface SelectionChoice {
  name: string;
  value: string;
  short?: string;
}
