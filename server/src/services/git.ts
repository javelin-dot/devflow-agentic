import { simpleGit, type SimpleGit } from 'simple-git';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export interface GitRepoInfo {
  name: string;
  path: string;
  branch: string;
  lang: string | null;
}

export class GitService {
  public git(cwd: string): SimpleGit {
    return simpleGit({ baseDir: cwd, binary: 'git', maxConcurrentProcesses: 4 });
  }

  async isGitRepo(dir: string): Promise<boolean> {
    try {
      const g = this.git(dir);
      await g.status();
      return true;
    } catch {
      return false;
    }
  }

  async currentBranch(dir: string): Promise<string> {
    try {
      const g = this.git(dir);
      const status = await g.status();
      return status.current ?? 'master';
    } catch {
      return 'master';
    }
  }

  detectLang(dir: string): string | null {
    const files = existsSync(dir) ? readdirSync(dir) : [];
    if (files.includes('pom.xml') || files.includes('build.gradle')) return 'java';
    if (files.includes('package.json')) return 'node';
    if (files.includes('go.mod')) return 'go';
    if (files.includes('requirements.txt') || files.includes('pyproject.toml')) return 'python';
    if (files.includes('Cargo.toml')) return 'rust';
    return null;
  }

  async scanDirectory(root: string): Promise<GitRepoInfo[]> {
    const results: GitRepoInfo[] = [];
    const scan = async (dir: string, depth: number) => {
      if (depth > 3) return;
      if (!(existsSync(dir))) return;
      if (await this.isGitRepo(dir)) {
        const name = dir.split('/').pop() ?? dir;
        const branch = await this.currentBranch(dir);
        const lang = this.detectLang(dir);
        results.push({ name, path: dir, branch, lang });
        return; // don't recurse into git repos
      }
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
            await scan(join(dir, e.name), depth + 1);
          }
        }
      } catch {}
    };
    await scan(root, 0);
    return results;
  }

  // Worktree operations
  async addWorktree(repoPath: string, worktreePath: string, branch: string): Promise<void> {
    const g = this.git(repoPath);
    // Check if branch exists
    const branches = await g.branch();
    if (branches.all.includes(branch) || branches.all.includes(`remotes/origin/${branch}`)) {
      await g.raw(['worktree', 'add', worktreePath, branch]);
    } else {
      await g.raw(['worktree', 'add', '-b', branch, worktreePath]);
    }
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    const g = this.git(repoPath);
    await g.raw(['worktree', 'remove', '--force', worktreePath]);
  }

  async worktreeList(repoPath: string): Promise<string[]> {
    try {
      const g = this.git(repoPath);
      const out = await g.raw(['worktree', 'list', '--porcelain']);
      return out.split('\n')
        .filter(l => l.startsWith('worktree '))
        .map(l => l.replace('worktree ', '').trim());
    } catch {
      return [];
    }
  }

  getWorktreePath(workspaceRoot: string, reqId: string, project: string): string {
    return resolve(workspaceRoot, 'worktrees', reqId, project);
  }

  async createBranch(repoPath: string, branchName: string): Promise<void> {
    const g = this.git(repoPath);
    try {
      await g.raw(['branch', branchName]);
    } catch {
      // branch already exists — ignore
    }
  }

  async mergeBranch(repoPath: string, targetBranch: string, sourceBranch: string): Promise<{ success: boolean; message: string }> {
    const g = this.git(repoPath);
    const current = await this.currentBranch(repoPath);
    try {
      await g.checkout(targetBranch);
      await g.merge([sourceBranch, '--no-edit']);
      return { success: true, message: `Merged ${sourceBranch} → ${targetBranch}` };
    } catch (err) {
      // try to restore HEAD on failure
      await g.checkout(current).catch(() => {});
      return { success: false, message: String(err) };
    } finally {
      await g.checkout(current).catch(() => {});
    }
  }
}

export const gitService = new GitService();
