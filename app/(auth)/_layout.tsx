import '@/global.css';
import { useAuth } from '@/lib/auth';
import { Redirect, Stack } from "expo-router";

export default function AuthLayout() {
  const { isSignedIn, isLoading, isRecoveringPassword } = useAuth();

  // Wait for auth to resolve before deciding what to render
  if (isLoading) {
    return null;
  }

  // Signed-in users have no business on the auth screens — send them home,
  // unless a password reset is still finishing (verifying the code signs them
  // in a moment before the new password is saved).
  if (isSignedIn && !isRecoveringPassword) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
