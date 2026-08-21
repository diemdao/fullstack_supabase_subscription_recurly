import { icons, type IconKey } from '@/constants/icons';
import { colors } from '@/constants/theme';
import {
  CATEGORIES,
  CATEGORY_COLORS,
  DEFAULT_CURRENCY,
  ICON_CHOICES,
  STATUS_OPTIONS,
  SWATCHES,
  type Category,
  type Frequency,
  type Status,
} from '@/constants/subscriptions';
import { addPeriod } from '@/lib/renewal';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { usePostHog } from 'posthog-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

interface CreateSubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  /** Persists the draft; resolves to null when the write failed. */
  onSubmit: (draft: SubscriptionDraft) => Promise<Subscription | null>;
  /**
   * When set, the form edits this subscription instead of creating one: the
   * fields are seeded from it and the copy switches to an update.
   */
  subscription?: Subscription | null;
}

const CreateSubscriptionModal = ({
  visible,
  onClose,
  onSubmit,
  subscription = null,
}: CreateSubscriptionModalProps) => {
  const posthog = usePostHog();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [plan, setPlan] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('Monthly');
  const [category, setCategory] = useState<Category>('Other');
  const [status, setStatus] = useState<Status>('active');
  const [iconKey, setIconKey] = useState<IconKey>('plus');

  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [renewalDate, setRenewalDate] = useState<Date>(() =>
    addPeriod(dayjs(), 'Monthly').toDate()
  );
  const [activePicker, setActivePicker] = useState<'start' | 'renewal' | null>(null);

  // The colour tracks the chosen category until the user picks one themselves.
  const [customColor, setCustomColor] = useState<string | null>(null);
  const color = customColor ?? CATEGORY_COLORS[category];

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isEditing = subscription !== null;

  const resetForm = React.useCallback(() => {
    setName('');
    setPrice('');
    setPlan('');
    setPaymentMethod('');
    setFrequency('Monthly');
    setCategory('Other');
    setStatus('active');
    setIconKey('plus');
    setStartDate(new Date());
    setRenewalDate(addPeriod(dayjs(), 'Monthly').toDate());
    setCustomColor(null);
    setActivePicker(null);
    setSaveError(null);
  }, []);

  // Seed the form each time it opens: from the subscription when editing,
  // back to blank defaults when creating.
  React.useEffect(() => {
    if (!visible) return;

    if (!subscription) {
      resetForm();
      return;
    }

    const nextFrequency: Frequency =
      (subscription.frequency ?? subscription.billing) === 'Yearly' ? 'Yearly' : 'Monthly';

    setName(subscription.name);
    setPrice(String(subscription.price));
    setPlan(subscription.plan ?? '');
    setPaymentMethod(subscription.paymentMethod ?? '');
    setFrequency(nextFrequency);
    setCategory(
      CATEGORIES.includes(subscription.category as Category)
        ? (subscription.category as Category)
        : 'Other'
    );
    setStatus(
      STATUS_OPTIONS.some((option) => option.value === subscription.status)
        ? (subscription.status as Status)
        : 'active'
    );
    setIconKey(subscription.iconKey);
    setStartDate(subscription.startDate ? new Date(subscription.startDate) : new Date());
    setRenewalDate(
      subscription.renewalDate
        ? new Date(subscription.renewalDate)
        : addPeriod(dayjs(), nextFrequency).toDate()
    );
    setCustomColor(subscription.color ?? null);
    setActivePicker(null);
    setSaveError(null);
  }, [visible, subscription, resetForm]);

  // Improved price validation
  const isValidPrice = () => {
    const trimmedPrice = price.trim();
    if (!trimmedPrice) return false;
    // Strict numeric pattern check
    if (!/^\s*[+-]?(\d+(\.\d+)?|\.\d+)\s*$/.test(trimmedPrice)) return false;
    const numValue = Number(trimmedPrice);
    return Number.isFinite(numValue) && numValue > 0;
  };

  const isRenewalAfterStart = !dayjs(renewalDate).isBefore(dayjs(startDate), 'day');
  const isValidForm = name.trim() !== '' && isValidPrice() && isRenewalAfterStart;

  const handleFrequencyChange = (next: Frequency) => {
    setFrequency(next);
    // Keep the renewal date in step with the cadence, measured from the start.
    setRenewalDate(addPeriod(dayjs(startDate), next).toDate());
  };

  const applyDate = (target: 'start' | 'renewal', selected: Date) => {
    if (target === 'start') {
      setStartDate(selected);
      // Push the renewal out to match, so the pair stays coherent.
      setRenewalDate(addPeriod(dayjs(selected), frequency).toDate());
    } else {
      setRenewalDate(selected);
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    const target = activePicker;
    if (event.type === 'dismissed' || !selected || !target) return;
    applyDate(target, selected);
  };

  /**
   * Android's own dialog is far clearer than an inline picker, so we use the
   * imperative API there. iOS renders the picker inline inside a labelled card
   * (see below) because a bare inline picker is easy to miss.
   */
  const openPicker = (target: 'start' | 'renewal') => {
    const value = target === 'start' ? startDate : renewalDate;

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: target === 'renewal' ? startDate : undefined,
        onChange: (event, selected) => {
          if (event.type === 'dismissed' || !selected) return;
          applyDate(target, selected);
        },
      });
      return;
    }

    setActivePicker((current) => (current === target ? null : target));
  };

  const handleSubmit = async () => {
    if (!isValidForm || isSaving) return;

    const priceValue = Number(price.trim());

    const draft: SubscriptionDraft = {
      name: name.trim(),
      price: priceValue,
      currency: DEFAULT_CURRENCY,
      frequency,
      billing: frequency,
      category,
      plan: plan.trim() || undefined,
      paymentMethod: paymentMethod.trim() || undefined,
      status,
      startDate: startDate.toISOString(),
      renewalDate: renewalDate.toISOString(),
      iconKey,
      color,
    };

    setIsSaving(true);
    setSaveError(null);
    try {
      const created = await onSubmit(draft);
      if (!created) {
        setSaveError(
          isEditing
            ? 'We could not save your changes. Please try again.'
            : 'We could not save that subscription. Please try again.'
        );
        return;
      }

      posthog.capture(isEditing ? 'subscription_updated' : 'subscription_created', {
        subscription_name: draft.name,
        subscription_price: priceValue,
        subscription_frequency: frequency,
        subscription_category: category,
        subscription_status: status,
        subscription_icon: iconKey,
        has_plan: Boolean(draft.plan),
        has_payment_method: Boolean(draft.paymentMethod),
      })

      resetForm();
      onClose();
    } finally {
      setIsSaving(false);
    }
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
              <Text className="modal-title">
                {isEditing ? 'Edit Subscription' : 'New Subscription'}
              </Text>
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
                  placeholderTextColor={colors.mutedForeground}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View className="auth-field">
                <Text className="auth-label">Price ({DEFAULT_CURRENCY})</Text>
                <TextInput
                  className="auth-input"
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </View>

              <View className="auth-field">
                <Text className="auth-label">Plan</Text>
                <TextInput
                  className="auth-input"
                  placeholder="Premium Plus, Professional, Team Plan…"
                  placeholderTextColor={colors.mutedForeground}
                  value={plan}
                  onChangeText={setPlan}
                />
              </View>

              <View className="auth-field">
                <Text className="auth-label">Payment method</Text>
                <TextInput
                  className="auth-input"
                  placeholder="Visa ending in 8530"
                  placeholderTextColor={colors.mutedForeground}
                  value={paymentMethod}
                  onChangeText={setPaymentMethod}
                />
              </View>

              <View className="auth-field">
                <Text className="auth-label">Frequency</Text>
                <View className="picker-row">
                  {(['Monthly', 'Yearly'] as Frequency[]).map((option) => (
                    <Pressable
                      key={option}
                      className={clsx('picker-option', frequency === option && 'picker-option-active')}
                      onPress={() => handleFrequencyChange(option)}
                    >
                      <Text
                        className={clsx(
                          'picker-option-text',
                          frequency === option && 'picker-option-text-active'
                        )}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="auth-field">
                <Text className="auth-label">Status</Text>
                <View className="picker-row">
                  {STATUS_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      className={clsx('picker-option', status === option.value && 'picker-option-active')}
                      onPress={() => setStatus(option.value)}
                    >
                      <Text
                        className={clsx(
                          'picker-option-text',
                          status === option.value && 'picker-option-text-active'
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
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

              <View className="auth-field">
                <Text className="auth-label">Icon</Text>
                <View className="icon-picker-row">
                  {ICON_CHOICES.map((key) => (
                    <Pressable
                      key={key}
                      className={clsx('icon-option', iconKey === key && 'icon-option-active')}
                      onPress={() => setIconKey(key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${key} icon`}
                    >
                      <Image source={icons[key]} className="icon-option-glyph" resizeMode="contain" />
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="auth-field">
                <Text className="auth-label">Card colour</Text>
                <View className="color-picker-row">
                  {SWATCHES.map((swatch) => (
                    <Pressable
                      key={swatch}
                      className={clsx('color-swatch', color === swatch && 'color-swatch-active')}
                      style={{ backgroundColor: swatch }}
                      onPress={() => setCustomColor(swatch)}
                      accessibilityRole="button"
                      accessibilityLabel={`Card colour ${swatch}`}
                    />
                  ))}
                </View>
                <Text className="auth-helper">Defaults to the category colour.</Text>
              </View>

              <View className="auth-field">
                <Text className="auth-label">Dates</Text>
                <View className="date-row">
                  {(
                    [
                      { key: 'start', label: 'Start', value: startDate },
                      { key: 'renewal', label: 'Renewal', value: renewalDate },
                    ] as const
                  ).map(({ key, label, value }) => (
                    <Pressable
                      key={key}
                      className={clsx('date-field', activePicker === key && 'date-field-active')}
                      onPress={() => openPicker(key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} date, ${dayjs(value).format('MMMM D, YYYY')}`}
                    >
                      <View className="date-field-head">
                        <Text className="date-field-label">{label}</Text>
                        <Ionicons
                          name="calendar-outline"
                          size={14}
                          color={activePicker === key ? colors.accent : colors.mutedForeground}
                        />
                      </View>
                      <Text className="date-field-text">{dayjs(value).format('MMM D, YYYY')}</Text>
                    </Pressable>
                  ))}
                </View>

                {activePicker && (
                  <View className="date-picker-card">
                    <View className="date-picker-head">
                      <Text className="date-picker-title">
                        {activePicker === 'start' ? 'Start date' : 'Renewal date'}
                      </Text>
                      <Pressable
                        className="date-picker-done"
                        onPress={() => setActivePicker(null)}
                      >
                        <Text className="date-picker-done-text">Done</Text>
                      </Pressable>
                    </View>

                    <DateTimePicker
                      value={activePicker === 'start' ? startDate : renewalDate}
                      mode="date"
                      display="inline"
                      minimumDate={activePicker === 'renewal' ? startDate : undefined}
                      onChange={handleDateChange}
                      // The app is light-only; without this the native picker
                      // follows the device theme and renders near-invisible
                      // light text on the cream background in dark mode.
                      themeVariant="light"
                      textColor={colors.primary}
                      accentColor={colors.accent}
                    />
                  </View>
                )}

                {!isRenewalAfterStart && (
                  <Text className="auth-error">Renewal date must be on or after the start date.</Text>
                )}
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
                  <Text className="auth-button-text">
                    {isEditing ? 'Save Changes' : 'Create Subscription'}
                  </Text>
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
