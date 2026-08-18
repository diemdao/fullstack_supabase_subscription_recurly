# PostHog Setup Report

PostHog product analytics, user identification, and error tracking have been wired into this Expo React Native app (react-native-recurrly).

---

## What was installed

**Package added:** `posthog-react-native@^3.5.0`
**Peer dependency added:** `react-native-svg@^15.8.0` (required for surveys)

`react-native-config` was declared in the install step but removed in the review step — it was never imported anywhere. The integration uses Expo's `EXPO_PUBLIC_*` env var convention instead.

`npm install` completed successfully, adding 15 packages.

---

## Initialization

**`lib/posthog.ts`** — Constructs a single PostHog client exported as `posthog`. Reads `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` and `EXPO_PUBLIC_POSTHOG_HOST` from `process.env`. If either is missing, initializes with `disabled: true` and logs a console error in `__DEV__`. Also wires `ErrorUtils.setGlobalHandler` here (see Error Tracking below).

**`app/_layout.tsx`** — Wraps the Expo Router `<Stack>` with `<PostHogProvider client={posthog} autocapture={{ captureTouches: true, captureScreens: true, propsToCapture: ['testID'] }}>` inside `<AuthProvider>` (Supabase). All screens are inside this provider tree.

**Environment variables** added to `.env` and documented in `.env.example`:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` | Public project token |
| `EXPO_PUBLIC_POSTHOG_HOST` | Ingestion host (`https://us.i.posthog.com`) |

---

## User identification

**Wired.** An `AuthSync` component (null-rendering) in `app/_layout.tsx` uses `useAuth()` from `@/lib/auth` (Supabase) and `usePostHog()` from posthog-react-native.

- When `isSignedIn` becomes `true`: calls `ph.identify(user.id, { $set: { email }, $set_once: { created_at } })`. Distinct ID is the Supabase `user.id` (a UUID) — never an email.
- When `isSignedIn` becomes `false`: calls `ph.reset()` to clear the identity.

Identity is fully centralized — no per-screen identify calls are needed. On app restart while signed in, Supabase re-hydrates the persisted session and `AuthSync` re-identifies. On sign-out, PostHog resets so the next user starts clean.

**Unresolved:** The build step confirmed the code compiles. Whether the returning-visitor path (app restart while authenticated) actually triggers a re-identify call has not been observed in a running app — only the code wiring was verified.

---

## Events instrumented

10 events were instrumented across 6 files. All use the `usePostHog()` hook (not the singleton directly) since all screens are inside the PostHogProvider tree. No PII appears in event properties — email is only on the person record via `identify`.

| Event | What it measures | File |
|---|---|---|
| `user_signed_in` | User successfully signs in with email and password | `app/(auth)/sign-in.tsx` |
| `user_signed_up` | User completes account creation after email verification | `app/(auth)/sign-up.tsx` |
| `email_verification_code_sent` | Email verification code sent during sign-up | `app/(auth)/sign-up.tsx` |
| `email_verification_code_resent` | User requested a new verification code during sign-up | `app/(auth)/sign-up.tsx` |
| `password_reset_code_requested` | User requested a password reset code | `app/(auth)/reset-password.tsx` |
| `password_reset_completed` | User successfully reset their password | `app/(auth)/reset-password.tsx` |
| `user_signed_out` | User signs out from the settings screen | `app/(tabs)/settings.tsx` |
| `subscription_created` | User creates a new subscription via the modal form | `components/CreateSubscriptionModal.tsx` |
| `subscription_searched` | User submitted a search query to filter subscriptions | `app/(tabs)/subscriptions.tsx` |
| `subscription_card_expanded` | User expanded a subscription card to view details | `app/(tabs)/subscriptions.tsx` |

**Note on `subscription_created`:** A capture call already existed in `CreateSubscriptionModal.tsx` but imported from `@/src/config/posthog` (a path that does not exist). The capture step fixed it to use the `usePostHog()` hook.

**Not instrumented:** `onboarding.tsx` and `subscriptions/[id].tsx` — these are placeholder screens with no real user actions.

**Not confirmed:** Events were instrumented in code. Whether they actually arrive in PostHog has not been observed — no test device or simulator run was performed during this wizard run.

---

## Error tracking

Two mechanisms were wired. Neither was verified with a live app run.

**1. Global JS error handler** (`lib/posthog.ts`)
After the PostHog instance is constructed, the module replaces `ErrorUtils.setGlobalHandler` with a handler that calls `posthog.captureException(error, { is_fatal: isFatal ?? false })` and then chains the previous handler. This captures all unhandled JS exceptions from app startup.

**2. Expo Router ErrorBoundary** (`app/+error.tsx`)
A new file exporting an `ErrorBoundary` component using `ErrorBoundaryProps` from `expo-router`. On mount, calls `posthog.captureException(error)` so React component render errors also reach PostHog. Shows a minimal recovery UI with a retry button.

