import { ghlFetchV2 } from "./client"

const loc = () => process.env.GHL_LOCATION_ID!

// ─── Types ────────────────────────────────────────────────────────

export interface GHLContactFull {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  tags?: string[]
  customFields?: { id: string; field_value: string }[]
  source?: string
  dateAdded?: string
  dateUpdated?: string
  assignedTo?: string
  companyName?: string
  address1?: string
  city?: string
  country?: string
}

export interface CreateContactInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  tags?: string[]
  source?: string
  companyName?: string
  address1?: string
  city?: string
  country?: string
  customFields?: { id: string; field_value: string }[]
}

export interface GHLOpportunity {
  id: string
  name: string
  monetaryValue?: number
  pipelineId: string
  pipelineStageId: string
  status: "open" | "won" | "lost" | "abandoned"
  contact?: { id: string; name?: string; email?: string }
  assignedTo?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateOpportunityInput {
  name: string
  pipelineId: string
  pipelineStageId: string
  contactId: string
  monetaryValue?: number
  status?: "open" | "won" | "lost" | "abandoned"
  assignedTo?: string
}

export interface GHLPipeline {
  id: string
  name: string
  stages: { id: string; name: string; position?: number }[]
}

export interface GHLConversation {
  id: string
  contactId: string
  fullName?: string
  email?: string
  phone?: string
  type?: string
  lastMessageType?: string
  lastMessageBody?: string
  unreadCount?: number
  dateUpdated?: string
}

export interface GHLWorkflow {
  id: string
  name: string
  status?: string
  createdAt?: string
}

export interface GHLAppointment {
  id: string
  title?: string
  calendarId: string
  contactId?: string
  startTime: string
  endTime: string
  status?: string
  appointmentStatus?: string
}

// ─── Contacts ─────────────────────────────────────────────────────

export async function searchContacts(
  query: string,
  limit = 20,
): Promise<GHLContactFull[]> {
  const res = await ghlFetchV2<{ contacts: GHLContactFull[] }>(
    `/contacts/?locationId=${loc()}&query=${encodeURIComponent(query)}&limit=${limit}`,
  )
  return res.contacts ?? []
}

export async function getContact(contactId: string): Promise<GHLContactFull> {
  const res = await ghlFetchV2<{ contact: GHLContactFull }>(`/contacts/${contactId}`)
  return res.contact
}

export async function createContact(data: CreateContactInput): Promise<GHLContactFull> {
  const res = await ghlFetchV2<{ contact: GHLContactFull }>("/contacts/", {
    method: "POST",
    body: JSON.stringify({ ...data, locationId: loc() }),
  })
  return res.contact
}

export async function updateContact(
  contactId: string,
  data: Partial<CreateContactInput>,
): Promise<GHLContactFull> {
  const res = await ghlFetchV2<{ contact: GHLContactFull }>(`/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
  return res.contact
}

export async function deleteContact(contactId: string): Promise<{ succeeded: boolean }> {
  return ghlFetchV2(`/contacts/${contactId}`, { method: "DELETE" })
}

export async function addContactTags(contactId: string, tags: string[]): Promise<void> {
  await ghlFetchV2(`/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  })
}

export async function removeContactTags(contactId: string, tags: string[]): Promise<void> {
  await ghlFetchV2(`/contacts/${contactId}/tags`, {
    method: "DELETE",
    body: JSON.stringify({ tags }),
  })
}

