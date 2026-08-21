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

/** Maps a draft onto table columns. `user_id` is never part of an update. */
const draftToColumns = (draft: SubscriptionDraft) => ({
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

const draftToInsert = (draft: SubscriptionDraft, userId: string) => ({
  ...draftToColumns(draft),
  user_id: userId,
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

/** Overwrites every editable column on a subscription the user owns. */
export const updateSubscription = async (
  id: string,
  draft: SubscriptionDraft
): Promise<Subscription> => {
  const { data, error } = await supabase
    .from('subscriptions')
    .update(draftToColumns(draft))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToSubscription(data as SubscriptionRow);
};

/** Only the fields present on `patch` become columns. */
const draftToPartialColumns = (patch: Partial<SubscriptionDraft>) => {
  const columns: Record<string, unknown> = {};

  if (patch.name !== undefined) columns.name = patch.name;
  if (patch.price !== undefined) columns.price = patch.price;
  if (patch.currency !== undefined) columns.currency = patch.currency;
  if (patch.billing !== undefined) columns.billing = patch.billing;
  if (patch.frequency !== undefined) columns.frequency = patch.frequency ?? null;
  if (patch.plan !== undefined) columns.plan = patch.plan ?? null;
  if (patch.category !== undefined) columns.category = patch.category ?? null;
  if (patch.paymentMethod !== undefined) columns.payment_method = patch.paymentMethod ?? null;
  if (patch.status !== undefined) columns.status = patch.status;
  if (patch.startDate !== undefined) columns.start_date = patch.startDate ?? null;
  if (patch.renewalDate !== undefined) columns.renewal_date = patch.renewalDate ?? null;
  if (patch.iconKey !== undefined) columns.icon_key = patch.iconKey;
  if (patch.color !== undefined) columns.color = patch.color ?? null;

  return columns;
};

/**
 * Updates only the supplied fields. `user_id` is never touched; RLS scopes the
 * row to the caller.
 *
 * `updateSubscription` above writes every editable column, which is right for
 * the modal because it always submits a complete form. The agent sends only
 * what changed, so routing it through there would null out the rest.
 */
export const patchSubscription = async (
  id: string,
  patch: Partial<SubscriptionDraft>
): Promise<Subscription> => {
  const columns = draftToPartialColumns(patch);

  if (Object.keys(columns).length === 0) {
    throw new Error('Nothing to update.');
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .update(columns)
    .eq('id', id)
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
/** One bar in the insights chart. A bucket is a day (week view) or a
 * seven-day block of the month (month view). */
export interface ChartBucket {
  /** Stable key for list rendering. */
  key: string;
  /** Axis label, e.g. "Thu" or "8–14". */
  label: string;
  /** Combined price of everything renewing in the bucket. */
  total: number;
  /** How many subscriptions renew in the bucket. */
  count: number;
  /** The bucket containing today — highlighted on the axis. */
  isCurrent: boolean;
}

const isBillable = (subscription: Subscription): boolean =>
  subscription.status !== 'cancelled' && Boolean(subscription.renewalDate);

/**
 * Buckets renewals into one entry per day across the current Monday–Sunday
 * week. Days with nothing due are kept so the chart holds a stable seven-column
 * shape rather than collapsing.
 */
export const renewalsByWeekday = (subscriptions: Subscription[]): ChartBucket[] => {
  const today = dayjs().startOf('day');

  // dayjs weeks start on Sunday (day() === 0), so step back to Monday without
  // pulling in the isoWeek plugin.
  const monday = today.subtract((today.day() + 6) % 7, 'day');
  const todayKey = today.format('YYYY-MM-DD');

  const buckets: ChartBucket[] = Array.from({ length: 7 }, (_, offset) => {
    const day = monday.add(offset, 'day');
    const key = day.format('YYYY-MM-DD');
    return {
      key,
      label: day.format('ddd'),
      total: 0,
      count: 0,
      isCurrent: key === todayKey,
    };
  });

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const subscription of subscriptions) {
    if (!isBillable(subscription)) continue;

    const renewal = dayjs(subscription.renewalDate);
    if (!renewal.isValid()) continue;

    const bucket = byKey.get(renewal.format('YYYY-MM-DD'));
    if (!bucket) continue;

    bucket.total += subscription.price;
    bucket.count += 1;
  }

  return buckets;
};

/**
 * Buckets the current month into seven-day blocks starting on the 1st, giving
 * four or five bars depending on the month's length. Bucketing by individual
 * day would mean up to 31 bars, which is unreadable at phone width.
 */
export const renewalsByMonthBlock = (subscriptions: Subscription[]): ChartBucket[] => {
  const today = dayjs().startOf('day');
  const monthKey = today.format('YYYY-MM');
  const daysInMonth = today.daysInMonth();
  const todayDate = today.date();

  const buckets: ChartBucket[] = [];
  for (let startDay = 1; startDay <= daysInMonth; startDay += 7) {
    const endDay = Math.min(startDay + 6, daysInMonth);
    buckets.push({
      key: `${monthKey}-${startDay}`,
      label: startDay === endDay ? `${startDay}` : `${startDay}\u2013${endDay}`,
      total: 0,
      count: 0,
      isCurrent: todayDate >= startDay && todayDate <= endDay,
    });
  }

  for (const subscription of subscriptions) {
    if (!isBillable(subscription)) continue;

    const renewal = dayjs(subscription.renewalDate);
    if (!renewal.isValid() || renewal.format('YYYY-MM') !== monthKey) continue;

    const bucket = buckets[Math.floor((renewal.date() - 1) / 7)];
    if (!bucket) continue;

    bucket.total += subscription.price;
    bucket.count += 1;
  }

  return buckets;
};
