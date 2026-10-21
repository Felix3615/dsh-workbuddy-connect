/**
 * Rewrite the Harness's own identity sentence on its way to WorkBuddy.
 *
 * The system prompt belongs to DSH, not to this plugin: it arrives over the
 * OpenAI-compatible wire as a `system` message (pi-ai emits it as `developer`,
 * which {@link prepareChatBody} renames one step earlier) and is forwarded
 * upstream verbatim. This module is the single seam where that sentence is
 * replaced, so nothing else in the pipeline has to know about it.
 *
 * Scope rules, both deliberate:
 *
 * - **Only prompt-bearing messages are touched.** Rewriting user or assistant
 *   text would corrupt a conversation and could rewrite a quoted copy of the
 *   sentence the user is discussing; the identity sentence is prompt-only.
 * - **Only the exact sentence is replaced.** The Harness's system prompt is far
 *   longer than this one line, so the surrounding instruction is preserved
 *   byte for byte and the rewrite stays a wording change rather than a
 *   replacement prompt.
 *
 * Idempotent: after one pass the sentence is gone, so re-running (the
 * international path hands an already-prepared body to
 * {@link prepareInternationalChatBody}, which calls `prepareChatBody` again)
 * changes nothing.
 *
 * @module dsh-workbuddy-connect/prompt-rewrite
 */

/** The Harness's own identity sentence as it reaches the wire. */
export const HARNESS_PROMPT_SENTENCE = 'You are an AI agent powered by DeepSeek Harness'

/** What that sentence becomes before the request leaves this plugin. */
export const HARNESS_PROMPT_REPLACEMENT = "Is now F's PC, You are an AI agent powered by DSH"

/** Roles whose content is a prompt rather than conversation text. */
const PROMPT_ROLES: ReadonlySet<string> = new Set(['system', 'developer'])

/** Top-level body fields that may carry a prompt instead of (or besides) `messages`. */
const PROMPT_FIELDS: readonly string[] = ['system', 'instructions']

/** Replace every occurrence of the sentence in one string. */
function rewriteText(text: string): string {
  return text.includes(HARNESS_PROMPT_SENTENCE)
    ? text.split(HARNESS_PROMPT_SENTENCE).join(HARNESS_PROMPT_REPLACEMENT)
    : text
}

/**
 * Rewrite one message's `content`, which the OpenAI wire allows as either a
 * plain string or an array of typed parts (`{ type: 'text', text }`). Any other
 * shape is left alone: it carries no text this module can safely edit.
 *
 * @returns whether any text changed.
 */
function rewriteContent(holder: Record<string, unknown>): boolean {
  const content = holder['content']
  if (typeof content === 'string') {
    const next = rewriteText(content)
    if (next === content) return false
    holder['content'] = next
    return true
  }
  if (!Array.isArray(content)) return false
  let changed = false
  for (const part of content) {
    if (typeof part !== 'object' || part === null || Array.isArray(part)) continue
    const wrapped = part as Record<string, unknown>
    const text = wrapped['text']
    if (typeof text !== 'string') continue
    const next = rewriteText(text)
    if (next === text) continue
    wrapped['text'] = next
    changed = true
  }
  return changed
}

/**
 * Apply the rewrite to an already-parsed chat-completions body.
 *
 * Mutates `body` in place, exactly as the other `prepare*` helpers in
 * `upstream.ts` do, and tolerates any shape: a body without `messages`, with a
 * non-array `messages`, or with malformed entries is simply left unchanged.
 *
 * @returns whether the body was rewritten.
 */
export function rewriteHarnessPrompt(body: Record<string, unknown>): boolean {
  let changed = false
  for (const field of PROMPT_FIELDS) {
    const value = body[field]
    if (typeof value !== 'string') continue
    const next = rewriteText(value)
    if (next === value) continue
    body[field] = next
    changed = true
  }
  const messages = body['messages']
  if (!Array.isArray(messages)) return changed
  for (const message of messages) {
    if (typeof message !== 'object' || message === null || Array.isArray(message)) continue
    const wrapped = message as Record<string, unknown>
    const role = wrapped['role']
    if (typeof role !== 'string' || !PROMPT_ROLES.has(role.toLowerCase())) continue
    if (rewriteContent(wrapped)) changed = true
  }
  return changed
}
