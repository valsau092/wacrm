// ============================================================
// Platform-level feature flags.
//
// Set by whoever runs the deployment (env vars), never by a tenant.
// `NEXT_PUBLIC_*` values are inlined at build time on both client and
// server, so flipping one needs a rebuild (`npm run deploy`).
// Server routes use the 403 helpers in `features-server.ts`.
// ============================================================

/**
 * "Draft with AI" in the inbox composer plus the bring-your-own-key AI
 * setup it depends on (/agents page, /api/ai/* except autoreply). Off
 * unless NEXT_PUBLIC_FEATURE_AI_DRAFT is exactly "true". Does NOT gate
 * the AI pause toggle (/api/ai/autoreply) used with an external agent.
 */
export const AI_DRAFT_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_AI_DRAFT === 'true';
