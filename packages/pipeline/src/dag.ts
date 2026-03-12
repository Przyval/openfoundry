import type { PipelineStep } from "./types.js";

// ---------------------------------------------------------------------------
// DAG validation
// ---------------------------------------------------------------------------

/**
 * Validate that pipeline steps form a valid DAG — no cycles, all referenced
 * dependencies exist, and every step has a unique id.
 */
export function validateDag(
  steps: PipelineStep[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();

  // Check for duplicate IDs
  for (const step of steps) {
    if (ids.has(step.id)) {
      errors.push(`Duplicate step id: "${step.id}"`);
    }
    ids.add(step.id);
  }

  // Check all dependencies reference existing step IDs
  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!ids.has(dep)) {
        errors.push(
          `Step "${step.id}" depends on unknown step "${dep}"`,
        );
      }
    }
  }

  // Check for self-references
  for (const step of steps) {
    if (step.dependsOn?.includes(step.id)) {
      errors.push(`Step "${step.id}" depends on itself`);
    }
  }

  // Check for cycles using Kahn's algorithm (in-degree based)
  if (errors.length === 0) {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, 0);
      adjacency.set(step.id, []);
    }

    for (const step of steps) {
      for (const dep of step.dependsOn ?? []) {
        // dep -> step.id (dep must run before step)
        adjacency.get(dep)!.push(step.id);
        inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let visited = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visited++;
      for (const neighbor of adjacency.get(current) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (visited < steps.length) {
      errors.push("Pipeline contains a cycle");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Topological sort
// ---------------------------------------------------------------------------

/**
 * Return pipeline steps in topological order (dependencies first).
 *
 * Throws if the DAG is invalid.
 */
export function topologicalSort(steps: PipelineStep[]): PipelineStep[] {
  const validation = validateDag(steps);
  if (!validation.valid) {
    throw new Error(
      `Invalid pipeline DAG: ${validation.errors.join("; ")}`,
    );
  }

  const stepMap = new Map<string, PipelineStep>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const step of steps) {
    stepMap.set(step.id, step);
    inDegree.set(step.id, 0);
    adjacency.set(step.id, []);
  }

  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      adjacency.get(dep)!.push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  // Sort queue for deterministic output
  queue.sort();

  const result: PipelineStep[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(stepMap.get(current)!);

    const neighbors = [...(adjacency.get(current) ?? [])].sort();
    for (const neighbor of neighbors) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }

    // Re-sort to keep deterministic
    queue.sort();
  }

  return result;
}
