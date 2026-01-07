import Anthropic from '@anthropic-ai/sdk';

export interface EnhancementContext {
  issueTitle: string;
  issueDescription: string;
  issueLabels: string[];
  claudeMdContent: string;
}

export class PromptEnhancer {
  private client: Anthropic | null = null;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async enhancePrompt(context: EnhancementContext): Promise<string> {
    // If no API key, return basic prompt
    if (!this.client) {
      return this.buildBasicPrompt(context);
    }

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: this.buildEnhancementPrompt(context),
        }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text;
      }

      return this.buildBasicPrompt(context);
    } catch (error) {
      console.error('Prompt enhancement failed:', error);
      return this.buildBasicPrompt(context);
    }
  }

  private buildEnhancementPrompt(context: EnhancementContext): string {
    return `You are helping to create a detailed prompt for Claude Code to solve a Linear issue.

LINEAR ISSUE:
Title: ${context.issueTitle}
Description: ${context.issueDescription}
Labels: ${context.issueLabels.join(', ')}

PROJECT CONTEXT (from claude.md):
${context.claudeMdContent}

Based on the issue and the project context in claude.md, create a clear, detailed prompt that:
1. Explains what needs to be done
2. References relevant parts of the codebase mentioned in claude.md
3. Provides specific guidance based on the project's architecture/patterns
4. Keeps it concise but actionable

Return ONLY the enhanced prompt text, no preamble or explanation.`;
  }

  private buildBasicPrompt(context: EnhancementContext): string {
    return `# Issue: ${context.issueTitle}

## Description
${context.issueDescription}

## Labels
${context.issueLabels.join(', ')}

## Instructions
Please solve this issue following the project's best practices.`;
  }
}
