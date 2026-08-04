import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { ListErrorState } from "../../components/ui/ListErrorState";
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  type NotificationItem, type NotificationType,
} from "../../api/notifications";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, type ThemeColors } from "../../context/ThemeContext";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Icon + tint per type. Colors are derived from the tenant theme (not hardcoded
// hex) so branded tenants get a consistent, on-brand set of notification colors.
function typeMeta(colors: ThemeColors): Record<NotificationType, { icon: string; color: string; label: string }> {
  return {
    session_cancelled:   { icon: "close-circle-outline", color: colors.red,       label: "Session"    },
    session_rescheduled: { icon: "sync-outline",          color: colors.secondary, label: "Session"    },
    session_assigned:    { icon: "checkmark-circle-outline", color: colors.accent, label: "Session"    },
    class_reminder:      { icon: "alarm-outline",          color: colors.blue,      label: "Reminder"   },
    new_enrollment:       { icon: "person-add-outline",     color: colors.green,     label: "Enrollment" },
    installment_overdue: { icon: "cash-outline",           color: colors.red,       label: "Fees"       },
    batch_capacity:      { icon: "layers-outline",         color: colors.purple,    label: "Capacity"   },
  };
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// "Today" items show a relative time ("2m ago"); older items show a clock time
// once they're already grouped under a day label, so the row isn't redundant
// with the section header above it.
function dayLabel(iso: string): "Today" | "Yesterday" | "Earlier" {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Earlier";
}

function itemTime(iso: string, label: string): string {
  if (label === "Today") return relTime(iso);
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function NotificationsScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation<Nav>();

  const [items, setItems]           = useState<NotificationItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const res = await fetchNotifications({ limit: 50 });
      setItems(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unreadCount = items.filter((n) => !n.readAt).length;

  async function handlePress(item: NotificationItem) {
    if (!item.readAt) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
      markNotificationRead(item.id).catch(() => {});
    }
    const screen = item.data?.screen as keyof RootStackParamList | undefined;
    if (screen) navigation.navigate(screen as any, item.data as any);
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    markAllNotificationsRead().catch(() => {});
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.screenBg }]} edges={["bottom"]}>
      <ScreenHeader
        title="Notifications"
        count={unreadCount}
        countLabel="unread"
        onBack={() => navigation.goBack()}
        rightIcon={unreadCount > 0 ? "checkmark-done-outline" : undefined}
        onRight={unreadCount > 0 ? handleMarkAllRead : undefined}
      />

      {loading ? (
        <View style={s.centerBlock}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <ListErrorState title="Failed to load notifications" onRetry={() => load()} />
      ) : (
        <ScrollView
          style={[s.scroll, { backgroundColor: colors.screenBg }]}
          contentContainerStyle={s.scrollBody}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {items.length === 0 ? (
            <View style={s.emptyBlock}>
              <Ionicons name="notifications-off-outline" size={ms(36)} color={C.border} />
              <Text style={s.emptyT}>No notifications yet</Text>
            </View>
          ) : (
            items.map((item, i) => {
              const meta = typeMeta(colors)[item.type] ?? { icon: "ellipse-outline", color: C.muted, label: "" };
              const unread = !item.readAt;
              const label = dayLabel(item.createdAt);
              const prevLabel = i > 0 ? dayLabel(items[i - 1].createdAt) : null;
              const showDayLabel = label !== prevLabel;
              return (
                <React.Fragment key={item.id}>
                  {showDayLabel && <Text style={s.dayLabel}>{label}</Text>}
                  <TouchableOpacity
                    style={s.row}
                    onPress={() => handlePress(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.icon, { backgroundColor: meta.color + "18" }]}>
                      <Ionicons name={meta.icon as any} size={ms(17)} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.topLine}>
                        <Text style={[s.title, unread && s.titleUnread]} numberOfLines={1}>{item.title}</Text>
                        {unread && <View style={s.unreadDot} />}
                      </View>
                      <Text style={s.body} numberOfLines={2}>{item.body}</Text>
                      <View style={s.metaLine}>
                        <Text style={s.time}>{itemTime(item.createdAt, label)}</Text>
                        {!!meta.label && (
                          <View style={[s.typeTag, { backgroundColor: meta.color + "18" }]}>
                            <Text style={[s.typeTagT, { color: meta.color }]}>{meta.label}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })
          )}
          <View style={{ height: ms(24) }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  centerBlock: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:      { flex: 1, backgroundColor: C.bg },
  scrollBody:  { paddingHorizontal: ms(16), paddingTop: ms(12) },

  emptyBlock: { alignItems: "center", paddingVertical: ms(64), gap: ms(10) },
  emptyT:     { fontSize: fs(13), color: C.placeholder, fontFamily: "Inter_600SemiBold", fontWeight: "600" },

  dayLabel: {
    fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700",
    color: C.placeholder, textTransform: "uppercase", letterSpacing: 0.7,
    marginTop: ms(14), marginBottom: ms(8), marginLeft: ms(4),
  },

  row: {
    flexDirection: "row", alignItems: "flex-start", gap: ms(12),
    backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(8),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(2) },
    shadowOpacity: 0.05, shadowRadius: ms(8), elevation: 1,
  },
  icon: { width: ms(38), height: ms(38), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0 },

  topLine:  { flexDirection: "row", alignItems: "center", gap: ms(6), marginBottom: ms(2) },
  title:    { flex: 0, flexShrink: 1, fontSize: fs(13.5), fontFamily: "Inter_500Medium", fontWeight: "500", color: C.muted },
  titleUnread: { fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  unreadDot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: "#F5B301", flexShrink: 0 },

  body: { fontSize: fs(12), color: C.muted, marginBottom: ms(5), lineHeight: fs(17) },

  metaLine: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  time:     { fontSize: fs(10.5), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.placeholder },
  typeTag:  { borderRadius: ms(5), paddingHorizontal: ms(6), paddingVertical: ms(1.5) },
  typeTagT: { fontSize: fs(9.5), fontFamily: "Inter_700Bold", fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
});
