import type { ImageSourcePropType } from "react-native";
import type { IconKey } from "./constants/icons";

declare global {
    interface AppTab {
        name: string;
        title: string;
        icon: ImageSourcePropType;
        variant?: 'primary';
    }

    interface TabIconProps {
        focused: boolean;
        icon: ImageSourcePropType;
    }

    interface Subscription {
        id: string;
        /** Key into `constants/icons.ts` — this is what the database stores. */
        iconKey: IconKey;
        /** Resolved bundled asset for `iconKey`. */
        icon: ImageSourcePropType;
        name: string;
        plan?: string;
        category?: string;
        paymentMethod?: string;
        status?: string;
        startDate?: string;
        price: number;
        currency?: string;
        billing: string;
        frequency?: string;
        renewalDate?: string;
        color?: string;
    }

    /** A subscription as captured by the create form, before Supabase assigns an id. */
    interface SubscriptionDraft
        extends Omit<Subscription, "id" | "icon" | "iconKey"> {
        iconKey?: IconKey;
    }

    interface SubscriptionCardProps extends Omit<Subscription, "id"> {
        expanded: boolean;
        onPress: () => void;
        onEditPress?: () => void;
        onDeletePress?: () => void;
        isDeleting?: boolean;
    }

    interface UpcomingSubscription {
        id: string;
        icon: ImageSourcePropType;
        name: string;
        price: number;
        currency?: string;
        daysLeft: number;
    }

    interface UpcomingSubscriptionCardProps
        extends Omit<UpcomingSubscription, "id"> {}

    interface ListHeadingProps {
        title: string;
        /** Wires up the "View all" button; it renders inert without this. */
        onActionPress?: () => void;
    }
}

export { };
