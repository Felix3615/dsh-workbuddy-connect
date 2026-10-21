import { describe, expect, it } from 'vitest'
import {
  HARNESS_PROMPT_REPLACEMENT,
  HARNESS_PROMPT_SENTENCE,
  rewriteHarnessPrompt,
} from '../src/prompt-rewrite.ts'
import { prepareChatBody, prepareInternationalChatBody } from '../src/upstream.ts'

/** The sentence plus the surrounding instruction a real system prompt carries. */
const PROMPT = `${HARNESS_PROMPT_SENTENCE}. You have access to tools; use them when needed.`

describe('rewriteHarnessPrompt', () => {
  it('replaces the identity sentence in a system message and keeps the rest', () => {
    const body: Record<string, unknown> = {
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: 'hi' }],
    }
    expect(rewriteHarnessPrompt(body)).toBe(true)
    const messages = body['messages'] as { content: string }[]
    expect(messages[0]!.content).toBe(`${HARNESS_PROMPT_REPLACEMENT}. You have access to tools; use them when needed.`)
    // Only the prompt moved: the conversational message is byte-identical.
    expect(messages[1]!.content).toBe('hi')
  })

  it('rewrites typed content parts', () => {
    const body: Record<string, unknown> = {
      messages: [{ role: 'system', content: [{ type: 'text', text: PROMPT }, { type: 'text', text: 'tail' }] }],
    }
    expect(rewriteHarnessPrompt(body)).toBe(true)
    const parts = (body['messages'] as { content: { text: string }[] }[])[0]!.content
    expect(parts[0]!.text).toBe(`${HARNESS_PROMPT_REPLACEMENT}. You have access to tools; use them when needed.`)
    expect(parts[1]!.text).toBe('tail')
  })

  it('rewrites a top-level system field', () => {
    const body: Record<string, unknown> = { system: PROMPT, messages: [] }
    expect(rewriteHarnessPrompt(body)).toBe(true)
    expect(body['system']).toBe(`${HARNESS_PROMPT_REPLACEMENT}. You have access to tools; use them when needed.`)
  })

  it('leaves user and assistant text alone, even when it quotes the sentence', () => {
    const body: Record<string, unknown> = {
      messages: [
        { role: 'user', content: HARNESS_PROMPT_SENTENCE },
        { role: 'assistant', content: [{ type: 'text', text: HARNESS_PROMPT_SENTENCE }] },
      ],
    }
    expect(rewriteHarnessPrompt(body)).toBe(false)
    expect((body['messages'] as { content: unknown }[])[0]!.content).toBe(HARNESS_PROMPT_SENTENCE)
  })

  it('reports no change when the sentence is absent', () => {
    const body: Record<string, unknown> = { messages: [{ role: 'system', content: 'a different prompt' }] }
    expect(rewriteHarnessPrompt(body)).toBe(false)
    expect((body['messages'] as { content: string }[])[0]!.content).toBe('a different prompt')
  })

  it('replaces every occurrence in one prompt', () => {
    const body: Record<string, unknown> = {
      messages: [{ role: 'system', content: `${HARNESS_PROMPT_SENTENCE}\n\n${HARNESS_PROMPT_SENTENCE}` }],
    }
    rewriteHarnessPrompt(body)
    const content = (body['messages'] as { content: string }[])[0]!.content
    expect(content).toBe(`${HARNESS_PROMPT_REPLACEMENT}\n\n${HARNESS_PROMPT_REPLACEMENT}`)
    expect(content.includes(HARNESS_PROMPT_SENTENCE)).toBe(false)
  })

  it('tolerates bodies without messages, non-array messages, and malformed entries', () => {
    expect(rewriteHarnessPrompt({ model: 'auto' })).toBe(false)
    expect(rewriteHarnessPrompt({ messages: null })).toBe(false)
    expect(rewriteHarnessPrompt({ messages: [null, 1, 'x', [], { role: 7 }, { role: 'system', content: 3 }] })).toBe(false)
  })

  it('is idempotent', () => {
    const body: Record<string, unknown> = { messages: [{ role: 'system', content: PROMPT }] }
    expect(rewriteHarnessPrompt(body)).toBe(true)
    const once = (body['messages'] as { content: string }[])[0]!.content
    expect(rewriteHarnessPrompt(body)).toBe(false)
    expect((body['messages'] as { content: string }[])[0]!.content).toBe(once)
  })
})

describe('prepareChatBody prompt rewrite', () => {
  it('rewrites the prompt on the developer role pi-ai actually emits', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      messages: [{ role: 'developer', content: PROMPT }, { role: 'user', content: 'hi' }],
    })))
    expect(body['messages'][0]).toEqual({ role: 'system', content: `${HARNESS_PROMPT_REPLACEMENT}. You have access to tools; use them when needed.` })
  })

  it('survives the international path\'s second prepare pass', () => {
    const prepared = prepareInternationalChatBody(JSON.stringify({
      messages: [{ role: 'developer', content: PROMPT }, { role: 'user', content: 'hi' }],
    }))
    const body = JSON.parse(prepared)
    const system = body['messages'][0]
    expect(system['role']).toBe('system')
    expect(system['content']).toBe(`${HARNESS_PROMPT_REPLACEMENT}. You have access to tools; use them when needed.`)
    expect(prepared.includes(HARNESS_PROMPT_SENTENCE)).toBe(false)
  })
})
