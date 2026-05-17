import { Hono } from 'hono';
import { db } from '../db/index.js';
import { gitService } from '../services/git.js';
import { existsSync } from 'node:fs';

export const worktreeRouter = new Hono();

// GET /requirements/:id/worktree-status
worktreeRouter.get('/:id/worktree-status', async (c) => {
  const { id } = c.req.param();
  const req = db.prepare('SELECT * FROM requirements WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!req) return c.json({ error: 'not found' }, 404);

  const settingsRow = db.prepare('SELECT value FROM settings WHERE key=?').get('workspaceRoot') as { value: string } | undefined;
  const workspaceRoot = settingsRow?.value ?? process.cwd();

  const links = db.prepare('SELECT * FROM requirement_projects WHERE req_id=?').all(id) as Array<Record<string, unknown>>;
  const projects = await Promise.all(
    links.map(async (link) => {
      const wtPath = gitService.getWorktreePath(workspaceRoot, id, link.project as string);
      const exists = existsSync(wtPath);
      const branch = link.dev_branch as string | null;
      return {
        project: link.project as string,
        path: wtPath,
        exists,
        branch,
        branchExists: false, // simplified for M1
      };
    })
  );

  const ready = projects.length === 0 || projects.every(p => p.exists);
  return c.json({ ready, projects });
});

// POST /requirements/:id/worktree-create
worktreeRouter.post('/:id/worktree-create', async (c) => {
  const { id } = c.req.param();
  const req = db.prepare('SELECT * FROM requirements WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!req) return c.json({ error: 'not found' }, 404);

  const settingsRow = db.prepare("SELECT value FROM settings WHERE key=?").get('workspaceRoot') as { value: string } | undefined;
  const workspaceRoot = settingsRow?.value ?? process.cwd();

  const links = db.prepare('SELECT * FROM requirement_projects WHERE req_id=?').all(id) as Array<Record<string, unknown>>;
  const created: Array<{ project: string; path: string; branch: string }> = [];
  const errors: Array<{ project: string; error: string }> = [];

  for (const link of links) {
    const projectName = link.project as string;
    const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(projectName) as Record<string, unknown> | undefined;
    if (!projectRow) {
      errors.push({ project: projectName, error: 'project not found in registry' });
      continue;
    }

    const repoPath = projectRow.path as string;
    if (!existsSync(repoPath)) {
      errors.push({ project: projectName, error: `repo path does not exist: ${repoPath}` });
      continue;
    }

    const wtPath = gitService.getWorktreePath(workspaceRoot, id, projectName);

    // Determine branch name
    let branch = (link.dev_branch as string | null) ?? null;
    if (!branch) {
      const prefix = (projectRow.branch_prefix as string | null) ?? 'feature';
      branch = `${prefix}/${id}`;
      db.prepare('UPDATE requirement_projects SET dev_branch=? WHERE req_id=? AND project=?').run(branch, id, projectName);
    }

    if (existsSync(wtPath)) {
      created.push({ project: projectName, path: wtPath, branch });
      continue;
    }

    try {
      await gitService.addWorktree(repoPath, wtPath, branch);
      created.push({ project: projectName, path: wtPath, branch });
    } catch (err) {
      errors.push({ project: projectName, error: (err as Error).message });
    }
  }

  // Return updated status
  const projects = links.map(link => {
    const projectName = link.project as string;
    const wtPath = gitService.getWorktreePath(workspaceRoot, id, projectName);
    return {
      project: projectName,
      path: wtPath,
      exists: existsSync(wtPath),
      branch: link.dev_branch as string | null,
      branchExists: false,
    };
  });

  return c.json({ created, errors, ready: projects.every(p => p.exists), projects });
});
