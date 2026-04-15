import { ghlFetchV2 } from "./client"
import { getAllContacts, findContactByEmail, type GHLContact } from "./contacts"

const EMAIL_FROM = "Auto-Ecole Magazine <contact@autoecolemagazine.fr>"

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function personalize(html: string, contact: GHLContact): string {
  return html.replace(
    /\{\{contact\.first_name\}\}/g,
    contact.firstName?.trim() || "",
  )
}

interface SendResult {
  contactId: string
  email: string
  success: boolean
  error?: string
}

/**
 * Send an email to a single contact via GHL v2 Conversations API.
 * Ported from send_newsletter.py send_to_contact()
 */
export async function sendEmailToContact(
  contact: GHLContact,
  subject: string,
  html: string,
): Promise<SendResult> {
  const personalizedHtml = personalize(html, contact)

  try {
    await ghlFetchV2("/conversations/messages", {
      method: "POST",
      body: JSON.stringify({
        type: "Email",
        contactId: contact.id,
        subject,
        html: personalizedHtml,
        emailFrom: EMAIL_FROM,
      }),
    })
    return { contactId: contact.id, email: contact.email!, success: true }
  } catch (err) {
    return {
      contactId: contact.id,
      email: contact.email!,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Send email to all contacts with rate limiting.
 * Ported from send_newsletter.py send_all()
 * Rate limit: sleep 1s every 10 contacts, matches Python pattern.
 */
export async function sendBulkEmail(
  subject: string,
  html: string,
): Promise<{ total: number; success: number; errors: SendResult[] }> {
  const contacts = await getAllContacts()
  const total = contacts.length
  let success = 0
  const errors: SendResult[] = []

  for (let i = 0; i < contacts.length; i++) {
    const result = await sendEmailToContact(contacts[i], subject, html)
    if (result.success) {
      success++
    } else {
      errors.push(result)
    }

    // Rate limiting: 1s pause every 10 contacts
    if ((i + 1) % 10 === 0) {
      await sleep(1000)
    }
  }

  return { total, success, errors }
}

/**
 * Send a preview email to krome01@gmail.com (or first contact as fallback).
 */
export async function sendPreviewEmail(
  subject: string,
  html: string,
): Promise<SendResult> {
  // Try to find the test contact directly (faster than loading all contacts)
  const testContact = await findContactByEmail("krome01@gmail.com")
  if (testContact) {
    return sendEmailToContact(testContact, `[PREVIEW] ${subject}`, html)
  }

  // Fallback: get first contact
  const contacts = await getAllContacts()
  if (contacts.length === 0) {
    return { contactId: "", email: "", success: false, error: "Aucun contact trouvé dans GHL" }
  }

  return sendEmailToContact(contacts[0], `[PREVIEW] ${subject}`, html)
}
