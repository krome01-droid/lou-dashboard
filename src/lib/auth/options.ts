import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "WordPress",
      credentials: {
        username: { label: "Identifiant", type: "text" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        // Local admin account — credentials stored in ADMIN_USERNAME / ADMIN_PASSWORD env vars
        const adminUser = process.env.ADMIN_USERNAME ?? "lou"
        const adminPass = process.env.ADMIN_PASSWORD
        if (
          adminPass &&
          credentials.username === adminUser &&
          credentials.password === adminPass
        ) {
          return {
            id: "lou",
            name: "Lou",
            email: "lou@autoecolemagazine.fr",
          }
        }

        // Validate credentials against WordPress REST API
        const wpUrl = process.env.WP_URL
        const creds = Buffer.from(
          `${credentials.username}:${credentials.password}`,
        ).toString("base64")

        try {
          const res = await fetch(`${wpUrl}/wp-json/wp/v2/users/me`, {
            headers: { Authorization: `Basic ${creds}` },
          })

          if (!res.ok) return null

          const wpUser = await res.json()

          // Only allow administrators
          if (
            !wpUser.capabilities?.administrator &&
            !wpUser.roles?.includes("administrator")
          ) {
            return null
          }

          return {
            id: String(wpUser.id),
            name: wpUser.name,
            email: wpUser.email ?? `${credentials.username}@autoecolemagazine.fr`,
            image: wpUser.avatar_urls?.["96"] ?? null,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 jours
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
}
