import { db } from '../db/index.js';

export interface CreatePROptions {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface GitProvider {
  createPR(options: CreatePROptions): Promise<{ url: string; number: number }>;
  getPRStatus(owner: string, repo: string, number: number): Promise<'open' | 'approved' | 'changes_requested' | 'closed_merged' | 'closed_rejected'>;
  getReviews(owner: string, repo: string, number: number): Promise<Array<{ state: string; user: string }>>;
  closePR(owner: string, repo: string, number: number): Promise<void>;
}

function getGitToken(): string {
  const row = db.prepare("SELECT value FROM settings WHERE key='git.token'").get() as { value: string } | undefined;
  return row?.value ?? '';
}

function githubHeaders(): Record<string, string> {
  const token = getGitToken();
  if (!token) throw new Error('GitHub token not configured. Set settings.git.token');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

class GitHubProvider implements GitProvider {
  private baseUrl = 'https://api.github.com';

  async createPR(options: CreatePROptions): Promise<{ url: string; number: number }> {
    const resp = await fetch(`${this.baseUrl}/repos/${options.owner}/${options.repo}/pulls`, {
      method: 'POST',
      headers: githubHeaders(),
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`GitHub createPR failed: ${resp.status} ${text}`);
    }
    const data = await resp.json() as { html_url: string; number: number };
    return { url: data.html_url, number: data.number };
  }

  async getPRStatus(owner: string, repo: string, number: number): Promise<'open' | 'approved' | 'changes_requested' | 'closed_merged' | 'closed_rejected'> {
    const resp = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls/${number}`, {
      headers: githubHeaders(),
    });
    if (!resp.ok) throw new Error(`GitHub getPR failed: ${resp.status}`);
    const pr = await resp.json() as { state: string; merged: boolean };

    if (pr.state === 'closed') {
      return pr.merged ? 'closed_merged' : 'closed_rejected';
    }

    const reviews = await this.getReviews(owner, repo, number);
    const hasChangesRequested = reviews.some(r => r.state === 'CHANGES_REQUESTED');
    const hasApproved = reviews.some(r => r.state === 'APPROVED');

    if (hasChangesRequested) return 'changes_requested';
    if (hasApproved) return 'approved';
    return 'open';
  }

  async getReviews(owner: string, repo: string, number: number): Promise<Array<{ state: string; user: string }>> {
    const resp = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls/${number}/reviews`, {
      headers: githubHeaders(),
    });
    if (!resp.ok) throw new Error(`GitHub getReviews failed: ${resp.status}`);
    const data = await resp.json() as Array<{ state: string; user: { login: string } }>;
    return data.map(r => ({ state: r.state, user: r.user.login }));
  }

  async closePR(owner: string, repo: string, number: number): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls/${number}`, {
      method: 'PATCH',
      headers: githubHeaders(),
      body: JSON.stringify({ state: 'closed' }),
    });
    if (!resp.ok) throw new Error(`GitHub closePR failed: ${resp.status}`);
  }
}

export function getGitProvider(): GitProvider {
  const providerRow = db.prepare("SELECT value FROM settings WHERE key='git.provider'").get() as { value: string } | undefined;
  const provider = providerRow?.value ?? 'github';
  if (provider === 'github') return new GitHubProvider();
  throw new Error(`Git provider '${provider}' not implemented`);
}
