import Anthropic from '@anthropic-ai/sdk';

export interface ReviewContext {
  issueTitle: string;
  issueDescription: string;
  workingDirectory: string;
  relevantFiles?: string[];
}

export interface Concern {
  severity: 'critical' | 'warning' | 'info';
  type: 'scope' | 'safety' | 'quality' | 'other';
  description: string;
  location?: string;
}

export interface ReviewResult {
  approved: boolean;
  confidence: 'high' | 'medium' | 'low';
  concerns: Concern[];
  reasoning: string;
  recommendation: 'approve' | 'reject' | 'manual_review';
}

export class PlanReviewer {
  private client: Anthropic | null = null;

  constructor(options: { apiKey?: string }) {
    if (options.apiKey) {
      this.client = new Anthropic({ apiKey: options.apiKey });
    }
  }

  async reviewPlan(plan: string, context: ReviewContext): Promise<ReviewResult> {
    // If no API key, auto-approve with low confidence
    if (!this.client) {
      return {
        approved: true,
        confidence: 'low',
        concerns: [{
          severity: 'info',
          type: 'other',
          description: 'No Anthropic API key configured - skipping AI review',
        }],
        reasoning: 'AI review unavailable without API key',
        recommendation: 'approve',
      };
    }

    try {
      const prompt = this.buildReviewPrompt(plan, context);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude API');
      }

      const result = this.parseReviewResponse(content.text);
      return result;

    } catch (error: any) {
      console.error('Plan review error:', error);

      // Fallback to auto-approve on error
      return {
        approved: true,
        confidence: 'low',
        concerns: [{
          severity: 'warning',
          type: 'other',
          description: `Review failed: ${error.message}`,
        }],
        reasoning: 'AI review failed - defaulting to approval',
        recommendation: 'approve',
      };
    }
  }

  private buildReviewPrompt(plan: string, context: ReviewContext): string {
    return `You are an expert code reviewer examining an implementation plan from Claude Code.
Your job is to identify obvious errors, safety issues, or scope problems.

ISSUE CONTEXT:
Title: ${context.issueTitle}
Description:
${context.issueDescription}

Working Directory: ${context.workingDirectory}

IMPLEMENTATION PLAN TO REVIEW:
${plan}

Review this plan and respond ONLY with valid JSON in this exact format:
{
  "approved": boolean,
  "confidence": "high" | "medium" | "low",
  "concerns": [
    {
      "severity": "critical" | "warning" | "info",
      "type": "scope" | "safety" | "quality" | "other",
      "description": "...",
      "location": "file/line if applicable"
    }
  ],
  "reasoning": "Brief explanation of your decision",
  "recommendation": "approve" | "reject" | "manual_review"
}

REVIEW CRITERIA:
- REJECT (critical) if the plan:
  * Modifies completely wrong files unrelated to the issue
  * Performs destructive operations (deleting important files, DROP TABLE, etc.)
  * Has massive scope creep (doing 10x more than the issue asks)
  * Contains obvious security vulnerabilities

- WARN but APPROVE (warning) if the plan:
  * Has minor scope expansion but still reasonable
  * Uses a less-than-ideal approach but will work
  * Has code quality concerns but nothing critical

- APPROVE (high confidence) if the plan:
  * Directly addresses the issue
  * Modifies appropriate files
  * Uses sound technical approach
  * No critical concerns

IMPORTANT:
- Be lenient - only reject for OBVIOUS critical problems
- Minor imperfections are OK → approve with warnings
- If uncertain → recommend manual_review
- Return ONLY valid JSON, no other text`;
  }

  private parseReviewResponse(response: string): ReviewResult {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (typeof parsed.approved !== 'boolean' ||
          !['high', 'medium', 'low'].includes(parsed.confidence) ||
          !['approve', 'reject', 'manual_review'].includes(parsed.recommendation)) {
        throw new Error('Invalid response structure');
      }

      return {
        approved: parsed.approved,
        confidence: parsed.confidence,
        concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
        reasoning: parsed.reasoning || 'No reasoning provided',
        recommendation: parsed.recommendation,
      };

    } catch (error: any) {
      console.error('Error parsing review response:', error);
      console.error('Raw response:', response);

      // Default to manual review on parse error
      return {
        approved: false,
        confidence: 'low',
        concerns: [{
          severity: 'warning',
          type: 'other',
          description: `Failed to parse AI review: ${error.message}`,
        }],
        reasoning: 'Could not parse AI response - manual review recommended',
        recommendation: 'manual_review',
      };
    }
  }
}
