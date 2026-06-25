import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, Button, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { LeadsScreen } from "../screens/LeadsScreen";
import { StudentsScreen } from "../screens/StudentsScreen";

export type RootStackParamList = {
  Leads: undefined;
  Students: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LogoutButton() {
  const { logout } = useAuth();
  return <Button title="Log out" onPress={logout} />;
}

export function RootNavigator() {
  const { staff, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!staff) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Leads"
          component={LeadsScreen}
          options={{ headerRight: LogoutButton }}
        />
        <Stack.Screen name="Students" component={StudentsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
