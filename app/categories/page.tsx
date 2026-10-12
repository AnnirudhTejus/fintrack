'use client'

// Categories: grouped by Expense / Income / Investment, with entry and vendor
// counts, add, edit (name, and type while unused) and archive.

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import ConfirmModal from '@/components/ConfirmModal'
import RowActionsMenu from '@/components/RowActionsMenu'
import Toast from '@/components/Toast'

type CategoryRow = {
  id: number
  name: string
  type_id: number
  is_active?: boolean
  is_archived?: boolean
}

type UsageRow = { category_id: number | null; vendor_id: number | null }

type SheetState = { kind: 'add' } | { kind: 'edit'; category: CategoryRow } | null

const TYPES = [
  { id: 1, label: 'Expense' },
  { id: 2, label: 'Income' },
  { id: 3, label: 'Investment' },
]

function typeLabel(typeId: number) {
  return TYPES.find((type) => type.id === typeId)?.label || 'Other'
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')

  const [sheet, setSheet] = useState<SheetState>(null)
  const [formName, setFormName] = useState('')
  const [formTypeId, setFormTypeId] = useState(1)
  const [sheetError, setSheetError] = useState('')
  const [saving, setSaving] = useState(false)

  const [workingId, setWorkingId] = useState<number | null>(null)
  const [archiveCategory, setArchiveCategory] = useState<CategoryRow | null>(null)

  const fetchData = async () => {
    setLoading(true)

    const [categoryRes, usageRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, type_id, is_active, is_archived')
        .order('type_id', { ascending: true })
        .order('name', { ascending: true }),
      fetchAllRows<UsageRow>(() =>
        supabase
          .from('transaction')
          .select('category_id, vendor_id')
          .not('category_id', 'is', null)
          .order('id', { ascending: true })
      ),
    ])

    if (categoryRes.error) {
      setErrorMessage(categoryRes.error.message)
      setCategories([])
      setLoading(false)
      return
    }

    setCategories((categoryRes.data as CategoryRow[]) || [])
    setUsage(usageRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // categoryId -> { entries, vendors }
  const counts = useMemo(() => {
    const entries: Record<number, number> = {}
    const vendorSets: Record<number, Set<number>> = {}
    usage.forEach((row) => {
      if (!row.category_id) return
      entries[row.category_id] = (entries[row.category_id] || 0) + 1
      if (row.vendor_id) (vendorSets[row.category_id] ||= new Set()).add(row.vendor_id)
    })
    return { entries, vendors: (id: number) => vendorSets[id]?.size || 0 }
  }, [usage])

  const entriesOf = (category: CategoryRow) => counts.entries[category.id] || 0

  const activeCount = categories.filter((category) => category.is_archived !== true).length
  const archivedCount = categories.length - activeCount

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = categories
      .filter((category) => (activeTab === 'active' ? category.is_archived !== true : category.is_archived === true))
      .filter((category) => !query || category.name.toLowerCase().includes(query))

    return TYPES.map((type) => ({
      ...type,
      categories: rows
        .filter((category) => category.type_id === type.id)
        .sort(
          (a, b) =>
            (counts.entries[b.id] || 0) - (counts.entries[a.id] || 0) || a.name.localeCompare(b.name)
        ),
    })).filter((group) => group.categories.length > 0)
  }, [categories, activeTab, search, counts])

  function openAdd() {
    setSheet({ kind: 'add' })
    setFormName('')
    setFormTypeId(1)
    setSheetError('')
  }

  function openEdit(category: CategoryRow) {
    setSheet({ kind: 'edit', category })
    setFormName(category.name)
    setFormTypeId(category.type_id)
    setSheetError('')
  }

  function closeSheet() {
    if (!saving) setSheet(null)
  }

  // A category's type can change only while it has no entries, so no entry ends
  // up with a category of the wrong type.
  const typeLocked = sheet?.kind === 'edit' && entriesOf(sheet.category) > 0

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!sheet) return

    const name = formName.trim().replace(/\s+/g, ' ')
    if (!name) {
      setSheetError('Enter a category name.')
      return
    }

    const editingId = sheet.kind === 'edit' ? sheet.category.id : null
    const typeId = typeLocked && sheet.kind === 'edit' ? sheet.category.type_id : formTypeId
    const clash = categories.find(
      (category) =>
        category.id !== editingId &&
        category.type_id === typeId &&
        category.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (clash) {
      setSheetError(
        `There is already an ${typeLabel(typeId).toLowerCase()} category called "${clash.name}"${clash.is_archived ? ' (archived)' : ''}.`
      )
      return
    }

    setSaving(true)
    setSheetError('')

    const { error } =
      sheet.kind === 'add'
        ? await supabase
            .from('categories')
            .insert([{ name, type_id: typeId, is_active: true, is_archived: false, sort_order: 0 }])
        : await supabase.from('categories').update({ name, type_id: typeId }).eq('id', sheet.category.id)

    if (error) {
      setSaving(false)
      setSheetError(error.message)
      return
    }

    // Entries also keep the category name as text; keep it in step with a rename.
    if (sheet.kind === 'edit' && name !== sheet.category.name && entriesOf(sheet.category) > 0) {
      await supabase.from('transaction').update({ category: name }).eq('category_id', sheet.category.id)
    }

    setSaving(false)
    setSheet(null)
    setSuccessMessage(sheet.kind === 'add' ? `${name} added.` : `${name} saved.`)
    await fetchData()
  }

  const handleArchiveToggle = async (category: CategoryRow) => {
    setWorkingId(category.id)
    const restoring = category.is_archived === true
    const { error } = await supabase
      .from('categories')
      .update({ is_archived: !restoring, is_active: restoring })
      .eq('id', category.id)
    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage(restoring ? `${category.name} restored.` : `${category.name} archived.`)
    await fetchData()
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    height: '44px',
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
    boxSizing: 'border-box',
  }

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 700,
    color: '#374151',
    margin: '12px 0 6px',
  }

  const buttonPrimary: CSSProperties = {
    height: '44px',
    padding: '0 16px',
    borderRadius: '10px',
    border: '1px solid #0f172a',
    background: '#0f172a',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
  }

  const buttonSecondary: CSSProperties = {
    height: '44px',
    padding: '0 16px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
  }

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        .cats-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .cats-add {
          height: 40px;
          padding: 0 16px;
          border-radius: 999px;
          border: none;
          background: #2563eb;
          color: #fff;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
        }

        .cats-tabs {
          display: flex;
          gap: 16px;
          margin: 10px 2px 12px;
        }

        .cats-tab {
          padding: 4px 0;
          border: none;
          border-bottom: 2px solid transparent;
          background: none;
          color: #64748b;
          font: inherit;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .cats-tab.is-on {
          color: #2563eb;
          border-bottom-color: #2563eb;
        }

        .cats-group {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          background: #fff;
          margin-bottom: 12px;
        }

        .cats-group-title {
          padding: 8px 16px;
          background: #f1f5f9;
          border-radius: 14px 14px 0 0;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .cat-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 10px 16px;
          border-top: 1px solid #f1f5f9;
        }

        .cat-name {
          color: #111827;
          font-weight: 700;
          font-size: 14px;
        }

        .cat-meta {
          margin-top: 3px;
          color: #64748b;
          font-size: 12px;
        }

        .cats-sheet-shade {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(15, 23, 42, 0.45);
        }

        .cats-sheet {
          width: 100%;
          max-width: 440px;
          box-sizing: border-box;
          padding: 18px 16px;
          border-radius: 16px;
          background: #fff;
        }

        @media (max-width: 640px) {
          .cats-sheet-shade {
            align-items: flex-end;
            padding: 0;
          }

          .cats-sheet {
            max-width: none;
            border-radius: 18px 18px 0 0;
            padding-bottom: calc(18px + env(safe-area-inset-bottom));
          }
        }
      `}</style>

      <div className="hide-on-phone" style={{ marginBottom: '16px' }}>
        <Link href="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
          ← Back to Dashboard
        </Link>
      </div>

      <div className="cats-top">
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>Categories</h1>
        <button type="button" className="cats-add" onClick={openAdd}>
          + Add
        </button>
      </div>

      <input
        type="text"
        placeholder="Search categories"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search categories"
        style={inputStyle}
      />

      <div className="cats-tabs">
        <button
          type="button"
          className={`cats-tab${activeTab === 'active' ? ' is-on' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active ({activeCount})
        </button>
        <button
          type="button"
          className={`cats-tab${activeTab === 'archived' ? ' is-on' : ''}`}
          onClick={() => setActiveTab('archived')}
        >
          Archived ({archivedCount})
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: '14px', padding: '8px 2px' }}>Loading categories...</div>
      ) : groups.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '14px', padding: '8px 2px' }}>
          {search.trim() ? 'No categories match your search.' : 'No categories here.'}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.id} className="cats-group" aria-label={group.label}>
            <div className="cats-group-title">
              {group.label} · {group.categories.length}
            </div>
            {group.categories.map((category) => {
              const entries = entriesOf(category)
              const vendors = counts.vendors(category.id)
              const isWorking = workingId === category.id
              return (
                <div key={category.id} className="cat-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="cat-name">{category.name}</div>
                    <div className="cat-meta">
                      {entries === 0 ? 'No entries yet' : entries === 1 ? '1 entry' : `${entries} entries`}
                      {vendors > 0 && ` · ${vendors === 1 ? '1 vendor' : `${vendors} vendors`}`}
                    </div>
                  </div>
                  <RowActionsMenu
                    items={[
                      { label: 'Edit', onClick: () => openEdit(category), disabled: isWorking },
                      {
                        label: category.is_archived === true ? 'Restore' : 'Archive',
                        onClick: () => setArchiveCategory(category),
                        disabled: isWorking,
                      },
                    ]}
                  />
                </div>
              )
            })}
          </section>
        ))
      )}

      {sheet && (
        <div className="cats-sheet-shade" onClick={closeSheet}>
          <form
            className="cats-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheet.kind === 'add' ? 'Add category' : 'Edit category'}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSave}
          >
            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
              {sheet.kind === 'add' ? 'Add category' : 'Edit category'}
            </h2>

            <label style={labelStyle} htmlFor="category-name">
              Name
            </label>
            <input
              id="category-name"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Travel"
              autoComplete="off"
              style={inputStyle}
            />

            <label style={labelStyle} htmlFor="category-type">
              Type
            </label>
            <select
              id="category-type"
              value={formTypeId}
              onChange={(e) => setFormTypeId(Number(e.target.value))}
              disabled={typeLocked}
              style={{ ...inputStyle, background: typeLocked ? '#f1f5f9' : '#fff' }}
            >
              {TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
            {typeLocked && sheet.kind === 'edit' && (
              <div style={{ marginTop: '6px', color: '#64748b', fontSize: '12px' }}>
                The type can&apos;t change because {sheet.category.name} already has entries.
              </div>
            )}

            {sheetError && (
              <div style={{ marginTop: '10px', color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>{sheetError}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" onClick={closeSheet} style={buttonSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={{ ...buttonPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : sheet.kind === 'add' ? 'Add category' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={!!archiveCategory}
        title={archiveCategory?.is_archived ? 'Restore category' : 'Archive category'}
        message={
          archiveCategory?.is_archived
            ? 'This category will show in the Add Transaction form again.'
            : 'This category will be hidden from the Add Transaction form. Past entries keep it.'
        }
        onCancel={() => setArchiveCategory(null)}
        onConfirm={() => {
          if (archiveCategory) handleArchiveToggle(archiveCategory)
          setArchiveCategory(null)
        }}
      />

      <Toast message={successMessage} type="success" onClose={() => setSuccessMessage('')} />
      <Toast message={errorMessage} type="error" onClose={() => setErrorMessage('')} />
    </main>
  )
}
