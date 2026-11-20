/** Company profile used as the letterhead on printed quotations, invoices and receipts. */
export interface CompanySettings {
  name: string
  tagline: string
  address: string
  phone: string
  email: string
  gstin: string
  bankDetails: string
  footer: string
}

export const DEFAULT_SETTINGS: CompanySettings = {
  name: 'Maali Constructions', tagline: 'Civil Engineering & Construction', address: '', phone: '', email: '', gstin: '',
  bankDetails: '', footer: 'Thank you for your business.',
}
