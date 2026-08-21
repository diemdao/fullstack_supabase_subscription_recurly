// supabase/functions/agent/index.ts — Gemini version.
//
// Same architecture as before, different provider. Reads run here against the
// caller's own rows; writes come back as proposals the client confirms and
// commits through the zustand store. The function never writes.
//
// Deploy:  supabase functions deploy agent
// Secrets: supabase secrets set GEMINI_API_KEY=...
//
// Note on the request shape: the client sends `{ history, message }` and gets
// `{ reply, proposals, history }` back. `history` is provider-shaped and the
// client treats it as opaque — it never builds a Gemini `contents` array
// itself. That is what keeps a provider swap confined to this file.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Vocabulary — mirrors constants/subscriptions.ts in the app.
// Deno cannot import from the React Native tree, so this is a deliberate copy.
// ---------------------------------------------------------------------------

const FREQUENCIES = ['Monthly', 'Yearly'] as const;
const STATUSES = ['active', 'paused', 'cancelled'] as const;
const CATEGORIES = [
  'Entertainment',
  'AI Tools',
  'Developer Tools',
  'Design',
  'Productivity',
  'Cloud',
  'Music',
  'Other',
] as const;
const ICON_KEYS = [
  'plus',
  'spotify',
  'notion',
  'figma',
  'github',
  'adobe',
  'claude',
  'openai',
  'canva',
  'netflix',
  'dropbox',
  'medium',
] as const;

// Checked against the docs. 'gemini-3.5-flash' is current, stable, and the
// model the generateContent doc tree documents — its page calls it "our most
// intelligent model for sustained frontier performance in agentic and coding
// tasks". gemini-3.7-flash exists and is newer, but appears only in the
// Interactions-API docs; it is not listed as available on this endpoint. Test
// it with a single curl before switching MODEL.
const MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_TURNS = 6;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Function declarations
//
// Gemini uses an OpenAPI schema subset. It is narrower than the JSON Schema
// the Anthropic version used: no exclusiveMinimum, no minLength. The
// `price > 0` rule therefore lives in the description and, more importantly,
// in `violatesConstraints` below — which is now the only thing standing
// between a bad value and your check constraint.
// ---------------------------------------------------------------------------

const SUBSCRIPTION_FIELDS = {
  name: {
    type: 'string',
    description: 'Service name as the user says it, e.g. "Namecheap", "Spotify". Never blank.',
  },
  price: {
    type: 'number',
    description:
      'Amount charged per billing period. Must be greater than zero — the database rejects 0, so a free ' +
      'plan cannot be tracked. Say so rather than proposing 0.',
  },
  currency: { type: 'string', description: 'ISO 4217 code. Defaults to USD.' },
  frequency: { type: 'string', enum: [...FREQUENCIES], description: 'Billing cadence.' },
  category: { type: 'string', enum: [...CATEGORIES] },
  status: { type: 'string', enum: [...STATUSES] },
  plan: { type: 'string', description: 'Tier name if mentioned, e.g. "Pro", "Family".' },
  paymentMethod: { type: 'string', description: 'Card or method if mentioned.' },
  startDate: { type: 'string', description: 'ISO 8601 date the subscription began, e.g. 2026-08-12.' },
  iconKey: { type: 'string', enum: [...ICON_KEYS], description: 'Brand glyph. Use "plus" when nothing matches.' },
};

const INFERRED = {
  inferred: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Names of the fields above whose value you inferred, defaulted or derived rather than being told ' +
      'directly by the user. Be honest and complete — an unlisted field is presented to the user as ' +
      'something they said themselves.',
  },
};

