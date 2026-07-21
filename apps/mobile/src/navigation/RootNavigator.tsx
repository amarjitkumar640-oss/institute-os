import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, Button, StatusBar, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { AlertProvider } from "../context/AlertContext";
import { NetworkProvider } from "../context/NetworkContext";
import { AppLockProvider, useAppLock } from "../context/AppLockContext";
import { NetworkBanner } from "../components/ui/NetworkBanner";
import { AppLockScreen } from "../screens/lock/AppLockScreen";
import type { RootStackParamList } from "./types";

// Screens — organised by feature folder
import { LoginScreen }          from "../screens/auth/LoginScreen";
import { CenterSelectScreen }      from "../screens/centers/CenterSelectScreen";
import { CenterManagementScreen }  from "../screens/centers/CenterManagementScreen";
import { StaffManagementScreen }   from "../screens/staff/StaffManagementScreen";
import { DashboardScreen }   from "../screens/dashboard/DashboardScreen";
import { ProfileScreen }     from "../screens/profile/ProfileScreen";
import { BatchListScreen }   from "../screens/batches/BatchListScreen";
import { BatchDetailScreen } from "../screens/batches/BatchDetailScreen";
import { CreateBatchScreen } from "../screens/batches/CreateBatchScreen";
import { EditBatchScreen }   from "../screens/batches/EditBatchScreen";
import { CourseListScreen }    from "../screens/courses/CourseListScreen";
import { CreateCourseScreen }  from "../screens/courses/CreateCourseScreen";
import { EditCourseScreen }    from "../screens/courses/EditCourseScreen";
import { FacultyListScreen }   from "../screens/faculty/FacultyListScreen";
import { CreateFacultyScreen } from "../screens/faculty/CreateFacultyScreen";
import { EditFacultyScreen }   from "../screens/faculty/EditFacultyScreen";
import { SubjectListScreen }   from "../screens/subjects/SubjectListScreen";
import { CreateSubjectScreen } from "../screens/subjects/CreateSubjectScreen";
import { EditSubjectScreen }   from "../screens/subjects/EditSubjectScreen";
import { StudentListScreen }      from "../screens/students/StudentListScreen";
import { StudentAdmissionScreen } from "../screens/students/StudentAdmissionScreen";
import { EditStudentScreen }      from "../screens/students/EditStudentScreen";
import { FeesScreen }             from "../screens/fees/FeesScreen";
import { FeeScheduleDetailScreen } from "../screens/fees/FeeScheduleDetailScreen";
import { FeeStructureScreen }      from "../screens/fees/FeeStructureScreen";
import { LeadsScreen }       from "../screens/leads/LeadsScreen";
import { StudentsScreen }    from "../screens/students/StudentsScreen";
import { BatchScheduleScreen } from "../screens/schedule/BatchScheduleScreen";
import { SessionDetailScreen } from "../screens/schedule/SessionDetailScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

function LogoutButton() {
  const { logout } = useAuth();
  return <Button title="Log out" onPress={logout} />;
}

function RootNavigatorInner() {
  const { staff, isLoading, pendingCenters } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!staff) return <LoginScreen />;

  // Between login and center selection — show the center picker full-screen
  if (pendingCenters) return <CenterSelectScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        {/* Dashboard — home after login */}
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Profile"   component={ProfileScreen}   />

        {/* Feature list screens */}
        <Stack.Screen name="BatchList"    component={BatchListScreen} />
        <Stack.Screen name="BatchDetail"  component={BatchDetailScreen} />
        <Stack.Screen name="CreateBatch"  component={CreateBatchScreen}  options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="EditBatch"    component={EditBatchScreen}    options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="CourseList"    component={CourseListScreen} />
        <Stack.Screen name="CreateCourse"  component={CreateCourseScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="EditCourse"    component={EditCourseScreen}   options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="FacultyList"    component={FacultyListScreen} />
        <Stack.Screen name="CreateFaculty"  component={CreateFacultyScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="EditFaculty"    component={EditFacultyScreen}   options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="SubjectList"    component={SubjectListScreen} />
        <Stack.Screen name="CreateSubject"  component={CreateSubjectScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="EditSubject"    component={EditSubjectScreen}   options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="StudentList"   component={StudentListScreen} />
        <Stack.Screen name="NewAdmission" component={StudentAdmissionScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="EditStudent"  component={EditStudentScreen}     options={{ animation: "slide_from_bottom" }} />

        {/* Fees */}
        <Stack.Screen name="FeesList"          component={FeesScreen}             />
        <Stack.Screen name="FeeScheduleDetail" component={FeeScheduleDetailScreen} />
        <Stack.Screen name="FeeStructure"      component={FeeStructureScreen}     options={{ animation: "slide_from_bottom" }} />

        {/* Class Schedule */}
        <Stack.Screen name="BatchSchedule" component={BatchScheduleScreen} />
        <Stack.Screen name="SessionDetail" component={SessionDetailScreen} />

        {/* Admin-only management screens */}
        <Stack.Screen name="CenterManagement" component={CenterManagementScreen} />
        <Stack.Screen name="StaffManagement"  component={StaffManagementScreen} />

        {/* Legacy screens */}
        <Stack.Screen name="Leads"    component={LeadsScreen}    options={{ headerShown: true, headerRight: LogoutButton }} />
        <Stack.Screen name="Students" component={StudentsScreen} options={{ headerShown: true }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AppLockGate({ children }: { children: React.ReactNode }) {
  const { staff } = useAuth();
  const { hasPin, isLocked, pinLoaded } = useAppLock();

  // Wait for SecureStore check before deciding — prevents flash of lock screen
  if (!pinLoaded) return null;

  // Only lock when a PIN has been configured AND the app is currently locked
  const showLock = !!staff && hasPin && isLocked;
  if (showLock) return <AppLockScreen />;
  return <>{children}</>;
}

export function RootNavigator() {
  return (
    <NetworkProvider>
      <AlertProvider>
        {/* Global default — every screen inherits this unless it overrides */}
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <AppLockProvider>
          <AppLockGate>
            <RootNavigatorInner />
          </AppLockGate>
          <NetworkBanner />
        </AppLockProvider>
      </AlertProvider>
    </NetworkProvider>
  );
}
