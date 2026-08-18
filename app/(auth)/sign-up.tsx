import AuthBrandHeader from '@/components/AuthBrandHeader';
import PasswordInput from '@/components/PasswordInput';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { codeError, emailError, nameError, passwordError } from '@/lib/validation';
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

const SignUp = () => {
  const router = useRouter();
  const posthog = usePostHog();

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [awaitingCode, setAwaitingCode] = React.useState(false);
  const [formErrors, setFormErrors] = React.useState<{
    name?: string;
    email?: string;
    password?: string;
    code?: string;
  }>({});
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const nameFieldError = formErrors.name;
  const emailFieldError = formErrors.email;
  const passwordFieldError = formErrors.password;
  const codeFieldError = formErrors.code;
  const bannerError = generalError;

  const handleSignUp = async () => {
    const nextErrors = {
      name: nameError(name) ?? undefined,
      email: emailError(email) ?? undefined,
      password: passwordError(password) ?? undefined,
    };
    setFormErrors(nextErrors);
    setGeneralError(null);
    if (nextErrors.name || nextErrors.email || nextErrors.password) return;

    setIsBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Lands on the user's `user_metadata`, which is what the home screen
        // reads through `displayNameFor()`. It survives email verification.
        options: { data: { full_name: name.trim() } },
      });

      if (error) {
        setGeneralError(error.message);
        return;
      }

      // Supabase returns a user with no identities when the address is already
      // registered, rather than leaking that fact through an error.
      if (data.user && data.user.identities?.length === 0) {
        setGeneralError('An account with this email already exists. Try signing in instead.');
        return;
      }

      posthog.capture('user_signed_up');

      // With email confirmation switched off the session arrives immediately
      // and there is no code to enter.
      if (data.session) {
        router.replace('/');
        return;
      }

      posthog.capture('email_verification_code_sent');
      setAwaitingCode(true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerify = async () => {
    const codeErr = codeError(code) ?? undefined;
    setFormErrors((prev) => ({ ...prev, code: codeErr }));
    setGeneralError(null);
    if (codeErr) return;

    setIsBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'signup',
      });

      if (error) {
        setGeneralError(error.message);
        return;
      }

      if (!data.session) {
        setGeneralError('That code did not complete verification. Please try again.');
        return;
      }

      router.replace('/');
    } finally {
      setIsBusy(false);
    }
  };

  const resendCode = async () => {
    setGeneralError(null);
    setCode('');
    setFormErrors((prev) => ({ ...prev, code: undefined }));

    setIsBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });

      if (error) {
        setGeneralError(error.message);
        return;
      }

      posthog.capture('email_verification_code_resent');
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
          {awaitingCode ? (
            <>
              <AuthBrandHeader
                title="Verify your email"
                subtitle={`Enter the 8-digit code we sent to ${email.trim()}`}
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

                  {bannerError && <Text className="auth-error">{bannerError}</Text>}

                  <Pressable
                    className={clsx('auth-button', isBusy && 'auth-button-disabled')}
                    onPress={handleVerify}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text className="auth-button-text">Verify email</Text>
                    )}
                  </Pressable>

                  <Pressable
                    className="auth-secondary-button"
                    onPress={resendCode}
                    disabled={isBusy}
                  >
                    <Text className="auth-secondary-button-text">Send a new code</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <>
              <AuthBrandHeader
                title="Create your account"
                subtitle="Track every subscription and never miss a renewal again"
              />

              <View className="auth-card">
                <View className="auth-form">
                  <View className="auth-field">
                    <Text className="auth-label">Name</Text>
                    <TextInput
                      className={clsx('auth-input', nameFieldError && 'auth-input-error')}
                      value={name}
                      onChangeText={setName}
                      placeholder="Enter your name"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="words"
                      autoComplete="name"
                      editable={!isBusy}
                    />
                    {nameFieldError && <Text className="auth-error">{nameFieldError}</Text>}
                  </View>

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
                      placeholder="Create a password"
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
                    onPress={handleSignUp}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text className="auth-button-text">Create account</Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <View className="auth-link-row">
                <Text className="auth-link-copy">Already have an account?</Text>
                <Link href="/(auth)/sign-in" asChild>
                  <Pressable>
                    <Text className="auth-link">Sign in</Text>
                  </Pressable>
                </Link>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignUp;
