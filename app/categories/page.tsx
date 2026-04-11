'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import ConfirmModal from '@/components/ConfirmModal'
import RowActionsMenu from '@/components/RowActionsMenu'
import Toast from '@/components/Toast'

type CategoryType = 'Expense' | 'Income' | 'Investment'
type SortMode = 'custom' | 'name_asc' | 'name_desc'

type CategoryRow = {
  id: number
  name: string
  type_id: number
  is_active?: boolean
  is_archived?: boolean
  sort_order?: number | null
}

function typeIdToLabel(typeId: number): CategoryType {
  if (typeId === 1) return 'Expense'
  if (typeId === 2) return 'Income'
  return 'Investment'
}

function labelToTypeId(label: CategoryType) {
  if (label === 'Expense') return 1
  if (label === 'Income') return 2
  return 3
}

function getTypeBadgeStyle(type: CategoryType): CSSProperties {
  if (type === 'Expense') return { background: '#fee2e2', color: '#b91c1c' }
  if (type === 'Income') return { background: '#ecfccb', color: '#4d7c0f' }
  return { background: '#dbeafe', color: '#1d4ed8' }
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'All' | CategoryType>('All')
  const [sortMode, setSortMode] = useState<SortMode>('custom')

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>('Expense')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingType, setEditingType] = useState<CategoryType>('Expense')

  const [workingId, setWorkingId] = useState<number | null>(null)
  const [archiveCategory, setArchiveCategory] = useState<CategoryRow | null>(null)

  const fetchData = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('categories')
      .select('id, name, type_id, is_active, is_archived, sort_order')
      .order('type_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      setCategories([])
      setLoading(false)
      return
    }

    setCategories((data as CategoryRow[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const activeCount = useMemo(
    () => categories.filter((category) => category.is_archived !== true).length,
    [categories]
  )

  const archivedCount = useMemo(
    () => categories.filter((category) => category.is_archived === true).length,
    [categories]
  )

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase()

    let rows = categories.filter((category) =>
      activeTab === 'active' ? category.is_archived !== true : category.is_archived === true
    )

    if (filterType !== 'All') {
      const wantedTypeId = labelToTypeId(filterType)
      rows = rows.filter((category) => category.type_id === wantedTypeId)
    }

    if (query) {
      rows = rows.filter((category) => {
        const typeLabel = typeIdToLabel(category.type_id).toLowerCase()
        return category.name.toLowerCase().includes(query) || typeLabel.includes(query)
      })
    }

    if (sortMode === 'name_asc') {
      rows = [...rows].sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortMode === 'name_desc') {
      rows = [...rows].sort((a, b) => b.name.localeCompare(a.name))
    } else {
      rows = [...rows].sort((a, b) => {
        if ((a.type_id || 0) !== (b.type_id || 0)) return (a.type_id || 0) - (b.type_id || 0)
        const aSort = a.sort_order ?? 999999
        const bSort = b.sort_order ?? 999999
        if (aSort !== bSort) return aSort - bSort
        return a.name.localeCompare(b.name)
      })
    }

    return rows
  }, [categories, activeTab, search, filterType, sortMode])

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = newCategoryName.trim()
    if (!trimmedName) {
      setErrorMessage('Category name is required.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.from('categories').insert([
      {
        name: trimmedName,
        type_id: labelToTypeId(newCategoryType),
        is_active: true,
        is_archived: false,
      },
    ])

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Category added successfully.')
    setNewCategoryName('')
    setNewCategoryType('Expense')
    await fetchData()
  }

  const startEdit = (category: CategoryRow) => {
    setEditingId(category.id)
    setEditingName(category.name)
    setEditingType(typeIdToLabel(category.type_id))
    setErrorMessage('')
    setSuccessMessage('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
    setEditingType('Expense')
  }

  const handleSaveEdit = async (categoryId: number) => {
    const trimmedName = editingName.trim()
    if (!trimmedName) {
      setErrorMessage('Category name cannot be empty.')
      return
    }

    setWorkingId(categoryId)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('categories')
      .update({
        name: trimmedName,
        type_id: labelToTypeId(editingType),
      })
      .eq('id', categoryId)

    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Category updated successfully.')
    cancelEdit()
    await fetchData()
  }

  const handleArchiveToggle = async (category: CategoryRow) => {
    setWorkingId(category.id)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('categories')
      .update({
        is_archived: category.is_archived !== true ? true : false,
        is_active: category.is_archived === true ? true : false,
      })
      .eq('id', category.id)

    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage(
      category.is_archived === true
        ? 'Category restored successfully.'
        : 'Category archived successfully.'
    )
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
        .category-create-form {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(180px, 0.9fr) auto;
          gap: 10px;
          align-items: end;
        }

        .category-filter-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(180px, 0.8fr) minmax(180px, 0.8fr);
          gap: 10px;
        }

        .category-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: start;
          padding: 12px 16px;
        }

        .category-row-actions .ram-trigger {
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .category-row:hover .category-row-actions .ram-trigger,
        .category-row:focus-within .category-row-actions .ram-trigger {
          opacity: 1;
        }

        @media (max-width: 640px) {
          .category-page-header {
            flex-direction: column;
            align-items: stretch !important;
          }

          .category-create-form,
          .category-filter-grid {
            grid-template-columns: 1fr !important;
          }

          .category-row {
            grid-template-columns: 1fr auto !important;
          }

          .category-row-actions {
            justify-self: end;
            align-self: start;
          }

          .category-row-actions .ram-trigger {
            opacity: 1 !important;
          }

          .category-edit-row {
            flex-direction: column;
            align-items: stretch !important;
          }

          .category-edit-row input,
          .category-edit-row select {
            max-width: none !important;
          }
        }
      `}</style>

      <div style={{ marginBottom: '16px' }}>
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
        className="category-page-header"
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
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>Categories</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '15px' }}>
            Manage expense, income, and investment categories.
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
          Add New Category
        </h2>

        <form className="category-create-form" onSubmit={handleCreateCategory}>
          <input
            type="text"
            placeholder="Category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            style={inputStyle}
          />

          <select
            value={newCategoryType}
            onChange={(e) => setNewCategoryType(e.target.value as CategoryType)}
            style={inputStyle}
          >
            <option value="Expense">Expense</option>
            <option value="Income">Income</option>
            <option value="Investment">Investment</option>
          </select>

          <button type="submit" style={buttonPrimary}>
            Add Category
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

      <section style={{ ...card, marginBottom: '12px', padding: '14px' }}>
        <div className="category-filter-grid">
          <input
            type="text"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'All' | CategoryType)}
            style={inputStyle}
          >
            <option value="All">All Types</option>
            <option value="Expense">Expense</option>
            <option value="Income">Income</option>
            <option value="Investment">Investment</option>
          </select>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            style={inputStyle}
          >
            <option value="custom">Sort: Custom / Default</option>
            <option value="name_asc">Sort: Name A–Z</option>
            <option value="name_desc">Sort: Name Z–A</option>
          </select>
        </div>
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
            ? 'Loading categories...'
            : `${filteredCategories.length} categor${filteredCategories.length === 1 ? 'y' : 'ies'}`}
        </div>

        {loading ? null : filteredCategories.length === 0 ? (
          <div
            style={{
              padding: '16px',
              color: '#6b7280',
              fontSize: '14px',
            }}
          >
            No categories found.
          </div>
        ) : (
          <div>
            {filteredCategories.map((category, index) => {
              const categoryType = typeIdToLabel(category.type_id)
              const isEditing = editingId === category.id
              const isWorking = workingId === category.id

              return (
                <div
                  key={category.id}
                  className="category-row"
                  style={{
                    borderBottom:
                      index === filteredCategories.length - 1 ? 'none' : '1px solid #f3f4f6',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    {isEditing ? (
                      <div
                        className="category-edit-row"
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
                            maxWidth: '260px',
                          }}
                        />

                        <select
                          value={editingType}
                          onChange={(e) => setEditingType(e.target.value as CategoryType)}
                          style={{
                            ...inputStyle,
                            maxWidth: '180px',
                          }}
                        >
                          <option value="Expense">Expense</option>
                          <option value="Income">Income</option>
                          <option value="Investment">Investment</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleSaveEdit(category.id)}
                          disabled={isWorking}
                          style={buttonPrimary}
                        >
                          Save
                        </button>

                        <button type="button" onClick={cancelEdit} style={buttonSecondary}>
                          Cancel
                        </button>
                      </div>
                    ) : (
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
                          {category.name}
                        </div>

                        <span
                          style={{
                            ...getTypeBadgeStyle(categoryType),
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 7px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {categoryType}
                        </span>

                        <span
                          style={{
                            background: category.is_archived === true ? '#e5e7eb' : '#d9f99d',
                            color: category.is_archived === true ? '#4b5563' : '#4d7c0f',
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 7px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {category.is_archived === true ? 'Archived' : 'Active'}
                        </span>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="category-row-actions" style={{ flexShrink: 0 }}>
                      <RowActionsMenu
                        items={[
                          {
                            label: 'Rename / Edit',
                            onClick: () => startEdit(category),
                            disabled: isWorking,
                          },
                          {
                            label: category.is_archived === true ? 'Restore' : 'Archive',
                            onClick: () => setArchiveCategory(category),
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
        open={!!archiveCategory}
        title={archiveCategory?.is_archived ? 'Restore category' : 'Archive category'}
        message={
          archiveCategory?.is_archived
            ? 'This category will become active again.'
            : 'This category will be hidden from active selection.'
        }
        onCancel={() => setArchiveCategory(null)}
        onConfirm={() => {
          if (archiveCategory) handleArchiveToggle(archiveCategory)
          setArchiveCategory(null)
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