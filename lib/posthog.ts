import AsyncStorage from '@react-native-async-storage/async-storage'
import PostHog from 'posthog-react-native'

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

const isConfigured = Boolean(projectToken && projectToken !== 'phc_your_project_token_here')

if (__DEV__ && !isConfigured) {
  console.error(
    'EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, ' +
    'this causes events to be silently missed. This error stops appearing once ' +
    'EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is configured'
  )
}

export const posthog = new PostHog(projectToken ?? 'placeholder_key', {
  host,
  disabled: !isConfigured,
  // Use AsyncStorage instead of PostHog's default expo-file-system persistence,
  // whose writeAsStringAsync/readAsStringAsync are deprecated in Expo SDK 54.
  customStorage: AsyncStorage,
  captureNativeAppLifecycleEvents: true,
  flushAt: 20,
  flushInterval: 10000,
  preloadFeatureFlags: true,
})

const _previousHandler = ErrorUtils.getGlobalHandler()
ErrorUtils.setGlobalHandler((error, isFatal) => {
  posthog.captureException(error, { is_fatal: isFatal ?? false })
  _previousHandler(error, isFatal)
})
