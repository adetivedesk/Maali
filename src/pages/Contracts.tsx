import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Upload } from 'lucide-react'
import { ContractUploadForm } from '../components/workflowForms'
import { Button, Card, EmptyRow, Kpi, KpiGrid, Money, PageHeader, StatusBadge, Table, Td, Th } from '../components/ui'
import { formatCompact, formatDate } from '../lib/format'
import { useStore } from '../store/store'

export function Contracts() {
  const { db, notify } = useStore()
  const [upload, setUpload] = useState<string | null>(null)
  const rows = [...db.contracts].sort((a, b) => b.id.localeCompare(a.id))
  const active = rows.filter((c) => c.status === 'Active')
  return (
    <>
      <PageHeader title="Contracts" subtitle="Signed client contracts. A project becomes Active once its signed contract is uploaded." />
      <KpiGrid cols={4}>
        <Kpi label="Contracts" value={rows.length} />
        <Kpi label="Active contract value" value={formatCompact(active.reduce((a, c) => a + c.value, 0))} sub={`${active.length} active`} />
        <Kpi label="Pending signature" value={rows.filter((c) => c.status === 'Pending Signature').length} tone="warning" />
        <Kpi label="Completed" value={rows.filter((c) => c.status === 'Completed').length} tone="positive" />
      </KpiGrid>
      <Card className="mt-5" bodyClassName="">
        <Table>
          <thead><tr><Th>Contract no.</Th><Th>Project</Th><Th>Client</Th><Th right>Contract value</Th><Th>Start</Th><Th>End</Th><Th>Signed</Th><Th>Document</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={9} />}
            {rows.map((c) => {
              const doc = db.documents.find((d) => d.id === c.documentId)
              return (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <Td className="font-medium text-navy-900">{c.id}</Td>
                  <Td><Link to={`/projects/${c.projectId}`} className="hover:text-blue-600">{db.projects.find((p) => p.id === c.projectId)?.name}</Link></Td>
                  <Td>{db.clients.find((x) => x.id === c.clientId)?.name}</Td>
                  <Td right><Money value={c.value} /></Td>
                  <Td className="whitespace-nowrap">{formatDate(c.startDate)}</Td>
                  <Td className="whitespace-nowrap">{formatDate(c.endDate)}</Td>
                  <Td className="whitespace-nowrap">{formatDate(c.signedDate)}</Td>
                  <Td>
                    {doc ? (
                      <button type="button" onClick={() => notify(`Opening ${doc.name} (demo — no file stored)`, 'info')} className="inline-flex items-center gap-1.5 text-blue-600 hover:underline">
                        <FileText size={14} />{doc.name}
                      </button>
                    ) : <Button size="sm" variant="primary" icon={<Upload size={12} />} onClick={() => setUpload(c.id)}>Upload signed</Button>}
                  </Td>
                  <Td><StatusBadge status={c.status} /></Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>
      {upload && <ContractUploadForm open onClose={() => setUpload(null)} contractId={upload} />}
    </>
  )
}
