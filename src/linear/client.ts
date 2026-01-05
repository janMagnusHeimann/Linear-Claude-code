/**
 * Linear API Client
 * Handles all interactions with the Linear API for fetching issues
 */

import { LinearClient, Issue, Team, Project, WorkflowState, IssueLabel } from '@linear/sdk';
import {
  LinearIssue,
  IssueFilter,
  IssueState,
  Label,
  Team as TeamType,
  Project as ProjectType,
  Comment,
  User,
} from '../types';

export class LinearAPIClient {
  private client: LinearClient;
  private teamCache: Map<string, TeamType> = new Map();
  private stateCache: Map<string, IssueState[]> = new Map();

  constructor(apiKey?: string) {
    const key = apiKey || process.env.LINEAR_API_KEY;
    if (!key) {
      throw new Error(
        'Linear API key is required. Set LINEAR_API_KEY environment variable or pass it to the constructor.'
      );
    }
    this.client = new LinearClient({ apiKey: key });
  }

  /**
   * Fetch issues from Linear with flexible filtering
   */
  async fetchIssues(filter: IssueFilter = {}): Promise<LinearIssue[]> {
    const queryFilter = await this.buildQueryFilter(filter);

    const issuesConnection = await this.client.issues({
      filter: queryFilter,
      first: filter.limit || 50,
      orderBy: 'updatedAt' as any,
    });

    const issues: LinearIssue[] = [];

    for (const issue of issuesConnection.nodes) {
      const linearIssue = await this.transformIssue(issue);
      issues.push(linearIssue);
    }

    return issues;
  }

  /**
   * Fetch a single issue by identifier (e.g., "ENG-123")
   */
  async fetchIssueByIdentifier(identifier: string): Promise<LinearIssue | null> {
    const [teamKey, number] = identifier.split('-');

    const teams = await this.client.teams({
      filter: { key: { eq: teamKey } }
    });

    if (teams.nodes.length === 0) {
      return null;
    }

    const issues = await this.client.issues({
      filter: {
        team: { key: { eq: teamKey } },
        number: { eq: parseInt(number, 10) }
      }
    });

    if (issues.nodes.length === 0) {
      return null;
    }

    return this.transformIssue(issues.nodes[0]);
  }

  /**
   * Get all available teams
   */
  async getTeams(): Promise<TeamType[]> {
    const teams = await this.client.teams();
    return teams.nodes.map(team => ({
      id: team.id,
      name: team.name,
      key: team.key,
    }));
  }

  /**
   * Get workflow states for a team
   */
  async getWorkflowStates(teamKey: string): Promise<IssueState[]> {
    if (this.stateCache.has(teamKey)) {
      return this.stateCache.get(teamKey)!;
    }

    const teams = await this.client.teams({
      filter: { key: { eq: teamKey } }
    });

    if (teams.nodes.length === 0) {
      return [];
    }

    const states = await teams.nodes[0].states();
    const issueStates: IssueState[] = states.nodes.map(state => ({
      id: state.id,
      name: state.name,
      type: state.type as IssueState['type'],
      color: state.color,
    }));

    this.stateCache.set(teamKey, issueStates);
    return issueStates;
  }