const FUNCTION_DECLARATIONS = [
  {
    name: 'list_subscriptions',
    description:
      "Read the user's current subscriptions. Call this before proposing any update, cancel or delete so " +
      'you reference a real id, and whenever the user asks what they are paying for.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional case-insensitive filter on name, category or plan.',
        },
      },
    },
  },
  {
    name: 'propose_create_subscription',
    description:
      'Propose adding a new subscription. This does NOT save it — the user sees a confirmation card and ' +
      'taps to apply. Omit renewalDate; the app computes it from startDate and frequency.',
    parameters: {
      type: 'object',
      properties: { ...SUBSCRIPTION_FIELDS, ...INFERRED },
      required: ['name', 'price', 'frequency', 'inferred'],
    },
  },
  {
    name: 'propose_update_subscription',
    description:
      'Propose changing fields on an existing subscription. Include ONLY the fields that change — ' +
      'everything omitted is left exactly as it is. Does NOT save; the user confirms.',
    parameters: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string', description: 'id from list_subscriptions.' },
        ...SUBSCRIPTION_FIELDS,
        ...INFERRED,
      },
      required: ['subscriptionId', 'inferred'],
    },
  },
  {
    name: 'propose_status_change',
    description:
      'Propose pausing, cancelling or reactivating a subscription. Prefer this over delete: cancelling ' +
      'keeps the history, deleting destroys it. Does NOT save; the user confirms.',
    parameters: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string' },
        status: { type: 'string', enum: [...STATUSES] },
      },
      required: ['subscriptionId', 'status'],
    },
  },
  {
    name: 'propose_delete_subscription',
    description:
      'Propose permanently removing a subscription. Only when the user clearly wants it gone rather than ' +
      'cancelled. Does NOT save; the user confirms.',
    parameters: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string' },
        losing: {
          type: 'string',
          description:
            'One short line naming what is destroyed, e.g. "Spotify, $11.99/mo, tracked since Jan 2024". ' +
            'Shown to the user before they confirm.',
        },
      },
      required: ['subscriptionId', 'losing'],
    },
  },
];

const systemPrompt = (today: string) => `
You help someone manage the subscriptions they track in this app. You are talking to them inside the app, so keep replies short and plain. No markdown headers, no bullet lists unless you are listing subscriptions.

Today is ${today}. Resolve relative dates against it: "last week" and "on the 12th" become concrete ISO dates. If the user gives a start date in the past, that is fine and expected — pass it through as startDate and let the app work out the next renewal.

Nothing you do saves anything. The propose_ functions draft a change and the user taps to confirm it. Never say "added", "updated" or "done" — say "here's what I'll add" and let them decide.

Be honest about what you worked out versus what you were told:
- Every create and update proposal must list, in "inferred", the fields you guessed, defaulted or derived. Category, plan, icon and status are usually inferred. An unlisted field is shown to the user as their own words, so leaving one out is worse than over-listing.
- Never invent a price, a date or a plan tier. If a price is missing, ask. Do not default it to anything.
- Price must be greater than zero. If the user describes a free plan, tell them it cannot be tracked rather than proposing a price of 0.
- If the user is vague about the cadence, ask rather than assuming Monthly.

Before any update, status change or delete:
- Call list_subscriptions first, so you reference a real id.
- If more than one subscription could match what they said, do not pick. List the candidates and ask which one.
- If nothing matches, say so plainly and ask. Do not fall back to the nearest name.

Deleting is permanent and cannot be undone, and cancelling usually does what the user actually wants while keeping the history and the spend record. Prefer propose_status_change. Only propose a delete when the user is clearly asking for the record gone rather than the subscription stopped, and fill in "losing" with what disappears so they can see it before confirming.

One subscription per proposal. If the user describes three, make three.
`.trim();

// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Mirrors the check constraints in `supabase/schema.sql`. Gemini's schema
 * subset cannot express `price > 0`, so this is load-bearing — it is the only
 * thing catching a bad value before the confirm card.
 */
