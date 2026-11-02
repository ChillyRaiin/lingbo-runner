// 稳定的边界契约；运行时代码为 JS，后续迁移 TypeScript 时可直接沿用。
export type ProviderId = 'manual' | 'file' | 'apple-health' | 'garmin' | 'coros' | 'suunto' | 'tcx' | 'gpx';
export interface RunningActivity {
  id?: string; date: string; sport?: 'running'; distanceKm: number; durationSec: number;
  rpe: number | null; isRace: boolean; avgHr?: number; source: string;
  provider?: ProviderId; externalId?: string;
}
export interface ImportBatch { schemaVersion: 1; provider: Exclude<ProviderId, 'manual'>; activities: RunningActivity[] }
export interface SourceCitation { id: string; sourceId: string; summary: string; chapter: string; pdfPages: number[]; evidence: string; url?: string }
export interface ActivityProvider {
  readonly id: string;
  beginAuthorization(context: { userId: string; redirectUri: string }): Promise<{ url: string; state: string }>;
  exchangeAuthorization(context: { code: string; state: string }): Promise<void>;
  pullActivities(context: { userId: string; cursor?: string }): Promise<{ batch: ImportBatch; nextCursor?: string }>;
  revoke(context: { userId: string }): Promise<void>;
}
export interface KnowledgeRetriever { search(query: string): SourceCitation[] | Promise<SourceCitation[]> }
export interface ExplanationModel { explain(input: { ruleResult: unknown; citations: SourceCitation[] }): Promise<{ text: string; citedIds: string[] }> }
export interface AthleteState { consent: boolean; profile: unknown; activities: RunningActivity[]; checkins: unknown[]; steps: Array<{ date: string; step: number }> }
export interface AthleteRepository {
  getState(userId: string): AthleteState;
  saveActivity(userId: string, value: RunningActivity): RunningActivity | null;
  importActivities(userId: string, values: RunningActivity[]): { imported: number; duplicates: number };
  deleteActivity(userId: string, id: string): boolean;
  deleteMetrics(userId: string): void;
  deleteUser(userId: string): void;
}
export interface TrainingEngine { readonly modelVersion: string; evaluate(state: AthleteState, today: string): unknown }
