'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import { formatMoney, walletCurrency } from '@/lib/currency'
import { TRANSACTIONS_CHANGED_EVENT } from '@/components/MobileNav'
import { walletPeriodSummary } from '@/lib/walletBalance'
import { isDateInRange } from '@/lib/dateFilters'
import PeriodFilter, { rangeForPeriod, type Period } from '@/components/PeriodFilter'
import ConfirmModal from '@/components/ConfirmModal'
import RowActionsMenu from '@/components/RowActionsMenu'
import TxRow, { TxDayHeader, txRowText } from '@/components/TxRow'
import Toast from '@/components/Toast'
import TransactionForm, {
  TransactionFormInitialValues,
  TransactionFormValues,
  TransactionType,
} from '@/components/TransactionForm'

type PageTransactionType = TransactionType | 'Transfer' | 'Exchange'
type LedgerTypeFilter = 'All' | PageTransactionType
type TransferFlowFilter = 'all' | 'in' | 'out'

type TransactionRow = {
  id: string
  created_at?: string
  type: PageTransactionType
  category: string | null
  category_id: number | null
  vendor: string | null
  vendor_id: number | null
  wallet_id: number | null
  transfer_wallet_id: number | null
  amount: number
  received_amount?: number | null
  date: string
  note: string | null
}

type WalletRow = {
  id: number
  name: string
  type: 'cash' | 'bank' | 'card' | 'ewallet'
  is_archived?: boolean
  created_at?: string
  opening_balance?: number | null
  opening_balance_date?: string | null
  currency?: string | null
}

type VendorRow = {
  id: number
  name: string
  normalized_name?: string
  is_archived?: boolean
}

type CategoryRow = {
  id: number
  type_id: number
  name: string
  is_archived?: boolean
  is_active?: boolean
}

type LedgerDisplayRow = {
  id: string
  type: PageTransactionType
  amount: number
  date: string
  note: string | null
  title: string
  walletName: string | null
  walletType?: WalletRow['type']
  transferWalletName: string | null
  transferWalletType?: WalletRow['type']
  direction: 'in' | 'out'
  transferFlow: TransferFlowFilter | null
  categoryId: string
  vendorId: number | null
  vendorName: string | null
  categoryName: string
  fromName: string | null
  toName: string | null
  // Exchange: the other side, e.g. "received ₹ 18,450.00".
  exchangeNote?: string
}

type LedgerGroup = {
  date: string
  label: string
  rows: LedgerDisplayRow[]
  expenseTotal: number
  incomeTotal: number
  transferTotal: number
}

function formatPrettyDate(dateString: string) {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString.toUpperCase()

  return date.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase()
}

