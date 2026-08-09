import type { Client, ClientPatch, NewClient } from '../types/client.ts';

export type ClientRepo = {
  getById(id: string): Promise<Client | null>;
  /** The mapping that turns an inbound message into a known client. */
  getByFacebookSenderId(senderId: string): Promise<Client | null>;
  list(): Promise<Client[]>;
  create(input: NewClient): Promise<Client>;
  update(id: string, patch: ClientPatch): Promise<Client | null>;
};
