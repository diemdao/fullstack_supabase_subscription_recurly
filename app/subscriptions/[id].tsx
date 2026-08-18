import { useSubscriptionStore } from '@/lib/subscriptionStore';
import { formatCurrency, formatStatusLabel, formatSubscriptionDateTime } from '@/lib/utils';
import { Link, useLocalSearchParams } from 'expo-router';
import { styled } from 'nativewind';
import React from 'react';
import { Image, Text, View } from 'react-native';
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';

const SafeAreaView = styled(RNSafeAreaView);

const SubscriptionDetails = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The row is already in the store from the list screens' fetch.
  const subscription = useSubscriptionStore((state) =>
    state.subscriptions.find((item) => item.id === id)
  );

  if (!subscription) {
    return (
      <SafeAreaView className="flex-1 bg-background p-5">
        <Text className="home-empty-state">We could not find that subscription.</Text>
        <Link href="/" className="auth-link">Go back</Link>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <View className="sub-main">
        <Image source={subscription.icon} className="sub-icon" />
        <View className="sub-copy">
          <Text className="sub-title">{subscription.name}</Text>
          <Text className="sub-meta">{subscription.category ?? subscription.plan ?? ''}</Text>
        </View>
      </View>

      <View className="sub-details mt-6">
        <View className="sub-row">
          <View className="sub-row-copy">
            <Text className="sub-label">Price</Text>
            <Text className="sub-value">
              {formatCurrency(subscription.price, subscription.currency)} · {subscription.billing}
            </Text>
          </View>
        </View>

        <View className="sub-row">
          <View className="sub-row-copy">
            <Text className="sub-label">Payment</Text>
            <Text className="sub-value">{subscription.paymentMethod ?? 'Not provided'}</Text>
          </View>
        </View>

        <View className="sub-row">
          <View className="sub-row-copy">
            <Text className="sub-label">Started</Text>
            <Text className="sub-value">{formatSubscriptionDateTime(subscription.startDate)}</Text>
          </View>
        </View>

        <View className="sub-row">
          <View className="sub-row-copy">
            <Text className="sub-label">Renewal Date</Text>
            <Text className="sub-value">{formatSubscriptionDateTime(subscription.renewalDate)}</Text>
          </View>
        </View>

        <View className="sub-row">
          <View className="sub-row-copy">
            <Text className="sub-label">Status</Text>
            <Text className="sub-value">{formatStatusLabel(subscription.status)}</Text>
          </View>
        </View>
      </View>

      <Link href="/" className="auth-link mt-8">Go back</Link>
    </SafeAreaView>
  );
};

export default SubscriptionDetails;
