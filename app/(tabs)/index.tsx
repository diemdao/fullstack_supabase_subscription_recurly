import CreateSubscriptionModal from "@/components/CreateSubscriptionModal";
import ListHeading from "@/components/ListHeading";
import SubscriptionCard from "@/components/SubscriptionCard";
import UpcomingSubscriptionCard from "@/components/UpcomingSubscriptionCard";
import { HOME_USER } from "@/constants/data";
import { icons } from "@/constants/icons";
import images from "@/constants/images";
import "@/global.css";
import { avatarUrlFor, displayNameFor, useAuth } from "@/lib/auth";
import { useSubscriptionStore } from "@/lib/subscriptionStore";
import { monthlySpend, nextRenewalDate, upcomingRenewals } from "@/lib/subscriptions";
import { formatCurrency } from "@/lib/utils";
import dayjs from "dayjs";
import { styled } from "nativewind";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";


const SafeAreaView = styled(RNSafeAreaView);

export default function App() {

  const [expandedSubscriptionId, setExpandedSubscriptionId] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const { user, isSignedIn } = useAuth();
  const subscriptions = useSubscriptionStore((state) => state.subscriptions);
  const isLoading = useSubscriptionStore((state) => state.isLoading);
  const isRefreshing = useSubscriptionStore((state) => state.isRefreshing);
  const hasLoaded = useSubscriptionStore((state) => state.hasLoaded);
  const error = useSubscriptionStore((state) => state.error);
  const loadSubscriptions = useSubscriptionStore((state) => state.loadSubscriptions);
  const addSubscription = useSubscriptionStore((state) => state.addSubscription);

  // Pull the user's rows once per signed-in session; `AuthSync` clears the
  // cache on sign-out so the next user re-fetches instead of seeing stale data.
  useEffect(() => {
    if (isSignedIn && !hasLoaded) {
      loadSubscriptions();
    }
  }, [isSignedIn, hasLoaded, loadSubscriptions]);

  const displayName = displayNameFor(user) ?? HOME_USER.name;
  const avatarUrl = avatarUrlFor(user);
  const avatarSource = avatarUrl ? { uri: avatarUrl } : images.avatar;

  // The balance card and the "Upcoming" rail are now derived from the user's
  // real subscriptions rather than the mock constants.
  const balance = useMemo(() => monthlySpend(subscriptions), [subscriptions]);
  const nextRenewal = useMemo(() => nextRenewalDate(subscriptions), [subscriptions]);
  const upcoming = useMemo(() => upcomingRenewals(subscriptions), [subscriptions]);

  const showInitialSpinner = isLoading && !hasLoaded;

  return (
    <SafeAreaView className="flex-1 bg-background p-5">

        
        <FlatList 
          ListHeaderComponent={ () => <> 
          
              <View className="home-header"> 
                <View className="home-user">
                  <Image source={avatarSource} className="home-avatar"/>
                  <Text className="home-user-name">{displayName}</Text>
                </View>

                <Pressable onPress={() => setIsModalVisible(true)}>
                  <Image source={icons.add} className="home-add-icon"/>
                </Pressable>
              </View>

              <View className="home-balance-card">
                <Text className="home-balance-label">Balance</Text>
                <View className="home-balance-row">
                  <Text className="home-balance-amount">
                    {formatCurrency(balance)}
                  </Text>
                  <Text className="home-balance-date"> 
                    {nextRenewal ? dayjs(nextRenewal).format("MM/DD") : "—"}
                    </Text>
                </View>
              </View>

              <View className="mb-5">
                <ListHeading title="Upcoming"/>
                                
                <FlatList
                  data={upcoming}
                  renderItem={({ item }) => <UpcomingSubscriptionCard {...item} />}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  ListEmptyComponent={<Text className="home-empty-state">No upcoming renewals yet.</Text>}
                />
              </View>

              {error && <Text className="auth-error">{error}</Text>}

              <ListHeading title="All Subscriptions"/>
          
          </>}

          data={subscriptions}
          keyExtractor={(item) => item.id}

          renderItem={({ item }) => (
            <SubscriptionCard
              {...item}
              expanded={expandedSubscriptionId === item.id}
              onPress={() => setExpandedSubscriptionId((currentId) => (currentId) === item.id ? null : item.id)}
            />
          )}
          extraData ={expandedSubscriptionId}
          ItemSeparatorComponent={() => <View className="h-4"/>}
          showsVerticalScrollIndicator={false}
          refreshing={isRefreshing}
          onRefresh={() => loadSubscriptions({ refresh: true })}
          ListEmptyComponent={
            showInitialSpinner ? (
              <ActivityIndicator className="mt-6" />
            ) : (
              <Text className="home-empty-state">No subscriptions yet.</Text>
            )
          }

          contentContainerClassName="pb-30"
        />

        <CreateSubscriptionModal
          visible={isModalVisible}
          onClose={() => setIsModalVisible(false)}
          onSubmit={addSubscription}
        />


    </SafeAreaView>
  );
}
