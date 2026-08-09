import type { ChangeRequest, NewChangeRequest, RequestStatus } from '../types/change-request.ts';

export type ChangeRequestRepo = {
  create(input: NewChangeRequest): Promise<ChangeRequest>;
  getById(id: string): Promise<ChangeRequest | null>;
  /** Used to keep a retried batch from producing a second request. */
  getByBatchId(batchId: string): Promise<ChangeRequest | null>;
  list(options: { status?: RequestStatus; clientId?: string; limit: number; offset?: number }): Promise<ChangeRequest[]>;
  /** Recent requests for one client, as context for interpreting the next message. */
  listRecentForClient(clientId: string, limit: number): Promise<ChangeRequest[]>;
  updateStatus(id: string, status: RequestStatus): Promise<ChangeRequest | null>;
  countByStatus(): Promise<Record<string, number>>;
};
