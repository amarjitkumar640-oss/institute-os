import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { apiClient } from "../api/client";

interface Lead {
  id: string;
  name: string;
  phone: string;
  targetExam: string;
  status: string;
}

export function LeadsScreen() {
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
      data={leads}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadLeads} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.phone} · {item.targetExam} · {item.status}
          </Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No leads yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  name: { fontSize: 16, fontWeight: "600" },
  meta: { color: "#666", marginTop: 4 },
  empty: { textAlign: "center", marginTop: 32, color: "#999" },
});
