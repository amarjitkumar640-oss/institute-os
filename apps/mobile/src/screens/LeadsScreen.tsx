import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { apiClient } from "../api/client";
import { useThemeColors } from "../context/ThemeContext";
import { EmptyState } from "../components/ui/EmptyState";

interface Lead {
  id: string;
  name: string;
  phone: string;
  targetExam: string;
  status: string;
}

function LeadsEmpty() {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <EmptyState
        scene="leads"
        color={colors.primary}
        title="No leads yet"
        subtitle="Add your first lead to get started"
      />
    </View>
  );
}

export function LeadsScreen() {
  const colors = useThemeColors();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadLeads = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await apiClient.get<Lead[]>("/leads");
      setLeads(data);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLeads();
    }, [loadLeads])
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={leads}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadLeads} colors={[colors.primary]} tintColor={colors.primary} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.phone} · {item.targetExam} · {item.status}
          </Text>
        </View>
      )}
      ListEmptyComponent={<LeadsEmpty />}
    />
  );
}

const styles = StyleSheet.create({
  list:    { flex: 1 },
  content: { flexGrow: 1 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  meta: { color: "#666", marginTop: 4 },
});
