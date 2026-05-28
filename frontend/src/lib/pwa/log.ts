// Minimal structured client logger (Constitution Principle III): user-visible
// onboarding actions emit a JSON record with a stable event name and outcome.
// Console sink for now; backend ingestion is feature 009 (observability).

export type OnboardingEvent =
  | 'coach.shown'
  | 'install.unavailable'
  | 'install.completed'
  | 'notif.permission'
  | 'storage.persist'
  | 'versiongate.shown';

export function logEvent(
  event: OnboardingEvent,
  outcome: string,
  extra: Record<string, unknown> = {},
): void {
  const record = { ts: new Date().toISOString(), event, outcome, ...extra };
  console.info(JSON.stringify(record));
}
