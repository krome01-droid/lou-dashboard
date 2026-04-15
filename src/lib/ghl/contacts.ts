import { ghlFetchV2 } from "./client"

export interface GHLContact {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  tags?: string[]
}

interface ContactsV2Response {
  contacts: GHLContact[]
  meta?: { startAfterId?: string; startAfter?: number; total?: number }
}

function getLocationId(): string {
  return process.env.GHL_LOCATION_ID ?? ""
}

/**
 * Fetch all contacts with email from GHL v2 API.
 * Paginates through all pages (100 per page).
 */
export async function getAllContacts(): Promise<GHLContact[]> {
  const allContacts: GHLContact[] = []
  const locationId = getLocationId()
  let startAfterId: string | undefined

  // Safety limit: max 10 pages (1000 contacts)
  for (let page = 0; page < 10; page++) {
    let path = `/contacts/?locationId=${locationId}&limit=100`
    if (startAfterId) path += `&startAfterId=${startAfterId}`

    const response = await ghlFetchV2<ContactsV2Response>(path)
    const contacts = response.contacts ?? []
    allContacts.push(...contacts)

    if (contacts.length < 100 || !response.meta?.startAfterId) break
    startAfterId = response.meta.startAfterId
  }

  return allContacts.filter((c) => c.email?.trim())
}

/**
 * Search for a specific contact by email.
 */
export async function findContactByEmail(email: string): Promise<GHLContact | null> {
  const locationId = getLocationId()
  const response = await ghlFetchV2<ContactsV2Response>(
    `/contacts/?locationId=${locationId}&query=${encodeURIComponent(email)}&limit=1`,
  )
  const contact = response.contacts?.[0]
  return contact?.email?.toLowerCase() === email.toLowerCase() ? contact : null
}
