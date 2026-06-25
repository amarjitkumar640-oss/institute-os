import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient, clearAccessToken, getAccessToken, storeAccessToken } from "../api/client";

interface StaffInfo {
  id: string;
  fullName: string;
  role: "admin" | "teacher" | "frontdesk";
}

interface AuthContextValue {
  staff: StaffInfo | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // A stored token without restored staff info still requires re-login;
    // this just avoids flashing the login screen before storage is checked.
    getAccessToken().finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { data } = await apiClient.post("/auth/login", { email, password });
    await storeAccessToken(data.accessToken);
    setStaff(data.staff);
  }

  async function logout() {
    await clearAccessToken();
    setStaff(null);
  }

  return (
    <AuthContext.Provider value={{ staff, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
