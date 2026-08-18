// Supabase client for React Native / Expo.
//
// Session persistence uses `expo-sqlite`'s drop-in `localStorage` shim, which is
// the storage adapter Expo documents for Supabase on SDK 54. Importing the
// install module registers `globalThis.localStorage` before the client is built.
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY — add them to your .env file'
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: globalThis.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to parse a session out of in a native app.
    detectSessionInUrl: false,
  },
});

// `autoRefreshToken` would otherwise run its refresh loop forever on iOS and
// Android; tie it to the foreground so we stop refreshing in the background.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
