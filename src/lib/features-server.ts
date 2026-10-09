import { NextResponse } from 'next/server';
import { AI_DRAFT_ENABLED } from '@/lib/features';

/**
 * 403 for an AI-assistant endpoint while `AI_DRAFT_ENABLED` is off, or
 * null when the feature is on. Hiding the UI isn't enough — every
 * endpoint behind the feature checks this first.
 */
export function aiDraftDisabledResponse(): NextResponse | null {
  if (AI_DRAFT_ENABLED) return null;
  return NextResponse.json(
    { error: 'AI assistant is not available' },
    { status: 403 }
  );
}
