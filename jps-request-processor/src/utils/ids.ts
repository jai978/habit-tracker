import { randomUUID, createHash } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
