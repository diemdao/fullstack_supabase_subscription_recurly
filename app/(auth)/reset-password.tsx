import AuthBrandHeader from '@/components/AuthBrandHeader';
import PasswordInput from '@/components/PasswordInput';
import { colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { codeError, emailError, passwordError } from '@/lib/validation';
import clsx from 'clsx';
import { Link, useRouter } from 'expo-router';
import { styled } from 'nativewind';
import { usePostHog } from 'posthog-react-native';
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

const ResetPassword = () => {
  const router = useRouter();
  const posthog = usePostHog();
  const { setRecoveringPassword } = useAuth();

  const [stage, setStage] = React.useState<'request' | 'reset'>('request');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [formErrors, setFormErrors] = React.useState<{
    email?: string;
    code?: string;
    password?: string;
  }>({});
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const emailFieldError = formErrors.email;
  const codeFieldError = formErrors.code;
  const passwordFieldError = formErrors.password;
  const bannerError = generalError;

  // If the screen goes away mid-reset, don't leave the redirect guard latched.
  React.useEffect(() => () => setRecoveringPassword(false), [setRecoveringPassword]);

  const handleSendCode = async () => {
    const emailErr = emailError(email) ?? undefined;
    setFormErrors({ email: emailErr });
    setGeneralError(null);
    if (emailErr) return;

    setIsBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        setGeneralError(error.message);
        return;
      }

      posthog.capture('password_reset_code_requested');
      setStage('reset');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetPassword = async () => {
    const nextErrors = {
      code: codeError(code) ?? undefined,
      password: passwordError(password) ?? undefined,
    };
    setFormErrors(nextErrors);
    setGeneralError(null);
    if (nextErrors.code || nextErrors.password) return;

    setIsBusy(true);
    // Hold the auth layout's redirect: the next call signs the user in.
    setRecoveringPassword(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery',
      });

      if (verifyError) {
        setGeneralError(verifyError.message);
        return;
      }

      if (!data.session) {
        setGeneralError('We could not verify that code. Please try again.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setGeneralError(error.message);
        return;
      }

      posthog.capture('password_reset_completed');
      setRecoveringPassword(false);
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
          {stage === 'request' ? (
            <>
              <AuthBrandHeader
                title="Reset password"
                subtitle="Enter your email and we'll send you a code to reset your password"
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

                  {bannerError && <Text className="auth-error">{bannerError}</Text>}

                  <Pressable
                    className={clsx('auth-button', isBusy && 'auth-button-disabled')}
                    onPress={handleSendCode}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text className="auth-button-text">Send reset code</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <>
              <AuthBrandHeader
                title="Choose a new password"
                subtitle={`Enter the code we sent to ${email.trim()} and your new password`}
              />

              <View className="auth-card">
                <View className="auth-form">
                  <View className="auth-field">
                    <Text className="auth-label">Verification code</Text>
                    <TextInput
                      className={clsx('auth-input', codeFieldError && 'auth-input-error')}
                      value={code}
                      onChangeText={setCode}
                      placeholder="12345678"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      maxLength={8}
                      editable={!isBusy}
                    />
                    {codeFieldError && <Text className="auth-error">{codeFieldError}</Text>}
                  </View>

                  <View className="auth-field">
                    <Text className="auth-label">New password</Text>
                    <PasswordInput
                      hasError={Boolean(passwordFieldError)}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter a new password"
                      placeholderTextColor={colors.mutedForeground}
                      editable={!isBusy}
                    />
                    {passwordFieldError ? (
                      <Text className="auth-error">{passwordFieldError}</Text>
                    ) : (
                      <Text className="auth-helper">Use at least 8 characters.</Text>
                    )}
                  </View>

                  {bannerError && <Text className="auth-error">{bannerError}</Text>}

                  <Pressable
                    className={clsx('auth-button', isBusy && 'auth-button-disabled')}
                    onPress={handleResetPassword}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text className="auth-button-text">Reset password</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </>
          )}

          <View className="auth-link-row">
            <Text className="auth-link-copy">Remembered it?</Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text className="auth-link">Back to sign in</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ResetPassword;
