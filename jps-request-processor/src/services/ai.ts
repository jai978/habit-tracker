import Anthropic from '@anthropic-ai/sdk';

import type { Config } from '../config.ts';
import type { Client } from '../types/client.ts';
import type { Analysis } from '../types/change-request.ts';
import type { Message } from '../types/message.ts';
import type { RequestContext } from './client-context.ts';
import {
  ANALYSIS_SCHEMA,
  CLASSIFY_SYSTEM_PROMPT,
  buildClassifyInput,
} from '../prompts/classify-request.ts';
import {
  LOVABLE_SYSTEM_PROMPT,
  buildFallbackLovablePrompt,
  buildLovableInput,
} from '../prompts/generate-lovable-prompt.ts';
import { parseAnalysis, validateLovablePrompt } from '../utils/validation.ts';
import { EVENTS, errorMessage, type Logger } from '../utils/logger.ts';

/**
 * The only place that talks to the model.
 *
 * Two calls, deliberately separate: classification decides whether there is a
 * request at all, prompt generation only ever runs on an analysis that already
 * passed validation. Both outputs are validated before they leave this file.
 */

export type AiService = {
  classify(context: RequestContext): Promise<Analysis>;
  generateLovablePrompt(client: Client | null, analysis: Analysis, messages: Message[]): Promise<string>;
};

/** Thrown when the model answered but the answer cannot be trusted. */
export class InvalidAiOutputError extends Error {
  errors: string[];
  constructor(message: string, errors: string[]) {
    super(message);
    this.name = 'InvalidAiOutputError';
    this.errors = errors;
  }
}

function firstText(content: Anthropic.ContentBlock[]): string {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const block = content[index];
    if (block && block.type === 'text') return block.text;
  }
  return '';
}

export function createAiService(config: Config, logger: Logger): AiService {
  if (!config.ai.apiKey) throw new Error('ANTHROPIC_API_KEY is required');
  const client = new Anthropic({ apiKey: config.ai.apiKey, timeout: config.ai.timeoutMs });

  async function classify(context: RequestContext): Promise<Analysis> {
    const started = Date.now();
    logger.info(EVENTS.aiStarted, { step: 'classify', batch_id: context.batch.id });

    const response = await client.messages.create({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      system: CLASSIFY_SYSTEM_PROMPT,
      output_config: {
        effort: config.ai.effort,
        // Structured outputs constrain the response to the schema, so the only
        // failures left to handle are semantic ones.
        format: { type: 'json_schema', schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [{ role: 'user', content: buildClassifyInput(context) }],
    });

    if (response.stop_reason === 'refusal') {
      throw new InvalidAiOutputError('The model declined to analyse this message batch', [
        response.stop_details?.explanation ?? 'refused',
      ]);
    }

    const raw = firstText(response.content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new InvalidAiOutputError('Classification response was not valid JSON', [raw.slice(0, 200)]);
    }

    const result = parseAnalysis(parsed);
    if (!result.ok) {
      logger.warn(EVENTS.aiInvalidOutput, { step: 'classify', errors: result.errors });
      throw new InvalidAiOutputError('Classification response failed validation', result.errors);
    }

    logger.info(EVENTS.aiCompleted, {
      step: 'classify',
      batch_id: context.batch.id,
      classification: result.value.classification,
      confidence: result.value.confidence,
      duration_ms: Date.now() - started,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    return result.value;
  }

  async function generateLovablePrompt(
    clientRecord: Client | null,
    analysis: Analysis,
    messages: Message[],
  ): Promise<string> {
    const started = Date.now();
    logger.info(EVENTS.aiStarted, { step: 'lovable_prompt' });

    try {
      const response = await client.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens,
        system: LOVABLE_SYSTEM_PROMPT,
        output_config: { effort: config.ai.effort },
        messages: [{ role: 'user', content: buildLovableInput(clientRecord, analysis, messages) }],
      });

      if (response.stop_reason === 'refusal') {
        throw new InvalidAiOutputError('The model declined to write the implementation prompt', ['refused']);
      }

      const validated = validateLovablePrompt(firstText(response.content));
      if (!validated.ok) {
        logger.warn(EVENTS.aiInvalidOutput, { step: 'lovable_prompt', errors: validated.errors });
        throw new InvalidAiOutputError('Generated prompt failed validation', validated.errors);
      }

      logger.info(EVENTS.aiCompleted, {
        step: 'lovable_prompt',
        duration_ms: Date.now() - started,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
      return validated.value;
    } catch (error) {
      // The analysis is already validated, so a usable prompt can be assembled
      // without the model. Losing the nicer wording beats losing the request.
      logger.warn(EVENTS.error, {
        step: 'lovable_prompt_fallback',
        reason: errorMessage(error),
      });
      return buildFallbackLovablePrompt(clientRecord, analysis);
    }
  }

  return { classify, generateLovablePrompt };
}
