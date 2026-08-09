import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAnalysis, sanitizeText, validateLovablePrompt } from '../src/utils/validation.ts';
import { buildFallbackLovablePrompt } from '../src/prompts/generate-lovable-prompt.ts';
import type { Analysis } from '../src/types/change-request.ts';

const VALID = {
  classification: 'CHANGE_REQUEST',
  confidence: 0.97,
  summary: 'Add commercial roofing to the services page.',
  requested_changes: [
    { type: 'content_addition', page: '/services', description: 'Add Commercial Roofing as a service.' },
  ],
  client_supplied_content: [],
  attachments_required: [],
  ambiguities: [],
  clarification_required: null,
};

test('a well-formed analysis is accepted', () => {
  const result = parseAnalysis(VALID);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.classification, 'CHANGE_REQUEST');
    assert.equal(result.value.requested_changes.length, 1);
  }
});

test('an unknown classification is rejected rather than coerced', () => {
  const result = parseAnalysis({ ...VALID, classification: 'DO_IT_NOW' });
  assert.equal(result.ok, false);
});

test('a change request with no changes is rejected', () => {
  const result = parseAnalysis({ ...VALID, requested_changes: [] });
  assert.equal(result.ok, false);
});

test('a possible change with nothing to clarify is rejected', () => {
  const result = parseAnalysis({
    ...VALID,
    classification: 'POSSIBLE_CHANGE',
    requested_changes: [],
    ambiguities: [],
    clarification_required: null,
  });
  assert.equal(result.ok, false);
});

test('an out-of-range confidence is rejected', () => {
  assert.equal(parseAnalysis({ ...VALID, confidence: 1.5 }).ok, false);
  assert.equal(parseAnalysis({ ...VALID, confidence: 'high' }).ok, false);
});

test('an unrecognised change type degrades to "other" rather than losing the request', () => {
  const result = parseAnalysis({
    ...VALID,
    requested_changes: [{ type: 'rewrite_everything', page: null, description: 'Add a service.' }],
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.requested_changes[0]?.type, 'other');
});

test('non-objects and junk are rejected', () => {
  assert.equal(parseAnalysis('CHANGE_REQUEST').ok, false);
  assert.equal(parseAnalysis(null).ok, false);
  assert.equal(parseAnalysis([]).ok, false);
});

test('control characters are stripped and long values are capped', () => {
  assert.equal(sanitizeText('hello' + String.fromCharCode(0) + String.fromCharCode(7) + ' world'), 'hello world');
  assert.equal(sanitizeText('keeps\nnewlines'), 'keeps\nnewlines');
  assert.equal(sanitizeText('x'.repeat(50), 10).length, 11); // 10 chars plus the ellipsis
  assert.equal(sanitizeText(42), '');
});

test('a prompt missing its scope-control section is rejected', () => {
  const missing = 'Update the site.\n\nOBJECTIVE\nDo the thing.\n\nREQUESTED CHANGES\n1. Do it.\n\nVALIDATION\nCheck it.';
  const result = validateLovablePrompt(missing);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors[0] ?? '', /SCOPE CONTROL/);
});

test('the deterministic fallback prompt always passes validation', () => {
  const analysis = parseAnalysis(VALID);
  assert.equal(analysis.ok, true);
  if (!analysis.ok) return;

  const prompt = buildFallbackLovablePrompt(
    {
      id: 'client-1',
      business_name: 'ABC Roofing',
      facebook_sender_id: 'sender-1',
      facebook_page_id: null,
      website_url: 'https://abcroofing.co.nz',
      lovable_project_reference: null,
      site_context: null,
      special_instructions: null,
      active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    analysis.value as Analysis,
  );

  assert.equal(validateLovablePrompt(prompt).ok, true);
  assert.match(prompt, /Update the existing ABC Roofing website/);
  assert.match(prompt, /Make only the changes listed above/);
});
