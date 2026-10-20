export const GOALS = ["energy", "sleep", "digestion", "immunity", "balance"] as const;
export type Goal = typeof GOALS[number];
export type Quiz = { goals: Goal[]; diet: string; activity: string; safety: string };
export function validateQuiz(value: unknown): Quiz | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.goals) || v.goals.length < 1 || v.goals.length > 5 || !v.goals.every(g => GOALS.includes(g))) return null;
  if (!['balanced', 'irregular', 'plant', 'mixed'].includes(String(v.diet))) return null;
  if (!['low', 'moderate', 'high'].includes(String(v.activity))) return null;
  if (!['clear', 'pregnant', 'medications', 'minor', 'condition'].includes(String(v.safety))) return null;
  return { goals: [...new Set(v.goals)] as Goal[], diet: String(v.diet), activity: String(v.activity), safety: String(v.safety) };
}
export function validateLead(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string' || typeof v.phone !== 'string' || typeof v.telegram !== 'string') return null;
  const name = v.name.trim();
  const phone = v.phone.trim().replace(/[\s()-]/g, '');
  const telegram = v.telegram.trim().replace(/^@/, '');
  if (name.length < 2 || name.length > 100 || /[\x00-\x1f<>]/.test(name)) return null;
  if (!/^\+?[1-9]\d{9,14}$/.test(phone)) return null;
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)) return null;
  if (v.consent !== true || (v.website !== undefined && (typeof v.website !== 'string' || v.website !== ''))) return null;
  if (v.page !== undefined && (typeof v.page !== 'string' || v.page.length > 2048)) return null;
  const utm: Record<string, string> = {};
  if (v.utm && typeof v.utm === 'object' && !Array.isArray(v.utm)) {
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const val = (v.utm as Record<string, unknown>)[key];
      if (typeof val === 'string') utm[key] = val.slice(0, 200);
    }
  }
  return { name, phone, telegram: `@${telegram}`, consent: true, consent_version: '2026-10-20', page: typeof v.page === 'string' ? v.page : '', utm };
}
