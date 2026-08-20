# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Supabase setup

Auth and data both run on Supabase. Before the app will boot you need a project
and a `.env`.

### 1. Environment

Copy `.env.example` to `.env` and fill in the two Supabase values from
**Project Settings → API**:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The publishable (anon) key is safe to ship in the client — Row Level Security is
what protects the data. Never put the service-role key in an `EXPO_PUBLIC_*`
variable.

### 2. Database

Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. It creates the
`subscriptions` table, its indexes, an `updated_at` trigger, and RLS policies that
scope every row to `auth.uid()`.

[`supabase/seed.sql`](supabase/seed.sql) is optional demo data — sign up in the app
first, then run it with your own user id.

### 3. Storage (profile pictures)

Run [`supabase/storage.sql`](supabase/storage.sql). It creates a public-read
`avatars` bucket (5 MB limit, images only) and policies that let each user write
only inside their own `<user_id>/` folder.

Profile pictures are set from the Settings tab and stored as an `avatar_url` on
the user's metadata, which the home header reads through `avatarUrlFor()`.

### 4. Email templates (required for the verification-code screens)

The sign-up and password-reset screens ask for a **8-digit code**, not a magic
link. Supabase's default templates only send a link, so update both under
**Authentication → Email Templates** to include the token:

- **Confirm signup** → use `{{ .Token }}`
- **Reset password** → use `{{ .Token }}`

For example: `<p>Your code is <strong>{{ .Token }}</strong></p>`

If you'd rather skip email verification entirely during development, turn off
**Confirm email** under **Authentication → Sign In / Providers → Email**. The
sign-up screen detects that case and drops the user straight into the app.

### How auth is wired

- [`lib/supabase.ts`](lib/supabase.ts) — the client. Sessions persist through
  `expo-sqlite`'s `localStorage` shim (the adapter Expo documents for SDK 54), and
  token auto-refresh is tied to `AppState` so it stops in the background.
- [`lib/auth.tsx`](lib/auth.tsx) — `<AuthProvider>` plus the `useAuth()` hook
  (`session`, `user`, `isLoading`, `isSignedIn`). One `onAuthStateChange`
  subscription feeds every screen.
- [`app/(tabs)/_layout.tsx`](app/(tabs)/_layout.tsx) and
  [`app/(auth)/_layout.tsx`](app/(auth)/_layout.tsx) — the route guards.
- [`lib/subscriptions.ts`](lib/subscriptions.ts) — table reads/writes plus the
  row ↔ `Subscription` mappers. Icons are stored as an `icon_key` string and
  resolved back to bundled assets from `constants/icons.ts`.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
# react-native-recurrly
test
test
test
# fullstack_supabase_subscription_recurly
