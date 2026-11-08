import api from './client'

export interface OrganizationOut {
  id: number
  name: string
  description: string | null
  owner_id: number
  created_at: string
  member_count: number
}

export interface MemberOut {
  id: number
  user_id: number
  username: string
  email: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}

export interface CategoryOut {
  id: number
  name: string
  description: string | null
  parent_id: number | null
  order_index: number
  children: CategoryOut[]
}

export interface TemplateCategory {
  name: string
  description: string | null
  children: TemplateCategory[]
}

export interface ClassificationTemplate {
  key: string
  name: string
  summary: string
  description: string
  suitable_for: string
  default_prompt: string
  categories: TemplateCategory[]
}

export interface ClassificationConfig {
  organization_id: number
  template_key: string | null
  template_name: string | null
  custom_prompt: string | null
  effective_prompt: string | null
  updated_at: string | null
}

export const orgApi = {
  create: (data: { name: string; description?: string }) =>
    api.post<OrganizationOut>('/api/organizations', data),

  list: () => api.get<OrganizationOut[]>('/api/organizations'),

  get: (id: number) => api.get<OrganizationOut>(`/api/organizations/${id}`),

  update: (id: number, data: { name?: string; description?: string }) =>
    api.patch<OrganizationOut>(`/api/organizations/${id}`, data),

  listMembers: (id: number) =>
    api.get<MemberOut[]>(`/api/organizations/${id}/members`),

  inviteMember: (id: number, data: { email: string; role: string }) =>
    api.post<MemberOut>(`/api/organizations/${id}/members`, data),

  removeMember: (orgId: number, userId: number) =>
    api.delete(`/api/organizations/${orgId}/members/${userId}`),

  getCategories: (id: number) =>
    api.get<CategoryOut[]>(`/api/organizations/${id}/categories`),

  createCategory: (id: number, data: { name: string; description?: string; parent_id?: number; order_index?: number }) =>
    api.post<CategoryOut>(`/api/organizations/${id}/categories`, data),

  updateCategory: (orgId: number, catId: number, data: { name?: string; description?: string; order_index?: number }) =>
    api.patch<CategoryOut>(`/api/organizations/${orgId}/categories/${catId}`, data),

  deleteCategory: (orgId: number, catId: number) =>
    api.delete(`/api/organizations/${orgId}/categories/${catId}`),

  getClassificationTemplates: () =>
    api.get<ClassificationTemplate[]>('/api/classification/templates'),

  getClassification: (id: number) =>
    api.get<ClassificationConfig>(`/api/organizations/${id}/classification`),

  updateClassification: (id: number, data: {
    template_key: string
    custom_prompt?: string
    replace_existing?: boolean
  }) => api.put<ClassificationConfig>(`/api/organizations/${id}/classification`, data),
}
