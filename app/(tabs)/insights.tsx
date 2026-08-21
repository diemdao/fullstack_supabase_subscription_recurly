import ListHeading from "@/components/ListHeading";
import UpcomingRenewalsChart from "@/components/UpcomingRenewalsChart";
import "@/global.css";
import { useAuth } from "@/lib/auth";
import { useSubscriptionStore } from "@/lib/subscriptionStore";
import {
  renewalsByMonthBlock,
  renewalsByWeekday,
  totalsByMonthBlock,
  totalsByWeekday,
} from "@/lib/subscriptions";
import clsx from "clsx";
import { useRouter } from "expo-router";
import { styled } from "nativewind";
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";

const SafeAreaView = styled(RNSafeAreaView);

type Range = 'week' | 'month';

const RANGES = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
] as const;

/** The segmented control both sections use, so the two look identical. */
const RangeToggle = ({
  range,
  onChange,
}: {
  range: Range;
  onChange: (next: Range) => void;
}) => (
  <View className="picker-row mb-5">
    {RANGES.map((option) => (
      <Pressable
        key={option.value}
        className={clsx('picker-option', range === option.value && 'picker-option-active')}
        onPress={() => onChange(option.value)}
        accessibilityRole="button"
        accessibilityState={{ selected: range === option.value }}
      >
        <Text
          className={clsx(
            'picker-option-text',
            range === option.value && 'picker-option-text-active'
          )}
        >
          {option.label}
        </Text>
      </Pressable>
    ))}
  </View>
);

const Insights = () => {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  // Independent ranges: comparing what was charged this month against what is
  // still due this week is a reasonable thing to want on one screen.
  const [totalRange, setTotalRange] = useState<Range>('week');
  const [upcomingRange, setUpcomingRange] = useState<Range>('week');

  const subscriptions = useSubscriptionStore((state) => state.subscriptions);
  const isLoading = useSubscriptionStore((state) => state.isLoading);
  const hasLoaded = useSubscriptionStore((state) => state.hasLoaded);
  const error = useSubscriptionStore((state) => state.error);
  const loadSubscriptions = useSubscriptionStore((state) => state.loadSubscriptions);

  // Covers landing here first, before the other tabs have fetched.
  useEffect(() => {
    if (isSignedIn && !hasLoaded) {
      loadSubscriptions();
    }
  }, [isSignedIn, hasLoaded, loadSubscriptions]);

  // Every billing occurrence inside the window, derived from each start date —
  // so a charge that already happened still counts.
  const totalBuckets = useMemo(
    () =>
      totalRange === 'week'
        ? totalsByWeekday(subscriptions)
        : totalsByMonthBlock(subscriptions),
    [totalRange, subscriptions]
  );

  // The stored `renewalDate` only, so each subscription lands on at most one
  // bar and only ever a future one.
  const upcomingBuckets = useMemo(
    () =>
      upcomingRange === 'week'
        ? renewalsByWeekday(subscriptions)
        : renewalsByMonthBlock(subscriptions),
    [upcomingRange, subscriptions]
  );

  const isFirstLoad = isLoading && !hasLoaded;

  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <Text className="insights-title mt-5">Insights</Text>

        {error && <Text className="auth-error">{error}</Text>}

        <ListHeading
          title="Total"
          onActionPress={() => router.push('/(tabs)/subscriptions')}
        />

        <RangeToggle range={totalRange} onChange={setTotalRange} />

        {isFirstLoad ? (
          <ActivityIndicator className="mt-6" />
        ) : (
          <UpcomingRenewalsChart
            // Remount on range change so the preselected bar resets cleanly.
            key={`total-${totalRange}`}
            data={totalBuckets}
            // Not "Spent": the window runs to the end of the period, so part
            // of this total has not been charged yet.
            totalLabel={totalRange === 'week' ? 'This week' : 'This month'}
            emptyMessage={
              totalRange === 'week' ? 'No charges this week.' : 'No charges this month.'
            }
          />
        )}

        <ListHeading
          title="Upcoming"
          onActionPress={() => router.push('/(tabs)/subscriptions')}
        />

        <RangeToggle range={upcomingRange} onChange={setUpcomingRange} />

        {isFirstLoad ? (
          <ActivityIndicator className="mt-6" />
        ) : (
          <UpcomingRenewalsChart
            key={`upcoming-${upcomingRange}`}
            data={upcomingBuckets}
            totalLabel={upcomingRange === 'week' ? 'Due this week' : 'Due this month'}
            emptyMessage={
              upcomingRange === 'week' ? 'Nothing renewing this week.' : 'Nothing renewing this month.'
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default Insights;