  /**
   * Get all labels (optionally filtered by team)
   */
  async getLabels(teamKey?: string): Promise<Label[]> {
    let labels;

    if (teamKey) {
      const teams = await this.client.teams({
        filter: { key: { eq: teamKey } }
      });
      if (teams.nodes.length > 0) {
        labels = await teams.nodes[0].labels();
      } else {
        return [];
      }
    } else {
      labels = await this.client.issueLabels();
    }

    return labels.nodes.map(label => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description || undefined,
    }));
  }

  /**
   * Get projects (optionally filtered by team)
   */
  async getProjects(teamKey?: string): Promise<ProjectType[]> {
    let projects;

    if (teamKey) {
      const teams = await this.client.teams({
        filter: { key: { eq: teamKey } }
      });
      if (teams.nodes.length > 0) {
        projects = await teams.nodes[0].projects();
      } else {
        return [];
      }
    } else {
      projects = await this.client.projects();
    }

    return projects.nodes.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description || undefined,
    }));
  }

  /**
   * Get the current user (for "assigned to me" filtering)
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const viewer = await this.client.viewer;
      return {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
      };
    } catch {
      return null;
    }
  }

  /**
   * Build the GraphQL filter object from our IssueFilter
   */
  private async buildQueryFilter(filter: IssueFilter): Promise<any> {
    const queryFilter: any = {};

    // Team filtering
    if (filter.teamIds?.length) {
      queryFilter.team = { id: { in: filter.teamIds } };
    } else if (filter.teamKeys?.length) {
      queryFilter.team = { key: { in: filter.teamKeys } };
    }

    // Project filtering
    if (filter.projectIds?.length) {
      queryFilter.project = { id: { in: filter.projectIds } };
    }

    // State filtering
    if (filter.stateTypes?.length) {
      queryFilter.state = { type: { in: filter.stateTypes } };
    } else if (filter.stateNames?.length) {
      queryFilter.state = { name: { in: filter.stateNames } };
    }

    // Label filtering
    if (filter.labelNames?.length) {
      queryFilter.labels = { name: { in: filter.labelNames } };
    }

    // Priority filtering
    if (filter.priorities?.length) {
      queryFilter.priority = { in: filter.priorities };
    }

    // Assignee filtering
    if (filter.assignedToMe) {
      const user = await this.getCurrentUser();
      if (user) {
        queryFilter.assignee = { id: { eq: user.id } };
      }
    } else if (filter.assigneeIds?.length) {
      queryFilter.assignee = { id: { in: filter.assigneeIds } };
    }

    // Date filtering
    if (filter.createdAfter) {
      queryFilter.createdAt = { gte: filter.createdAfter.toISOString() };
    }

    if (filter.updatedAfter) {
      queryFilter.updatedAt = { gte: filter.updatedAfter.toISOString() };
    }

    // Search query
    if (filter.searchQuery) {
      queryFilter.or = [
        { title: { containsIgnoreCase: filter.searchQuery } },
        { description: { containsIgnoreCase: filter.searchQuery } },
      ];
    }

    return queryFilter;
  }

  /**
   * Transform a Linear SDK Issue to our LinearIssue type
   */
  private async transformIssue(issue: Issue): Promise<LinearIssue> {
    // Fetch related data
    const [state, labels, team, project, assignee, creator, comments, attachments, parent, children] =
      await Promise.all([
        issue.state,
        issue.labels(),
        issue.team,
        issue.project.catch(() => null),
        issue.assignee.catch(() => null),
        issue.creator.catch(() => null),
        issue.comments().catch(() => ({ nodes: [] })),
        issue.attachments().catch(() => ({ nodes: [] })),
        issue.parent.catch(() => null),
        issue.children().catch(() => ({ nodes: [] })),
      ]);

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || null,
      priority: issue.priority,
      state: state ? {
        id: state.id,
        name: state.name,
        type: state.type as IssueState['type'],
        color: state.color,
      } : { id: '', name: 'Unknown', type: 'backlog', color: '#gray' },
      labels: labels.nodes.map(label => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description || undefined,
      })),
      team: team ? {
        id: team.id,
        name: team.name,
        key: team.key,
      } : { id: '', name: 'Unknown', key: 'UNK' },
      project: project ? {
        id: project.id,
        name: project.name,
        description: project.description || undefined,
      } : undefined,
      assignee: assignee ? {
        id: assignee.id,
        name: assignee.name,
        email: assignee.email,
      } : undefined,
      creator: creator ? {
        id: creator.id,
        name: creator.name,
        email: creator.email,
      } : undefined,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
      estimate: issue.estimate || undefined,
      url: issue.url,
      comments: comments.nodes.map(comment => ({
        id: comment.id,
        body: comment.body,
        createdAt: new Date(comment.createdAt),
      })),
      attachments: attachments.nodes.map(attachment => ({
        id: attachment.id,
        title: attachment.title,
        url: attachment.url,
      })),
      parentIssue: parent ? {
        id: parent.id,
        identifier: parent.identifier,
      } : undefined,
      subIssues: children.nodes.map(child => ({
        id: child.id,
        identifier: child.identifier,
      })),
    };
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueId: string, body: string): Promise<void> {
    await this.client.createComment({
      issueId,
      body,
    });
  }

  /**
   * Update issue state
   */
  async updateIssueState(issueId: string, stateId: string): Promise<void> {
    await this.client.updateIssue(issueId, {
      stateId,
    });
  }

  /**
   * Create a branch name from an issue
   */
  async createBranchName(issue: LinearIssue): Promise<string> {
    const slugify = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
    };

    return `${issue.identifier.toLowerCase()}/${slugify(issue.title)}`;
  }
}

export default LinearAPIClient;
