export type WorldMode = 'local' | 'vercel';

const requiredInProd = ['OPENROUTER_API_KEY', 'MUX_TOKEN_ID', 'MUX_TOKEN_SECRET'];

function getWorldMode(): WorldMode {
  const raw = process.env.WORKFLOW_WORLD?.toLowerCase();
  if (raw === 'vercel') {
    return 'vercel';
  }
  return 'local';
}

export const env = {
  get nodeEnv() {
    return process.env.NODE_ENV ?? 'development';
  },
  get workflowWorld() {
    return getWorldMode();
  },
  get openRouterApiKey() {
    return process.env.OPENROUTER_API_KEY ?? '';
  },
  get muxTokenId() {
    return process.env.MUX_TOKEN_ID ?? '';
  },
  get muxTokenSecret() {
    return process.env.MUX_TOKEN_SECRET ?? '';
  },
  get strapiEndpoint() {
    return process.env.STRAPI_ENDPOINT ?? '';
  },
  get strapiApiToken() {
    return process.env.STRAPI_API_TOKEN ?? '';
  },
  get jobsDbPath() {
    return process.env.JOBS_DB_PATH ?? '.data/jobs.json';
  },
  get artifactRootPath() {
    return process.env.ARTIFACT_ROOT_PATH ?? '.data/artifacts';
  }
};

export function getRuntimeWarnings(): string[] {
  if (env.nodeEnv !== 'production') {
    return [];
  }

  const warnings = requiredInProd
    .filter((key) => !process.env[key])
    .map((key) => `${key} is not configured in production mode.`);

  return warnings;
}
