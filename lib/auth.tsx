// App-wide Supabase auth state. One subscription to `onAuthStateChange` feeds
// every screen, instead of each screen talking to the SDK directly.
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import React from 'react';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read off disk. */
  isLoading: boolean;
  isSignedIn: boolean;
  /**
   * Set while a password reset is mid-flight. Verifying a recovery code signs
   * the user in *before* the new password is submitted, so the auth layout has
   * to hold its redirect until the reset screen is finished.
   */
  isRecoveringPassword: boolean;
  setRecoveringPassword: (value: boolean) => void;
}

const AuthContext = React.createContext<AuthState>({
  session: null,
  user: null,
  isLoading: true,
  isSignedIn: false,
  isRecoveringPassword: false,
  setRecoveringPassword: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRecoveringPassword, setRecoveringPassword] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    // Rehydrate whatever session expo-sqlite's localStorage is holding.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    // Covers sign-in, sign-out, token refresh and password recovery.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = React.useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isSignedIn: Boolean(session),
      isRecoveringPassword,
      setRecoveringPassword,
    }),
    [session, isLoading, isRecoveringPassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => React.useContext(AuthContext);

/** Best-effort human-readable name for the signed-in user. */
export const displayNameFor = (user: User | null): string | null => {
  if (!user) return null;
  const metadata = user.user_metadata ?? {};
  return (
    metadata.full_name ||
    metadata.name ||
    metadata.username ||
    user.email?.split('@')[0] ||
    null
  );
};

/** Avatar URL stored on the user's metadata, when one exists. */
export const avatarUrlFor = (user: User | null): string | null =>
  (user?.user_metadata?.avatar_url as string | undefined) ?? null;
