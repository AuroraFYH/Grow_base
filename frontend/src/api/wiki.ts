import api from './client'

export type WikiCitation = {
  id: number
  source_id: number
  source_title: string
  citation_key: string
  claim_text: string | null
  quote: string
  locator: string | null
  verified: boolean
}

export type WikiLink = {
  id: number
  target_page_id: number
  target_title: string
  label: string | null
  context: string | null
}

export type WikiPage = {
  id: number
  organization_id: number
  category_id: number | null
  title: string
  slug: string
  page_type: string
  summary: string | null
  content: string
  status: string
  version: number
  ai_managed: boolean
  created_by: number
  updated_by: number
  created_at: string
  updated_at: string | null
  citations: WikiCitation[]
  outgoing_links: WikiLink[]
  incoming_count: number
}

export type ProposalPageChange = {
  action: 'create' | 'update'
  page_id: number | null
  title: string
  page_type: string
  summary: string | null
  content: string
  previous_content?: string | null
  reason: string | null
  citations: Array<{
    key: string
    claim: string | null
    quote: string
    locator: string | null
    verified: boolean
  }>
  links: string[]
}

export type KnowledgeProposal = {
  id: number
  organization_id: number
  source_id: number
  source_title: string
  created_by: number
  reviewed_by: number | null
  title: string
  summary: string | null
  instructions: string | null
  status: 'generating' | 'pending' | 'approved' | 'rejected' | 'failed'
  change_set: {
    summary?: string
    pages?: ProposalPageChange[]
    conflicts?: Array<Record<string, string>>
    validation?: { page_count?: number; unverified_citation_count?: number }
  }
  error: string | null
  created_at: string
  reviewed_at: string | null
  updated_at: string | null
  vault_sync_status?: 'synced' | 'skipped' | 'failed' | null
  vault_sync_message?: string | null
}

export type WikiVaultSync = {
  status: 'synced'
  vault_path: string
  written_count: number
  files: string[]
}

export type WikiHealth = {
  page_count: number
  citation_count: number
  link_count: number
  pending_proposal_count: number
  health_score: number
  issues: Array<{
    type: 'no_citation' | 'orphan' | 'unverified_citation' | 'duplicate_title'
    page_id: number | null
    title: string
    detail: string
  }>
}

export const wikiApi = {
  listPages: (orgId: number, search?: string) =>
    api.get<WikiPage[]>(`/api/organizations/${orgId}/wiki/pages`, { params: search ? { search } : undefined }),

  getPage: (orgId: number, pageId: number) =>
    api.get<WikiPage>(`/api/organizations/${orgId}/wiki/pages/${pageId}`),

  listProposals: (orgId: number, status?: string) =>
    api.get<KnowledgeProposal[]>(`/api/organizations/${orgId}/wiki/proposals`, { params: status ? { status } : undefined }),

  createProposal: (orgId: number, sourceId: number, instructions?: string, force = false) =>
    api.post<KnowledgeProposal>(`/api/organizations/${orgId}/wiki/proposals`, {
      source_id: sourceId,
      instructions,
      force,
    }),

  approveProposal: (orgId: number, proposalId: number, changeSet?: KnowledgeProposal['change_set']) =>
    api.post<KnowledgeProposal>(`/api/organizations/${orgId}/wiki/proposals/${proposalId}/approve`, changeSet ? { change_set: changeSet } : {}),

  rejectProposal: (orgId: number, proposalId: number) =>
    api.post<KnowledgeProposal>(`/api/organizations/${orgId}/wiki/proposals/${proposalId}/reject`),

  health: (orgId: number) =>
    api.get<WikiHealth>(`/api/organizations/${orgId}/wiki/health`),

  syncVault: (orgId: number) =>
    api.post<WikiVaultSync>(`/api/organizations/${orgId}/wiki/vault/sync`),
}
