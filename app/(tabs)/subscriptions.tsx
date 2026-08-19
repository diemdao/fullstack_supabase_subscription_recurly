import CreateSubscriptionModal from "@/components/CreateSubscriptionModal";
import SubscriptionCard from "@/components/SubscriptionCard";
import { useAuth } from "@/lib/auth";
import { useSubscriptionStore } from "@/lib/subscriptionStore";
import { useSubscriptionActions } from "@/lib/useSubscriptionActions";
import { styled } from "nativewind";
import { usePostHog } from "posthog-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native';
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";

const SafeAreaView = styled(RNSafeAreaView);

const Subscriptions = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const { isSignedIn } = useAuth();
    const subscriptions = useSubscriptionStore((state) => state.subscriptions);
    const isLoading = useSubscriptionStore((state) => state.isLoading);
    const isRefreshing = useSubscriptionStore((state) => state.isRefreshing);
    const hasLoaded = useSubscriptionStore((state) => state.hasLoaded);
    const error = useSubscriptionStore((state) => state.error);
    const loadSubscriptions = useSubscriptionStore((state) => state.loadSubscriptions);
    const actions = useSubscriptionActions();
    const posthog = usePostHog();

    // Covers landing here directly (deep link) before the home tab has loaded.
    useEffect(() => {
        if (isSignedIn && !hasLoaded) {
            loadSubscriptions();
        }
    }, [isSignedIn, hasLoaded, loadSubscriptions]);

    const filteredSubscriptions = subscriptions.filter((subscription) =>
        subscription.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subscription.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subscription.plan?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <SafeAreaView className="flex-1 bg-background">
            <FlatList
                data={filteredSubscriptions}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={
                    <View >
                        <Text className="text-3xl font-bold text-dark mt-5">My Subscriptions</Text>
                        <View className=" pt-5 ">
                          <TextInput
                            className="bg-card rounded-xl px-4 py-3 mb-4 border border-gray-300 text-[14px] font-sans-medium text-primary"
                            placeholder="Search subscriptions, category, plan..."
                            placeholderTextColor="#666"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onBlur={() => {
                              if (searchQuery.trim()) {
                                posthog.capture('subscription_searched', {
                                  result_count: filteredSubscriptions.length,
                                });
                              }
                            }}
                          />
                        </View>

                        {error && <Text className="auth-error">{error}</Text>}

                    </View>
                }
                renderItem={({ item }) => (
                    <SubscriptionCard
                        {...item}
                        expanded={expandedId === item.id}
                        onPress={() => {
                            const isExpanding = expandedId !== item.id;
                            setExpandedId(expandedId === item.id ? null : item.id);
                            if (isExpanding) {
                                posthog.capture('subscription_card_expanded', {
                                    subscription_name: item.name,
                                    subscription_category: item.category ?? null,
                                    subscription_frequency: item.frequency ?? null,
                                });
                            }
                        }}
                        onEditPress={() => actions.startEdit(item)}
                        onDeletePress={() => actions.confirmDelete(item)}
                        isDeleting={actions.deletingId === item.id}
                    />
                )}
                extraData={`${expandedId}:${actions.deletingId}`}
                refreshing={isRefreshing}
                onRefresh={() => loadSubscriptions({ refresh: true })}
                ListEmptyComponent={
                    isLoading && !hasLoaded ? (
                        <ActivityIndicator className="mt-6" />
                    ) : (
                        <Text className="home-empty-state">
                            {searchQuery.trim() ? 'No matching subscriptions.' : 'No subscriptions yet.'}
                        </Text>
                    )
                }
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 12 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"

                // on-drag when we click out or drag the screen again outside the key board, the key board will stop
            />

            <CreateSubscriptionModal
                visible={actions.editing !== null}
                subscription={actions.editing}
                onClose={actions.stopEdit}
                onSubmit={actions.submitEdit}
            />
        </SafeAreaView>
    )
}
export default Subscriptions