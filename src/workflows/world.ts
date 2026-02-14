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

  async onJobStart(_jobId: string): Promise<void> {}

  async onStepUpdate(
    _jobId: string,
    _step: WorkflowStepName,
    _status: StepStatus
  ): Promise<void> {}

  async onJobComplete(_jobId: string, _status: 'completed' | 'failed'): Promise<void> {}
}

class VercelWorld implements WorkflowWorld {
  mode: WorldMode = 'vercel';

  async onJobStart(_jobId: string): Promise<void> {
    // Placeholder for workflow.dev Vercel world integration.
  }

  async onStepUpdate(
    _jobId: string,
    _step: WorkflowStepName,
    _status: StepStatus
  ): Promise<void> {
    // Placeholder for workflow.dev Vercel world integration.
  }

  async onJobComplete(_jobId: string, _status: 'completed' | 'failed'): Promise<void> {
    // Placeholder for workflow.dev Vercel world integration.
  }
}

export function getWorkflowWorld(): WorkflowWorld {
  return env.workflowWorld === 'vercel' ? new VercelWorld() : new LocalWorld();
}
