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
  nodeEnv: process.env.NODE_ENV ?? 'development',
  workflowWorld: getWorldMode(),
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  muxTokenId: process.env.MUX_TOKEN_ID ?? '',
  muxTokenSecret: process.env.MUX_TOKEN_SECRET ?? '',
  strapiEndpoint: process.env.STRAPI_ENDPOINT ?? '',
  strapiApiToken: process.env.STRAPI_API_TOKEN ?? '',
  jobsDbPath: process.env.JOBS_DB_PATH ?? '.data/jobs.json',
  artifactRootPath: process.env.ARTIFACT_ROOT_PATH ?? '.data/artifacts'
};

export function getRuntimeWarnings(): string[] {
  if (env.nodeEnv !== 'production') {
    return [];
  }

  return requiredInProd
    .filter((key) => !process.env[key])
    .map((key) => `${key} is not configured in production mode.`);
}
