import type { Status } from '@/constants/subscriptions';
import {
  createSubscription,
  deleteSubscription,
  fetchSubscriptions,
  patchSubscription,
  updateSubscription,
  updateSubscriptionStatus,
} from '@/lib/subscriptions';
import { create } from 'zustand';

const messageFor = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

interface SubscriptionStore {
  subscriptions: Subscription[];
  /** True during the first load for a session; screens use it for a spinner. */
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasLoaded: boolean;

  loadSubscriptions: (options?: { refresh?: boolean }) => Promise<void>;
  addSubscription: (draft: SubscriptionDraft) => Promise<Subscription | null>;
  editSubscription: (id: string, draft: SubscriptionDraft) => Promise<Subscription | null>;
  /** Writes only the supplied fields. Used by the agent, which sends partials. */
  patchSubscriptionById: (
    id: string,
    patch: Partial<SubscriptionDraft>
  ) => Promise<Subscription | null>;
  changeStatus: (id: string, status: Status) => Promise<void>;
  cancelSubscription: (id: string) => Promise<void>;
  removeSubscription: (id: string) => Promise<void>;
  setSubscriptions: (subscriptions: Subscription[]) => void;
  /** Drop all cached rows — called on sign-out so the next user starts clean. */
  reset: () => void;
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  isLoading: false,
  isRefreshing: false,
  error: null,
  hasLoaded: false,

  loadSubscriptions: async (options) => {
    const refresh = options?.refresh ?? false;

    // The home and subscriptions tabs both kick off a load on mount; without
    // this the two would race and fetch the same rows twice.
    const { isLoading, isRefreshing } = get();
    if (isLoading || isRefreshing) return;

    set(refresh ? { isRefreshing: true, error: null } : { isLoading: true, error: null });

    try {
      const subscriptions = await fetchSubscriptions();
      set({ subscriptions, hasLoaded: true });
    } catch (error) {
      set({ error: messageFor(error) });
    } finally {
      set({ isLoading: false, isRefreshing: false });
    }
  },

  addSubscription: async (draft) => {
    set({ error: null });
    try {
      const created = await createSubscription(draft);
      set((state) => ({ subscriptions: [created, ...state.subscriptions] }));
      return created;
    } catch (error) {
      set({ error: messageFor(error) });
      return null;
    }
  },

  editSubscription: async (id, draft) => {
    set({ error: null });
    try {
      const updated = await updateSubscription(id, draft);
      set((state) => ({
        subscriptions: state.subscriptions.map((subscription) =>
          subscription.id === id ? updated : subscription
        ),
      }));
      return updated;
    } catch (error) {
      set({ error: messageFor(error) });
      return null;
    }
  },

  patchSubscriptionById: async (id, patch) => {
    set({ error: null });
    try {
      const updated = await patchSubscription(id, patch);
      set((state) => ({
        subscriptions: state.subscriptions.map((subscription) =>
          subscription.id === id ? updated : subscription
        ),
      }));
      return updated;
    } catch (error) {
      set({ error: messageFor(error) });
      return null;
    }
  },

  changeStatus: async (id, status) => {
    const previous = get().subscriptions;
    // Optimistic: flip the badge immediately, roll back if the write fails.
    set({
      error: null,
      subscriptions: previous.map((subscription) =>
        subscription.id === id ? { ...subscription, status } : subscription
      ),
    });

    try {
      const updated = await updateSubscriptionStatus(id, status);
      set((state) => ({
        subscriptions: state.subscriptions.map((subscription) =>
          subscription.id === id ? updated : subscription
        ),
      }));
    } catch (error) {
      set({ subscriptions: previous, error: messageFor(error) });
    }
  },

  // One status-write path: the swipe action and the agent both land here.
  cancelSubscription: (id) => get().changeStatus(id, 'cancelled'),

  removeSubscription: async (id) => {
    const previous = get().subscriptions;
    set({
      error: null,
      subscriptions: previous.filter((subscription) => subscription.id !== id),
    });

    try {
      await deleteSubscription(id);
    } catch (error) {
      set({ subscriptions: previous, error: messageFor(error) });
    }
  },

  setSubscriptions: (subscriptions) => set({ subscriptions }),

  reset: () =>
    set({
      subscriptions: [],
      isLoading: false,
      isRefreshing: false,
      error: null,
      hasLoaded: false,
    }),
}));
