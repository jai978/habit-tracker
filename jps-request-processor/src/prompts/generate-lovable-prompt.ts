import type { Client } from '../types/client.ts';
import type { Analysis } from '../types/change-request.ts';
import type { Message } from '../types/message.ts';

/**
 * Prompt for turning a validated Analysis into text a JPS operator can paste
 * straight into Lovable, plus a deterministic fallback so a request never ends
 * up with no usable prompt at all.
 */

export const LOVABLE_SYSTEM_PROMPT = `You write implementation prompts for Lovable, the tool JPS Solutions uses to build and edit client websites.

You are given a website change that a client requested, already interpreted and checked. Your job is to turn it into instructions precise enough that someone with no knowledge of the conversation could carry them out without asking a question — and narrow enough that nothing else on the site is touched.

Write plain text with these sections, in this order and with these exact headings:

A single opening line naming the site being changed, e.g. "Update the existing ABC Roofing website."

OBJECTIVE
One or two sentences on what the client wants and why, in their terms.

REQUESTED CHANGES
A numbered list. Each item is one concrete action, phrased as an instruction. Name the page or section it
applies to. Where the site context gives a path or a layout convention, use it. Where the change must match
something that already exists — a card, a service tile, a section — say so explicitly, because matching the
existing pattern is what keeps the result looking intentional.

SUPPLIED CONTENT
Only if the client provided exact values or files. Reproduce each value verbatim on its own line, labelled
with where it goes. If the change depends on a file, say plainly that the client-supplied file is to be used
and must not be substituted with a stock image or a placeholder.

SCOPE CONTROL
State that only the listed changes are to be made, and list what must be preserved: existing branding,
typography, colour system, existing copy, existing functionality, forms, SEO metadata, responsive behaviour,
navigation, and any section not named above.

VALIDATION
What to check once the change is made: desktop, tablet and mobile layouts; that the change matches the
surrounding design; that links still work; that forms still work if the change touched one; and that nothing
unrelated changed.

Rules:

Only the listed changes. Do not add improvements, extra sections, refactors, accessibility passes or copy
rewrites that were not requested, however worthwhile they would be.

Do not invent content. If a value was not supplied, do not write a plausible one — say the value is to be
supplied by JPS. Never write filler copy, placeholder text or example contact details.

Keep supplied values exact. Reproduce phone numbers, addresses, emails, hours and client wording character
for character.

No preamble, no closing commentary, no markdown fences. Output only the prompt itself.`;

