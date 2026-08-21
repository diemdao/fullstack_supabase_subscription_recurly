// Assistant tab.
//
// Every write goes through `useAgentChat` — the screen never calls
// `sendToAgent` or the store directly. It reads `subscriptions` only to name
// the row a proposal points at.
//
// The card's whole job is the confirmation gate: a value the model worked out
// must not be mistakable for one the user gave. Provenance is carried by
// position (below the rule), ground (tinted block), treatment (accent chip)
// and a count in the heading, so failing to register one channel still leaves
// three.
import { colors, components, spacing } from '@/constants/theme';
import '@/global.css';
import {
  describeProposal,
  draftFromCreateProposal,
  inferredFields,
  isDestructive,
  patchFromUpdateProposal,
  type Proposal,
} from '@/lib/agent';
import { iconForKey } from '@/lib/subscriptions';
import { useSubscriptionStore } from '@/lib/subscriptionStore';
import { useAgentChat, type ChatMessage, type DismissIntent, type ProposalOutcome } from '@/lib/useAgentChat';
import { formatCurrency, formatStatusLabel, formatSubscriptionDateTime } from '@/lib/utils';
import Ionicons from '@expo/vector-icons/Ionicons';
import clsx from 'clsx';
import { styled } from 'nativewind';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView as RNSafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const SafeAreaView = styled(RNSafeAreaView);

const tabBar = components.tabBar;

const EXAMPLES = [
  "I've paid for Figma since January, $12 a month",
  'Change Netflix to $19',
  'What am I paying for this month?',
];

const CADENCE_WORD: Record<string, string> = {
  Monthly: 'a month',
  Yearly: 'a year',
};

/** Told fields rendered as rows, in card order. Price and cadence are handled
 *  by the summary line on a create, so they are absent here. */
const CREATE_ROW_FIELDS = ['startDate', 'plan', 'paymentMethod', 'category', 'status', 'iconKey'];

const UPDATE_ROW_FIELDS = [
  'price',
  'frequency',
  'startDate',
  'plan',
  'paymentMethod',
  'category',
  'status',
  'currency',
  'iconKey',
];

const ROW_LABELS: Record<string, string> = {
  price: 'Price',
  currency: 'Currency',
  frequency: 'Cadence',
  category: 'Category',
  status: 'Status',
  plan: 'Plan',
  paymentMethod: 'Payment method',
  startDate: 'Started',
  renewalDate: 'Renews',
  iconKey: 'Icon',
};

/**
 * Mirrors the filter inside `inferredFields` so the keys line up index for
 * index with the labels it returns. `inferredFields` gives labels only, and
 * the card needs the values too.
 */
const inferredKeys = (proposal: Proposal): string[] => {
  const declared = proposal.input.inferred;
  if (!Array.isArray(declared)) return [];
  return declared.filter(
    (field: unknown): field is string =>
      typeof field === 'string' && proposal.input[field] !== undefined
  );
};

const formatValue = (key: string, value: unknown, currency?: string): string => {
  if (value === undefined || value === null) return '—';
  switch (key) {
    case 'price':
      return formatCurrency(Number(value), currency ?? 'USD');
    case 'startDate':
    case 'renewalDate':
      return formatSubscriptionDateTime(String(value));
    case 'status':
      return formatStatusLabel(String(value));
    default:
      return String(value);
  }
};

