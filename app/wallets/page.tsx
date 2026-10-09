'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { TRANSACTIONS_CHANGED_EVENT } from '@/components/MobileNav'
import RowActionsMenu from '@/components/RowActionsMenu'
import Toast from '@/components/Toast'
import ConfirmModal from '@/components/ConfirmModal'
import { walletBalance } from '@/lib/walletBalance'
import CurrencySwitch from '@/components/CurrencySwitch'
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  currenciesInUse,
  currencyInfo,
  formatMoney,
  useViewCurrency,
  walletCurrency,
  type CurrencyCode,
} from '@/lib/currency'

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
  currency?: string | null
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

function formatCurrency(value: number, currency: string) {
  return formatMoney(value, currency)
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

function getWalletTypeLabel(type: WalletType) {
  if (type === 'cash') return 'Cash'
  if (type === 'bank') return 'Bank'
  if (type === 'card') return 'Card'
  return 'E-Wallet'
}

export default function WalletsPage() {
  const router = useRouter()

  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [usageRows, setUsageRows] = useState<TransactionUsageRow[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<WalletTab>('active')
  const [showAdd, setShowAdd] = useState(false)

  const [walletName, setWalletName] = useState('')
  const [walletType, setWalletType] = useState<WalletType>('cash')
  const [openingBalance, setOpeningBalance] = useState('')
  const [openingDate, setOpeningDate] = useState('')
  const [walletCurrencyCode, setWalletCurrencyCode] = useState<CurrencyCode>(DEFAULT_CURRENCY)

  const [editWallet, setEditWallet] = useState<WalletRow | null>(null)
  const [editBalance, setEditBalance] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editCurrency, setEditCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY)
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
        .select('id, name, type, is_archived, created_at, opening_balance, opening_balance_date, currency')
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

  // Reload when a transaction is added from the bottom bar's + button.
  useEffect(() => {
    const reload = () => {
      fetchData()
    }
    window.addEventListener(TRANSACTIONS_CHANGED_EVENT, reload)
    return () => window.removeEventListener(TRANSACTIONS_CHANGED_EVENT, reload)
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

  // One currency at a time, the same one chosen on the dashboard.
  const availableCurrencies = useMemo(() => currenciesInUse(wallets), [wallets])
  const viewCurrency = useViewCurrency(availableCurrencies)
  const showCurrency = availableCurrencies.length > 1

  const activeInView = useMemo(
    () => activeWallets.filter((wallet) => walletCurrency(wallet) === viewCurrency),
    [activeWallets, viewCurrency]
  )

  // Archived wallets are few and rarely opened, so every currency is listed there.
  const filteredWallets = useMemo<WalletListItem[]>(() => {
    const source = tab === 'active' ? activeInView : archivedWallets
    return source
      .map((wallet) => ({
        ...wallet,
        usageCount: usageMap[wallet.id] || 0,
        balance: balanceMap[wallet.id] || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tab, activeInView, archivedWallets, usageMap, balanceMap])

  function openAddWallet() {
    setWalletName('')
    setWalletType('cash')
    setOpeningBalance('')
    setOpeningDate('')
    setWalletCurrencyCode(viewCurrency)
    setShowAdd(true)
  }

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
        currency: walletCurrencyCode,
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
    setWalletCurrencyCode(DEFAULT_CURRENCY)
    setShowAdd(false)
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
    setEditCurrency(walletCurrency(wallet))
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
        // Currency can only change while the wallet has no transactions.
        ...((usageMap[editWallet.id] || 0) === 0 ? { currency: editCurrency } : {}),
      })
      .eq('id', editWallet.id)

    setSavingEdit(false)

    if (error) {
      setEditError(error.message)
      return
    }

    setEditWallet(null)
    setSuccessMessage('Wallet saved.')
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

  function renderWalletRow(wallet: WalletListItem) {
    const isWorking = workingId === wallet.id
    const usageCount = wallet.usageCount
    const currency = walletCurrency(wallet)

    return (
      <div key={wallet.id} className="wallets-row">
        <Link href={`/wallets/${wallet.id}`} className="wallets-row-main">
          <span className="wallets-row-name">{wallet.name}</span>
          <span className="wallets-row-meta">
            {getWalletTypeLabel(wallet.type)} · {usageCount} transaction{usageCount === 1 ? '' : 's'}
            {tab === 'archived' && showCurrency ? ` · ${currencyInfo(currency).short}` : ''}
          </span>
        </Link>

        <Link
          href={`/wallets/${wallet.id}`}
          className="wallets-row-balance"
          style={{ color: wallet.balance >= 0 ? '#166534' : '#b91c1c' }}
        >
          {formatCurrency(wallet.balance, currency)}
        </Link>

        <div className="wallets-menu-col">
          <RowActionsMenu
            items={[
              {
                label: 'View Ledger',
                onClick: () => router.push(`/wallets/${wallet.id}`),
              },
              {
                label: 'Edit Wallet',
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
      </div>
    )
  }

  return (
    <main style={pageWrap}>
      <style>{`
        .wallets-head {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .wallets-tabs {
          display: flex;
          align-items: center;
          gap: 20px;
          margin: 16px 2px 12px;
        }

        .wallets-tab {
          border: none;
          background: none;
          padding: 0 0 5px;
          font: inherit;
          font-size: 15px;
          font-weight: 700;
          color: #64748b;
          border-bottom: 2px solid transparent;
          cursor: pointer;
        }

        .wallets-tab[aria-pressed='true'] {
          color: #0f172a;
          border-bottom-color: #0f172a;
        }

        .wallets-add-link {
          margin-left: auto;
          border: none;
          background: none;
          padding: 0 0 5px;
          font: inherit;
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          cursor: pointer;
        }

        .wallets-list {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          background: #fff;
          overflow: hidden;
        }

        .wallets-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 10px;
          align-items: center;
          padding: 12px 10px 12px 16px;
          border-top: 1px solid #f1f5f9;
        }

        .wallets-row:first-child {
          border-top: none;
        }

        .wallets-row-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          text-decoration: none;
        }

        .wallets-row-name {
          font-size: 15px;
          font-weight: 700;
          color: #111827;
          word-break: break-word;
        }

        .wallets-row-meta {
          font-size: 12px;
          color: #94a3b8;
        }

        .wallets-row-balance {
          font-size: 15px;
          font-weight: 800;
          white-space: nowrap;
          text-decoration: none;
        }

        .wallets-field-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 6px;
        }

        .wallets-sheet-shade {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .wallets-sheet {
          width: 100%;
          max-width: 420px;
          max-height: 92vh;
          overflow-y: auto;
          box-sizing: border-box;
          background: #fff;
          border-radius: 14px;
          padding: 16px;
          display: grid;
          gap: 12px;
        }

        @media (max-width: 640px) {
          .wallets-sheet-shade {
            align-items: flex-end;
            padding: 0;
          }

          .wallets-sheet {
            max-width: none;
            border-radius: 18px 18px 0 0;
            padding-bottom: calc(16px + env(safe-area-inset-bottom));
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

      <div className="wallets-head">
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>Wallets</h1>
        <CurrencySwitch available={availableCurrencies} value={viewCurrency} />
      </div>

      <div className="wallets-tabs">
        <button
          type="button"
          className="wallets-tab"
          aria-pressed={tab === 'active'}
          onClick={() => setTab('active')}
        >
          Active ({activeInView.length})
        </button>
        <button
          type="button"
          className="wallets-tab"
          aria-pressed={tab === 'archived'}
          onClick={() => setTab('archived')}
        >
          Archived ({archivedWallets.length})
        </button>
        <button type="button" className="wallets-add-link" onClick={openAddWallet}>
          + Add wallet
        </button>
      </div>

      {loading ? (
        <p style={{ margin: 0, color: '#64748b' }}>Loading wallets...</p>
      ) : filteredWallets.length === 0 ? (
        <div className="wallets-list" style={{ padding: '16px', color: '#64748b', fontSize: '14px' }}>
          {tab === 'active' ? 'No wallets yet.' : 'No archived wallets.'}
        </div>
      ) : (
        <div className="wallets-list">{filteredWallets.map(renderWalletRow)}</div>
      )}

      {showAdd && (
        <div className="wallets-sheet-shade" onClick={() => setShowAdd(false)}>
          <form className="wallets-sheet" onSubmit={handleAddWallet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Add wallet</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowAdd(false)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '999px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                ×
              </button>
            </div>

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
              <span className="wallets-field-label">Currency (locked once the wallet has transactions)</span>
              <select
                value={walletCurrencyCode}
                onChange={(e) => setWalletCurrencyCode(e.target.value as CurrencyCode)}
                style={inputStyle}
              >
                {CURRENCIES.map((info) => (
                  <option key={info.code} value={info.code}>
                    {info.symbol} {info.code} · {info.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="wallets-field-label">
                Opening balance ({currencyInfo(walletCurrencyCode).symbol})
              </span>
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
        </div>
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
              <h3 style={{ margin: 0 }}>Edit wallet</h3>
              <p style={{ fontSize: 14, color: '#555', margin: '6px 0 0' }}>{editWallet.name}</p>
            </div>

            <label>
              <span className="wallets-field-label">Currency</span>
              <select
                value={editCurrency}
                onChange={(e) => setEditCurrency(e.target.value as CurrencyCode)}
                disabled={(usageMap[editWallet.id] || 0) > 0}
                style={{ ...inputStyle, background: (usageMap[editWallet.id] || 0) > 0 ? '#f1f5f9' : '#fff' }}
              >
                {CURRENCIES.map((info) => (
                  <option key={info.code} value={info.code}>
                    {info.symbol} {info.code} · {info.name}
                  </option>
                ))}
              </select>
              {(usageMap[editWallet.id] || 0) > 0 && (
                <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Locked: this wallet already has transactions.
                </span>
              )}
            </label>

            <label>
              <span className="wallets-field-label">
                Opening balance ({currencyInfo(editCurrency).symbol})
              </span>
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