'use client'

// Vendors: grouped by home category (or A to Z), with add, edit (name and home
// category), merge, archive and delete.
//
// A vendor's home category decides where it is listed here and what the Add
// Transaction form fills in the first time it is used. Entries keep their own
// category; editing the home category moves past entries only when asked.

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import ConfirmModal from '@/components/ConfirmModal'
import RowActionsMenu from '@/components/RowActionsMenu'
import Toast from '@/components/Toast'

type VendorRow = {
  id: number
  name: string
  normalized_name?: string | null
  is_archived?: boolean
  category_id?: number | null
}

type CategoryRow = {
  id: number
  name: string
  type_id: number
  is_archived?: boolean
  is_active?: boolean
}

type UsageRow = { vendor_id: number | null; category_id: number | null }

type GroupMode = 'category' | 'az'

type SheetState =
  | { kind: 'add' }
  | { kind: 'edit'; vendor: VendorRow }
  | { kind: 'merge'; vendor: VendorRow }
  | null

const GROUP_MODE_KEY = 'fintrack:vendors-group'
const TYPE_LABELS: Record<number, string> = { 1: 'Expense', 2: 'Income', 3: 'Investment' }

function normalizeVendorName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function readGroupMode(): GroupMode {
  try {
    return window.localStorage.getItem(GROUP_MODE_KEY) === 'az' ? 'az' : 'category'
  } catch {
    return 'category'
  }
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [groupMode, setGroupMode] = useState<GroupMode>('category')

  const [sheet, setSheet] = useState<SheetState>(null)
  const [formName, setFormName] = useState('')
  const [formCategoryId, setFormCategoryId] = useState('')
  // Categories (other than the home one) whose entries for this vendor should move to the home category.
  const [moveFrom, setMoveFrom] = useState<number[]>([])
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [sheetError, setSheetError] = useState('')
  const [saving, setSaving] = useState(false)

  const [workingId, setWorkingId] = useState<number | null>(null)
  const [deleteVendor, setDeleteVendor] = useState<VendorRow | null>(null)

  useEffect(() => {
    setGroupMode(readGroupMode())
  }, [])

  function changeGroupMode(next: GroupMode) {
    setGroupMode(next)
    try {
      window.localStorage.setItem(GROUP_MODE_KEY, next)
    } catch {
      // Not remembered on this device; still works.
    }
  }

  const fetchData = async () => {
    setLoading(true)

    const [vendorRes, categoryRes, usageRes] = await Promise.all([
      supabase
        .from('vendors')
        .select('id, name, normalized_name, is_archived, category_id')
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('id, name, type_id, is_archived, is_active')
        .order('type_id', { ascending: true })
        .order('name', { ascending: true }),
      fetchAllRows<UsageRow>(() =>
        supabase
          .from('transaction')
          .select('vendor_id, category_id')
          .not('vendor_id', 'is', null)
          .order('id', { ascending: true })
      ),
    ])

    if (vendorRes.error) {
      setErrorMessage(vendorRes.error.message)
      setVendors([])
      setLoading(false)
      return
    }

    setVendors((vendorRes.data as VendorRow[]) || [])
    setCategories((categoryRes.data as CategoryRow[]) || [])
    setUsage(usageRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const categoryById = useMemo(() => {
    const map: Record<number, CategoryRow> = {}
    categories.forEach((category) => {
      map[category.id] = category
    })
    return map
  }, [categories])

  // vendorId -> { total, byCategory: categoryId -> count }
  const usageByVendor = useMemo(() => {
    const map: Record<number, { total: number; byCategory: Record<number, number> }> = {}
    usage.forEach((row) => {
      if (!row.vendor_id) return
      const entry = (map[row.vendor_id] ||= { total: 0, byCategory: {} })
      entry.total += 1
      if (row.category_id) entry.byCategory[row.category_id] = (entry.byCategory[row.category_id] || 0) + 1
    })
    return map
  }, [usage])

  const usesOf = (vendor: VendorRow) => usageByVendor[vendor.id]?.total || 0

  const alsoUsedIn = (vendor: VendorRow) => {
    const byCategory = usageByVendor[vendor.id]?.byCategory || {}
    return Object.keys(byCategory)
      .map(Number)
      .filter((id) => id !== vendor.category_id)
      .sort((a, b) => byCategory[b] - byCategory[a])
      .map((id) => categoryById[id]?.name)
      .filter(Boolean) as string[]
  }

  const tabVendors = useMemo(() => {
    const query = search.trim().toLowerCase()
    return vendors
      .filter((vendor) => (activeTab === 'active' ? vendor.is_archived !== true : vendor.is_archived === true))
      .filter((vendor) => !query || vendor.name.toLowerCase().includes(query))
  }, [vendors, activeTab, search])

  const groups = useMemo(() => {
    const byUse = (a: VendorRow, b: VendorRow) =>
      (usageByVendor[b.id]?.total || 0) - (usageByVendor[a.id]?.total || 0) || a.name.localeCompare(b.name)

    if (groupMode === 'az') {
      const map: Record<string, VendorRow[]> = {}
      tabVendors.forEach((vendor) => {
        const first = vendor.name.trim().charAt(0).toUpperCase()
        const key = /[A-Z]/.test(first) ? first : '#'
        ;(map[key] ||= []).push(vendor)
      })
      return Object.keys(map)
        .sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
        .map((key) => ({
          key,
          title: key,
          vendors: map[key].sort((a, b) => a.name.localeCompare(b.name)),
        }))
    }

    const map: Record<string, VendorRow[]> = {}
    tabVendors.forEach((vendor) => {
      const key = vendor.category_id && categoryById[vendor.category_id] ? String(vendor.category_id) : 'none'
      ;(map[key] ||= []).push(vendor)
    })
    const ordered = categories.filter((category) => map[String(category.id)])
    return [
      ...ordered.map((category) => ({
        key: String(category.id),
        title: category.name,
        vendors: map[String(category.id)].sort(byUse),
      })),
      ...(map.none ? [{ key: 'none', title: 'No category', vendors: map.none.sort(byUse) }] : []),
    ]
  }, [tabVendors, groupMode, categories, categoryById, usageByVendor])

  const activeCount = vendors.filter((vendor) => vendor.is_archived !== true).length
  const archivedCount = vendors.length - activeCount

  const pickableCategories = categories.filter(
    (category) => category.is_archived !== true && category.is_active !== false
  )

  // ---- sheet: add / edit / merge ----

  function openAdd() {
    setSheet({ kind: 'add' })
    setFormName('')
    setFormCategoryId('')
    setMoveFrom([])
    setSheetError('')
  }

  function openEdit(vendor: VendorRow) {
    setSheet({ kind: 'edit', vendor })
    setFormName(vendor.name)
    setFormCategoryId(vendor.category_id ? String(vendor.category_id) : '')
    setMoveFrom([])
    setSheetError('')
  }

  function openMerge(vendor: VendorRow) {
    setSheet({ kind: 'merge', vendor })
    setMergeTargetId('')
    setSheetError('')
  }

  function closeSheet() {
    if (saving) return
    setSheet(null)
  }

  // Editing: this vendor's entries in categories other than the chosen home
  // category. Same-type ones can be moved to the home category; others stay.
  const editOthers = useMemo(() => {
    if (sheet?.kind !== 'edit') return null
    const home = formCategoryId ? categoryById[Number(formCategoryId)] : null
    if (!home) return null
    const byCategory = usageByVendor[sheet.vendor.id]?.byCategory || {}
    const others = Object.keys(byCategory)
      .map(Number)
      .filter((id) => id !== home.id && categoryById[id])
      .map((id) => ({ category: categoryById[id], count: byCategory[id] }))
      .sort((a, b) => b.count - a.count)
    if (others.length === 0) return null
    return {
      home,
      movable: others.filter((other) => other.category.type_id === home.type_id),
      fixed: others.filter((other) => other.category.type_id !== home.type_id),
    }
  }, [sheet, formCategoryId, usageByVendor, categoryById])

  async function handleSaveVendor(e: React.FormEvent) {
    e.preventDefault()
    if (!sheet || sheet.kind === 'merge') return

    const name = formName.trim().replace(/\s+/g, ' ')
    if (!name) {
      setSheetError('Enter a vendor name.')
      return
    }
    if (!formCategoryId) {
      setSheetError('Choose a home category.')
      return
    }

    const normalized = normalizeVendorName(name)
    const editingId = sheet.kind === 'edit' ? sheet.vendor.id : null
    const clash = vendors.find(
      (vendor) =>
        vendor.id !== editingId && (vendor.normalized_name || normalizeVendorName(vendor.name)) === normalized
    )
    if (clash) {
      setSheetError(
        `"${clash.name}" already exists${clash.is_archived ? ' (archived)' : ''}. ` +
          (sheet.kind === 'edit' ? 'To combine them, use Merge.' : 'Use that one instead.')
      )
      return
    }

    setSaving(true)
    setSheetError('')
    const categoryId = Number(formCategoryId)

    if (sheet.kind === 'add') {
      const { error } = await supabase
        .from('vendors')
        .insert([{ name, normalized_name: normalized, category_id: categoryId, is_archived: false }])
      setSaving(false)
      if (error) {
        setSheetError(error.message)
        return
      }
      setSheet(null)
      setSuccessMessage(`${name} added.`)
      await fetchData()
      return
    }

    const vendor = sheet.vendor
    const { error } = await supabase
      .from('vendors')
      .update({ name, normalized_name: normalized, category_id: categoryId })
      .eq('id', vendor.id)

    if (error) {
      setSaving(false)
      setSheetError(error.message)
      return
    }

    let moved = 0
    const toMove = (editOthers?.movable || []).filter((other) => moveFrom.includes(other.category.id))
    if (toMove.length > 0 && editOthers) {
      const { error: moveError } = await supabase
        .from('transaction')
        .update({ category_id: editOthers.home.id, category: editOthers.home.name })
        .eq('vendor_id', vendor.id)
        .in(
          'category_id',
          toMove.map((other) => other.category.id)
        )
      if (moveError) {
        setSaving(false)
        setSheetError(`Vendor saved, but its entries could not be moved: ${moveError.message}`)
        await fetchData()
        return
      }
      moved = toMove.reduce((sum, other) => sum + other.count, 0)
    }

    setSaving(false)
    setSheet(null)
    setSuccessMessage(
      moved > 0
        ? `${name} saved. ${moved === 1 ? '1 entry' : `${moved} entries`} moved to ${editOthers?.home.name}.`
        : `${name} saved.`
    )
    await fetchData()
  }

  const mergeCandidates = useMemo(() => {
    if (sheet?.kind !== 'merge') return []
    return vendors
      .filter((vendor) => vendor.id !== sheet.vendor.id && vendor.is_archived !== true)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [sheet, vendors])

  async function handleMerge() {
    if (sheet?.kind !== 'merge') return
    const from = sheet.vendor
    const keep = vendors.find((vendor) => String(vendor.id) === mergeTargetId)
    if (!keep) {
      setSheetError('Choose the vendor to keep.')
      return
    }

    setSaving(true)
    setSheetError('')

    const { error: moveError } = await supabase
      .from('transaction')
      .update({ vendor_id: keep.id, vendor: keep.name })
      .eq('vendor_id', from.id)

    if (moveError) {
      setSaving(false)
      setSheetError(moveError.message)
      return
    }

    const { error: deleteError } = await supabase.from('vendors').delete().eq('id', from.id)
    if (deleteError) {
      // Entries already moved; hide the old name instead.
      await supabase.from('vendors').update({ is_archived: true }).eq('id', from.id)
    }

    setSaving(false)
    setSheet(null)
    setSuccessMessage(`Merged "${from.name}" into ${keep.name}.`)
    await fetchData()
  }

  const handleArchiveToggle = async (vendor: VendorRow) => {
    setWorkingId(vendor.id)
    const { error } = await supabase
      .from('vendors')
      .update({ is_archived: vendor.is_archived !== true })
      .eq('id', vendor.id)
    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage(vendor.is_archived === true ? `${vendor.name} restored.` : `${vendor.name} archived.`)
    await fetchData()
  }

  const handleDelete = async (vendor: VendorRow) => {
    if (usesOf(vendor) > 0) {
      setErrorMessage('Vendors with entries cannot be deleted. Archive or merge them instead.')
      return
    }

    setWorkingId(vendor.id)
    const { error } = await supabase.from('vendors').delete().eq('id', vendor.id)
    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage(`${vendor.name} deleted.`)
    await fetchData()
  }

  // ---- styles ----

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

  const categorySelect = (
    <select
      value={formCategoryId}
      onChange={(e) => {
        setFormCategoryId(e.target.value)
        setMoveFrom([])
      }}
      aria-label="Home category"
      style={inputStyle}
    >
      <option value="">Choose a category</option>
      {[1, 2, 3].map((typeId) => {
        const options = pickableCategories.filter((category) => category.type_id === typeId)
        if (options.length === 0) return null
        return (
          <optgroup key={typeId} label={TYPE_LABELS[typeId]}>
            {options.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )

  const mergeFrom = sheet?.kind === 'merge' ? sheet.vendor : null
  const mergeKeep = mergeCandidates.find((vendor) => String(vendor.id) === mergeTargetId)
  const mergeCount = mergeFrom ? usesOf(mergeFrom) : 0

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        .vendors-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .vendors-add:disabled {
          background: #cbd5e1;
          color: #f8fafc;
          cursor: not-allowed;
        }

        .vendors-add {
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

        .vendors-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin: 10px 2px 12px;
        }

        .vendors-tabs {
          display: flex;
          gap: 16px;
        }

        .vendors-tab {
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

        .vendors-tab.is-on {
          color: #2563eb;
          border-bottom-color: #2563eb;
        }

        .vendors-switch {
          display: inline-flex;
          border: 1px solid #d1d5db;
          border-radius: 999px;
          overflow: hidden;
          background: #fff;
        }

        .vendors-switch button {
          padding: 6px 12px;
          border: none;
          background: none;
          color: #475569;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .vendors-switch button.is-on {
          background: #0f172a;
          color: #fff;
        }

        .vendors-group {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          background: #fff;
          overflow: visible;
          margin-bottom: 12px;
        }

        .vendors-group-title {
          padding: 8px 16px;
          background: #f1f5f9;
          border-radius: 14px 14px 0 0;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .vendor-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 10px 16px;
          border-top: 1px solid #f1f5f9;
        }

        .vendor-name {
          color: #111827;
          font-weight: 700;
          font-size: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .vendor-meta {
          margin-top: 3px;
          color: #64748b;
          font-size: 12px;
        }

        .vendor-also {
          color: #0f766e;
        }

        .vendors-sheet-shade {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(15, 23, 42, 0.45);
        }

        .vendors-sheet {
          width: 100%;
          max-width: 440px;
          max-height: 90vh;
          overflow: auto;
          box-sizing: border-box;
          padding: 18px 16px;
          border-radius: 16px;
          background: #fff;
        }

        .vendors-check {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-top: 12px;
          color: #374151;
          font-size: 13px;
          cursor: pointer;
        }

        .vendors-fixed {
          margin-top: 10px;
          color: #64748b;
          font-size: 13px;
        }

        .vendor-link {
          display: block;
          min-width: 0;
          color: inherit;
          text-decoration: none;
        }

        .vendor-link:hover .vendor-name {
          color: #2563eb;
        }

        .vendors-note {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 13px;
        }

        @media (max-width: 640px) {
          .vendors-sheet-shade {
            align-items: flex-end;
            padding: 0;
          }

          .vendors-sheet {
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

      <div className="vendors-top">
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>Vendors</h1>
        <button
          type="button"
          className="vendors-add"
          onClick={openAdd}
          disabled={activeTab === 'archived'}
          title={activeTab === 'archived' ? 'Switch to Active to add a vendor' : undefined}
        >
          + Add
        </button>
      </div>

      <input
        type="text"
        placeholder="Search vendors"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search vendors"
        style={inputStyle}
      />

      <div className="vendors-bar">
        <div className="vendors-tabs">
          <button
            type="button"
            className={`vendors-tab${activeTab === 'active' ? ' is-on' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            className={`vendors-tab${activeTab === 'archived' ? ' is-on' : ''}`}
            onClick={() => setActiveTab('archived')}
          >
            Archived ({archivedCount})
          </button>
        </div>

        <div className="vendors-switch" role="group" aria-label="Group vendors by">
          <button
            type="button"
            className={groupMode === 'category' ? 'is-on' : ''}
            aria-pressed={groupMode === 'category'}
            onClick={() => changeGroupMode('category')}
          >
            Category
          </button>
          <button
            type="button"
            className={groupMode === 'az' ? 'is-on' : ''}
            aria-pressed={groupMode === 'az'}
            onClick={() => changeGroupMode('az')}
          >
            A–Z
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: '14px', padding: '8px 2px' }}>Loading vendors...</div>
      ) : groups.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '14px', padding: '8px 2px' }}>
          {search.trim() ? 'No vendors match your search.' : 'No vendors here.'}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="vendors-group" aria-label={group.title}>
            <div className="vendors-group-title">
              {group.title} · {group.vendors.length}
            </div>
            {group.vendors.map((vendor) => {
              const uses = usesOf(vendor)
              const also = alsoUsedIn(vendor)
              const home = vendor.category_id ? categoryById[vendor.category_id]?.name : null
              const isWorking = workingId === vendor.id
              const isArchived = vendor.is_archived === true
              return (
                <div key={vendor.id} className="vendor-row">
                  <Link
                    href={`/transactions?vendor=${vendor.id}`}
                    className="vendor-link"
                    aria-label={`See entries for ${vendor.name}`}
                  >
                    <div className="vendor-name">{vendor.name}</div>
                    <div className="vendor-meta">
                      {groupMode === 'az' && <>{home || 'No category'} · </>}
                      {uses > 0 ? (uses === 1 ? '1 entry' : `${uses} entries`) : 'Not used yet'}
                      {also.length > 0 && <span className="vendor-also"> · Also used in {also.join(', ')}</span>}
                    </div>
                  </Link>
                  <RowActionsMenu
                    // Archived: only Restore works; everything else is greyed out.
                    items={[
                      { label: 'Edit', onClick: () => openEdit(vendor), disabled: isWorking || isArchived },
                      {
                        label: 'Merge into another…',
                        onClick: () => openMerge(vendor),
                        disabled: isWorking || isArchived,
                      },
                      {
                        label: isArchived ? 'Restore' : 'Archive',
                        onClick: () => handleArchiveToggle(vendor),
                        disabled: isWorking,
                      },
                      {
                        label: 'Delete',
                        danger: !isArchived,
                        onClick: () => setDeleteVendor(vendor),
                        disabled: isWorking || isArchived,
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
        <div className="vendors-sheet-shade" onClick={closeSheet}>
          <div
            className="vendors-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheet.kind === 'add' ? 'Add vendor' : sheet.kind === 'edit' ? 'Edit vendor' : 'Merge vendor'}
            onClick={(e) => e.stopPropagation()}
          >
            {sheet.kind === 'merge' && mergeFrom ? (
              <>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Merge &ldquo;{mergeFrom.name}&rdquo;</h2>
                <label style={labelStyle} htmlFor="merge-keep">
                  Keep this vendor
                </label>
                <select
                  id="merge-keep"
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Choose a vendor</option>
                  {mergeCandidates.map((vendor) => (
                    <option key={vendor.id} value={String(vendor.id)}>
                      {vendor.name}
                    </option>
                  ))}
                </select>

                {mergeKeep && (
                  <div className="vendors-note" style={{ background: '#fff7ed', color: '#9a3412' }}>
                    {mergeCount > 0 ? (
                      <>
                        {mergeCount === 1 ? 'Its 1 entry' : `All ${mergeCount} entries`} of &ldquo;{mergeFrom.name}&rdquo; will
                        move to <b>{mergeKeep.name}</b>, and &ldquo;{mergeFrom.name}&rdquo; will be removed.
                      </>
                    ) : (
                      <>&ldquo;{mergeFrom.name}&rdquo; has no entries. It will be removed.</>
                    )}{' '}
                    This cannot be undone.
                  </div>
                )}

                {sheetError && (
                  <div style={{ marginTop: '10px', color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>{sheetError}</div>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button type="button" onClick={closeSheet} style={buttonSecondary}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleMerge}
                    disabled={saving || !mergeKeep}
                    style={{ ...buttonPrimary, opacity: saving || !mergeKeep ? 0.5 : 1 }}
                  >
                    {saving ? 'Merging…' : 'Merge'}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveVendor}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                  {sheet.kind === 'add' ? 'Add vendor' : 'Edit vendor'}
                </h2>

                <label style={labelStyle} htmlFor="vendor-name">
                  Name
                </label>
                <input
                  id="vendor-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Jaya Grocer"
                  autoComplete="off"
                  style={inputStyle}
                />

                <label style={labelStyle} htmlFor="vendor-home">
                  Home category
                </label>
                <div id="vendor-home">{categorySelect}</div>

                {editOthers && (
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>Also used in</div>
                    {editOthers.movable.map((other) => (
                      <label key={other.category.id} className="vendors-check">
                        <input
                          type="checkbox"
                          checked={moveFrom.includes(other.category.id)}
                          onChange={(e) =>
                            setMoveFrom((current) =>
                              e.target.checked
                                ? [...current, other.category.id]
                                : current.filter((id) => id !== other.category.id)
                            )
                          }
                          style={{ width: '18px', height: '18px', margin: 0, flex: 'none' }}
                        />
                        <span>
                          {other.category.name} ({other.count === 1 ? '1 entry' : `${other.count} entries`}) → move to{' '}
                          <b>{editOthers.home.name}</b>
                        </span>
                      </label>
                    ))}
                    {editOthers.fixed.map((other) => (
                      <div key={other.category.id} className="vendors-fixed">
                        {other.category.name} ({other.count === 1 ? '1 entry' : `${other.count} entries`}) stays: it is{' '}
                        {TYPE_LABELS[other.category.type_id]?.toLowerCase()}, {editOthers.home.name} is{' '}
                        {TYPE_LABELS[editOthers.home.type_id]?.toLowerCase()}.
                      </div>
                    ))}
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
                    {saving ? 'Saving…' : sheet.kind === 'add' ? 'Add vendor' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteVendor}
        title="Delete vendor"
        message={
          deleteVendor && usesOf(deleteVendor) > 0
            ? `${deleteVendor.name} has entries, so it cannot be deleted. Archive or merge it instead.`
            : 'This cannot be undone.'
        }
        danger
        onCancel={() => setDeleteVendor(null)}
        onConfirm={() => {
          if (deleteVendor) handleDelete(deleteVendor)
          setDeleteVendor(null)
        }}
      />

      <Toast message={successMessage} type="success" onClose={() => setSuccessMessage('')} />
      <Toast message={errorMessage} type="error" onClose={() => setErrorMessage('')} />
    </main>
  )
}
