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

    const nextId = response.meta?.startAfterId
    // Stop at the last page, OR if the cursor stops advancing. Without the
    // `nextId === startAfterId` guard the same page can be refetched in a loop,
    // and every contact on it would be emailed again (the newsletter "spam" bug).
    if (contacts.length < 100 || !nextId || nextId === startAfterId) break
    startAfterId = nextId
  }

  // Keep contacts with an email, deduplicated by address. The imported base
  // holds duplicate records that share one email, and overlapping pages can
  // repeat a contact — without this dedup each duplicate receives its own copy
  // of every send (cause of the repeated newsletters to the same recipient).
  const seen = new Set<string>()
  const unique: GHLContact[] = []
  for (const c of allContacts) {
    const email = c.email?.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    unique.push(c)
  }
  return unique
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