interface Row {
  key: string;
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Proposal card
// ---------------------------------------------------------------------------

interface ProposalCardProps {
  proposal: Proposal;
  existing?: Subscription;
  outcome?: ProposalOutcome;
  busy: boolean;
  index: number;
  total: number;
  errorText: string | null;
  onConfirm: (proposal: Proposal) => void;
  onDismiss: (proposal: Proposal, intent: DismissIntent) => void;
}

const ProposalCard = ({
  proposal,
  existing,
  outcome,
  busy,
  index,
  total,
  errorText,
  onConfirm,
  onDismiss,
}: ProposalCardProps) => {
  const input = proposal.input;

  // A confirmed delete removes the row from the store, so `existing` goes
  // undefined right when the spent card needs to name it. Hold the first name
  // we see for the life of the card.
  const remembered = React.useRef<string | undefined>(undefined);
  if (existing?.name && !remembered.current) remembered.current = existing.name;
  const name: string = existing?.name ?? remembered.current ?? 'that subscription';

  const guessedKeys = React.useMemo(() => inferredKeys(proposal), [proposal]);

  const worked = React.useMemo<Row[]>(() => {
    const labels = inferredFields(proposal);
    const rows = new Map<string, Row>();

    guessedKeys.forEach((key, position) => {
      rows.set(key, {
        key,
        label: labels[position] ?? ROW_LABELS[key] ?? key,
        value: formatValue(key, input[key], input.currency),
      });
    });

    // Values the app derives rather than the model proposing them. They are
    // never in `inferred`, but they are just as much "not your words" — and
    // the renewal date decides whether this ever shows up in Insights.
    if (proposal.action === 'create') {
      const draft = draftFromCreateProposal(input);
      if (!rows.has('renewalDate')) {
        rows.set('renewalDate', {
          key: 'renewalDate',
          label: ROW_LABELS.renewalDate,
          value: formatValue('renewalDate', draft.renewalDate),
        });
      }
      if (!input.startDate && !rows.has('startDate')) {
        rows.set('startDate', {
          key: 'startDate',
          label: ROW_LABELS.startDate,
          value: formatValue('startDate', draft.startDate),
        });
      }
      if (draft.iconKey && draft.iconKey !== input.iconKey && !rows.has('iconKey')) {
        rows.set('iconKey', {
          key: 'iconKey',
          label: ROW_LABELS.iconKey,
          value: String(draft.iconKey),
        });
      }
    }

    if (proposal.action === 'update' && existing) {
      const patch = patchFromUpdateProposal(input, existing);
      if (patch.renewalDate && !rows.has('renewalDate')) {
        rows.set('renewalDate', {
          key: 'renewalDate',
          label: ROW_LABELS.renewalDate,
          value: formatValue('renewalDate', patch.renewalDate),
        });
      }
    }

    return [...rows.values()];
  }, [proposal, input, guessedKeys, existing]);

  const told = React.useMemo<Row[]>(() => {
    const fields =
      proposal.action === 'create'
        ? CREATE_ROW_FIELDS
        : proposal.action === 'update'
          ? UPDATE_ROW_FIELDS
          : [];
    return fields
      .filter((key) => input[key] !== undefined && !guessedKeys.includes(key))
      .map((key) => ({
        key,
        label: ROW_LABELS[key] ?? key,
        value: formatValue(key, input[key], input.currency),
      }));
  }, [proposal.action, input, guessedKeys]);

  // Headline. `describeProposal` folds price and cadence into a create's
  // headline and `losing` into a delete's, either of which would state a
  // guessed value as fact above the rule. Compose those two here instead.
  const headline =
    proposal.action === 'create'
      ? `Add ${String(input.name ?? '').trim()}`
      : proposal.action === 'delete'
        ? `Delete ${name}`
        : describeProposal(proposal, existing);

  // Price is never inferrable, so it always belongs to the user. The cadence
  // word joins it only when the user actually gave the cadence.
  const summary =
    proposal.action === 'create' && input.price !== undefined
      ? `${formatCurrency(Number(input.price), input.currency)}${
          !guessedKeys.includes('frequency') && CADENCE_WORD[input.frequency]
            ? ` ${CADENCE_WORD[input.frequency]}`
            : ''
        }`
      : null;

  // --- spent states --------------------------------------------------------

  if (outcome === 'done' || outcome === 'dismissed') {
    const done = outcome === 'done';
    const spent = done
      ? proposal.action === 'create'
        ? `Added ${String(input.name ?? '').trim()}`
        : proposal.action === 'update'
          ? `Updated ${name}`
          : proposal.action === 'delete'
            ? `Deleted ${name}`
            : `Marked ${name} as ${input.status}`
      : `Skipped — ${headline.charAt(0).toLowerCase()}${headline.slice(1)}`;

    return (
      <View className="chat-card-spent">
        <Text
          className="chat-spent-mark"
          style={{ color: done ? colors.success : colors.mutedForeground }}
        >
          {done ? '✓' : '✕'}
        </Text>
        <Text className="chat-spent-text">{spent}</Text>
      </View>
    );
  }

  if (outcome === 'failed') {
    const verb =
      proposal.action === 'create'
        ? `add ${String(input.name ?? '').trim()}`
        : proposal.action === 'update'
          ? `update ${name}`
          : proposal.action === 'delete'
            ? `delete ${name}`
            : `change ${name}`;

    return (
      <View className="chat-card-failed">
        <Text className="chat-failed-title">Couldn&apos;t {verb}</Text>
        {errorText && <Text className="chat-failed-reason">{errorText}</Text>}
        <Pressable
          className="chat-retry"
          onPress={() => onConfirm(proposal)}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text className="chat-retry-text">Try again</Text>
          )}
        </Pressable>
      </View>
    );
  }

  // --- pending -------------------------------------------------------------

  const isDelete = proposal.action === 'delete';
  const isCancel = proposal.action === 'status_change' && input.status === 'cancelled';
  const hasGuesses = worked.length > 0;

  const primaryLabel = isDelete
    ? 'Delete it'
    : isCancel
      ? 'Cancel it'
      : hasGuesses
        ? 'Looks right'
        : proposal.action === 'create'
          ? 'Add it'
          : 'Update it';

  const secondaryLabel = isDestructive(proposal) ? 'Keep it' : hasGuesses ? 'Fix it' : 'Discard';
  const secondaryIntent: DismissIntent = !isDestructive(proposal) && hasGuesses ? 'correcting' : 'declined';

  return (
    <View className="chat-card">
      <View className="chat-card-head">
        <Text className="chat-card-title">{headline}</Text>
        {total > 1 && (
          <Text className="chat-card-count">
            {index + 1} of {total}
          </Text>
        )}
      </View>

      {summary && <Text className="chat-card-summary">{summary}</Text>}

      {told.length > 0 && (
        <View className="chat-rows">
          {told.map((row) => (
            <View key={row.key} className="chat-row">
              <Text className="chat-row-label">{row.label}</Text>
              <Text className="chat-row-value" numberOfLines={1}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {isDelete && input.losing && (
        <View className="chat-losing">
          <Text className="chat-losing-label">You lose</Text>
          <Text className="chat-losing-text">{String(input.losing)}</Text>
        </View>
      )}

      {hasGuesses && (
        <View className="chat-worked">
          <Text className="chat-worked-head">
            I worked out {worked.length} of these. Check them.
          </Text>
          {worked.map((row) => (
            <View key={row.key} className="chat-worked-row">
              <Text className="chat-worked-label">{row.label}</Text>
              <View className="chat-worked-chip">
                {row.key === 'iconKey' ? (
                  <Image
                    source={iconForKey(row.value)}
                    className="chat-worked-glyph"
                    resizeMode="contain"
                  />
                ) : (
                  <Text className="chat-worked-chip-text">{row.value}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <View className="chat-actions">
        <Pressable
          className={clsx(
            'chat-confirm',
            isDelete && 'chat-confirm-danger',
            busy && 'chat-action-disabled'
          )}
          onPress={() => onConfirm(proposal)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${primaryLabel}. ${headline}`}
        >
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text className="chat-confirm-text">{primaryLabel}</Text>
          )}
        </Pressable>

        <Pressable
          className={clsx('chat-secondary', busy && 'chat-action-disabled')}
          onPress={() => onDismiss(proposal, secondaryIntent)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text className="chat-secondary-text">{secondaryLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type TranscriptRow =
  | { kind: 'thinking'; id: string }
  | { kind: 'message'; id: string; message: ChatMessage };

const Chat = () => {
  const insets = useSafeAreaInsets();
  const { messages, isThinking, error, applied, send, confirm, dismiss } = useAgentChat();
  const subscriptions = useSubscriptionStore((state) => state.subscriptions);

  const [draft, setDraft] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [keyboardUp, setKeyboardUp] = React.useState(false);
  const inputRef = React.useRef<TextInput>(null);

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // The tab bar is absolute, so the input has to clear it itself. Once the
  // keyboard is up the keyboard covers the tab bar and the input sits on it.
  const tabBarClearance =
    Math.max(insets.bottom, tabBar.horizontalInset) + tabBar.height + spacing[3];

  const rows = React.useMemo<TranscriptRow[]>(() => {
    // The list is inverted, so the newest row goes first.
    const transcript: TranscriptRow[] = [...messages]
      .reverse()
      .map((message) => ({ kind: 'message' as const, id: message.id, message }));
    return isThinking ? [{ kind: 'thinking', id: '__thinking__' }, ...transcript] : transcript;
  }, [messages, isThinking]);

  const findExisting = React.useCallback(
    (id?: string) => subscriptions.find((subscription) => subscription.id === id),
    [subscriptions]
  );

  const handleSend = React.useCallback(() => {
    const text = draft.trim();
    if (!text || isThinking) return;
    setDraft('');
    send(text);
  }, [draft, isThinking, send]);

  const handleConfirm = React.useCallback(
    async (proposal: Proposal) => {
      // `confirm` has no per-proposal pending state, so guard the double tap here.
      if (busyId) return;
      setBusyId(proposal.proposalId);
      try {
        await confirm(proposal);
      } finally {
        setBusyId(null);
      }
    },
    [busyId, confirm]
  );

  const handleDismiss = React.useCallback(
    (proposal: Proposal, intent: DismissIntent) => {
      dismiss(proposal, intent);
      // "Fix it" means a correction is coming — open the keyboard for it.
      if (intent === 'correcting') inputRef.current?.focus();
    },
    [dismiss]
  );

  const applyExample = React.useCallback((text: string) => {
    // Prefills rather than sends: an accidental tap should not spend a turn,
    // and the phrasing is meant to be edited into the user's own truth.
    setDraft(text);
    inputRef.current?.focus();
  }, []);

  const renderRow = React.useCallback(
    ({ item }: { item: TranscriptRow }) => {
      if (item.kind === 'thinking') {
        return (
          <View className="chat-thinking">
            <View className="chat-thinking-dot" />
            <View className="chat-thinking-dot" />
            <View className="chat-thinking-dot" />
          </View>
        );
      }

      const { message } = item;

      if (message.role === 'user') {
        return (
          <View className="chat-msg-user">
            <Text className="chat-msg-user-text">{message.text}</Text>
          </View>
        );
      }

      const proposals = message.proposals ?? [];

      return (
        <View className="chat-group">
          {message.text.length > 0 && (
            <View className="chat-msg-agent">
              <Text className="chat-msg-agent-text">{message.text}</Text>
            </View>
          )}

          {proposals.map((proposal, index) => (
            <ProposalCard
              key={proposal.proposalId}
              proposal={proposal}
              existing={findExisting(proposal.input.subscriptionId)}
              outcome={applied[proposal.proposalId]}
              busy={busyId === proposal.proposalId}
              index={index}
              total={proposals.length}
              errorText={error}
              onConfirm={handleConfirm}
              onDismiss={handleDismiss}
            />
          ))}
        </View>
      );
    },
    [applied, busyId, error, findExisting, handleConfirm, handleDismiss]
  );

  const canSend = draft.trim().length > 0 && !isThinking;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <Text className="chat-title">Assistant</Text>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 && !isThinking ? (
          <View className="chat-empty">
            <Text className="chat-empty-title">Tell me about a subscription</Text>
            <Text className="chat-empty-body">
              Say it however you&apos;d say it out loud. I&apos;ll draft the change — you confirm
              before anything saves.
            </Text>

            <View className="chat-examples">
              {EXAMPLES.map((example) => (
                <Pressable
                  key={example}
                  className="chat-example"
                  onPress={() => applyExample(example)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use example: ${example}`}
                >
                  <Text className="chat-example-text">{example}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            contentContainerStyle={{ paddingHorizontal: spacing[5], paddingVertical: spacing[3] }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}

        {/* About the request, not part of the conversation — so it sits here
            rather than in the transcript, where it would scroll away. */}
        {error && <Text className="chat-error">{error}</Text>}

        <View
          className="chat-input-bar"
          style={{ paddingBottom: keyboardUp ? spacing[3] : tabBarClearance }}
        >
          <TextInput
            ref={inputRef}
            className="chat-input"
            placeholder="Ask about a subscription"
            placeholderTextColor={colors.mutedForeground}
            value={draft}
            onChangeText={setDraft}
            multiline
            accessibilityLabel="Message the assistant"
          />
          <Pressable
            className={clsx('chat-send', !canSend && 'chat-send-disabled')}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Ionicons name="arrow-up" size={20} color={canSend ? '#ffffff' : colors.mutedForeground} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default Chat;
