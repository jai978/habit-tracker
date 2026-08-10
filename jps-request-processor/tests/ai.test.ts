import test from 'node:test';
import assert from 'node:assert/strict';

import { supportsEffort } from '../src/services/ai.ts';

/**
 * Haiku models 400 if `output_config.effort` is sent at all — this is the
 * guard that keeps AI_EFFORT from breaking the default (Haiku) configuration.
 */

test('haiku models do not accept the effort parameter', () => {
  assert.equal(supportsEffort('claude-haiku-4-5'), false);
  assert.equal(supportsEffort('claude-3-5-haiku-20241022'), false);
});

test('opus, sonnet and fable models accept it', () => {
  assert.equal(supportsEffort('claude-opus-5'), true);
  assert.equal(supportsEffort('claude-sonnet-5'), true);
  assert.equal(supportsEffort('claude-opus-4-8'), true);
  assert.equal(supportsEffort('claude-fable-5'), true);
});
