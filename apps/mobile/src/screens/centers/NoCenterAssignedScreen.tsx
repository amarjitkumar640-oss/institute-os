import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { ms, fs } from "../../utils/responsive";

// Standalone gate screen, same family as LoginScreen/CenterSelectScreen —
// renders outside NavigationContainer, so no ScreenHeader/nav dependency.
// Shown only when noCentersAssigned is true (see AuthContext.tsx / RootNavigator.tsx).
export function NoCenterAssignedScreen() {
  const colors = useThemeColors();
  const s = useThemedStyles(makeStyles);
  const { staff, logout, recheckCenterAssignment } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = staff?.role === "admin";

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await recheckCenterAssignment();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <View style={s.iconCircle}>
          <Ionicons name="business-outline" size={ms(36)} color={colors.primary} />
        </View>

        <Text style={s.title}>No Center Assigned</Text>
        <Text style={s.message}>
          {isAdmin
            ? "You haven't created or been assigned to a center yet. Create your institute's first center, or ask another admin to assign you to one."
            : "You haven't been assigned to a center yet. Contact your admin to get assigned before you can continue."}
        </Text>

        {/* Log Out uses "outline", not "danger" — logging out here isn't a
            destructive action, same reasoning as the logout confirm dialog
            elsewhere in the app (see AlertContext's "brand" variant). */}
        <View style={s.actions}>
          <PrimaryButton
            label="Refresh"
            icon="refresh-outline"
            loading={refreshing}
            onPress={handleRefresh}
          />
          <View style={{ height: ms(10) }} />
          <PrimaryButton label="Log Out" variant="outline" onPress={() => logout()} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: ms(32) },

  iconCircle: {
    width: ms(88), height: ms(88), borderRadius: ms(24),
    backgroundColor: colors.primary + "17",
    alignItems: "center", justifyContent: "center",
    marginBottom: ms(20),
  },
  title: {
    fontSize: fs(19), fontFamily: "Inter_800ExtraBold", fontWeight: "800",
    color: colors.text, textAlign: "center", marginBottom: ms(10),
  },
  message: {
    fontSize: fs(13.5), color: colors.muted, textAlign: "center",
    lineHeight: fs(20), marginBottom: ms(28),
  },
  actions: { width: "100%" },
});
