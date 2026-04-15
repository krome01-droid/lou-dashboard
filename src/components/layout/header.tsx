"use client"

import { useSession, signOut } from "next-auth/react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut } from "lucide-react"

export function Header({ title, children }: { title?: string; children?: React.ReactNode }) {
  const { data: session } = useSession()
  const user = session?.user

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <h2 className="text-lg font-semibold">{title ?? "Dashboard"}</h2>

      <div className="flex items-center gap-3">
        {children}

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.image ?? undefined} />
                <AvatarFallback className="text-xs">
                  {user.name?.charAt(0)?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline">{user.name}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