function formatGroupLabel(dateString: string) {
  const input = new Date(dateString)
  const today = new Date()

  if (Number.isNaN(input.getTime())) return dateString.toUpperCase()

  const inputDay = new Date(input.getFullYear(), input.getMonth(), input.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.floor((todayDay.getTime() - inputDay.getTime()) / 86400000)

  const pretty = formatPrettyDate(dateString)

  if (diffDays === 0) return `Today — ${pretty}`
  if (diffDays === 1) return `Yesterday — ${pretty}`
  return pretty
}

function formatDateShort(dateString?: string) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString

  return date.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getTypeDotColor(type: PageTransactionType) {
  if (type === 'Expense') return '#ef4444'
  if (type === 'Income') return '#65a30d'
  if (type === 'Investment') return '#3b82f6'
  return '#8b5cf6'
}

function getAmountColor(type: PageTransactionType, direction: 'in' | 'out') {
  if (type === 'Transfer' || type === 'Exchange') return '#7c3aed'
  if (type === 'Investment') return '#2563eb'
  return direction === 'in' ? '#166534' : '#b91c1c'
}


function getWalletBadgeStyle(walletType?: WalletRow['type']): CSSProperties {
  if (walletType === 'cash') return { background: '#fef3c7', color: '#92400e' }
  if (walletType === 'bank') return { background: '#dbeafe', color: '#1d4ed8' }
  if (walletType === 'card') return { background: '#ffedd5', color: '#c2410c' }
  if (walletType === 'ewallet') return { background: '#dcfce7', color: '#166534' }
  return { background: '#e5e7eb', color: '#4b5563' }
}

export default function WalletLedgerPage() {
  const params = useParams()
  const walletId = Number(params?.id)

  const [wallet, setWallet] = useState<WalletRow | null>(null)
  // Every amount on this page is in the wallet's own currency.
  const currency = walletCurrency(wallet)
  const formatCurrency = (value: number) => formatMoney(value, currency)
  const formatCurrencyCompact = (value: number) => formatMoney(value, currency, 0)
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState<Period>('month')
  const [monthOffset, setMonthOffset] = useState(0)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState<LedgerTypeFilter>('All')
  const [transferFlowFilter, setTransferFlowFilter] = useState<TransferFlowFilter>('all')

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formInitialValues, setFormInitialValues] = useState<TransactionFormInitialValues>({
    type: 'Expense',
  })

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const fetchData = async () => {
    if (!walletId || Number.isNaN(walletId)) {
      setErrorMessage('Invalid wallet ID.')
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage('')

    const [walletRes, txRes, walletsRes, vendorsRes, categoriesRes] = await Promise.all([
      supabase
        .from('wallets')
        .select('id, name, type, is_archived, created_at, opening_balance, opening_balance_date, currency')
        .eq('id', walletId)
        .maybeSingle(),
      fetchAllRows(() =>
        supabase
          .from('transaction')
          .select('*')
          .or(`wallet_id.eq.${walletId},transfer_wallet_id.eq.${walletId}`)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
      ),
      supabase
        .from('wallets')
        .select('id, name, type, is_archived, created_at')
        .order('name', { ascending: true }),
      supabase
        .from('vendors')
        .select('id, name, normalized_name, is_archived')
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('id, type_id, name, is_archived, is_active')
        .order('type_id', { ascending: true })
        .order('name', { ascending: true }),
    ])

    if (walletRes.error) {
      setErrorMessage(walletRes.error.message)
      setWallet(null)
    } else {
      setWallet((walletRes.data as WalletRow) || null)
    }

    if (txRes.error) {
      setErrorMessage(txRes.error.message)
      setTransactions([])
    } else {
      setTransactions((txRes.data as TransactionRow[]) || [])
    }

    if (walletsRes.error) {
      setErrorMessage(walletsRes.error.message)
      setWallets([])
    } else {
      setWallets((walletsRes.data as WalletRow[]) || [])
    }

    if (vendorsRes.error) {
      setErrorMessage(vendorsRes.error.message)
      setVendors([])
    } else {
      setVendors((vendorsRes.data as VendorRow[]) || [])
    }

    if (categoriesRes.error) {
      setErrorMessage(categoriesRes.error.message)
      setCategories([])
    } else {
      setCategories((categoriesRes.data as CategoryRow[]) || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [walletId])

  // Reload when a transaction is added from the bottom bar's + button.
  useEffect(() => {
    const reload = () => {
      fetchData()
    }
    window.addEventListener(TRANSACTIONS_CHANGED_EVENT, reload)
    return () => window.removeEventListener(TRANSACTIONS_CHANGED_EVENT, reload)
  }, [])

  useEffect(() => {
    const range = rangeForPeriod('month', 0)
    setFilterDateFrom(range.from)
    setFilterDateTo(range.to)
  }, [])

  useEffect(() => {
    if (!showForm) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [showForm])

  const walletMap = useMemo(() => {
    const map: Record<number, WalletRow> = {}
    wallets.forEach((item) => {
      map[item.id] = item
    })
    return map
  }, [wallets])

  const vendorMap = useMemo(() => {
    const map: Record<number, VendorRow> = {}
    vendors.forEach((item) => {
      map[item.id] = item
    })
    return map
  }, [vendors])

  const categoryMap = useMemo(() => {
    const map: Record<number, CategoryRow> = {}
    categories.forEach((item) => {
      map[item.id] = item
    })
    return map
  }, [categories])

  const displayRows = useMemo<LedgerDisplayRow[]>(() => {
    return transactions.map((item) => {
      const sourceWallet = item.wallet_id ? walletMap[item.wallet_id] : undefined
      const destinationWallet = item.transfer_wallet_id ? walletMap[item.transfer_wallet_id] : undefined
      const vendorName =
        (item.vendor_id ? vendorMap[item.vendor_id]?.name : null) || item.vendor || null
      const categoryName =
        (item.category_id ? categoryMap[item.category_id]?.name : '') ||
        item.category ||
        (item.type === 'Transfer' || item.type === 'Exchange' ? 'Transfer' : 'Uncategorized')

      let amount = Number(item.amount) || 0
      let exchangeNote: string | undefined
      let direction: 'in' | 'out' = 'out'
      let transferFlow: TransferFlowFilter | null = null
      let title = ''
      let walletName: string | null = sourceWallet?.name || null
      let walletType: WalletRow['type'] | undefined = sourceWallet?.type
      let transferWalletName: string | null = destinationWallet?.name || null
      let transferWalletType: WalletRow['type'] | undefined = destinationWallet?.type

      if (item.type === 'Transfer') {
        if (item.transfer_wallet_id === walletId) {
          direction = 'in'
          transferFlow = 'in'
          walletName = destinationWallet?.name || wallet?.name || null
          walletType = destinationWallet?.type || wallet?.type
          transferWalletName = sourceWallet?.name || null
          transferWalletType = sourceWallet?.type
          title = `Transfer · ${sourceWallet?.name || 'No wallet'} → ${destinationWallet?.name || 'No wallet'}`
        } else {
          direction = 'out'
          transferFlow = 'out'
          title = `Transfer · ${sourceWallet?.name || 'No wallet'} → ${destinationWallet?.name || 'No wallet'}`
        }
      } else if (item.type === 'Exchange') {
        // This wallet either sent the money (its own currency) or received it.
        title = `Transfer · ${sourceWallet?.name || 'No wallet'} → ${destinationWallet?.name || 'No wallet'}`
        const sent = Number(item.amount) || 0
        const received = Number(item.received_amount) || 0
        if (item.transfer_wallet_id === walletId) {
          direction = 'in'
          transferFlow = 'in'
          amount = received
          walletName = destinationWallet?.name || wallet?.name || null
          walletType = destinationWallet?.type || wallet?.type
          transferWalletName = sourceWallet?.name || null
          transferWalletType = sourceWallet?.type
          exchangeNote = `from ${formatMoney(sent, walletCurrency(sourceWallet))}`
        } else {
          direction = 'out'
          transferFlow = 'out'
          exchangeNote = `received ${formatMoney(received, walletCurrency(destinationWallet))}`
        }
      } else if (item.type === 'Income') {
        direction = 'in'
        title = `${categoryName}${vendorName ? ` · ${vendorName}` : ''}`
      } else {
        direction = 'out'
        title = `${categoryName}${vendorName ? ` · ${vendorName}` : ''}`
      }

      return {
        id: item.id,
        type: item.type,
        amount,
        exchangeNote,
        date: item.date,
        note: item.note,
        title,
        walletName,
        walletType,
        transferWalletName,
        transferWalletType,
        direction,
        transferFlow,
        categoryId: item.category_id ? String(item.category_id) : '',
        vendorId: item.vendor_id,
        vendorName,
        categoryName,
        fromName: sourceWallet?.name || null,
        toName: destinationWallet?.name || null,
      }
    })
  }, [transactions, walletMap, vendorMap, categoryMap, walletId, wallet])

  const filteredRows = useMemo(() => {
    return displayRows.filter((item) => {
      // "Wallet transfer" covers both same-currency transfers and exchanges.
      const typeMatch =
        typeFilter === 'All'
          ? true
          : typeFilter === 'Transfer'
            ? item.type === 'Transfer' || item.type === 'Exchange'
            : item.type === typeFilter
      const dateMatch = isDateInRange(item.date, filterDateFrom, filterDateTo)
      const transferFlowMatch =
        typeFilter === 'Transfer'
          ? transferFlowFilter === 'all'
            ? true
            : item.transferFlow === transferFlowFilter
          : true

      return typeMatch && dateMatch && transferFlowMatch
    })
  }, [displayRows, typeFilter, filterDateFrom, filterDateTo, transferFlowFilter])

  // Opening and closing balance for the selected dates. Type and category
  // filters do not change these: a balance always includes every transaction.
  const periodBalance = useMemo(() => {
    if (!wallet) return { opening: null, moneyIn: 0, moneyOut: 0, closing: null }
    return walletPeriodSummary(wallet, transactions, filterDateFrom || null, filterDateTo || null)
  }, [wallet, transactions, filterDateFrom, filterDateTo])

  const summaryTotals = useMemo(() => {
    let moneyIn = 0
    let moneyOut = 0

    filteredRows.forEach((item) => {
      if (item.direction === 'in') moneyIn += item.amount
      else moneyOut += item.amount
    })

    return {
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
    }
  }, [filteredRows])

  const allTimeEntryCount = transactions.length

  const groupedRows = useMemo<LedgerGroup[]>(() => {
    const groups: Record<string, LedgerGroup> = {}

    filteredRows.forEach((item) => {
      if (!groups[item.date]) {
        groups[item.date] = {
          date: item.date,
          label: formatGroupLabel(item.date),
          rows: [],
          expenseTotal: 0,
          incomeTotal: 0,
          transferTotal: 0,
        }
      }

      groups[item.date].rows.push(item)

      if (item.type === 'Income') {
        groups[item.date].incomeTotal += item.amount
      } else if (item.type === 'Transfer' || item.type === 'Exchange') {
        groups[item.date].transferTotal += item.amount
      } else {
        groups[item.date].expenseTotal += item.amount
      }
    })

    return Object.keys(groups)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => groups[key])
  }, [filteredRows])

  function handlePeriodChange(next: Period) {
    setPeriod(next)
    const range = rangeForPeriod(next, monthOffset, filterDateFrom, filterDateTo)
    setFilterDateFrom(range.from)
    setFilterDateTo(range.to)
  }

  function handleMonthOffsetChange(next: number) {
    setMonthOffset(next)
    const range = rangeForPeriod('month', next)
    setFilterDateFrom(range.from)
    setFilterDateTo(range.to)
  }

  function handleFromDateChange(value: string) {
    setPeriod('custom')
    setFilterDateFrom(value)
  }

  function handleToDateChange(value: string) {
    setPeriod('custom')
    setFilterDateTo(value)
  }

  function clearFilters() {
    setPeriod('month')
    setMonthOffset(0)
    const range = rangeForPeriod('month', 0)
    setFilterDateFrom(range.from)
    setFilterDateTo(range.to)
    setTypeFilter('All')
    setTransferFlowFilter('all')
  }

  function resetFormState() {
    setEditingId(null)
    setFormInitialValues({ type: 'Expense' })
  }

  function handleCancel() {
    resetFormState()
    setShowForm(false)
    setErrorMessage('')
    setSuccessMessage('')
  }

  function handleEdit(row: LedgerDisplayRow) {
    const source = transactions.find((item) => item.id === row.id)
    if (!source) return

    setEditingId(row.id)
    // Transfers (same or different currency): the form lets only the amount change.
    if (source.type === 'Transfer' || source.type === 'Exchange') {
      setFormInitialValues({
        type: source.type,
        wallet_id: source.wallet_id || null,
        transfer_wallet_id: source.transfer_wallet_id || null,
        amount: String(source.amount),
        received_amount: source.received_amount == null ? '' : String(source.received_amount),
        date: source.date,
        note: source.note || '',
      })
      setShowForm(true)
      setErrorMessage('')
      setSuccessMessage('')
      return
    }
    setFormInitialValues({
      type: source.type as TransactionType,
      category_id: source.category_id ? String(source.category_id) : '',
      vendor: source.vendor || '',
      vendor_id: source.vendor_id || null,
      wallet_id: source.wallet_id || null,
      amount: String(source.amount),
      date: source.date,
      note: source.note || '',
    })
    setShowForm(true)
    setErrorMessage('')
    setSuccessMessage('')
  }

  async function handleSaveTransaction(values: TransactionFormValues) {
    setErrorMessage('')
    setSuccessMessage('')

    if (!editingId) return

    const { error } = await supabase.from('transaction').update(values).eq('id', editingId)
    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Transaction updated successfully.')
    resetFormState()
    setShowForm(false)
    await fetchData()
  }

  async function handleDelete(id: string) {
    setWorkingId(id)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.from('transaction').delete().eq('id', id)

    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Transaction deleted successfully.')
    if (editingId === id) {
      resetFormState()
      setShowForm(false)
    }
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
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
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

  if (loading) {
    return <main style={pageWrap}>Loading wallet ledger...</main>
  }

  if (!wallet) {
    return <main style={pageWrap}>Wallet not found.</main>
  }

  // The current period's closing is today's balance; a finished period closes on its last day.
  const todayKey = new Date().toLocaleDateString('en-CA')
  const closingLabel =
    !filterDateTo || filterDateTo >= todayKey
      ? `as on ${formatDateShort(todayKey)}`
      : formatDateShort(filterDateTo)

  return (
    <main style={pageWrap}>
      <style>{`
        .wallet-ledger-topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .ledger-summary {
          display: grid;
          grid-template-columns: minmax(200px, auto) minmax(0, 1fr);
          gap: 16px;
          align-items: center;
        }

        .ledger-summary-closing-value {
          font-size: 1.8rem;
          font-weight: 800;
          margin-top: 2px;
          white-space: nowrap;
        }

        .ledger-figures {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .ledger-figure {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #f8fafc;
          padding: 10px 12px;
          min-width: 0;
        }

        .ledger-figure-label {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
        }

        .ledger-figure-value {
          font-size: 1.05rem;
          font-weight: 800;
          margin-top: 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .wallet-ledger-custom-dates {
          display: grid;
          grid-template-columns: minmax(170px, 1fr) minmax(170px, 1fr);
          gap: 10px;
          margin-bottom: 10px;
        }

        .wallet-ledger-filter-grid {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .wallet-ledger-filter-grid > .ledger-type-select,
        .wallet-ledger-filter-grid > .ledger-transfer-select {
          flex: 1;
          min-width: 220px;
        }

        .wallet-ledger-group-grid {
          display: grid;
          grid-template-columns: 14px minmax(0, 1.9fr) minmax(140px, 1fr) 120px auto;
          gap: 12px;
          align-items: center;
        }

        .wallet-ledger-row {
          display: grid;
          grid-template-columns: 14px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
        }

        .wallet-ledger-main {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .wallet-ledger-left {
          min-width: 0;
          flex: 1;
        }

        .wallet-ledger-right {
          display: grid;
          grid-template-columns: 110px auto auto;
          gap: 12px;
          align-items: center;
        }

        .wallet-ledger-note {
          margin-top: 6px;
          font-size: 12px;
          color: #64748b;
          word-break: break-word;
        }

        @media (max-width: 900px) {
          .ledger-summary {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .wallet-ledger-custom-dates {
            grid-template-columns: 1fr 1fr !important;
          }

          .wallet-ledger-group-grid {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          .wallet-ledger-group-spacer {
            display: none !important;
          }

          .wallet-ledger-group-totals {
            justify-self: start !important;
            text-align: left !important;
            white-space: normal !important;
          }
        }

        @media (max-width: 640px) {
          .wallet-ledger-topbar {
            flex-direction: column;
            align-items: stretch !important;
          }

          .ledger-figures {
            grid-template-columns: 1fr 1fr;
          }

          .wallet-ledger-custom-dates {
            grid-template-columns: 1fr !important;
          }

          .wallet-ledger-filter-grid {
            gap: 8px !important;
          }

          .wallet-ledger-filter-grid > .ledger-type-select {
            flex: 1 1 0 !important;
            min-width: 0 !important;
          }

          .wallet-ledger-filter-grid > .ledger-transfer-select {
            order: 3;
            flex: 1 1 100% !important;
            min-width: 0 !important;
          }

          .wallet-ledger-filter-grid > button {
            flex: 0 0 auto !important;
          }

          .wallet-ledger-row {
            grid-template-columns: 14px minmax(0, 1fr) !important;
            align-items: start !important;
          }

          .wallet-ledger-main {
            flex-direction: column;
            align-items: stretch !important;
            gap: 10px !important;
          }

          .wallet-ledger-right {
            grid-template-columns: auto auto;
            justify-content: space-between;
          }

          .wallet-ledger-flow-col {
            display: none !important;
          }
        }
      `}</style>

      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/wallets"
          style={{
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          ← Back to Wallets
        </Link>
      </div>

      <div className="wallet-ledger-topbar">
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>{wallet.name}</h1>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: '6px',
              color: '#64748b',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                ...getWalletBadgeStyle(wallet.type),
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {wallet.type === 'ewallet'
                ? 'E-Wallet'
                : wallet.type.charAt(0).toUpperCase() + wallet.type.slice(1)}
            </span>
            {wallet.is_archived && (
              <span
                style={{
                  background: '#e5e7eb',
                  color: '#4b5563',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                Archived
              </span>
            )}
            <span>
              {allTimeEntryCount} {allTimeEntryCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        </div>
      </div>

      {/* Closing balance first, then the four figures that lead to it. */}
      <section className="ledger-summary" style={{ ...sectionCard, marginBottom: '16px' }}>
        <div className="ledger-summary-closing">
          <div className="ledger-figure-label">
            Closing · {closingLabel}
          </div>
          <div
            className="ledger-summary-closing-value"
            style={{ color: (periodBalance.closing ?? 0) >= 0 ? '#1d4ed8' : '#b91c1c' }}
          >
            {periodBalance.closing === null ? '–' : formatCurrency(periodBalance.closing)}
          </div>
        </div>

        <div className="ledger-figures">
          <div className="ledger-figure">
            <div className="ledger-figure-label">Opening</div>
            <div
              className="ledger-figure-value"
              style={{ color: (periodBalance.opening ?? 0) >= 0 ? '#0f172a' : '#b91c1c' }}
            >
              {periodBalance.opening === null ? '–' : formatCurrency(periodBalance.opening)}
            </div>
          </div>
          <div className="ledger-figure">
            <div className="ledger-figure-label">Net flow</div>
            <div
              className="ledger-figure-value"
              style={{ color: summaryTotals.net >= 0 ? '#166534' : '#b91c1c' }}
            >
              {formatCurrency(summaryTotals.net)}
            </div>
          </div>
          <div className="ledger-figure" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <div className="ledger-figure-label" style={{ color: '#166534' }}>
              Money in
            </div>
            <div className="ledger-figure-value" style={{ color: '#166534' }}>
              {formatCurrency(summaryTotals.moneyIn)}
            </div>
          </div>
          <div className="ledger-figure" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
            <div className="ledger-figure-label" style={{ color: '#b91c1c' }}>
              Money out
            </div>
            <div className="ledger-figure-value" style={{ color: '#b91c1c' }}>
              {formatCurrency(summaryTotals.moneyOut)}
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...sectionCard, marginBottom: '16px', padding: '12px' }}>
        <div style={{ marginBottom: '10px' }}>
          <PeriodFilter
            period={period}
            monthOffset={monthOffset}
            onPeriodChange={handlePeriodChange}
            onMonthOffsetChange={handleMonthOffsetChange}
          />
        </div>

        {period === 'custom' && (
          <div className="wallet-ledger-custom-dates">
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => handleFromDateChange(e.target.value)}
              style={inputStyle}
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => handleToDateChange(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        <div className="wallet-ledger-filter-grid">
          <div className="ledger-type-select">
            <select
              value={typeFilter}
              onChange={(e) => {
                const next = e.target.value as LedgerTypeFilter
                setTypeFilter(next)
                if (next !== 'Transfer') {
                  setTransferFlowFilter('all')
                }
              }}
              style={inputStyle}
            >
              <option value="All">All Types</option>
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
              <option value="Investment">Investment</option>
              <option value="Transfer">Wallet transfer</option>
            </select>
          </div>

          {typeFilter === 'Transfer' && (
            <div className="ledger-transfer-select">
              <select
                value={transferFlowFilter}
                onChange={(e) => setTransferFlowFilter(e.target.value as TransferFlowFilter)}
                style={inputStyle}
              >
                <option value="all">All Transfers</option>
                <option value="in">Transfer In</option>
                <option value="out">Transfer Out</option>
              </select>
            </div>
          )}

          <button type="button" onClick={clearFilters} style={buttonSecondary}>
            Clear
          </button>
        </div>
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Wallet ledger</h2>
          <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
            Showing {filteredRows.length} of {allTimeEntryCount}
          </div>
        </div>

        {groupedRows.length === 0 ? (
          <div style={sectionCard}>No ledger entries found for these filters.</div>
        ) : (
          <div style={{ display: 'grid', gap: '18px' }}>
            {groupedRows.map((group) => {
              const totalParts: Array<{ text: string; color: string }> = []

              if (group.expenseTotal > 0) {
                totalParts.push({
                  text: `${formatCurrencyCompact(group.expenseTotal)} spent`,
                  color: '#b91c1c',
                })
              }

              if (group.incomeTotal > 0) {
                totalParts.push({
                  text: `${formatCurrencyCompact(group.incomeTotal)} in`,
                  color: '#166534',
                })
              }

              if (group.transferTotal > 0) {
                totalParts.push({
                  text: `${formatCurrencyCompact(group.transferTotal)} transfer`,
                  color: '#7c3aed',
                })
              }

              return (
                <div key={group.date}>
                  <TxDayHeader label={group.label} parts={totalParts} />

                  <div className="txr-card">
                    {group.rows.map((row) => {
                      const isWorking = workingId === row.id
                      const text = txRowText({
                        type: row.type,
                        vendor: row.vendorName,
                        category: row.categoryName,
                        fromName: row.fromName,
                        toName: row.toName,
                        flow: row.transferFlow === 'in' || row.transferFlow === 'out' ? row.transferFlow : null,
                        note: row.note,
                      })

                      return (
                        <TxRow
                          key={row.id}
                          className="ledger-txr"
                          title={text.title}
                          subtitle={text.subtitle}
                          dotColor={getTypeDotColor(row.type)}
                          amount={`${row.direction === 'in' ? '+' : ''}${formatCurrency(row.amount)}`}
                          amountColor={getAmountColor(row.type, row.direction)}
                          amountNote={row.exchangeNote}
                          menu={
                            <RowActionsMenu
                              items={[
                                {
                                  label: 'Edit',
                                  disabled: isWorking,
                                  onClick: () => handleEdit(row),
                                },
                                {
                                  label: 'Delete',
                                  danger: true,
                                  disabled: isWorking,
                                  onClick: () => setDeleteId(row.id),
                                },
                              ]}
                            />
                          }
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={handleCancel}
        >
          <div
            style={{
              width: 'min(760px, 100%)',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              background: '#fff',
              padding: '16px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Edit Transaction</h2>

              <button
                type="button"
                onClick={handleCancel}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '999px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#111827',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                }}
                aria-label="Close transaction form"
              >
                ×
              </button>
            </div>

            <TransactionForm
              mode="edit"
              initialValues={formInitialValues}
              submitLabel="Update Transaction"
              onSubmit={handleSaveTransaction}
              onCancel={handleCancel}
              showCancel
            />
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="Delete transaction"
        message="This action cannot be undone."
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