// "Download backup": saves everything in FinTrack to one file on this device.
// The file holds every table in full, so it can be used to restore the data.
// For a readable list of entries, use Export CSV on the Transactions page.

import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'

const TABLES = ['wallets', 'categories', 'vendors', 'transaction_types', 'transaction'] as const

export async function downloadBackup(): Promise<{ entries: number }> {
  const tables: Record<string, unknown[]> = {}

  for (const table of TABLES) {
    const { data, error } = await fetchAllRows<Record<string, unknown>>(() =>
      supabase.from(table).select('*').order('id', { ascending: true })
    )
    // Never save a partial backup.
    if (error) throw new Error(`Backup failed while reading ${table}: ${error.message}`)
    tables[table] = data
  }

  const now = new Date()
  const stamp = now.toLocaleDateString('en-CA')
  const backup = {
    app: 'FinTrack',
    format: 1,
    exported_at: now.toISOString(),
    counts: Object.fromEntries(TABLES.map((table) => [table, tables[table].length])),
    tables,
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `fintrack-backup-${stamp}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  return { entries: tables.transaction.length }
}
