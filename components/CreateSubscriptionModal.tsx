import { colors } from '@/constants/theme';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { usePostHog } from 'posthog-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

interface CreateSubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  /** Persists the draft; resolves to null when the write failed. */
  onSubmit: (draft: SubscriptionDraft) => Promise<Subscription | null>;
}

type Frequency = 'Monthly' | 'Yearly';
type Category =
  | 'Entertainment'
  | 'AI Tools'
  | 'Developer Tools'
  | 'Design'
  | 'Productivity'
  | 'Cloud'
  | 'Music'
  | 'Other';
const CATEGORIES: Category[] = [
  'Entertainment',
  'AI Tools',
  'Developer Tools',
  'Design',
  'Productivity',
  'Cloud',
  'Music',
  'Other',
];
const CATEGORY_COLORS: Record<Category, string> = {
  'Entertainment': '#ff6b6b',
  'AI Tools': '#b8d4e3',
  'Developer Tools': '#e8def8',
  'Design': '#f5c542',
  'Productivity': '#95e1d3',
  'Cloud': '#a8d8ea',
  'Music': '#e2b6cf',
  'Other': '#d4d4d4',
};

const CreateSubscriptionModal = ({ visible, onClose, onSubmit }: CreateSubscriptionModalProps) => {
  const posthog = usePostHog();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('Monthly');
  const [category, setCategory] = useState<Category>('Other');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Improved price validation
  const isValidPrice = () => {
    const trimmedPrice = price.trim();
    if (!trimmedPrice) return false;
    // Strict numeric pattern check
    if (!/^\s*[+-]?(\d+(\.\d+)?|\.\d+)\s*$/.test(trimmedPrice)) return false;
    const numValue = Number(trimmedPrice);
    return Number.isFinite(numValue) && numValue > 0;
  };

  const isValidForm = name.trim() !== '' && isValidPrice();

  const handleSubmit = async () => {
    if (!isValidForm || isSaving) return;

    const priceValue = Number(price.trim());
    const now = dayjs();
    const renewalDate = frequency === 'Monthly' ? now.add(1, 'month') : now.add(1, 'year');

    const draft: SubscriptionDraft = {
      name: name.trim(),
      price: priceValue,
      currency: 'USD',
      frequency,
      category,
      status: 'active',
      startDate: now.toISOString(),
      renewalDate: renewalDate.toISOString(),
      // Custom subscriptions get the generic glyph; the key is what Supabase stores.
      iconKey: 'plus',
      billing: frequency,
      color: CATEGORY_COLORS[category],
    };

    setIsSaving(true);
    setSaveError(null);
    try {
      const created = await onSubmit(draft);
      if (!created) {
        setSaveError('We could not save that subscription. Please try again.');
        return;
      }

      posthog.capture('subscription_created', {
        subscription_name: draft.name,
        subscription_price: priceValue,
        subscription_frequency: frequency,
        subscription_category: category,
      })

      resetForm();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setName('');
    setPrice('');
    setFrequency('Monthly');
    setCategory('Other');
    setSaveError(null);
  };

  const handleClose = () => {
    if (isSaving) return;
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <Pressable className="modal-overlay" onPress={handleClose}>
          <Pressable className="modal-container" onPress={(e) => e.stopPropagation()}>
            <View className="modal-header">
              <Text className="modal-title">New Subscription</Text>
              <Pressable className="modal-close" onPress={handleClose}>
                <Text className="modal-close-text">✕</Text>
              </Pressable>
            </View>

            <ScrollView
              className="p-5"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 20, paddingBottom: 20 }}
            >
              <View className="auth-field">
                <Text className="auth-label">Name</Text>
                <TextInput
                  className="auth-input"
                  placeholder="Subscription name"
                  placeholderTextColor="rgba(0, 0, 0, 0.4)"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View className="auth-field">
                <Text className="auth-label">Price</Text>
                <TextInput
                  className="auth-input"
                  placeholder="0.00"
                  placeholderTextColor="rgba(0, 0, 0, 0.4)"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </View>

              <View className="auth-field">
                <Text className="auth-label">Frequency</Text>
                <View className="picker-row">
                  <Pressable
                    className={clsx('picker-option', frequency === 'Monthly' && 'picker-option-active')}
                    onPress={() => setFrequency('Monthly')}
                  >
                    <Text className={clsx('picker-option-text', frequency === 'Monthly' && 'picker-option-text-active')}>
                      Monthly
                    </Text>
                  </Pressable>
                  <Pressable
                    className={clsx('picker-option', frequency === 'Yearly' && 'picker-option-active')}
                    onPress={() => setFrequency('Yearly')}
                  >
                    <Text className={clsx('picker-option-text', frequency === 'Yearly' && 'picker-option-text-active')}>
                      Yearly
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View className="auth-field">
                <Text className="auth-label">Category</Text>
                <View className="category-scroll">
                  {CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      className={clsx('category-chip', category === cat && 'category-chip-active')}
                      onPress={() => setCategory(cat)}
                    >
                      <Text className={clsx('category-chip-text', category === cat && 'category-chip-text-active')}>
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {saveError && <Text className="auth-error">{saveError}</Text>}

              <Pressable
                className={clsx('auth-button', (!isValidForm || isSaving) && 'auth-button-disabled')}
                onPress={handleSubmit}
                disabled={!isValidForm || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text className="auth-button-text">Create Subscription</Text>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default CreateSubscriptionModal;