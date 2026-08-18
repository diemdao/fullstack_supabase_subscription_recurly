import { colors } from '@/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import clsx from 'clsx';
import React from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  /** Draws the destructive border, matching the plain `auth-input` fields. */
  hasError?: boolean;
}

/**
 * Password field with a show/hide toggle, styled with the existing `auth-*`
 * classes so it sits flush with the other inputs on the auth screens.
 */
const PasswordInput = ({ hasError, className, ...props }: PasswordInputProps) => {
  const [isVisible, setIsVisible] = React.useState(false);

  return (
    <View className="auth-password-field">
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        className={clsx(
          'auth-input auth-input-password',
          hasError && 'auth-input-error',
          className
        )}
        secureTextEntry={!isVisible}
      />

      <Pressable
        className="auth-password-toggle"
        onPress={() => setIsVisible((visible) => !visible)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={isVisible ? 'Hide password' : 'Show password'}
      >
        <Ionicons
          name={isVisible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={colors.mutedForeground}
        />
      </Pressable>
    </View>
  );
};

export default PasswordInput;
