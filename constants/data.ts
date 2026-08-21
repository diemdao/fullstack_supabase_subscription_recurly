import { icons } from "./icons";


export const tabs: AppTab[] = [
    { name: "index", title: "Home", icon: icons.home },
    { name: "subscriptions", title: "Subscriptions", icon: icons.wallet },
    { name: "chat", title: "Assistant", icon: icons.chat, variant: "primary" },
    { name: "insights", title: "Insights", icon: icons.activity },
    { name: "settings", title: "Settings", icon: icons.setting },
];

// Fallback shown before Supabase user metadata is available.
export const HOME_USER = {
    name: "there",
};

// The subscription list, balance and upcoming renewals now come from Supabase
// (see `lib/subscriptions.ts`). The former mock rows live in `supabase/seed.sql`
// if you want to load them into a real account.
