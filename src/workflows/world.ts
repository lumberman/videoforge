import { env, type WorldMode } from '@/config/env';
import type { StepStatus, WorkflowStepName } from '@/types/job';

export interface WorkflowWorld {
  mode: WorldMode;
  onJobStart(jobId: string): Promise<void>;
  onStepUpdate(jobId: string, step: WorkflowStepName, status: StepStatus): Promise<void>;
  onJobComplete(jobId: string, status: 'completed' | 'failed'): Promise<void>;
}

class LocalWorld implements WorkflowWorld {
  mode: WorldMode = 'local';

  async onJobStart(): Promise<void> {}

  async onStepUpdate(): Promise<void> {}

  async onJobComplete(): Promise<void> {}
}

class VercelWorld implements WorkflowWorld {
  mode: WorldMode = 'vercel';

  async onJobStart(): Promise<void> {
    // Placeholder for workflow.dev Vercel world integration.
  }

  async onStepUpdate(): Promise<void> {
    // Placeholder for workflow.dev Vercel world integration.
  }

  async onJobComplete(): Promise<void> {
    // Placeholder for workflow.dev Vercel world integration.
  }
}

export function getWorkflowWorld(): WorkflowWorld {
  return env.workflowWorld === 'vercel' ? new VercelWorld() : new LocalWorld();
}
