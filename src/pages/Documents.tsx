import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileImage, FileSpreadsheet, FileText, Search, Upload } from 'lucide-react'
import { DocumentUploadForm } from '../components/workflowForms'
import { Button, Card, EmptyRow, FilterBar, Input, PageHeader, Pill, Select, Table, Td, Th } from '../components/ui'
import type { DocumentRecord } from '../data/types'
import { formatDate } from '../lib/format'
import { useStore } from '../store/store'

const icon = (name: string) => (/\.(jpe?g|png)$/i.test(name) ? FileImage : /\.(xlsx?|csv)$/i.test(name) ? FileSpreadsheet : FileText)

function entityLink(d: DocumentRecord): string | undefined {
  switch (d.entityType) {
    case 'Project': return `/projects/${d.entityId}`
    case 'Phase': return `/phases/${d.entityId}`
    case 'Quotation': return `/quotations/${d.entityId}`
    case 'Contract': return '/contracts'
    case 'Invoice': return '/billing'
    case 'Supplier': return `/suppliers/${d.entityId}`
    case 'Expense': return '/expenses'
  }
}

export function DocumentTable({ docs }: { docs: DocumentRecord[] }) {
  const { db, notify } = useStore()
  return (
    <Table>
      <thead><tr><Th>Document</Th><Th>Type</Th><Th>Project</Th><Th>Linked to</Th><Th>Uploaded</Th><Th>By</Th><Th right>Size</Th></tr></thead>
      <tbody>
        {docs.length === 0 && <EmptyRow cols={7}>No documents</EmptyRow>}
        {docs.map((d) => {
          const Icon = icon(d.name)
          const to = entityLink(d)
          return (
            <tr key={d.id} className="hover:bg-slate-50/60">
              <Td>
                <button type="button" onClick={() => notify(`Opening ${d.name} (demo — no file stored)`, 'info')} className="flex items-center gap-2 text-left font-medium text-navy-900 hover:text-blue-600">
                  <Icon size={16} className="shrink-0 text-slate-400" />{d.name}
                </button>
              </Td>
              <Td><Pill>{d.type}</Pill></Td>
              <Td>{db.projects.find((p) => p.id === d.projectId)?.shortName ?? '—'}</Td>
              <Td>{to ? <Link to={to} className="text-blue-600 hover:underline">{d.entityType} · {d.entityId}</Link> : `${d.entityType} · ${d.entityId}`}</Td>
              <Td className="whitespace-nowrap">{formatDate(d.uploadedAt)}</Td>
              <Td className="text-slate-600">{d.uploadedBy}</Td>
              <Td right className="text-slate-500">{d.sizeKb >= 1024 ? `${(d.sizeKb / 1024).toFixed(1)} MB` : `${d.sizeKb} KB`}</Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

export function Documents() {
  const { db } = useStore()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [project, setProject] = useState('')
  const [entity, setEntity] = useState('')
  const docs = db.documents
    .filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()))
    .filter((d) => !type || d.type === type)
    .filter((d) => !project || d.projectId === project)
    .filter((d) => !entity || d.entityType === entity)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  return (
    <>
      <PageHeader title="Documents" subtitle="Quotations, contracts, BOQs, invoices, receipts, reports and site photos linked to their records."
        actions={<Button variant="primary" icon={<Upload size={15} />} onClick={() => setOpen(true)}>Upload document</Button>} />
      <Card bodyClassName="">
        <FilterBar>
          <div className="relative w-64"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><Input className="pl-9" placeholder="Search file name…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-44" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{[...new Set(db.documents.map((d) => d.type))].map((t) => <option key={t}>{t}</option>)}</Select>
          <Select className="w-48" value={project} onChange={(e) => setProject(e.target.value)}><option value="">All projects</option>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</Select>
          <Select className="w-40" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Any record</option>{['Project', 'Phase', 'Quotation', 'Contract', 'Invoice', 'Expense', 'Supplier'].map((t) => <option key={t}>{t}</option>)}</Select>
        </FilterBar>
        <DocumentTable docs={docs} />
      </Card>
      <DocumentUploadForm open={open} onClose={() => setOpen(false)} projectId={project || undefined} />
    </>
  )
}
