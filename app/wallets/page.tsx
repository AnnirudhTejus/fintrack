'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import RowActionsMenu from '@/components/RowActionsMenu'
import Toast from '@/components/Toast'
import ConfirmModal from '@/components/ConfirmModal'
import { walletBalance } from '@/lib/walletBalance'

type WalletType = 'cash' | 'bank' | 'card' | 'ewallet'
type WalletTab = 'active' | 'archived'

type WalletRow = {
  id: number
  name: string
  type: WalletType
  is_archived?: boolean
  created_at?: string
  opening_balance?: number | null
  opening_balance_date?: string | null
}

type TransactionUsageRow = {
  type: string
  amount: number
  date: string
  wallet_id: number | null
  transfer_wallet_id: number | null
}

type WalletListItem = WalletRow & {
  usageCount: number
  balance: number
}

function formatCurrency(value: number) {
  const formatted = Math.abs(value).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '-' : ''}RM ${formatted}`
}

function todayInputValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Returns null when the text is not a valid amount. Blank counts as 0.
function parseOpeningBalance(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDate(dateString?: string) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString

  return date.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getWalletTypeLabel(type: WalletType) {
  if (type === 'cash') return 'Cash'
  if (type === 'bank') return 'Bank'
  if (type === 'card') return 'Card'
  return 'E-Wallet'
}

function getWalletTypeBadgeStyle(type: WalletType): CSSProperties {
  if (type === 'cash') return { background: '#ecfccb', color: '#4d7c0f' }
  if (type === 'bank') return { background: '#dbeafe', color: '#1d4ed8' }
  if (type === 'card') return { background: '#ffedd5', color: '#c2410c' }
  return { background: '#ede9fe', color: '#7c3aed' }
}

export default function WalletsPage() {
  const router = useRouter()

  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [usageRows, setUsageRows] = useState<TransactionUsageRow[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<WalletTab>('active')
  const [searchQuery, setSearchQuery] = useState('')

  const [walletName, setWalletName] = useState('')
  const [walletType, setWalletType] = useState<WalletType>('cash')
  const [openingBalance, setOpeningBalance] = useState('')
  const [openingDate, setOpeningDate] = useState('')

  const [editWallet, setEditWallet] = useState<WalletRow | null>(null)
  const [editBalance, setEditBalance] = useState('')
  const [editDate, setEditDate] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const [workingId, setWorkingId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function fetchData() {
    setLoading(true)
    setErrorMessage('')

    const [walletRes, txRes] = await Promise.all([
      supabase
        .from('wallets')
        .select('id, name, type, is_archived, created_at, opening_balance, opening_balance_date')
        .order('name', { ascending: true }),
      supabase.from('transaction').select('type, amount, date, wallet_id, transfer_wallet_id'),
    ])

    if (walletRes.error) {
      setErrorMessage(walletRes.error.message)
      setWallets([])
      setUsageRows([])
      setLoading(false)
      return
    }

    if (txRes.error) {
      setErrorMessage(txRes.error.message)
      setUsageRows([])
    } else {
      setUsageRows((txRes.data as TransactionUsageRow[]) || [])
    }

    setWallets((walletRes.data as WalletRow[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const usageMap = useMemo(() => {
    const map: Record<number, number> = {}

    usageRows.forEach((row) => {
      if (row.wallet_id) {
        map[row.wallet_id] = (map[row.wallet_id] || 0) + 1
      }
      if (row.transfer_wallet_id) {
        map[row.transfer_wallet_id] = (map[row.transfer_wallet_id] || 0) + 1
      }
    })

    return map
  }, [usageRows])

  const balanceMap = useMemo(() => {
    const map: Record<number, number> = {}
    wallets.forEach((wallet) => {
      map[wallet.id] = walletBalance(wallet, usageRows)
    })
    return map
  }, [wallets, usageRows])

  const activeWallets = useMemo(() => {
    return wallets.filter((wallet) => wallet.is_archived !== true)
  }, [wallets])

  const archivedWallets = useMemo(() => {
    return wallets.filter((wallet) => wallet.is_archived === true)
  }, [wallets])

  const filteredWallets = useMemo<WalletListItem[]>(() => {
    const source = tab === 'active' ? activeWallets : archivedWallets
    const normalized = searchQuery.trim().toLowerCase()

    return source
      .filter((wallet) => {
        if (!normalized) return true

        const searchable = [wallet.name, wallet.type, getWalletTypeLabel(wallet.type)]
          .join(' ')
          .toLowerCase()

        return searchable.includes(normalized)
      })
      .map((wallet) => ({
        ...wallet,
        usageCount: usageMap[wallet.id] || 0,
        balance: balanceMap[wallet.id] || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tab, activeWallets, archivedWallets, searchQuery, usageMap, balanceMap])

  async function handleAddWallet(e: React.FormEvent) {
    e.preventDefault()

    const trimmedName = walletName.trim()
    if (!trimmedName) {
      setErrorMessage('Wallet name is required.')
      return
    }

    const parsedOpening = parseOpeningBalance(openingBalance)
    if (parsedOpening === null) {
      setErrorMessage('Opening balance must be a number.')
      return
    }

    if (openingDate && openingDate > todayInputValue()) {
      setErrorMessage('Opening balance date cannot be in the future.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.from('wallets').insert([
      {
        name: trimmedName,
        type: walletType,
        is_archived: false,
        opening_balance: parsedOpening,
        opening_balance_date: openingDate || null,
      },
    ])

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setWalletName('')
    setWalletType('cash')
    setOpeningBalance('')
    setOpeningDate('')
    setSuccessMessage('Wallet added successfully.')
    await fetchData()
  }

  function openEditOpening(wallet: WalletRow) {
    setEditWallet(wallet)
    setEditBalance(
      wallet.opening_balance === null || wallet.opening_balance === undefined
        ? ''
        : String(wallet.opening_balance)
    )
    setEditDate(wallet.opening_balance_date || '')
    setEditError('')
  }

  async function handleSaveOpening(e: React.FormEvent) {
    e.preventDefault()
    if (!editWallet) return

    const parsedOpening = parseOpeningBalance(editBalance)
    if (parsedOpening === null) {
      setEditError('Opening balance must be a number.')
      return
    }

    if (editDate && editDate > todayInputValue()) {
      setEditError('Opening balance date cannot be in the future.')
      return
    }

    setSavingEdit(true)
    setEditError('')
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('wallets')
      .update({
        opening_balance: parsedOpening,
        opening_balance_date: editDate || null,
      })
      .eq('id', editWallet.id)

    setSavingEdit(false)

    if (error) {
      setEditError(error.message)
      return
    }

    setEditWallet(null)
    setSuccessMessage('Opening balance saved.')
    await fetchData()
  }

  async function handleArchive(walletId: number, archive: boolean) {
    setWorkingId(walletId)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.from('wallets').update({ is_archived: archive }).eq('id', walletId)

    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage(archive ? 'Wallet archived successfully.' : 'Wallet restored successfully.')
    await fetchData()
  }

  async function handleDelete(walletId: number) {
    setWorkingId(walletId)
    setErrorMessage('')
    setSuccessMessage('')

    const usageCount = usageMap[walletId] || 0
    if (usageCount > 0) {
      setWorkingId(null)
      setErrorMessage('This wallet is already used in transactions and cannot be deleted.')
      return
    }

    const { error } = await supabase.from('wallets').delete().eq('id', walletId)

    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Wallet deleted successfully.')
    await fetchData()
  }

  const pageWrap: CSSProperties = {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '16px',
    fontFamily: 'Arial, sans-serif',
  }

  const sectionCard: CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    background: '#fff',
    padding: '16px',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    height: '48px',
    padding: '0 14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
    boxSizing: 'border-box',
  }

  const buttonPrimary: CSSProperties = {
    height: '48px',
    padding: '0 20px',
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

  const tabButton = (active: boolean): CSSProperties => ({
    height: '48px',
    padding: '0 20px',
    borderRadius: '999px',
    border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
    background: active ? '#2563eb' : '#fff',
    color: active ? '#fff' : '#111827',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  })

  return (
    <main style={pageWrap}>
      <style>{`
        .wallets-page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .wallets-add-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(150px, 0.8fr) minmax(150px, 0.8fr) minmax(160px, 0.8fr) auto;
          gap: 12px;
          align-items: end;
        }

        .wallets-field-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 6px;
        }

        .wallets-balance-col {
          text-align: right;
          white-space: nowrap;
        }

        .wallets-tabs-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .wallets-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 4px 12px;
          align-items: center;
          padding: 12px 16px;
          border-top: 1px solid #f1f5f9;
        }

        .wallets-row:first-child {
          border-top: none;
        }

        .wallets-row-top {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          min-width: 0;
        }

        .wallets-row-meta {
          grid-column: 1 / -1;
          font-size: 12px;
          color: #64748b;
        }

        .wallets-menu-col .ram-trigger {
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .wallets-row:hover .wallets-menu-col .ram-trigger,
        .wallets-row:focus-within .wallets-menu-col .ram-trigger {
          opacity: 1;
        }

        @media (max-width: 900px) {
          .wallets-add-grid {
            grid-template-columns: 1fr 1fr;
          }

          .wallets-add-grid > :last-child {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 640px) {
          .wallets-page-header {
            flex-direction: column;
            align-items: stretch !important;
          }

          .wallets-add-grid {
            grid-template-columns: 1fr !important;
          }

          .wallets-row {
            padding: 12px 14px;
          }

          .wallets-menu-col .ram-trigger {
            opacity: 1 !important;
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

      <div className="wallets-page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>Wallets</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '15px' }}>
            Manage cash, bank, card, and e-wallet accounts.
          </p>
        </div>
      </div>

      <section style={{ ...sectionCard, marginBottom: '16px' }}>
        <h2
          style={{
            marginTop: 0,
            marginBottom: '16px',
            color: '#6b7280',
            fontSize: '1.05rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Add New Wallet
        </h2>

        <form onSubmit={handleAddWallet} className="wallets-add-grid">
          <label>
            <span className="wallets-field-label">Wallet name</span>
            <input
              type="text"
              placeholder="e.g. Maybank, Cash"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label>
            <span className="wallets-field-label">Type</span>
            <select
              value={walletType}
              onChange={(e) => setWalletType(e.target.value as WalletType)}
              style={inputStyle}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="card">Card</option>
              <option value="ewallet">E-Wallet</option>
            </select>
          </label>

          <label>
            <span className="wallets-field-label">Opening balance (RM)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label>
            <span className="wallets-field-label">As at end of (optional)</span>
            <input
              type="date"
              max={todayInputValue()}
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
              style={inputStyle}
            />
          </label>

          <button type="submit" style={buttonPrimary}>
            Add Wallet
          </button>
        </form>
      </section>

      <div className="wallets-tabs-row">
        <button type="button" onClick={() => setTab('active')} style={tabButton(tab === 'active')}>
          Active ({activeWallets.length})
        </button>

        <button
          type="button"
          onClick={() => setTab('archived')}
          style={tabButton(tab === 'archived')}
        >
          Archived ({archivedWallets.length})
        </button>
      </div>

      <section style={{ ...sectionCard, marginBottom: '16px', padding: '12px' }}>
        <input
          type="text"
          placeholder="Search wallets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={inputStyle}
        />
      </section>

      {loading ? (
        <section style={sectionCard}>
          <p style={{ margin: 0 }}>Loading wallets...</p>
        </section>
      ) : (
        <section style={{ ...sectionCard, padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '16px',
              borderBottom: filteredWallets.length > 0 ? '1px solid #f1f5f9' : 'none',
              fontSize: '14px',
              fontWeight: 700,
              color: '#6b7280',
            }}
          >
            {filteredWallets.length} wallet{filteredWallets.length === 1 ? '' : 's'}
          </div>

          {filteredWallets.length === 0 ? (
            <div style={{ padding: '16px', color: '#64748b', fontSize: '14px' }}>No wallets found.</div>
          ) : (
            filteredWallets.map((wallet) => {
              const isWorking = workingId === wallet.id
              const usageCount = wallet.usageCount

              return (
                <div key={wallet.id} className="wallets-row">
                  <div className="wallets-row-top">
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#111827',
                        wordBreak: 'break-word',
                      }}
                    >
                      {wallet.name}
                    </div>

                    <span
                      style={{
                        ...getWalletTypeBadgeStyle(wallet.type),
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      {getWalletTypeLabel(wallet.type)}
                    </span>

                    {wallet.is_archived && (
                      <span
                        style={{
                          background: '#e5e7eb',
                          color: '#4b5563',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        Archived
                      </span>
                    )}
                  </div>

                  <div
                    className="wallets-balance-col"
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: wallet.balance >= 0 ? '#166534' : '#b91c1c',
                    }}
                  >
                    {formatCurrency(wallet.balance)}
                  </div>

                  <div className="wallets-menu-col" style={{ justifySelf: 'end' }}>
                    <RowActionsMenu
                      items={[
                        {
                          label: 'View Ledger',
                          onClick: () => router.push(`/wallets/${wallet.id}`),
                        },
                        {
                          label: 'Set Opening Balance',
                          disabled: isWorking,
                          onClick: () => openEditOpening(wallet),
                        },
                        tab === 'active'
                          ? {
                              label: 'Archive',
                              disabled: isWorking,
                              onClick: () => handleArchive(wallet.id, true),
                            }
                          : {
                              label: 'Restore',
                              disabled: isWorking,
                              onClick: () => handleArchive(wallet.id, false),
                            },
                        {
                          label: 'Delete',
                          danger: true,
                          disabled: isWorking || usageCount > 0,
                          onClick: () => setDeleteId(wallet.id),
                        },
                      ]}
                    />
                  </div>

                  <div className="wallets-row-meta">
                    {usageCount} transaction{usageCount === 1 ? '' : 's'} · Opening{' '}
                    {formatCurrency(Number(wallet.opening_balance) || 0)}
                    {wallet.opening_balance_date
                      ? ` as at ${formatDate(wallet.opening_balance_date)}`
                      : ''}
                  </div>
                </div>
              )
            })
          )}
        </section>
      )}

      {editWallet && (
        <div
          onClick={() => !savingEdit && setEditWallet(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <form
            onSubmit={handleSaveOpening}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              background: '#fff',
              borderRadius: 12,
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Opening balance</h3>
              <p style={{ fontSize: 14, color: '#555', margin: '6px 0 0' }}>{editWallet.name}</p>
            </div>

            <label>
              <span className="wallets-field-label">Opening balance (RM)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={editBalance}
                onChange={(e) => setEditBalance(e.target.value)}
                style={inputStyle}
                autoFocus
              />
            </label>

            <label>
              <span className="wallets-field-label">As at end of (optional)</span>
              <input
                type="date"
                max={todayInputValue()}
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                style={inputStyle}
              />
            </label>

            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              {editDate
                ? 'Only transactions dated after this day are added to the balance.'
                : 'No date set: every transaction in this wallet is added to the balance.'}
            </p>

            {editError && (
              <p style={{ fontSize: 13, color: '#b91c1c', margin: 0, fontWeight: 600 }}>{editError}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setEditWallet(null)}
                disabled={savingEdit}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 8,
                  border: '1px solid #0f172a',
                  background: '#0f172a',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="Delete wallet"
        message="This action cannot be undone. Wallets already used in transactions cannot be deleted."
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) handleDelete(deleteId)
          setDeleteId(null)
        }}
      />

      <Toast message={successMessage} type="success" onClose={() => setSuccessMessage('')} />
      <Toast message={errorMessage} type="error" onClose={() => setErrorMessage('')} />
    </main>
  )
}