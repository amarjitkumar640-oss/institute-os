import React, { useEffect, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "react-native";
import * as Notifications from "expo-notifications";
import type { NavigationContainerRef } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";
import { useThemeColors } from "../context/ThemeContext";
import { AlertProvider } from "../context/AlertContext";
import { NetworkProvider } from "../context/NetworkContext";
import { AppLockProvider, useAppLock } from "../context/AppLockContext";
import { NetworkBanner } from "../components/ui/NetworkBanner";
import { UpdateBanner } from "../components/ui/UpdateBanner";
import { AppSplashScreen } from "../components/ui/AppSplashScreen";
import { AppLockScreen } from "../screens/lock/AppLockScreen";
import type { RootStackParamList } from "./types";

// Screens — organised by feature folder
import { LoginScreen }          from "../screens/auth/LoginScreen";
import { CenterSelectScreen }      from "../screens/centers/CenterSelectScreen";
import { NoCenterAssignedScreen }  from "../screens/centers/NoCenterAssignedScreen";
import { CenterManagementScreen }  from "../screens/centers/CenterManagementScreen";
import { StaffManagementScreen }   from "../screens/staff/StaffManagementScreen";
import { OrganizationSettingsScreen } from "../screens/settings/OrganizationSettingsScreen";
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
import { FacultyAttendanceScreen } from "../screens/faculty/FacultyAttendanceScreen";
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
import { AddLeadScreen }     from "../screens/leads/AddLeadScreen";
import { AdmissionApplicationsScreen } from "../screens/admissionApplications/AdmissionApplicationsScreen";
import { StudentsScreen }    from "../screens/students/StudentsScreen";
import { BatchScheduleScreen } from "../screens/schedule/BatchScheduleScreen";
import { SessionDetailScreen } from "../screens/schedule/SessionDetailScreen";
import { NotificationsScreen } from "../screens/notifications/NotificationsScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigatorInner({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { staff, isLoading, pendingCenters, noCentersAssigned } = useAuth();
  const { name: orgName, isLoading: orgLoading } = useOrg();
  const { hasPin, isLocked, pinLoaded } = useAppLock();
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  // Navigate to the relevant screen when user taps a push notification.
  // Wrapped in try-catch: addNotificationResponseReceivedListener throws when
  // the native module isn't linked (JS-only dev client before native rebuild).
  useEffect(() => {
    let sub: Notifications.EventSubscription | null = null;
    try {
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        const screen = data?.screen as string | undefined;
        if (!screen || !navRef.current) return;
        setTimeout(() => {
          try { (navRef.current as any).navigate(screen, data); } catch { /* unknown screen */ }
        }, 300);
      });
    } catch {
      // Native module not yet linked
    }
    return () => { sub?.remove(); };
  }, []);

  // Waits on fonts, auth session restore, the tenant's org/branding fetch,
  // AND the PIN-lock check — the single gate for the splash, so
  // AppSplashScreen mounts exactly once for the whole boot sequence and
  // stays mounted continuously until all four are ready. This used to be
  // split across two components (this gate, plus a separate AppLockGate
  // wrapper checking pinLoaded on its own) — each rendered its own
  // AppSplashScreen, so the splash's entrance animation actually played
  // twice in a row as the app moved from one gate to the other.
  if (!fontsLoaded || isLoading || orgLoading || !pinLoaded) {
    return <AppSplashScreen orgName={orgName} />;
  }

  if (!staff) return <LoginScreen />;

  // Between login and center selection — show the center picker full-screen
  if (pendingCenters) return <CenterSelectScreen />;

  // Zero CenterStaff assignments — distinct from All Centers mode (see
  // AuthContext.tsx). Screens past this point assume at least one
  // assignment, so this must gate before the normal Stack ever mounts.
  if (noCentersAssigned) return <NoCenterAssignedScreen />;

  // Only lock when a PIN has been configured AND the app is currently
  // locked — staff is already guaranteed non-null past this point.
  if (hasPin && isLocked) return <AppLockScreen />;

  return (
    <NavigationContainer ref={navRef}>
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
        <Stack.Screen name="FacultyAttendance" component={FacultyAttendanceScreen} />
        <Stack.Screen name="SubjectList"    component={SubjectListScreen} />
        <Stack.Screen name="CreateSubject"  component={CreateSubjectScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="EditSubject"    component={EditSubjectScreen}   options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="StudentList"   component={StudentListScreen} />
        <Stack.Screen name="NewAdmission" component={StudentAdmissionScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="EditStudent"  component={EditStudentScreen}     options={{ animation: "slide_from_bottom" }} />

        {/* Leads */}
        <Stack.Screen name="Leads"   component={LeadsScreen} />
        <Stack.Screen name="AddLead" component={AddLeadScreen} options={{ animation: "slide_from_bottom" }} />

        {/* Admission Applications (self-service) */}
        <Stack.Screen name="AdmissionApplications" component={AdmissionApplicationsScreen} />

        {/* Fees */}
        <Stack.Screen name="FeesList"          component={FeesScreen}             />
        <Stack.Screen name="FeeScheduleDetail" component={FeeScheduleDetailScreen} />
        <Stack.Screen name="FeeStructure"      component={FeeStructureScreen}     options={{ animation: "slide_from_bottom" }} />

        {/* Class Schedule */}
        <Stack.Screen name="BatchSchedule" component={BatchScheduleScreen} />
        <Stack.Screen name="SessionDetail" component={SessionDetailScreen} />

        {/* Notifications */}
        <Stack.Screen name="Notifications" component={NotificationsScreen} />

        {/* Admin-only management screens */}
        <Stack.Screen name="CenterManagement" component={CenterManagementScreen} />
        <Stack.Screen name="StaffManagement"  component={StaffManagementScreen} />
        <Stack.Screen name="OrganizationSettings" component={OrganizationSettingsScreen} />

        {/* Legacy screens */}
        <Stack.Screen name="Students" component={StudentsScreen} options={{ headerShown: true }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function ThemedStatusBar() {
  const colors = useThemeColors();
  const barStyle = colors.headerText === "#FFFFFF" ? "light-content" : "dark-content";
  return <StatusBar barStyle={barStyle} translucent backgroundColor={colors.headerBg} />;
}

export function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  return (
    <NetworkProvider>
      <AlertProvider>
        <ThemedStatusBar />
        <AppLockProvider>
          <RootNavigatorInner fontsLoaded={fontsLoaded} />
          <NetworkBanner />
          <UpdateBanner />
        </AppLockProvider>
      </AlertProvider>
    </NetworkProvider>
  );
}
