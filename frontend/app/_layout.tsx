import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth/context";
import { SubscriptionProvider } from "@/src/subscription/context";
import { configureRevenueCat } from "@/src/lib/revenuecat";
import { useUniversalLinks } from "@/src/lib/useUniversalLinks";
import { colors } from "@/src/theme";

// Keep the native splash visible from cold start until icon fonts register
// AND auth state has been resolved. This avoids any visible flash between
// the native splash and the first rendered screen (welcome or main).
SplashScreen.preventAutoHideAsync();

// Configure RevenueCat once at module load (no-op on web / non-iOS).
configureRevenueCat();

function SplashGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();
  const [hidden, setHidden] = useState(false);
  useUniversalLinks();

  useEffect(() => {
    if (!isLoading && !hidden) {
      // Auth resolved — hide the native splash now. Stack will render the
      // welcome screen (or main) underneath which has the same green so
      // there is no perceptible flash.
      SplashScreen.hideAsync().finally(() => setHidden(true));
    }
  }, [isLoading, hidden]);

  // Keep an opaque brand-coloured layer under the native splash until
  // auth is resolved — covers any sliver before hideAsync() fires.
  if (!hidden) {
    return <View style={{ flex: 1, backgroundColor: colors.brand }}>{children}</View>;
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SplashGate>
          <SubscriptionProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.brand } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding/welcome" />
              <Stack.Screen name="auth/sign-in" />
              <Stack.Screen name="(main)" />
              <Stack.Screen
                name="paywall"
                options={{ presentation: "modal", animation: "slide_from_bottom" }}
              />
            </Stack>
          </SubscriptionProvider>
        </SplashGate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
