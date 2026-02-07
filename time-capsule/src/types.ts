/** Core types for the Time Capsule app */

export interface EmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  labelIds?: string[]
}

export interface ThreadMessage {
  id: string
  from: string
  to: string
  date: string
  body: string
  isHtml: boolean
  isSent: boolean
}

export interface EmailThread {
  id: string
  subject: string
  messages: ThreadMessage[]
}

export interface GmailProfile {
  emailAddress: string
  messagesTotal: number
  historyId: string
}

export type AppView = 'landing' | 'yearPicker' | 'inbox' | 'thread'

export interface AppState {
  view: AppView
  accessToken: string | null
  userEmail: string | null
  selectedYear: number | null
  availableYears: number[]
  emails: EmailMessage[]
  selectedThread: EmailThread | null
  isLoading: boolean
  error: string | null
}