---

## Dashboard

A starter dashboard was created in PostHog with 5 insights:

**[Analytics basics (wizard)](https://us.posthog.com/project/512838/dashboard/1890557)**

| Insight | Type | Events |
|---|---|---|
| Sign-up funnel | Funnel | `email_verification_code_sent` → `user_signed_up` |
| Daily active users | Trends (DAU) | `user_signed_in` |
| Auth events over time | Trends (Bar) | `user_signed_in`, `user_signed_up`, `user_signed_out` |
| Subscription engagement | Trends | `subscription_created`, `subscription_searched`, `subscription_card_expanded` |
| Password reset funnel | Funnel | `password_reset_code_requested` → `password_reset_completed` |

All 5 insights are live. They will render empty until the first real events arrive from the app.

---

## Build verification

| Check | Result |
|---|---|
| `npm install` | 15 packages added — success |
| `npx tsc --noEmit` | 0 PostHog-related errors after 5 fixes applied; pre-existing router-path and `app-example/` errors remain |
| `npm run lint` (expo lint) | 0 errors, 7 warnings (all pre-existing or safe) |

**TypeScript fixes applied by the build step:**
- `app/(tabs)/subscriptions.tsx:65` — missing `/>` self-close on `SubscriptionCard` JSX
- `lib/posthog.ts` — `captureAppLifecycleEvents` renamed to `captureNativeAppLifecycleEvents`
- `lib/posthog.ts` — `debug: __DEV__` removed (not a valid option)
- `lib/posthog.ts` — `is_fatal: isFatal` changed to `is_fatal: isFatal ?? false`
- `app/_layout.tsx`, `app/(tabs)/subscriptions.tsx` — `string | undefined` values changed to `?? null` for `JsonType` compatibility

**Lint warning (safe):** `react-hooks/exhaustive-deps` on `AuthSync`'s `useEffect` with deps `[isSignedIn, user?.id]` — `ph` is a stable PostHog client reference, omitting it is correct.

**Pre-existing issues (not introduced by PostHog):** router-path type strictness in `app/(auth)/`, `app/(tabs)/`, `app/subscriptions/[id].tsx`, and the entire `app-example/` directory.

---

## Files touched

| File | Change |
|---|---|
| `package.json` | Added `posthog-react-native`, `react-native-svg`; removed unused `react-native-config` |
| `lib/posthog.ts` | Created: PostHog singleton + `ErrorUtils` global handler |
| `app/_layout.tsx` | Added `PostHogProvider` wrapper + `AuthSync` identity component |
| `app/+error.tsx` | Created: Expo Router `ErrorBoundary` for render error capture |
| `.env` | Added `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` and `EXPO_PUBLIC_POSTHOG_HOST` |
| `.env.example` | Created with placeholder values for all env keys |
| `components/CreateSubscriptionModal.tsx` | Fixed broken PostHog import; now uses `usePostHog()` hook |
| `app/(auth)/sign-in.tsx` | Added `user_signed_in` capture |
| `app/(auth)/sign-up.tsx` | Added `user_signed_up`, `email_verification_code_sent`, `email_verification_code_resent` captures |
| `app/(auth)/reset-password.tsx` | Added `password_reset_code_requested`, `password_reset_completed` captures |
| `app/(tabs)/settings.tsx` | Added `user_signed_out` capture |
| `app/(tabs)/subscriptions.tsx` | Added `subscription_searched`, `subscription_card_expanded` captures |

---

## Before you merge

- [ ] Run a full production build (`eas build` or local native build) — the wizard only ran `tsc` and `expo lint`, not a native compile or bundle.
- [ ] Run the test suite — instrumented call sites may need updated mocks or fixtures for `usePostHog()`.
- [ ] Confirm `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` and `EXPO_PUBLIC_POSTHOG_HOST` are set in all deploy environments (EAS, CI, staging) — not just locally. The exact names are in `.env.example`.
- [ ] Launch the app on a device or simulator, sign in, and confirm `user_signed_in` appears in the PostHog [Live Events](https://us.posthog.com/project/512838/activity/explore) view — this is the first real end-to-end verification.
- [ ] Confirm the returning-visitor path (kill app, relaunch while signed in) triggers a re-identify call — `AuthSync` is wired reactively but this path was not observed in a live run.
- [ ] Create a test subscription and confirm `subscription_created` fires — this call site had a broken import before this run; verify the fix works at runtime.
- [ ] Trigger an unhandled exception in development and confirm it appears in [Error Tracking](https://us.posthog.com/project/512838/error_tracking) — neither the `ErrorUtils` handler nor the `ErrorBoundary` was verified with a live crash.
