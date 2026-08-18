import '@/global.css';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from "expo-router";
import { useEffect } from 'react';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { AuthProvider, displayNameFor, useAuth } from '@/lib/auth';
import { posthog } from '@/lib/posthog';
import { useSubscriptionStore } from '@/lib/subscriptionStore';

// App-wide error boundary. expo-router uses the `ErrorBoundary` named export on
// the root layout to catch render errors across the entire app.
export { ErrorBoundary } from '@/components/ErrorBoundary';

function AuthSync() {
  const { isSignedIn, isLoading, user } = useAuth();
  const ph = usePostHog();
  const resetSubscriptions = useSubscriptionStore((state) => state.reset);

  const userId = user?.id;
  const email = user?.email ?? null;
  const name = displayNameFor(user);
  const createdAt = user?.created_at ?? null;

  useEffect(() => {
    // Wait for the persisted session to resolve so we don't reset PostHog on
    // every cold start before Supabase has rehydrated.
    if (isLoading) return;

    if (isSignedIn && userId) {
      ph.identify(userId, {
        $set: { email, name },
        $set_once: { created_at: createdAt },
      });
    } else {
      ph.reset();
      // Never let one account's rows leak into the next session.
      resetSubscriptions();
    }
  }, [isSignedIn, isLoading, userId, email, name, createdAt, ph, resetSubscriptions]);

  return null;
}

SplashScreen.preventAutoHideAsync(); // this will prevent the splash screen from auto-hiding until we manually hide it when the fonts are loaded

export default function RootLayout() {

  const [fontsLoaded] = useFonts({
    'sans-regular': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'sans-bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'sans-semibold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'sans-medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'sans-light': require('../assets/fonts/PlusJakartaSans-Light.ttf'),
    'sans-extrabold': require('../assets/fonts/PlusJakartaSans-ExtraBold.ttf')
  });

  useEffect(() => {
    // if fonts loaded, we will hide the splash screen, otherwise we will keep it open until the fonts are loaded
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded])
  // re-trigger this whenever the fonts loaded variable changes. 

  // if font for whatever reason is not loaded, we will simply return null, we can not show our application without it
  if (!fontsLoaded) {
    return null;
  }



  return (
    <AuthProvider>
      <PostHogProvider client={posthog} autocapture={{ captureTouches: true, captureScreens: true, propsToCapture: ['testID'] }}>
        <AuthSync />
        <Stack screenOptions={{ headerShown: false }} />
      </PostHogProvider>
    </AuthProvider>
  );
}
