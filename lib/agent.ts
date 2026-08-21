// Client half of the agent. Talks to the `agent` Edge Function and turns the
// proposals it returns into the exact `SubscriptionDraft` shape the store
// already knows how to write.

import {
  CATEGORIES,
  CATEGORY_COLORS,
  DEFAULT_CURRENCY,
  iconKeyForName,
  type Category,
  type Frequency,
  type Status,
} from '@/constants/subscriptions';
import { nextRenewalFrom } from '@/lib/renewal';
import { supabase } from '@/lib/supabase';
import dayjs from 'dayjs';

export type ProposalAction = 'create' | 'update' | 'status_change' | 'delete';

export interface Proposal {
  proposalId: string;
  action: ProposalAction;
  input: Record<string, any>;
}

/** Whether committing this proposal is destructive or irreversible. */
export const isDestructive = (proposal: Proposal): boolean =>
  proposal.action === 'delete' ||
  (proposal.action === 'status_change' && proposal.input.status === 'cancelled');

export interface AgentTurn {
  reply: string;
  proposals: Proposal[];
  /**
   * Provider-shaped conversation history. Treat it as opaque — pass it back
   * unchanged on the next call and never construct or inspect it here. That is
   * what keeps a provider swap confined to the Edge Function.
   */
  history: unknown[];
}

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/agent`;

export const sendToAgent = async (
  message: string,
  history: unknown[] = []
): Promise<AgentTurn> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) throw new Error('You must be signed in to use the assistant.');

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, history }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'The assistant is unavailable.');

  return payload as AgentTurn;
};

// ---------------------------------------------------------------------------
// Proposal → draft
// ---------------------------------------------------------------------------

const asCategory = (value: unknown): Category =>
  CATEGORIES.includes(value as Category) ? (value as Category) : 'Other';

const asFrequency = (value: unknown): Frequency =>
  value === 'Yearly' ? 'Yearly' : 'Monthly';

/**
 * Builds a complete draft from a create proposal.
 *
 * The model is deliberately not asked for renewalDate, colour or a guaranteed
 * icon. Those are derived here so a chat-created subscription is
 * indistinguishable from a form-created one.
 */
export const draftFromCreateProposal = (input: Record<string, any>): SubscriptionDraft => {
  const frequency = asFrequency(input.frequency);
  const category = asCategory(input.category);
  const startDate = input.startDate ? dayjs(input.startDate) : dayjs();

  return {
    name: String(input.name ?? '').trim(),
    price: Number(input.price),
    currency: input.currency ?? DEFAULT_CURRENCY,
    // The form writes the same value to both columns; match it.
    frequency,
    billing: frequency,
    category,
    plan: input.plan?.trim() || undefined,
    paymentMethod: input.paymentMethod?.trim() || undefined,
    status: (input.status as Status) ?? 'active',
    startDate: startDate.toISOString(),
    // Not start + 1 period. A start date in the past would otherwise produce a
    // renewal in the past, which every Insights chart filters out.
    renewalDate: nextRenewalFrom(startDate, frequency).toISOString(),
    iconKey: input.iconKey && input.iconKey !== 'plus'
      ? input.iconKey
      : iconKeyForName(String(input.name ?? '')),
    color: CATEGORY_COLORS[category],
  };
};

/**
 * Builds a partial patch from an update proposal. Only keys the model actually
 * supplied are included — this is what stops "change the price" from wiping
 * plan, category and payment method.
 */
export const patchFromUpdateProposal = (
  input: Record<string, any>,
  existing: Subscription
): Partial<SubscriptionDraft> => {
  const patch: Partial<SubscriptionDraft> = {};

  if (input.name !== undefined) patch.name = String(input.name).trim();
  if (input.price !== undefined) patch.price = Number(input.price);
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.plan !== undefined) patch.plan = input.plan?.trim() || undefined;
  if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod?.trim() || undefined;
  if (input.status !== undefined) patch.status = input.status;
  if (input.iconKey !== undefined) patch.iconKey = input.iconKey;

  if (input.category !== undefined) {
    const category = asCategory(input.category);
    patch.category = category;
    // Only follow the category if the user had not picked a custom colour.
    if (existing.color === CATEGORY_COLORS[asCategory(existing.category)]) {
      patch.color = CATEGORY_COLORS[category];
    }
  }

  const frequencyChanged = input.frequency !== undefined;
  const startChanged = input.startDate !== undefined;

  if (frequencyChanged) {
    const frequency = asFrequency(input.frequency);
    patch.frequency = frequency;
    patch.billing = frequency;
  }
  if (startChanged) {
    patch.startDate = dayjs(input.startDate).toISOString();
  }

  // Either change invalidates the stored renewal date, so recompute it.
  if (frequencyChanged || startChanged) {
    const frequency = asFrequency(input.frequency ?? existing.frequency ?? existing.billing);
    const start = input.startDate ?? existing.startDate ?? dayjs();
    patch.renewalDate = nextRenewalFrom(start, frequency).toISOString();
  }

  return patch;
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  price: 'Price',
  currency: 'Currency',
  frequency: 'Billing cadence',
  category: 'Category',
  status: 'Status',
  plan: 'Plan',
  paymentMethod: 'Payment method',
  startDate: 'Start date',
  iconKey: 'Icon',
};

/**
 * The fields the model worked out rather than being told, in the order they
 * appear on the card. Render these with a "check this" marker — they are the
 * only part of a proposal the user genuinely needs to read.
 */
export const inferredFields = (proposal: Proposal): string[] => {
  const declared = proposal.input.inferred;
  if (!Array.isArray(declared)) return [];

  return declared
    .filter((field): field is string => typeof field === 'string')
    // Only surface fields that actually carry a value on this proposal.
    .filter((field) => proposal.input[field] !== undefined)
    .map((field) => FIELD_LABELS[field] ?? field);
};

/** One-line summary for the confirmation card. */
export const describeProposal = (
  proposal: Proposal,
  existing?: Subscription
): string => {
  const input = proposal.input;

  switch (proposal.action) {
    case 'create':
      return `Add ${input.name} at ${input.currency ?? DEFAULT_CURRENCY} ${input.price} ${
        asFrequency(input.frequency) === 'Yearly' ? 'a year' : 'a month'
      }`;
    case 'update':
      return `Update ${existing?.name ?? 'this subscription'}`;
    case 'status_change':
      return `Mark ${existing?.name ?? 'this subscription'} as ${input.status}`;
    case 'delete':
      return `Permanently delete ${input.losing ?? existing?.name ?? 'this subscription'}`;
    default:
      return 'Unrecognised change';
  }
};
