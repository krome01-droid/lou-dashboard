"use client"

import { SessionProvider } from "next-auth/react"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath="/admin-lou/api/auth">{children}</SessionProvider>
}
