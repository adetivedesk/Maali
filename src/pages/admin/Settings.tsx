import { useState } from 'react'
import { Download, Eraser, RotateCcw, Save } from 'lucide-react'
import { Button, Callout, Card, Field, Input, PageHeader, Textarea } from '../../components/ui'
import type { CompanySettings } from '../../lib/settings'
import { api, useStore } from '../../store/store'

export function Settings() {
  const { settings, setSettings, notify, can, reload, db } = useStore()
  const [f, setF] = useState<CompanySettings>(settings)
  const [busy, setBusy] = useState(false)
  const canWrite = can('settings', 'write')
  const canDelete = can('settings', 'delete')
  const set = (k: keyof CompanySettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const records = Object.values(db).reduce((a, l) => a + l.length, 0)

  async function save() {
    setBusy(true)
    try {
      const r = await api<{ settings: CompanySettings }>('admin', { method: 'POST', body: JSON.stringify({ action: 'saveSettings', settings: f }) })
      setSettings(r.settings); notify('Company settings saved')
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }

  async function dangerous(action: 'resetDemo' | 'clearBusinessData', word: string, question: string, done: string) {
    const typed = window.prompt(`${question}\n\nType ${word} to confirm.`)
    if (typed !== word) { if (typed !== null) notify('Not confirmed — nothing was changed', 'info'); return }
    setBusy(true)
    try {
      await api('admin', { method: 'POST', body: JSON.stringify({ action, confirm: word }) })
      await reload(); notify(done, 'info')
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Settings & Backup" subtitle="Company letterhead for printed documents, data backup, and pilot data controls." />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Company profile" subtitle="Printed on quotations, invoices and receipts."
          actions={canWrite && <Button variant="primary" icon={<Save size={14} />} disabled={busy} onClick={save}>Save</Button>}>
          <fieldset disabled={!canWrite} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company name"><Input value={f.name} onChange={set('name')} /></Field>
            <Field label="Tagline"><Input value={f.tagline} onChange={set('tagline')} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={f.address} onChange={set('address')} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><Input value={f.email} onChange={set('email')} /></Field>
            <Field label="GSTIN (optional)" hint="Printed for reference only; GST is not calculated in the pilot."><Input value={f.gstin} onChange={set('gstin')} /></Field>
            <Field label="Bank details for payment"><Textarea rows={2} value={f.bankDetails} onChange={set('bankDetails')} placeholder="A/c name, number, IFSC, bank & branch" /></Field>
            <Field label="Footer note" className="sm:col-span-2"><Input value={f.footer} onChange={set('footer')} /></Field>
          </fieldset>
        </Card>

        <div className="space-y-5">
          <Card title="Backup" subtitle="Download every record as one JSON file.">
            <p className="text-sm text-slate-600">Includes all business tables, users (without passwords), roles and settings. Neon also keeps a point-in-time restore window for the database — see the Neon console for your plan's retention.</p>
            <a href="/api/admin?view=export" download className="mt-3 inline-block"><Button icon={<Download size={14} />}>Download backup</Button></a>
            <p className="mt-2 text-xs text-slate-500">Recommended: download weekly during the pilot and keep it with your accounts records.</p>
          </Card>

          {canDelete && (
            <Card title="Pilot data" subtitle={`${records.toLocaleString('en-IN')} business records in the database`}>
              <Callout tone="warning">These affect every user. Users, roles and settings are always kept, and the action is recorded in the activity log.</Callout>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="danger" icon={<Eraser size={14} />} disabled={busy}
                  onClick={() => dangerous('clearBusinessData', 'CLEAR', 'Delete ALL business data (clients, projects, costs, invoices, payments, documents) to start the pilot with real data?', 'All business data cleared — ready for real data')}>
                  Clear all business data
                </Button>
                <Button icon={<RotateCcw size={14} />} disabled={busy}
                  onClick={() => dangerous('resetDemo', 'RESET', 'Replace ALL business data with the demo data?', 'Demo data restored')}>
                  Reload demo data
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
