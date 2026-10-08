'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import ConfirmModal from '@/components/ConfirmModal'
import RowActionsMenu from '@/components/RowActionsMenu'
import Toast from '@/components/Toast'

type VendorRow = {
  id: number
  name: string
  normalized_name?: string | null
  is_archived?: boolean
  created_at?: string
}

type TransactionUsageRow = {
  vendor_id: number | null
}

type VendorWithUsage = VendorRow & {
  usage_count?: number
}

function formatDate(dateString?: string) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function normalizeVendorName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorWithUsage[]>([])
  const [loading, setLoading] = useState(true)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')

  const [newVendorName, setNewVendorName] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [workingId, setWorkingId] = useState<number | null>(null)
  const [deleteVendor, setDeleteVendor] = useState<VendorWithUsage | null>(null)

  const fetchData = async () => {
    setLoading(true)

    const [vendorRes, txRes] = await Promise.all([
      supabase
        .from('vendors')
        .select('id, name, normalized_name, is_archived, created_at')
        .order('is_archived', { ascending: true })
        .order('name', { ascending: true }),
      supabase.from('transaction').select('vendor_id'),
    ])

    if (vendorRes.error) {
      setErrorMessage(vendorRes.error.message)
      setVendors([])
      setLoading(false)
      return
    }

    const usageRows = (txRes.data as TransactionUsageRow[]) || []
    const usageMap: Record<number, number> = {}

    usageRows.forEach((row) => {
      if (row.vendor_id) {
        usageMap[row.vendor_id] = (usageMap[row.vendor_id] || 0) + 1
      }
    })

    const vendorRows = ((vendorRes.data as VendorRow[]) || []).map((vendor) => ({
      ...vendor,
      usage_count: usageMap[vendor.id] || 0,
    }))

    setVendors(vendorRows)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredVendors = useMemo(() => {
    const query = search.trim().toLowerCase()

    return vendors
      .filter((vendor) =>
        activeTab === 'active' ? vendor.is_archived !== true : vendor.is_archived === true
      )
      .filter((vendor) => {
        if (!query) return true
        return vendor.name.toLowerCase().includes(query)
      })
  }, [vendors, activeTab, search])

  const activeCount = useMemo(
    () => vendors.filter((vendor) => vendor.is_archived !== true).length,
    [vendors]
  )

  const archivedCount = useMemo(
    () => vendors.filter((vendor) => vendor.is_archived === true).length,
    [vendors]
  )

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = newVendorName.trim()
    if (!trimmedName) {
      setErrorMessage('Vendor name is required.')
      return
    }

    const normalized = normalizeVendorName(trimmedName)
    const exists = vendors.some(
      (vendor) => (vendor.normalized_name || normalizeVendorName(vendor.name)) === normalized
    )

    if (exists) {
      setErrorMessage('Vendor already exists.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.from('vendors').insert([
      {
        name: trimmedName,
        normalized_name: normalized,
        is_archived: false,
      },
    ])

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Vendor added successfully.')
    setNewVendorName('')
    await fetchData()
  }

  const startRename = (vendor: VendorWithUsage) => {
    setEditingId(vendor.id)
    setEditingName(vendor.name)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleRename = async (vendorId: number) => {
    const trimmedName = editingName.trim()
    if (!trimmedName) {
      setErrorMessage('Vendor name cannot be empty.')
      return
    }

    const normalized = normalizeVendorName(trimmedName)
    const exists = vendors.some(
      (vendor) =>
        vendor.id !== vendorId &&
        (vendor.normalized_name || normalizeVendorName(vendor.name)) === normalized
    )

    if (exists) {
      setErrorMessage('Another vendor already uses this name.')
      return
    }

    setWorkingId(vendorId)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('vendors')
      .update({
        name: trimmedName,
        normalized_name: normalized,
      })
      .eq('id', vendorId)

    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Vendor renamed successfully.')
    cancelRename()
    await fetchData()
  }

  const handleArchiveToggle = async (vendor: VendorWithUsage) => {
    setWorkingId(vendor.id)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('vendors')
      .update({ is_archived: vendor.is_archived !== true ? true : false })
      .eq('id', vendor.id)

    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage(
      vendor.is_archived === true
        ? 'Vendor restored successfully.'
        : 'Vendor archived successfully.'
    )
    await fetchData()
  }

  const handleDelete = async (vendor: VendorWithUsage) => {
    if ((vendor.usage_count || 0) > 0) {
      setErrorMessage('Used vendors cannot be deleted. Archive them instead.')
      return
    }

    setWorkingId(vendor.id)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.from('vendors').delete().eq('id', vendor.id)

    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    if (editingId === vendor.id) {
      cancelRename()
    }

    setSuccessMessage('Vendor deleted successfully.')
    await fetchData()
  }

  const pageWrap: CSSProperties = {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '16px',
    fontFamily: 'Arial, sans-serif',
  }

  const card: CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    background: '#fff',
    padding: '16px',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    height: '48px',
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
    boxSizing: 'border-box',
  }

  const buttonPrimary: CSSProperties = {
    height: '48px',
    padding: '0 14px',
    borderRadius: '10px',
    border: '1px solid #0f172a',
    background: '#0f172a',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  }

  const buttonSecondary: CSSProperties = {
    height: '48px',
    padding: '0 14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  }

  const tabButton = (active: boolean): CSSProperties => ({
    height: '48px',
    padding: '0 18px',
    borderRadius: '999px',
    border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
    background: active ? '#2563eb' : '#fff',
    color: active ? '#fff' : '#111827',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  })

  return (
    <main style={pageWrap}>
      <style>{`
        .vendor-create-form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: end;
        }

        .vendor-search-card {
          padding: 12px;
        }

        .vendor-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: start;
          padding: 12px 16px;
        }

        .vendor-meta {
          margin-top: 4px;
          font-size: 12px;
          color: #4b5563;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .vendor-row-actions .ram-trigger {
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .vendor-row:hover .vendor-row-actions .ram-trigger,
        .vendor-row:focus-within .vendor-row-actions .ram-trigger {
          opacity: 1;
        }

        @media (max-width: 640px) {
          .vendor-page-header {
            flex-direction: column;
            align-items: stretch !important;
          }

          .vendor-create-form {
            grid-template-columns: 1fr !important;
          }

          .vendor-row {
            grid-template-columns: 1fr auto !important;
          }

          .vendor-row-actions {
            justify-self: end;
            align-self: start;
          }

          .vendor-row-actions .ram-trigger {
            opacity: 1 !important;
          }

          .vendor-edit-row {
            flex-direction: column;
            align-items: stretch !important;
          }

          .vendor-edit-row input {
            max-width: none !important;
          }
        }
      `}</style>

      <div className="hide-on-phone" style={{ marginBottom: '16px' }}>
        <Link
          href="/"
          style={{
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>

      <div
        className="vendor-page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>Vendors</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '15px' }}>
            Manage merchant and payee names used in transactions.
          </p>
        </div>
      </div>

      <section style={{ ...card, marginBottom: '16px' }}>
        <h2
          style={{
            marginTop: 0,
            marginBottom: '14px',
            fontSize: '0.95rem',
            letterSpacing: '0.04em',
            color: '#6b7280',
            textTransform: 'uppercase',
          }}
        >
          Add New Vendor
        </h2>

        <form className="vendor-create-form" onSubmit={handleCreateVendor}>
          <input
            type="text"
            placeholder="Vendor name (e.g. Grab, Jaya Grocers)"
            value={newVendorName}
            onChange={(e) => setNewVendorName(e.target.value)}
            style={inputStyle}
          />

          <button type="submit" style={buttonPrimary}>
            Add Vendor
          </button>
        </form>
      </section>

      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '14px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          style={tabButton(activeTab === 'active')}
        >
          Active ({activeCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('archived')}
          style={tabButton(activeTab === 'archived')}
        >
          Archived ({archivedCount})
        </button>
      </div>

      <section style={{ ...card, marginBottom: '12px' }} className="vendor-search-card">
        <input
          type="text"
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
      </section>

      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f3f4f6',
            fontSize: '14px',
            color: '#6b7280',
            fontWeight: 600,
          }}
        >
          {loading
            ? 'Loading vendors...'
            : `${filteredVendors.length} vendor${filteredVendors.length === 1 ? '' : 's'}`}
        </div>

        {loading ? null : filteredVendors.length === 0 ? (
          <div
            style={{
              padding: '16px',
              color: '#6b7280',
              fontSize: '14px',
            }}
          >
            No vendors found.
          </div>
        ) : (
          <div>
            {filteredVendors.map((vendor, index) => {
              const usageCount = vendor.usage_count || 0
              const isEditing = editingId === vendor.id
              const isWorking = workingId === vendor.id

              return (
                <div
                  key={vendor.id}
                  className="vendor-row"
                  style={{
                    borderBottom:
                      index === filteredVendors.length - 1 ? 'none' : '1px solid #f3f4f6',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    {isEditing ? (
                      <div
                        className="vendor-edit-row"
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          style={{
                            ...inputStyle,
                            maxWidth: '320px',
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => handleRename(vendor.id)}
                          disabled={isWorking}
                          style={buttonPrimary}
                        >
                          Save
                        </button>

                        <button
                          type="button"
                          onClick={cancelRename}
                          style={buttonSecondary}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              color: '#111827',
                              fontWeight: 700,
                              fontSize: '14px',
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {vendor.name}
                          </div>

                          <span
                            style={{
                              background: vendor.is_archived === true ? '#e5e7eb' : '#d9f99d',
                              color: vendor.is_archived === true ? '#4b5563' : '#4d7c0f',
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 7px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            {vendor.is_archived === true ? 'Archived' : 'Active'}
                          </span>
                        </div>

                        <div className="vendor-meta">
                          <span>
                            {usageCount > 0
                              ? `Used in ${usageCount} transaction${usageCount === 1 ? '' : 's'}`
                              : 'Unused'}
                          </span>

                          {vendor.created_at && <span>{formatDate(vendor.created_at)}</span>}
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="vendor-row-actions" style={{ flexShrink: 0 }}>
                      <RowActionsMenu
                        items={[
                          {
                            label: 'Rename',
                            onClick: () => startRename(vendor),
                            disabled: isWorking,
                          },
                          {
                            label: vendor.is_archived === true ? 'Restore' : 'Archive',
                            onClick: () => handleArchiveToggle(vendor),
                            disabled: isWorking,
                          },
                          {
                            label: 'Delete',
                            danger: true,
                            onClick: () => setDeleteVendor(vendor),
                            disabled: isWorking,
                          },
                        ]}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <ConfirmModal
        open={!!deleteVendor}
        title="Delete vendor"
        message="This action cannot be undone."
        danger
        onCancel={() => setDeleteVendor(null)}
        onConfirm={() => {
          if (deleteVendor) handleDelete(deleteVendor)
          setDeleteVendor(null)
        }}
      />

      <Toast
        message={successMessage}
        type="success"
        onClose={() => setSuccessMessage('')}
      />

      <Toast
        message={errorMessage}
        type="error"
        onClose={() => setErrorMessage('')}
      />
    </main>
  )
}