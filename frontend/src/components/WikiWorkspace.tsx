import { useCallback, useEffect, useState } from 'react'
import { Modal, Popconfirm, message } from 'antd'

import { wikiApi } from '../api/wiki'
import type { KnowledgeProposal, ProposalPageChange, WikiHealth, WikiPage } from '../api/wiki'

type WikiSection = 'wiki' | 'review' | 'health'

type Props = {
  orgId: number
  section: WikiSection
  isAdmin: boolean
  refreshToken: number
  onOpenReview: () => void
  theme: 'tech' | 'piggy'
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  concept: '概念',
  entity: '实体',
  overview: '总览',
  comparison: '对比',
  tutorial: '教程',
}

function proposalStatus(status: KnowledgeProposal['status']) {
  if (status === 'generating') return { label: '生成中', cls: 'generating' }
  if (status === 'pending') return { label: '待审核', cls: 'pending' }
  if (status === 'approved') return { label: '已发布', cls: 'approved' }
  if (status === 'rejected') return { label: '已拒绝', cls: 'rejected' }
  return { label: '生成失败', cls: 'failed' }
}

export default function WikiWorkspace({ orgId, section, isAdmin, refreshToken, onOpenReview, theme }: Props) {
  const [pages, setPages] = useState<WikiPage[]>([])
  const [proposals, setProposals] = useState<KnowledgeProposal[]>([])
  const [health, setHealth] = useState<WikiHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null)
  const [selectedProposal, setSelectedProposal] = useState<KnowledgeProposal | null>(null)
  const [draftPages, setDraftPages] = useState<ProposalPageChange[]>([])
  const [actionId, setActionId] = useState<number | null>(null)
  const [syncingVault, setSyncingVault] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (section === 'wiki') {
        const { data } = await wikiApi.listPages(orgId)
        setPages(data)
      } else if (section === 'review') {
        const { data } = await wikiApi.listProposals(orgId)
        setProposals(data)
        setSelectedProposal((current) => current ? data.find((item) => item.id === current.id) ?? null : null)
      } else {
        const { data } = await wikiApi.health(orgId)
        setHealth(data)
      }
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Wiki 数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [orgId, section])

  useEffect(() => { void load() }, [load, refreshToken])

  useEffect(() => {
    if (section !== 'review' || !proposals.some((proposal) => proposal.status === 'generating')) return
    const timer = window.setTimeout(() => { void load() }, 3000)
    return () => window.clearTimeout(timer)
  }, [section, proposals, load])

  const openPage = async (pageId: number) => {
    try {
      const { data } = await wikiApi.getPage(orgId, pageId)
      setSelectedPage(data)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '页面加载失败')
    }
  }

  const approve = async (proposal: KnowledgeProposal) => {
    setActionId(proposal.id)
    try {
      const { data } = await wikiApi.approveProposal(orgId, proposal.id, {
        ...proposal.change_set,
        pages: draftPages.length ? draftPages : proposal.change_set.pages ?? [],
      })
      if (data.vault_sync_status === 'failed') message.warning(data.vault_sync_message)
      else message.success(data.vault_sync_message || '提案已发布到正式 Wiki')
      setSelectedProposal(null)
      await load()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '发布失败')
    } finally {
      setActionId(null)
    }
  }

  const openProposal = (proposal: KnowledgeProposal) => {
    setSelectedProposal(proposal)
    setDraftPages(structuredClone(proposal.change_set.pages ?? []))
  }

  const updateDraftContent = (index: number, content: string) => {
    setDraftPages((current) => current.map((page, pageIndex) => pageIndex === index ? { ...page, content } : page))
  }

  const syncVault = async () => {
    setSyncingVault(true)
    try {
      const { data } = await wikiApi.syncVault(orgId)
      message.success(`已将 ${data.written_count} 个 Wiki 页面同步到 ${data.vault_path}`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Vault 同步失败')
    } finally {
      setSyncingVault(false)
    }
  }

  const reject = async (proposal: KnowledgeProposal) => {
    setActionId(proposal.id)
    try {
      await wikiApi.rejectProposal(orgId, proposal.id)
      message.success('提案已拒绝，正式 Wiki 未发生变化')
      setSelectedProposal(null)
      await load()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '操作失败')
    } finally {
      setActionId(null)
    }
  }

  if (loading && !pages.length && !proposals.length && !health) {
    return <div className="wiki-loading">正在读取自生长知识库…</div>
  }

  if (section === 'wiki') {
    return (
      <div className="wiki-workspace">
        {isAdmin && (
          <div className="wiki-toolbar">
            <span>审核发布后的正式知识会同步为 Obsidian Markdown。</span>
            <button className="ws-btn" disabled={syncingVault} onClick={() => void syncVault()}>
              {syncingVault ? '同步中…' : '同步到 Vault'}
            </button>
          </div>
        )}
        {pages.length === 0 ? (
          <div className="wiki-empty">
            <span className="wiki-empty-mark">W</span>
            <strong>正式 Wiki 还是空的</strong>
            <p>回到资料箱，选择一份有长期价值的资料并点击“沉淀到 Wiki”。</p>
          </div>
        ) : (
          <div className="wiki-page-grid">
            {pages.map((page) => (
              <button key={page.id} className="wiki-page-card" onClick={() => void openPage(page.id)}>
                <span className="wiki-page-type">{PAGE_TYPE_LABELS[page.page_type] ?? page.page_type}</span>
                <strong>{page.title}</strong>
                <p>{page.summary || '暂无页面摘要'}</p>
                <span className="wiki-page-meta">v{page.version} · {page.incoming_count} 个反向链接</span>
              </button>
            ))}
          </div>
        )}

        <Modal rootClassName={theme === 'piggy' ? 'piggy-modal' : ''} title={selectedPage?.title} open={Boolean(selectedPage)} onCancel={() => setSelectedPage(null)} footer={null} width={900}>
          {selectedPage && (
            <div className="wiki-page-detail">
              <div className="wiki-detail-meta">
                <span>{PAGE_TYPE_LABELS[selectedPage.page_type] ?? selectedPage.page_type}</span>
                <span>版本 {selectedPage.version}</span>
                <span>{selectedPage.citations.length} 条来源引用</span>
              </div>
              <article className="wiki-markdown">{selectedPage.content}</article>
              <section className="wiki-evidence">
                <h3>来源证据</h3>
                {selectedPage.citations.length === 0 ? <p>这个页面还没有来源引用。</p> : selectedPage.citations.map((citation) => (
                  <div key={citation.id} className="wiki-evidence-item">
                    <div><strong>{citation.source_title}</strong><span className={citation.verified ? 'verified' : 'unverified'}>{citation.verified ? '已核对' : '待核对'}</span></div>
                    {citation.claim_text && <p>{citation.claim_text}</p>}
                    <blockquote>{citation.quote}</blockquote>
                  </div>
                ))}
              </section>
              {selectedPage.outgoing_links.length > 0 && (
                <section className="wiki-related">
                  <h3>相关页面</h3>
                  <div>{selectedPage.outgoing_links.map((link) => <button key={link.id} onClick={() => void openPage(link.target_page_id)}>{link.target_title}</button>)}</div>
                </section>
              )}
            </div>
          )}
        </Modal>
      </div>
    )
  }

  if (section === 'review') {
    return (
      <div className="wiki-workspace">
        {proposals.length === 0 ? (
          <div className="wiki-empty"><span className="wiki-empty-mark">✓</span><strong>没有知识提案</strong><p>从资料箱发起沉淀后，AI 生成的页面变更会出现在这里。</p></div>
        ) : (
          <div className="proposal-list">
            {proposals.map((proposal) => {
              const meta = proposalStatus(proposal.status)
              const pageCount = proposal.change_set.pages?.length ?? 0
              return (
                <button key={proposal.id} className="proposal-card" onClick={() => openProposal(proposal)}>
                  <span className={`proposal-status ${meta.cls}`}>{meta.label}</span>
                  <div><strong>{proposal.title}</strong><p>{proposal.summary || proposal.error || 'AI 正在分析资料和已有 Wiki…'}</p></div>
                  <span className="proposal-count">{pageCount} 项变更</span>
                </button>
              )
            })}
          </div>
        )}

        <Modal rootClassName={theme === 'piggy' ? 'piggy-modal' : ''} title={selectedProposal?.title} open={Boolean(selectedProposal)} onCancel={() => setSelectedProposal(null)} footer={null} width={920}>
          {selectedProposal && (
            <div className="proposal-detail">
              <div className="proposal-source"><small>原始资料</small><strong>{selectedProposal.source_title}</strong></div>
              {selectedProposal.error && <div className="proposal-error">{selectedProposal.error}</div>}
              {(selectedProposal.change_set.conflicts?.length ?? 0) > 0 && (
                <div className="proposal-conflicts"><strong>发现知识冲突</strong><span>{selectedProposal.change_set.conflicts?.length} 处，需要管理员判断后再发布。</span></div>
              )}
              <div className="proposal-changes">
                {(selectedProposal.status === 'pending' && draftPages.length ? draftPages : selectedProposal.change_set.pages ?? []).map((change, index) => (
                  <section key={`${change.title}-${index}`} className="proposal-change">
                    <header><span className={change.action}>{change.action === 'create' ? '新增页面' : '更新页面'}</span><strong>{change.title}</strong></header>
                    {change.reason && <p className="proposal-reason">{change.reason}</p>}
                    {change.action === 'update' && change.previous_content && (
                      <details className="proposal-previous"><summary>查看发布前的页面内容</summary><article>{change.previous_content}</article></details>
                    )}
                    {isAdmin && selectedProposal.status === 'pending' ? (
                      <textarea
                        className="proposal-editor"
                        value={change.content}
                        onChange={(event) => updateDraftContent(index, event.target.value)}
                        aria-label={`编辑 ${change.title} 页面正文`}
                      />
                    ) : <article className="proposal-preview">{change.content}</article>}
                    <div className="proposal-citations">
                      {change.citations.map((citation) => (
                        <div key={citation.key} className={citation.verified ? 'verified' : 'unverified'}>
                          <strong>{citation.verified ? '引用已核对' : '引用未在原文中找到'}</strong>
                          <span>{citation.quote}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {isAdmin && selectedProposal.status === 'pending' && (
                <div className="proposal-actions">
                  <Popconfirm title="拒绝后正式 Wiki 不会发生变化" onConfirm={() => void reject(selectedProposal)}>
                    <button className="ws-btn" disabled={actionId === selectedProposal.id}>拒绝提案</button>
                  </Popconfirm>
                  <button
                    className="ws-btn ws-btn-primary"
                    disabled={actionId === selectedProposal.id || Boolean(selectedProposal.change_set.validation?.unverified_citation_count)}
                    onClick={() => void approve(selectedProposal)}
                  >
                    {actionId === selectedProposal.id ? '发布中…' : '批准并发布'}
                  </button>
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>
    )
  }

  return (
    <div className="wiki-workspace">
      {!health ? null : (
        <>
          <div className="health-overview">
            <div className="health-score"><strong>{health.health_score}</strong><span>知识健康度</span></div>
            <div><strong>{health.page_count}</strong><span>正式页面</span></div>
            <div><strong>{health.citation_count}</strong><span>来源引用</span></div>
            <div><strong>{health.link_count}</strong><span>页面关系</span></div>
            <button className="health-pending" onClick={onOpenReview}><strong>{health.pending_proposal_count}</strong><span>待处理提案</span></button>
          </div>
          <div className="health-issues">
            <h3>需要处理</h3>
            {health.page_count === 0 ? <div className="health-ok">正式 Wiki 为空，发布第一个知识提案后开始计算健康度。</div> : health.issues.length === 0 ? <div className="health-ok">当前没有发现断开的知识结构或无来源页面。</div> : health.issues.map((issue, index) => (
              <div key={`${issue.type}-${issue.page_id}-${index}`} className="health-issue">
                <span>{issue.type === 'no_citation' ? '缺少来源' : issue.type === 'orphan' ? '孤立页面' : '引用待核对'}</span>
                <strong>{issue.title}</strong>
                <p>{issue.detail}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
