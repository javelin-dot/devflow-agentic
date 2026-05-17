import type { SubTask } from '@devflow/shared';

export class CycleError extends Error {
  constructor(cycle: string[]) {
    super(`DAG cycle detected: ${cycle.join(' → ')}`);
  }
}

export function sortWaves(tasks: SubTask[]): SubTask[][] {
  const idToTask = new Map<string, SubTask>();
  for (const t of tasks) idToTask.set(t.id, t);

  // Build adjacency: id → Set of IDs that depend on it (successors)
  const inDegree = new Map<string, number>();
  const successors = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    successors.set(t.id, []);
  }

  for (const t of tasks) {
    for (const depId of t.taskDependsOn) {
      if (!idToTask.has(depId)) continue;
      successors.get(depId)!.push(t.id);
      inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
    }
  }

  const waves: SubTask[][] = [];
  let remaining = new Set(tasks.map(t => t.id));

  while (remaining.size > 0) {
    const wave = [...remaining].filter(id => (inDegree.get(id) ?? 0) === 0);
    if (wave.length === 0) {
      // Cycle detected among remaining nodes
      throw new CycleError([...remaining]);
    }

    waves.push(wave.map(id => idToTask.get(id)!));

    for (const id of wave) {
      remaining.delete(id);
      for (const succId of successors.get(id) ?? []) {
        inDegree.set(succId, (inDegree.get(succId) ?? 1) - 1);
      }
    }
  }

  return waves;
}
