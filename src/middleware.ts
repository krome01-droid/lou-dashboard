import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/google") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next()
  }

  // Internal server-to-server calls (tool-executor → API routes)
  const internalSecret = req.headers.get("x-internal-secret")
  if (internalSecret && internalSecret === process.env.NEXTAUTH_SECRET) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = "/login"
    // callbackUrl must include basePath for NextAuth redirect to work
    loginUrl.searchParams.set("callbackUrl", `/admin-lou${pathname}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
