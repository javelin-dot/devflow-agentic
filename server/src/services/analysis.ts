import type { Requirement, AnalysisOutput } from '@devflow/shared';

export function buildAnalysisPrompt(req: Pick<Requirement, 'id' | 'title' | 'description' | 'kind' | 'priority' | 'tags' | 'projects'>): string {
  const projectList = req.projects.map(p => p.project).join(', ') || 'none';
  const tagList = req.tags.join(', ') || 'none';

  return `You are a senior software architect. Analyze the following requirement and produce a structured task breakdown.

Requirement ID: ${req.id}
Title: ${req.title}
Description: ${req.description || '(no description)'}
Kind: ${req.kind}
Priority: ${req.priority}
Tags: ${tagList}
Projects: ${projectList}

Output ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "summary": "brief analysis summary",
  "proposedTasks": [
    {
      "title": "task title",
      "prompt": "detailed instructions for the agent",
      "project": "project name or null",
      "type": "impl | test | review | deploy | docs",
      "wave": 0,
      "taskDependsOn": ["title of dependency task"],
      "acceptance": ["acceptance criterion 1"],
      "verifyCommands": ["npm test", "npm run build"],
      "risk": "risk description or null"
    }
  ]
}

Rules:
- wave 0 = can start immediately (no dependencies)
- wave N = depends on tasks in wave N-1
- taskDependsOn contains titles of tasks this task depends on
- Each task must have a clear, actionable prompt
- Output ONLY the JSON object, nothing else`;
}

export function parseAnalysisOutput(rawText: string): AnalysisOutput {
  // Try ```json ... ``` block first
  const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)```/);
  const candidate = jsonBlockMatch ? jsonBlockMatch[1].trim() : null;

  // Try bare { ... } if no code block found
  const bareMatch = rawText.match(/\{[\s\S]*\}/);

  for (const text of [candidate, bareMatch?.[0]].filter(Boolean) as string[]) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'summary' in parsed &&
        'proposedTasks' in parsed &&
        Array.isArray((parsed as Record<string, unknown>).proposedTasks)
      ) {
        return parsed as AnalysisOutput;
      }
    } catch {
      // continue to next candidate
    }
  }

  return { summary: rawText, proposedTasks: [] };
}
