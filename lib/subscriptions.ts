// Data access for the `subscriptions` table.
//
// The database stores an `icon_key` (a key into `constants/icons.ts`) rather
// than an image, because the icons are bundled local assets. Everything that
// crosses the network boundary goes through the mappers below so screens keep
// working with the same `Subscription` shape they always have.
import { icons, type IconKey } from '@/constants/icons';
import { supabase } from '@/lib/supabase';
import dayjs from 'dayjs';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  plan: string | null;
  category: string | null;
  payment_method: string | null;
  status: string;
  price: number | string;
  currency: string;
  billing: string;
  frequency: string | null;
  start_date: string | null;
  renewal_date: string | null;
  icon_key: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

const isIconKey = (value: string): value is IconKey =>
  Object.prototype.hasOwnProperty.call(icons, value);

/** Resolve a stored key to a bundled asset, falling back to the generic glyph. */
export const iconForKey = (value: string | null | undefined) =>
  value && isIconKey(value) ? icons[value] : icons.plus;

const undefinedIfNull = <T,>(value: T | null): T | undefined =>
  value === null ? undefined : value;

export const rowToSubscription = (row: SubscriptionRow): Subscription => {
  const iconKey: IconKey = isIconKey(row.icon_key) ? row.icon_key : 'plus';

  return {
    id: row.id,
    name: row.name,
    // Postgres `numeric` comes back as a string over the wire.
    price: typeof row.price === 'string' ? Number(row.price) : row.price,
    currency: row.currency,
    billing: row.billing,
    frequency: undefinedIfNull(row.frequency),
    plan: undefinedIfNull(row.plan),
    category: undefinedIfNull(row.category),
    paymentMethod: undefinedIfNull(row.payment_method),
    status: row.status,
    startDate: undefinedIfNull(row.start_date),
    renewalDate: undefinedIfNull(row.renewal_date),
    color: undefinedIfNull(row.color),
    iconKey,
    icon: icons[iconKey],
  };
};

const draftToInsert = (draft: SubscriptionDraft, userId: string) => ({
  user_id: userId,
  name: draft.name,
  price: draft.price,
  currency: draft.currency ?? 'USD',
  billing: draft.billing,
  frequency: draft.frequency ?? null,
  plan: draft.plan ?? null,
  category: draft.category ?? null,
  payment_method: draft.paymentMethod ?? null,
  status: draft.status ?? 'active',
  start_date: draft.startDate ?? null,
  renewal_date: draft.renewalDate ?? null,
  icon_key: draft.iconKey ?? 'plus',
  color: draft.color ?? null,
});

const requireUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error('You must be signed in to manage subscriptions.');
  return userId;
};

/** All of the signed-in user's subscriptions, soonest renewal first. */
export const fetchSubscriptions = async (): Promise<Subscription[]> => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .order('renewal_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as SubscriptionRow[]).map(rowToSubscription);
};

export const createSubscription = async (
  draft: SubscriptionDraft
): Promise<Subscription> => {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('subscriptions')
    .insert(draftToInsert(draft, userId))
    .select()
    .single();

  if (error) throw error;
  return rowToSubscription(data as SubscriptionRow);
};

export const updateSubscriptionStatus = async (
  id: string,
  status: 'active' | 'paused' | 'cancelled'
): Promise<Subscription> => {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToSubscription(data as SubscriptionRow);
};

export const deleteSubscription = async (id: string): Promise<void> => {
  const { error } = await supabase.from('subscriptions').delete().eq('id', id);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Derived views — the home screen used to read these from mock constants.
// ---------------------------------------------------------------------------

const isBilledYearly = (subscription: Subscription): boolean =>
  (subscription.frequency ?? subscription.billing).toLowerCase() === 'yearly';

/**
 * What the user is committed to per month across every non-cancelled
 * subscription. Yearly plans are amortised over twelve months.
 */
export const monthlySpend = (subscriptions: Subscription[]): number =>
  subscriptions
    .filter((subscription) => subscription.status !== 'cancelled')
    .reduce(
      (total, subscription) =>
        total + (isBilledYearly(subscription) ? subscription.price / 12 : subscription.price),
      0
    );

/** The soonest renewal date still ahead of us, or null when there is none. */
export const nextRenewalDate = (subscriptions: Subscription[]): string | null => {
  const upcoming = subscriptions
    .filter((subscription) => subscription.status !== 'cancelled' && subscription.renewalDate)
    .map((subscription) => dayjs(subscription.renewalDate))
    .filter((date) => date.isValid() && !date.isBefore(dayjs(), 'day'))
    .sort((a, b) => a.valueOf() - b.valueOf());

  return upcoming[0]?.toISOString() ?? null;
};

/** Renewals due within `withinDays`, shaped for the horizontal home carousel. */
export const upcomingRenewals = (
  subscriptions: Subscription[],
  withinDays = 30
): UpcomingSubscription[] => {
  const today = dayjs().startOf('day');

  return subscriptions
    .filter((subscription) => subscription.status !== 'cancelled' && subscription.renewalDate)
    .map((subscription) => ({
      subscription,
      daysLeft: dayjs(subscription.renewalDate).startOf('day').diff(today, 'day'),
    }))
    .filter(({ daysLeft }) => Number.isFinite(daysLeft) && daysLeft >= 0 && daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(({ subscription, daysLeft }) => ({
      id: subscription.id,
      icon: subscription.icon,
      name: subscription.name,
      price: subscription.price,
      currency: subscription.currency,
      daysLeft,
    }));
};