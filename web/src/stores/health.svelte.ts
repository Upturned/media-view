import type { FixAction, FixResult, HealthSummary, IssueKind } from '@media-view/shared';
import { client, unwrap } from '../api.ts';
import { toast, toastError } from './toasts.svelte.ts';

/**
 * Library Health (milestone 7, design M7): the badge's counts and the calls behind the Health pages.
 * The page and the badge reload when the server says issues changed (`live.health`).
 */

export const health = $state({ summary: null as HealthSummary | null });

export async function loadHealthSummary(): Promise<void> {
  try {
    health.summary = await unwrap(client.api.health.summary.$get());
  } catch {
    health.summary = null;
  }
}

/** The badge (§3.3): a number for red + amber, colored by the worst; a blue dot when only blue is left. */
export function badgeOf(s: HealthSummary | null): { tone: 'red' | 'amber' | 'blue' | 'none'; count: number } {
  if (!s) return { tone: 'none', count: 0 };
  const count = s.error + s.warning;
  if (s.error) return { tone: 'red', count };
  if (s.warning) return { tone: 'amber', count };
  if (s.info || s.untagged) return { tone: 'blue', count: 0 };
  return { tone: 'none', count: 0 };
}

/** One fix; the toast offers Undo when the fix only dismissed something. Resolves true when applied. */
export async function applyFix(issueId: number, fix: FixAction, fallback = 'Done.'): Promise<boolean> {
  try {
    const r: FixResult = await unwrap(client.api.health[':id'].fix.$post({ param: { id: String(issueId) }, json: fix }));
    const reopen = r.reopen;
    toast(r.message || fallback, 'info', reopen
      ? { label: 'Undo', run: () => void unwrap(client.api.health.reopen.$post({ json: reopen })).catch(toastError) }
      : undefined);
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}

/** The same fix on every item of a kind (after the caller asked first). */
export async function applyToKind(kind: IssueKind, action: FixAction['action']): Promise<void> {
  try {
    const r = await unwrap(client.api.health['fix-all'].$post({ json: { kind, action: action as 'keep' } }));
    report(r, kind === 'duplicate' || action === 'recycle');
  } catch (err) {
    toastError(err);
  }
}

export function report(r: { done: number; skipped: number; failed: { message: string }[] }, binLink = false): void {
  const parts = [`Fixed ${r.done} ${r.done === 1 ? 'item' : 'items'}`];
  if (r.skipped) parts.push(`${r.skipped} need your choice`);
  if (r.failed.length) parts.push(`${r.failed.length} couldn’t be fixed: ${r.failed[0]!.message}`);
  toast(parts.join(' · '), r.failed.length ? 'error' : 'info', r.done && binLink ? { label: 'Recycle Bin', run: () => (location.hash = '#/recycle') } : undefined);
}

/** "today 09:42", "3 Oct 14:05". */
export function when(ms: number | null): string {
  if (!ms) return 'never';
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `today ${time}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

/** `Fantasy/Elves` → `Images\Fantasy\Elves` (how the page shows paths). */
export const winPath = (rel: string, root = 'Images') => [root, ...rel.split('/').filter(Boolean)].join('\\');