export async function addContactNote(
  contactId: string,
  body: string,
  userId?: string,
): Promise<{ id: string }> {
  return ghlFetchV2(`/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body, userId: userId ?? process.env.GHL_USER_ID }),
  })
}

export async function createContactTask(
  contactId: string,
  title: string,
  dueDate: string,
  description?: string,
): Promise<{ id: string }> {
  return ghlFetchV2(`/contacts/${contactId}/tasks`, {
    method: "POST",
    body: JSON.stringify({
      title,
      dueDate,
      completed: false,
      description: description ?? "",
      assignedTo: process.env.GHL_USER_ID,
    }),
  })
}

// ─── Opportunities / Pipeline ─────────────────────────────────────

export async function listPipelines(): Promise<GHLPipeline[]> {
  const res = await ghlFetchV2<{ pipelines: GHLPipeline[] }>(
    `/opportunities/pipelines?locationId=${loc()}`,
  )
  return res.pipelines ?? []
}

export async function getOpportunities(params?: {
  pipelineId?: string
  stageId?: string
  status?: string
  contactId?: string
  limit?: number
}): Promise<GHLOpportunity[]> {
  const qs = new URLSearchParams({ location_id: loc() })
  if (params?.pipelineId) qs.set("pipeline_id", params.pipelineId)
  if (params?.stageId) qs.set("pipeline_stage_id", params.stageId)
  if (params?.status) qs.set("status", params.status)
  if (params?.contactId) qs.set("contact_id", params.contactId)
  if (params?.limit) qs.set("limit", String(params.limit))
  const res = await ghlFetchV2<{ opportunities: GHLOpportunity[] }>(
    `/opportunities/search?${qs}`,
  )
  return res.opportunities ?? []
}

export async function createOpportunity(data: CreateOpportunityInput): Promise<GHLOpportunity> {
  const res = await ghlFetchV2<{ opportunity: GHLOpportunity }>("/opportunities/", {
    method: "POST",
    body: JSON.stringify({ ...data, location_id: loc() }),
  })
  return res.opportunity
}

export async function updateOpportunity(
  opportunityId: string,
  data: Partial<Omit<CreateOpportunityInput, "contactId">>,
): Promise<GHLOpportunity> {
  const res = await ghlFetchV2<{ opportunity: GHLOpportunity }>(
    `/opportunities/${opportunityId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  )
  return res.opportunity
}

export async function deleteOpportunity(opportunityId: string): Promise<{ succeeded: boolean }> {
  return ghlFetchV2(`/opportunities/${opportunityId}`, { method: "DELETE" })
}

// ─── Conversations & Messages ─────────────────────────────────────

export async function getConversations(params?: {
  contactId?: string
  limit?: number
  type?: string
}): Promise<GHLConversation[]> {
  const qs = new URLSearchParams({ locationId: loc() })
  if (params?.contactId) qs.set("contactId", params.contactId)
  if (params?.limit) qs.set("limit", String(params.limit))
  if (params?.type) qs.set("type", params.type)
  const res = await ghlFetchV2<{ conversations: GHLConversation[] }>(
    `/conversations/search?${qs}`,
  )
  return res.conversations ?? []
}

export async function getConversationMessages(
  conversationId: string,
  limit = 20,
): Promise<unknown[]> {
  const res = await ghlFetchV2<{ messages: { messages: unknown[] } }>(
    `/conversations/${conversationId}/messages?limit=${limit}`,
  )
  return res.messages?.messages ?? []
}

export async function sendSms(contactId: string, message: string): Promise<{ id: string }> {
  return ghlFetchV2("/conversations/messages", {
    method: "POST",
    body: JSON.stringify({
      type: "SMS",
      contactId,
      message,
    }),
  })
}

// ─── Workflows ────────────────────────────────────────────────────

export async function listWorkflows(): Promise<GHLWorkflow[]> {
  const res = await ghlFetchV2<{ workflows: GHLWorkflow[] }>(
    `/workflows/?locationId=${loc()}`,
  )
  return res.workflows ?? []
}

export async function triggerWorkflow(
  workflowId: string,
  contactId: string,
): Promise<{ ok: boolean }> {
  await ghlFetchV2(`/contacts/${contactId}/workflow/${workflowId}`, {
    method: "POST",
    body: JSON.stringify({ eventStartTime: new Date().toISOString() }),
  })
  return { ok: true }
}

// ─── Calendars & Appointments ─────────────────────────────────────

export interface GHLCalendar {
  id: string
  name: string
  description?: string
  slug?: string
}

export async function listCalendars(): Promise<GHLCalendar[]> {
  const res = await ghlFetchV2<{ calendars: GHLCalendar[] }>(
    `/calendars/?locationId=${loc()}`,
  )
  return res.calendars ?? []
}

export async function getAppointments(params?: {
  calendarId?: string
  contactId?: string
  startDate?: string
  endDate?: string
}): Promise<GHLAppointment[]> {
  const qs = new URLSearchParams({ locationId: loc() })
  if (params?.calendarId) qs.set("calendarId", params.calendarId)
  if (params?.contactId) qs.set("contactId", params.contactId)
  if (params?.startDate) qs.set("startDate", params.startDate)
  if (params?.endDate) qs.set("endDate", params.endDate)
  const res = await ghlFetchV2<{ appointments: GHLAppointment[] }>(
    `/appointments/?${qs}`,
  )
  return res.appointments ?? []
}

export async function createAppointment(data: {
  calendarId: string
  contactId: string
  startTime: string
  endTime: string
  title?: string
  appointmentStatus?: string
  address?: string
  notes?: string
}): Promise<GHLAppointment> {
  const res = await ghlFetchV2<{ appointment: GHLAppointment }>("/appointments/", {
    method: "POST",
    body: JSON.stringify({ ...data, locationId: loc() }),
  })
  return res.appointment
}

export async function cancelAppointment(appointmentId: string): Promise<void> {
  await ghlFetchV2(`/appointments/${appointmentId}`, { method: "DELETE" })
}
