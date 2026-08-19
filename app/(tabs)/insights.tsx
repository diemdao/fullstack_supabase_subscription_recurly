import ListHeading from "@/components/ListHeading";
import UpcomingRenewalsChart from "@/components/UpcomingRenewalsChart";
import "@/global.css";
import { useAuth } from "@/lib/auth";
import { useSubscriptionStore } from "@/lib/subscriptionStore";
import { renewalsByMonthBlock, renewalsByWeekday } from "@/lib/subscriptions";
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

const Insights = () => {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [range, setRange] = useState<Range>('week');

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

  const buckets = useMemo(
    () =>
      range === 'week'
        ? renewalsByWeekday(subscriptions)
        : renewalsByMonthBlock(subscriptions),
    [range, subscriptions]
  );

  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <Text className="insights-title mt-5">Insights</Text>

        {error && <Text className="auth-error">{error}</Text>}

        <ListHeading
          title="Upcoming"
          onActionPress={() => router.push('/(tabs)/subscriptions')}
        />

        {/* Range tabs — same segmented control the create form uses. */}
        <View className="picker-row mb-5">
          {RANGES.map((option) => (
            <Pressable
              key={option.value}
              className={clsx('picker-option', range === option.value && 'picker-option-active')}
              onPress={() => setRange(option.value)}
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

        {isLoading && !hasLoaded ? (
          <ActivityIndicator className="mt-6" />
        ) : (
          <UpcomingRenewalsChart
            // Remount on range change so the preselected bar resets cleanly.
            key={range}
            data={buckets}
            totalLabel={range === 'week' ? 'Due this week' : 'Due this month'}
            emptyMessage={
              range === 'week' ? 'Nothing renewing this week.' : 'Nothing renewing this month.'
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default Insights;
