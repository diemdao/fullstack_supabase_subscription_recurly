// Renewal date math.
//
// `addPeriod` used to be a local const inside `CreateSubscriptionModal.tsx`.
// The agent needs the same rule, so it lives here and the modal imports it.

import type { Frequency } from '@/constants/subscriptions';
import dayjs, { type Dayjs } from 'dayjs';

const unitFor = (frequency: Frequency) => (frequency === 'Monthly' ? 'month' : 'year');

/** One billing period after `from`. Unchanged behaviour from the modal. */
export const addPeriod = (from: Dayjs, frequency: Frequency): Dayjs =>
  from.add(1, unitFor(frequency));

/**
 * The first renewal on or after `asOf`, counted in whole periods from `start`.
 *
 * The modal only ever does `start + 1 period`, which is right when the user is
 * adding something they just bought. It is wrong when they tell the agent
 * "I've had this since January": that lands in February, every chart filters
 * on future dates, and the subscription silently disappears from Insights
 * while still counting toward monthly spend.
 *
 * Each candidate is measured from `start` rather than by stepping the previous
 * candidate forward, because dayjs clamps short months. Stepping would turn a
 * Jan 31 start into Feb 28, then Mar 28, and the day of month would drift.
 */
export const nextRenewalFrom = (
  start: string | Date | Dayjs,
  frequency: Frequency,
  asOf: string | Date | Dayjs = dayjs()
): Dayjs => {
  const anchor = dayjs(start);
  const floor = dayjs(asOf).startOf('day');
  const unit = unitFor(frequency);

  // 40 years of monthly periods. Guards against a garbage start date spinning.
  for (let periods = 1; periods <= 480; periods += 1) {
    const candidate = anchor.add(periods, unit);
    if (!candidate.isBefore(floor, 'day')) return candidate;
  }

  return addPeriod(floor, frequency);
};
