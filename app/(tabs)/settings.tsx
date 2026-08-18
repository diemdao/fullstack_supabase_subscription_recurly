import images from '@/constants/images';
import { colors } from '@/constants/theme';
import { avatarUrlFor, fullNameFor, useAuth } from '@/lib/auth';
import { pickAvatarImage, updateDisplayName, uploadAvatar } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { nameError } from '@/lib/validation';
import clsx from 'clsx';
import { useRouter } from 'expo-router';
import { styled } from 'nativewind';
import { usePostHog } from 'posthog-react-native';
import React from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';

const SafeAreaView = styled(RNSafeAreaView);

const Settings = () => {
  const { user } = useAuth();
  const router = useRouter();
  const posthog = usePostHog();

  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const avatarUrl = avatarUrlFor(user);
  const avatarSource = avatarUrl ? { uri: avatarUrl } : images.avatar;

  // --- Name editing -------------------------------------------------------
  const savedName = fullNameFor(user);
  const [name, setName] = React.useState(savedName);
  const [nameFieldError, setNameFieldError] = React.useState<string | null>(null);
  const [isSavingName, setIsSavingName] = React.useState(false);
  const [justSavedName, setJustSavedName] = React.useState(false);

  // Re-seed the field whenever the stored name changes — on first load, and
  // again after a successful save.
  React.useEffect(() => {
    setName(savedName);
  }, [savedName]);

  const isNameDirty = name.trim() !== savedName;

  const handleSaveName = async () => {
    const validationError = nameError(name);
    setNameFieldError(validationError);
    setJustSavedName(false);
    if (validationError) return;

    setError(null);
    setIsSavingName(true);
    try {
      await updateDisplayName(name);
      posthog.capture('profile_name_updated');
      setJustSavedName(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'We could not save your name. Please try again.'
      );
    } finally {
      setIsSavingName(false);
    }
  };

  const handleChangePhoto = async () => {
    setError(null);
    setIsUploadingAvatar(true);
    try {
      const asset = await pickAvatarImage();
      if (!asset) return; // Dismissed the picker.

      await uploadAvatar(asset);
      // `updateUser` emits USER_UPDATED, so `useAuth()` re-renders with the new
      // metadata and the avatar refreshes here and on the home screen.
      posthog.capture('profile_photo_updated');
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'We could not update your profile picture. Please try again.'
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setError(null);
    try {
      posthog.capture('user_signed_out');
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        return;
      }
      // `AuthSync` clears the cached subscriptions once the session drops.
      router.replace('/(auth)/sign-in');
    } finally {
      setIsSigningOut(false);
    }
  };

  const canSaveName = isNameDirty && !isSavingName;

  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <Text className="auth-title">Settings</Text>

      <View className="settings-profile">
        <View className="settings-avatar-wrap">
          <Image source={avatarSource} className="settings-avatar" />
          {isUploadingAvatar && (
            <View className="settings-avatar-busy">
              <ActivityIndicator color={colors.background} />
            </View>
          )}
        </View>

        <View className="flex-1">
          <Pressable
            className="settings-photo-button"
            onPress={handleChangePhoto}
            disabled={isUploadingAvatar}
          >
            <Text className="settings-photo-button-text">
              {isUploadingAvatar ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add photo'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="auth-field mt-8">
        <Text className="auth-label">Name</Text>
        <View className="settings-name-row">
          <TextInput
            className={clsx('auth-input flex-1', nameFieldError && 'auth-input-error')}
            value={name}
            onChangeText={(value) => {
              setName(value);
              setNameFieldError(null);
              setJustSavedName(false);
            }}
            placeholder="Enter your name"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoComplete="name"
            editable={!isSavingName}
          />

          <Pressable
            className={clsx('settings-save-button', !canSaveName && 'settings-save-button-disabled')}
            onPress={handleSaveName}
            disabled={!canSaveName}
          >
            {isSavingName ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text className="settings-save-button-text">Save</Text>
            )}
          </Pressable>
        </View>

        {nameFieldError && <Text className="auth-error">{nameFieldError}</Text>}
        {justSavedName && !nameFieldError && (
          <Text className="settings-saved-note">Saved</Text>
        )}
        {!nameFieldError && !justSavedName && (
          <Text className="auth-helper">This is the name shown on your home screen.</Text>
        )}
      </View>

      <View className="mt-8 gap-1">
        <Text className="auth-label">Signed in as</Text>
        <Text className="auth-helper">{user?.email ?? 'your account'}</Text>
      </View>

      <View className="mt-auto mb-28">
        {error && <Text className="auth-error">{error}</Text>}
        <Pressable
          className="auth-secondary-button"
          onPress={handleSignOut}
          disabled={isSigningOut}
        >
          <Text className="auth-secondary-button-text">
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

export default Settings;
