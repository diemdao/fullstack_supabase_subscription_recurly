import AuthBrandHeader from '@/components/AuthBrandHeader';
import PasswordInput from '@/components/PasswordInput';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { emailError, passwordError } from '@/lib/validation';
import clsx from 'clsx';
import { Link, useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { styled } from 'nativewind';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';

const SafeAreaView = styled(RNSafeAreaView);

const SignIn = () => {
  const router = useRouter();
  const posthog = usePostHog();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [formErrors, setFormErrors] = React.useState<{ email?: string; password?: string }>({});
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const emailFieldError = formErrors.email;
  const passwordFieldError = formErrors.password;
  const bannerError = generalError;

  const handleSignIn = async () => {
    const nextErrors = {
      email: emailError(email) ?? undefined,
      password: passwordError(password) ?? undefined,
    };
    setFormErrors(nextErrors);
    setGeneralError(null);
    if (nextErrors.email || nextErrors.password) return;

    setIsBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setGeneralError(error.message);
        return;
      }

      posthog.capture('user_signed_in');
      router.replace('/');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <SafeAreaView className="auth-safe-area" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="auth-scroll"
          contentContainerClassName="auth-content"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthBrandHeader
            title="Welcome back"
            subtitle="Sign in to continue managing your subscriptions"
          />

          <View className="auth-card">
            <View className="auth-form">
              <View className="auth-field">
                <Text className="auth-label">Email</Text>
                <TextInput
                  className={clsx('auth-input', emailFieldError && 'auth-input-error')}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={!isBusy}
                />
                {emailFieldError && <Text className="auth-error">{emailFieldError}</Text>}
              </View>

              <View className="auth-field">
                <Text className="auth-label">Password</Text>
                <PasswordInput
                  hasError={Boolean(passwordFieldError)}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.mutedForeground}
                  editable={!isBusy}
                />
                {passwordFieldError && <Text className="auth-error">{passwordFieldError}</Text>}
              </View>

              <Link href="/(auth)/reset-password" asChild>
                <Pressable className="self-end" disabled={isBusy}>
                  <Text className="auth-link">Forgot password?</Text>
                </Pressable>
              </Link>

              {bannerError && <Text className="auth-error">{bannerError}</Text>}

              <Pressable
                className={clsx('auth-button', isBusy && 'auth-button-disabled')}
                onPress={handleSignIn}
                disabled={isBusy}
              >
                {isBusy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text className="auth-button-text">Sign in</Text>
                )}
              </Pressable>
            </View>
          </View>

          <View className="auth-link-row">
            <Text className="auth-link-copy">New to Recurly?</Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable>
                <Text className="auth-link">Create an account</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignIn;
