// Sticky header for the grouped subscription lists. Shared by the Home and
// Subscriptions screens so the two cannot drift apart.
import type { SubscriptionSection } from '@/lib/subscriptions';
import React from 'react';
import { Text, View } from 'react-native';

const SubscriptionSectionHeader = ({ section }: { section: SubscriptionSection }) => (
  <View className="sub-section-head">
    <Text className="sub-section-title">{section.title}</Text>
    <View className="sub-section-count">
      <Text className="sub-section-count-text">{section.data.length}</Text>
    </View>
  </View>
);

export default SubscriptionSectionHeader;
