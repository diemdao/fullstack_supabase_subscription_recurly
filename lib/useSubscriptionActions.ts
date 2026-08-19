// Edit and delete wiring shared by the home and subscriptions screens, so both
// lists behave identically and the confirmation copy only exists in one place.
import { useSubscriptionStore } from '@/lib/subscriptionStore';
import { usePostHog } from 'posthog-react-native';
import React from 'react';
import { Alert } from 'react-native';

export const useSubscriptionActions = () => {
  const posthog = usePostHog();
  const editSubscription = useSubscriptionStore((state) => state.editSubscription);
  const removeSubscription = useSubscriptionStore((state) => state.removeSubscription);

  const [editing, setEditing] = React.useState<Subscription | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const stopEdit = React.useCallback(() => setEditing(null), []);

  /** Deleting is destructive and irreversible, so always confirm first. */
  const confirmDelete = React.useCallback(
    (subscription: Subscription) => {
      Alert.alert(
        'Delete subscription',
        `Stop tracking ${subscription.name}? This permanently removes it and cannot be undone.`,
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setDeletingId(subscription.id);
              try {
                await removeSubscription(subscription.id);
                posthog.capture('subscription_deleted', {
                  subscription_name: subscription.name,
                  subscription_category: subscription.category ?? null,
                });
              } finally {
                setDeletingId(null);
              }
            },
          },
        ]
      );
    },
    [posthog, removeSubscription]
  );

  const submitEdit = React.useCallback(
    async (draft: SubscriptionDraft) =>
      editing ? editSubscription(editing.id, draft) : null,
    [editing, editSubscription]
  );

  return { editing, startEdit: setEditing, stopEdit, submitEdit, confirmDelete, deletingId };
};
