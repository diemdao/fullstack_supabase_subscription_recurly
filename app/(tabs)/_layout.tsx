import { tabs } from "@/constants/data";
import { colors, components } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import clsx from "clsx";
import { Redirect, Tabs } from "expo-router";
import { Image, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const tabBar = components.tabBar;

// This gives you a "pill" background that only appears/highlights when that tab is the active one.
const TabIcon = ({focused, icon}: TabIconProps) => {
    return (
        <View className="tabs-icon">
            {/* Inner View gets tabs-pill, plus tabs-active conditionally when the tab is focused (via clsx) */}
            <View className={clsx('tabs-pill', focused && 'tabs-active')}>
                {/* Renders the actual icon image inside, scaled with resizeMode="contain" */}
                <Image source={icon} resizeMode="contain" className="tabs-glyph"/>
            </View>
        </View>
    );
};

const TabLayout = () => {
        const { isSignedIn, isLoading } = useAuth();
        const insets = useSafeAreaInsets();

        // Wait for auth to load before rendering anything
        if (isLoading) {
            return null;
        }

        // Redirect to sign-in if user is not authenticated
        if (!isSignedIn) {
            return <Redirect href="/(auth)/sign-in" />;
        }

        // These checks above live in the layout, so that way everything inside the tabs layout is protected and only accessible to authenticated users. If the user is not signed in, they will be redirected to the sign-in page before they can access any of the tabs.

        // If the user is signed in, render the tab layout with custom styling
        // This is else the user sign in, then let them see the home page with the tabs at the bottom
        return (
            <Tabs
                screenOptions={{
                        headerShown: false,
                        tabBarShowLabel: false,
                        tabBarStyle: {
                                position: 'absolute',
                                bottom: Math.max(insets.bottom, tabBar.horizontalInset),
                                height: tabBar.height,
                                marginHorizontal: tabBar.horizontalInset,
                                borderRadius: tabBar.radius,
                                backgroundColor: colors.primary,
                                borderTopWidth: 0,
                                elevation: 0,
                        },
                        tabBarItemStyle: {
                                paddingVertical: tabBar.height / 2 - tabBar.iconFrame / 1.6
                        },
                        tabBarIconStyle: {
                                width: tabBar.iconFrame,
                                height: tabBar.iconFrame,
                                alignItems: 'center'
                        }
            }}
            >
                    {tabs.map((tab) => (
                        <Tabs.Screen
                            key={tab.name}
                            name={tab.name}
                            options={{
                                    title: tab.title,
                                    tabBarIcon: ({focused}) => (
                                        <TabIcon focused={focused} icon={tab.icon} variant={tab.variant} />
                                    )
                            }}/>
                    ))}
            </Tabs>
        )
}

export default TabLayout;