// Chat state plus proposal commit.
//
// Every write goes through `useSubscriptionStore`, the same path the modal
// uses. That is the whole reason the Edge Function returns proposals instead of
// writing directly: the store already updates the cards optimistically, and the
// Insights charts are pure functions over `subscriptions`, so confirming a
// proposal updates the list and the analytics with nothing extra to wire.

import {
  describeProposal,
  draftFromCreateProposal,
  isDestructive,
  patchFromUpdateProposal,
  sendToAgent,
  type Proposal,
} from '@/lib/agent';
import { useSubscriptionStore } from '@/lib/subscriptionStore';
import { usePostHog } from 'posthog-react-native';
import React from 'react';
import { Alert } from 'react-native';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Rendered as confirm cards beneath an assistant message. */
  proposals?: Proposal[];
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Second gate for destructive proposals. Tapping a card in a chat is a low bar
 * for something irreversible, so deletes and cancels get the same native alert
 * the subscription list uses in `useSubscriptionActions`.
 */
const confirmDestructive = (proposal: Proposal, existing?: Subscription): Promise<boolean> => {
  const isDelete = proposal.action === 'delete';
  const name = existing?.name ?? 'this subscription';

  return new Promise((resolve) => {
    Alert.alert(
      isDelete ? 'Delete subscription' : 'Cancel subscription',
      isDelete
        ? `Stop tracking ${name}? This permanently removes it and cannot be undone.`
        : `Mark ${name} as cancelled? It stops counting toward your monthly spend.`,
      [
        { text: 'Keep', style: 'cancel', onPress: () => resolve(false) },
        {
          text: isDelete ? 'Delete' : 'Cancel it',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      { onDismiss: () => resolve(false) }
    );
  });
};

export const useAgentChat = () => {
  const posthog = usePostHog();

  const subscriptions = useSubscriptionStore((state) => state.subscriptions);
  const addSubscription = useSubscriptionStore((state) => state.addSubscription);
  const patchSubscriptionById = useSubscriptionStore((state) => state.patchSubscriptionById);
  const changeStatus = useSubscriptionStore((state) => state.changeStatus);
  const removeSubscription = useSubscriptionStore((state) => state.removeSubscription);

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState<Record<string, 'done' | 'failed'>>({});

  /** Confirmations since the last turn, folded into the next outbound message. */
  const pendingNotes = React.useRef<string[]>([]);

  // The model is stateless, so the transcript goes back every turn. The shape
  // is the provider's and belongs to the Edge Function — this ref only stores
  // and forwards it.
  const history = React.useRef<unknown[]>([]);

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isThinking) return;

      // Confirmations and dismissals that happened since the last turn, so the
      // model knows what actually landed.
      const notes = pendingNotes.current.splice(0);
      const outbound = notes.length
        ? `[since your last message: ${notes.join(' ')}]\n\n${trimmed}`
        : trimmed;

      setError(null);
      setMessages((current) => [
        ...current,
        { id: newId(), role: 'user', text: trimmed },
      ]);

      setIsThinking(true);

      try {
        const turn = await sendToAgent(outbound, history.current);
        history.current = turn.history;

        setMessages((current) => [
          ...current,
          {
            id: newId(),
            role: 'assistant',
            text: turn.reply,
            proposals: turn.proposals.length > 0 ? turn.proposals : undefined,
          },
        ]);

        posthog.capture('agent_turn_completed', {
          proposal_count: turn.proposals.length,
          proposal_actions: turn.proposals.map((proposal) => proposal.action),
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Something went wrong.');
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, posthog]
  );

  const findExisting = React.useCallback(
    (id?: string) => subscriptions.find((subscription) => subscription.id === id),
    [subscriptions]
  );

  const confirm = React.useCallback(
    async (proposal: Proposal) => {
      const input = proposal.input;
      const existing = findExisting(input.subscriptionId);

      // The row may have been deleted from another screen since the model saw it.
      if (proposal.action !== 'create' && !existing) {
        setApplied((current) => ({ ...current, [proposal.proposalId]: 'failed' }));
        setError('That subscription no longer exists.');
        return;
      }

      if (isDestructive(proposal) && !(await confirmDestructive(proposal, existing))) {
        posthog.capture('agent_proposal_abandoned', { action: proposal.action });
        return;
      }

      try {
        switch (proposal.action) {
          case 'create': {
            const created = await addSubscription(draftFromCreateProposal(input));
            if (!created) throw new Error('Could not save that subscription.');
            break;
          }
          case 'update': {
            const patch = patchFromUpdateProposal(input, existing!);
            const updated = await patchSubscriptionById(existing!.id, patch);
            if (!updated) throw new Error('Could not update that subscription.');
            break;
          }
          // `changeStatus` and `removeSubscription` return void and swallow
          // their own failures — they roll the optimistic update back and put
          // the reason on `state.error` rather than throwing. Awaiting them is
          // therefore not enough to know the write landed. Both clear `error`
          // before they start, so a non-null value here is this call's.
          case 'status_change': {
            await changeStatus(existing!.id, input.status);
            const failure = useSubscriptionStore.getState().error;
            if (failure) throw new Error(failure);
            break;
          }
          case 'delete': {
            await removeSubscription(existing!.id);
            const failure = useSubscriptionStore.getState().error;
            if (failure) throw new Error(failure);
            break;
          }
        }

        setApplied((current) => ({ ...current, [proposal.proposalId]: 'done' }));
        posthog.capture('agent_proposal_confirmed', { action: proposal.action });

        // Keep the transcript honest — otherwise the model's next turn still
        // believes nothing has been saved. Held here and prepended to the next
        // real message, so the client never has to build a provider-shaped turn.
        pendingNotes.current.push(
          `The user confirmed: ${describeProposal(proposal, existing)}. It is now saved.`
        );
      } catch (caught) {
        setApplied((current) => ({ ...current, [proposal.proposalId]: 'failed' }));
        setError(caught instanceof Error ? caught.message : 'Could not apply that change.');
      }
    },
    [addSubscription, changeStatus, findExisting, patchSubscriptionById, posthog, removeSubscription]
  );

  const dismiss = React.useCallback((proposal: Proposal) => {
    setApplied((current) => ({ ...current, [proposal.proposalId]: 'failed' }));
    pendingNotes.current.push('The user declined that change.');
  }, []);

  const reset = React.useCallback(() => {
    history.current = [];
    pendingNotes.current = [];
    setMessages([]);
    setApplied({});
    setError(null);
  }, []);

  return { messages, isThinking, error, applied, send, confirm, dismiss, reset };
};