const violatesConstraints = (input: Json): string | null => {
  if (input.name !== undefined && String(input.name).trim().length === 0) {
    return 'name cannot be blank.';
  }

  if (input.price !== undefined) {
    const price = Number(input.price);
    if (!Number.isFinite(price)) return 'price must be a number.';
    if (price <= 0) return 'price must be greater than zero; free plans cannot be tracked.';
    if (price >= 1e10) return 'price is implausibly large.';
  }

  if (input.status !== undefined && !STATUSES.includes(input.status as never)) {
    return `status must be one of ${STATUSES.join(', ')}.`;
  }

  if (input.frequency !== undefined && !FREQUENCIES.includes(input.frequency as never)) {
    return `frequency must be one of ${FREQUENCIES.join(', ')}.`;
  }

  for (const field of ['startDate', 'renewalDate']) {
    const value = input[field];
    if (value !== undefined && Number.isNaN(Date.parse(String(value)))) {
      return `${field} is not a valid date.`;
    }
  }

  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'Server is missing its model key.' }, 500);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  // Forwarding the caller's JWT means RLS scopes every read to their own rows.
  // The service-role key is never used here, on purpose.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } }
  );

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: 'Not signed in.' }, 401);

  let body: { history?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Malformed request body.' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ error: 'No message supplied.' }, 400);

  // The client sends plain text plus whatever history we handed it last time.
  // Shaping it into Gemini `contents` happens here and only here.
  const contents = Array.isArray(body.history) ? [...body.history] : [];
  contents.push({ role: 'user', parts: [{ text: message }] });

  const { data: allowed, error: limitError } = await supabase.rpc('claim_agent_turn', {
    daily_limit: 50,
  });

  if (limitError) {
    console.error('rate limit check failed', limitError);
    return json({ error: 'Could not verify usage limits.' }, 500);
  }
  if (allowed === false) {
    return json({ error: "You've hit today's assistant limit. Try again tomorrow." }, 429);
  }

  const proposals: Json[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt(today) }] },
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        // No temperature. Google strongly recommends leaving it at the
        // default of 1.0 on every Gemini 3 model — below 1.0 "may lead to
        // unexpected behavior, such as looping or degraded performance",
        // which in a tool-calling loop means burning all six turns.
        //
        // thinkingLevel, not thinkingBudget: the budget form is the legacy
        // parameter, and sending both in one request is a 400. 'low' is the
        // right depth for routing — the care this agent needs comes from the
        // prompt, not from thinking depth. Thinking tokens are drawn from the
        // output budget, so 1024 could be spent before a function call is
        // ever emitted, which surfaces as an empty candidate.
        generationConfig: {
          maxOutputTokens: 4096,
          // thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    });

    if (!response.ok) {
      console.error('model error', response.status, await response.text());
      return json({ error: 'The assistant is unavailable right now.' }, 502);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    if (parts.length === 0) {
      // Usually a safety block or a token ceiling, not a bug.
      console.error('empty candidate', JSON.stringify(candidate?.finishReason ?? result));
      return json({ error: 'The assistant could not answer that.' }, 502);
    }

    // Gemini requires model turns to be echoed back verbatim, function calls
    // included. Push the whole content object, not just the text.
    contents.push({ role: 'model', parts });

    const calls = parts.filter((part: Json) => part.functionCall);

    if (calls.length === 0) {
      const reply = parts
        .filter((part: Json) => typeof part.text === 'string')
        .map((part: Json) => part.text)
        .join('\n')
        .trim();

      return json({ reply, proposals, history: contents });
    }

    const responseParts: Json[] = [];

    for (const [index, part] of calls.entries()) {
      const call = part.functionCall as { id?: string; name: string; args?: Json };
      const args = call.args ?? {};
      let payload: Json;

      if (call.name === 'list_subscriptions') {
        // The only function that touches the database here. Reads are safe to
        // run unattended; writes are not.
        let request = supabase
          .from('subscriptions')
          .select('id,name,plan,category,status,price,currency,billing,frequency,start_date,renewal_date')
          .order('renewal_date', { ascending: true, nullsFirst: false });

        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (query) {
          const safe = query.replace(/[%,()]/g, '');
          request = request.or(
            `name.ilike.%${safe}%,category.ilike.%${safe}%,plan.ilike.%${safe}%`
          );
        }

        const { data, error } = await request;
        payload = error
          ? { error: `Could not read subscriptions: ${error.message}` }
          : { subscriptions: data ?? [] };
      } else if (call.name.startsWith('propose_')) {
        const problem = violatesConstraints(args);

        if (problem) {
          payload = {
            rejected: problem,
            instruction: 'Fix it or ask the user, then propose again.',
          };
        } else {
          // Gemini function calls do carry an id, but only unique within a
          // turn. The confirm card needs a key stable across the whole
          // response, so mint one from turn and index instead.
          proposals.push({
            proposalId: crypto.randomUUID(),
            action: call.name.replace('propose_', '').replace('_subscription', ''),
            input: args,
          });
          payload = {
            status:
              'Proposal shown to the user as a confirmation card. It is NOT saved yet. ' +
              'Tell them what you are about to change and let them confirm.',
          };
        }
      } else {
        payload = { error: `Unknown function: ${call.name}` };
      }

      // Echo the call's own id when it has one. Without it a parallel set of
      // same-named calls — "add Spotify, Netflix and Figma" produces three
      // propose_create_subscription calls — cannot be matched to its results
      // by name alone.
      responseParts.push({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: payload,
        },
      });
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  return json({ error: 'The assistant got stuck. Try rephrasing.' }, 500);
});
