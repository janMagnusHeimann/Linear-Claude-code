/**
 * Configuration Manager
 * Handles loading, saving, and managing configuration for linear-claude
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { cosmiconfig } from 'cosmiconfig';
import * as yaml from 'yaml';
import {
  LinearClaudeConfig,
  CodebaseConfig,
  LinearConfig,
  RoutingConfig,
  ClaudeCodeConfig,
  DefaultsConfig,
  IssueCodeMapping,
} from '../types';

const CONFIG_NAME = 'linear-claude';
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.linear-claude.json');

export class ConfigManager {
  private config: LinearClaudeConfig;
  private configPath: string;
  private explorer = cosmiconfig(CONFIG_NAME, {
    searchPlaces: [
      'package.json',
      `.${CONFIG_NAME}rc`,
      `.${CONFIG_NAME}rc.json`,
      `.${CONFIG_NAME}rc.yaml`,
      `.${CONFIG_NAME}rc.yml`,
      `.${CONFIG_NAME}.json`,
      `.${CONFIG_NAME}.yaml`,
      `.${CONFIG_NAME}.yml`,
      `${CONFIG_NAME}.config.js`,
      `${CONFIG_NAME}.config.ts`,
    ],
  });

  constructor() {
    this.configPath = DEFAULT_CONFIG_PATH;
    this.config = this.getDefaultConfig();
  }

  /**
   * Load configuration from file or defaults
   */
  async load(customPath?: string): Promise<LinearClaudeConfig> {
    try {
      // Try custom path first
      if (customPath && fs.existsSync(customPath)) {
        const content = fs.readFileSync(customPath, 'utf-8');
        const loaded = this.parseConfig(customPath, content);
        this.config = this.mergeWithDefaults(loaded);
        this.configPath = customPath;
        return this.config;
      }

      // Try cosmiconfig search
      const result = await this.explorer.search();
      if (result && !result.isEmpty) {
        this.config = this.mergeWithDefaults(result.config);
        this.configPath = result.filepath;
        return this.config;
      }

      // Try default home path
      if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
        const content = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf-8');
        const loaded = JSON.parse(content);
        this.config = this.mergeWithDefaults(loaded);
        return this.config;
      }

      // Load from environment variables
      this.loadFromEnv();

      return this.config;
    } catch (error) {
      console.warn('Could not load configuration, using defaults:', error);
      return this.config;
    }
  }

  /**
   * Save configuration to file
   */
  async save(configPath?: string): Promise<void> {
    const savePath = configPath || this.configPath;
    const dir = path.dirname(savePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const ext = path.extname(savePath);
    let content: string;

    if (ext === '.yaml' || ext === '.yml') {
      content = yaml.stringify(this.config);
    } else {
      content = JSON.stringify(this.config, null, 2);
    }

    fs.writeFileSync(savePath, content);
    this.configPath = savePath;
  }

  /**
   * Get the current configuration
   */
  getConfig(): LinearClaudeConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<LinearClaudeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Set Linear API key
   */
  setLinearApiKey(apiKey: string): void {
    this.config.linear.apiKey = apiKey;
  }

  /**
   * Get Linear API key
   */
  getLinearApiKey(): string | undefined {
    return this.config.linear.apiKey || process.env.LINEAR_API_KEY;
  }

  /**
   * Add a codebase configuration
   */
  addCodebase(codebase: CodebaseConfig): void {
    const existing = this.config.codebases.findIndex(c => c.rootPath === codebase.rootPath);
    if (existing >= 0) {
      this.config.codebases[existing] = codebase;
    } else {
      this.config.codebases.push(codebase);
    }
  }

  /**
   * Get codebase configuration by path
   */
  getCodebase(rootPath: string): CodebaseConfig | undefined {
    return this.config.codebases.find(c => c.rootPath === rootPath);
  }

  /**
   * Remove a codebase configuration
   */
  removeCodebase(rootPath: string): void {
    this.config.codebases = this.config.codebases.filter(c => c.rootPath !== rootPath);
  }

  /**
   * Add an issue-to-code mapping
   */
  addMapping(codebasePath: string, mapping: IssueCodeMapping): void {
    const codebase = this.getCodebase(codebasePath);
    if (codebase) {
      codebase.customMappings.push(mapping);
    }
  }

  /**
   * Initialize configuration for a project
   */
  async initForProject(projectPath: string): Promise<void> {
    const configPath = path.join(projectPath, `.${CONFIG_NAME}.json`);

    const projectConfig: Partial<LinearClaudeConfig> = {
      codebases: [{
        rootPath: projectPath,
        name: path.basename(projectPath),
        techStack: {
          languages: [],
          frameworks: [],
          buildTools: [],
          testFrameworks: [],
        },
        modules: [],
        entryPoints: [],
        testPatterns: [],
        docPatterns: [],
        excludePatterns: [],
        customMappings: [],
      }],
    };

    const fullConfig = this.mergeWithDefaults(projectConfig);
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
    console.log(`Created configuration at ${configPath}`);
  }

  /**
   * Validate the configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check Linear API key
    if (!this.getLinearApiKey()) {
      errors.push('Linear API key is not configured. Set LINEAR_API_KEY environment variable or add to config.');
    }

    // Check codebases
    for (const codebase of this.config.codebases) {
      if (!codebase.rootPath) {
        errors.push('Codebase configuration missing rootPath');
      } else if (!fs.existsSync(codebase.rootPath)) {
        errors.push(`Codebase path does not exist: ${codebase.rootPath}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): LinearClaudeConfig {
    return {
      linear: {
        defaultFilters: {
          stateTypes: ['unstarted', 'started'],
          limit: 20,
        },
      },
      codebases: [],
      routing: {
        strategies: ['label-mapping', 'keyword-extraction', 'file-mention', 'component-detection'],
        confidenceThreshold: 0.3,
        maxSuggestedFiles: 10,
      },
      claudeCode: {
        maxConcurrentSessions: 1,
        autoCommit: false,
        createBranch: true,
        branchPrefix: 'fix/',
        includeTests: true,
        reviewBeforeMerge: true,
      },
      defaults: {
        issueLimit: 20,
        autoSelectSingleMatch: false,
        verboseOutput: false,
        cacheAnalysis: true,
        cacheTTLHours: 24,
      },
    };
  }

  /**
   * Merge loaded config with defaults
   */
  private mergeWithDefaults(loaded: Partial<LinearClaudeConfig>): LinearClaudeConfig {
    const defaults = this.getDefaultConfig();

    return {
      linear: { ...defaults.linear, ...loaded.linear },
      codebases: loaded.codebases || defaults.codebases,
      routing: { ...defaults.routing, ...loaded.routing },
      claudeCode: { ...defaults.claudeCode, ...loaded.claudeCode },
      defaults: { ...defaults.defaults, ...loaded.defaults },
    };
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnv(): void {
    if (process.env.LINEAR_API_KEY) {
      this.config.linear.apiKey = process.env.LINEAR_API_KEY;
    }

    if (process.env.LINEAR_TEAM_KEY) {
      this.config.linear.defaultTeamKey = process.env.LINEAR_TEAM_KEY;
    }

    if (process.env.LINEAR_CLAUDE_BRANCH_PREFIX) {
      this.config.claudeCode.branchPrefix = process.env.LINEAR_CLAUDE_BRANCH_PREFIX;
    }

    if (process.env.LINEAR_CLAUDE_AUTO_COMMIT === 'true') {
      this.config.claudeCode.autoCommit = true;
    }

    if (process.env.LINEAR_CLAUDE_CREATE_BRANCH === 'false') {
      this.config.claudeCode.createBranch = false;
    }
  }

  /**
   * Parse config file based on extension
   */
  private parseConfig(filePath: string, content: string): Partial<LinearClaudeConfig> {
    const ext = path.extname(filePath);

    if (ext === '.yaml' || ext === '.yml') {
      return yaml.parse(content);
    }

    return JSON.parse(content);
  }
}

export const configManager = new ConfigManager();
export default ConfigManager;
