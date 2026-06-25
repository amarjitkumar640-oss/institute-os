import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { apiClient } from "../api/client";

interface Student {
  id: string;
  studentCode: string;
  fullName: string;
  phone: string;
}

export function StudentsScreen() {
  const [students, setStudents] = useState<Student[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadStudents = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await apiClient.get<Student[]>("/students");
      setStudents(data);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStudents();
    }, [loadStudents])
  );

  return (
    <FlatList
      style={styles.list}
      data={students}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadStudents} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.name}>{item.fullName}</Text>
          <Text style={styles.meta}>
            {item.studentCode} · {item.phone}
          </Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No students yet.</Text>}
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