export function buildLovableInput(
  client: Client | null,
  analysis: Analysis,
  messages: Message[],
): string {
  const attachmentLines = messages.flatMap((message) =>
    message.attachments.map((attachment) => {
      const name = attachment.name ? ` (${attachment.name})` : '';
      return `- ${attachment.type}${name} sent by the client at ${message.sent_at}`;
    }),
  );

  const sections = [
    [
      'WEBSITE',
      `Business: ${client?.business_name ?? '(unknown)'}`,
      client?.website_url ? `URL: ${client.website_url}` : null,
      client?.lovable_project_reference ? `Lovable project: ${client.lovable_project_reference}` : null,
    ]
      .filter(Boolean)
      .join('\n'),

    `SITE CONTEXT\n${client?.site_context?.trim() || '(none recorded — do not assume page paths or structure)'}`,

    client?.special_instructions?.trim()
      ? `STANDING INSTRUCTIONS FOR THIS CLIENT\n${client.special_instructions.trim()}`
      : null,

    `WHAT THE CLIENT ASKED FOR\n${analysis.summary}`,

    `REQUESTED CHANGES (interpreted and approved for prompt generation)\n${analysis.requested_changes
      .map((change, index) => {
        const page = change.page ? ` [page: ${change.page}]` : ' [page: not specified by the client]';
        return `${index + 1}. (${change.type})${page} ${change.description}`;
      })
      .join('\n')}`,

    analysis.client_supplied_content.length > 0
      ? `EXACT VALUES SUPPLIED BY THE CLIENT (reproduce character for character)\n${analysis.client_supplied_content
          .map((item) => `- ${item.kind}: ${item.value}\n  used for: ${item.usage}`)
          .join('\n')}`
      : 'EXACT VALUES SUPPLIED BY THE CLIENT\n(none)',

    analysis.attachments_required.length > 0
      ? `FILES THIS CHANGE DEPENDS ON\n${analysis.attachments_required
          .map(
            (item) =>
              `- ${item.type} for ${item.purpose} — ${item.supplied ? 'supplied by the client' : 'NOT YET SUPPLIED'}`,
          )
          .join('\n')}`
      : null,

    attachmentLines.length > 0 ? `ATTACHMENTS ON THE ORIGINAL MESSAGES\n${attachmentLines.join('\n')}` : null,

    analysis.ambiguities.length > 0
      ? `KNOWN UNKNOWNS (do not resolve these by guessing — state that JPS will supply them)\n${analysis.ambiguities
          .map((item) => `- ${item.question} (${item.why})`)
          .join('\n')}`
      : null,

    `ORIGINAL CLIENT MESSAGES (for tone and exact wording)\n${messages
      .map((message) => message.text.trim())
      .filter((text) => text !== '')
      .map((text) => `"${text}"`)
      .join('\n')}`,
  ];

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Assembled from the validated analysis with no model involved. Used when the
 * generation call fails or returns something unusable, so the operator always
 * has something correct to work from even if it reads mechanically.
 */
export function buildFallbackLovablePrompt(client: Client | null, analysis: Analysis): string {
  const name = client?.business_name ?? 'the client';
  const lines: string[] = [];

  lines.push(`Update the existing ${name} website.`);
  if (client?.website_url) lines.push(`Site: ${client.website_url}`);
  lines.push('');
  lines.push('OBJECTIVE');
  lines.push(analysis.summary);
  lines.push('');
  lines.push('REQUESTED CHANGES');
  analysis.requested_changes.forEach((change, index) => {
    const where = change.page ? ` (page: ${change.page})` : '';
    lines.push(`${index + 1}. ${change.description}${where}`);
  });
  lines.push(
    `${analysis.requested_changes.length + 1}. Match the existing design, spacing, typography and component structure already used on that page.`,
  );

  if (analysis.client_supplied_content.length > 0) {
    lines.push('');
    lines.push('SUPPLIED CONTENT');
    lines.push('Use these values exactly as written:');
    for (const item of analysis.client_supplied_content) {
      lines.push(`- ${item.value}  →  ${item.usage}`);
    }
  }

  if (analysis.attachments_required.length > 0) {
    lines.push('');
    lines.push('CLIENT-SUPPLIED FILES');
    for (const item of analysis.attachments_required) {
      lines.push(
        item.supplied
          ? `- Use the client-supplied ${item.type} for ${item.purpose}. Do not substitute a stock or placeholder file.`
          : `- A ${item.type} is needed for ${item.purpose}. JPS will supply it; do not invent a replacement.`,
      );
    }
  }

  lines.push('');
  lines.push('SCOPE CONTROL');
  lines.push('Make only the changes listed above. Do not make unrelated design or content changes.');
  lines.push('Preserve:');
  lines.push('- existing branding, typography and colour system');
  lines.push('- existing copy and content not named above');
  lines.push('- existing navigation and page structure');
  lines.push('- forms and any existing functionality');
  lines.push('- SEO metadata');
  lines.push('- responsive behaviour');
  if (client?.special_instructions?.trim()) {
    lines.push('');
    lines.push('Additional standing constraints for this client:');
    lines.push(client.special_instructions.trim());
  }

  lines.push('');
  lines.push('VALIDATION');
  lines.push('After implementing the change:');
  lines.push('- check the desktop layout');
  lines.push('- check the tablet layout');
  lines.push('- check the mobile layout');
  lines.push('- verify the change visually matches the surrounding design');
  lines.push('- verify links still work, and forms still work if this change touched one');
  lines.push('- verify no unrelated content or section was modified');

  return lines.join('\n');
}
