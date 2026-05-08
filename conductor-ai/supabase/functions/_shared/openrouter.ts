// Conductor AI — Shared OpenRouter Client
// Used by all AI agent Edge Functions

export const MODELS = {
  llama: 'meta-llama/llama-3.1-8b-instruct:free',
  gemma: 'google/gemma-2-9b-it:free',
  mistral: 'mistralai/mistral-7b-instruct:free',
}

export async function callOpenRouter(
  model: string,
  system: string,
  user: string,
  maxTokens = 800
): Promise<string> {
  const key = Deno.env.get('OPENROUTER_KEY')
  if (!key) throw new Error('OPENROUTER_KEY not set')

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://conductor-ai.ng',
      'X-Title': 'Conductor AI',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

export async function callOpenRouterMessages(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens = 800
): Promise<string> {
  const key = Deno.env.get('OPENROUTER_KEY')
  if (!key) throw new Error('OPENROUTER_KEY not set')

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://conductor-ai.ng',
      'X-Title': 'Conductor AI',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

export function parseJSON(raw: string): any {
  // Strip markdown fences before parsing
  const clean = raw.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(clean)
}
