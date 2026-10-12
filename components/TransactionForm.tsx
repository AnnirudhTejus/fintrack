'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import WalletPicker from '@/components/WalletPicker'
import { currenciesInUse, currencyInfo, useViewCurrency, walletCurrency } from '@/lib/currency'

export type TransactionType = 'Expense' | 'Income' | 'Investment'

type FormTransactionType = TransactionType | 'Transfer' | 'Exchange'

type CategoryRow = {
  id: number
  name: string
  type_id: number
  is_archived?: boolean
  is_active?: boolean
}

type VendorRow = {
  id: number
  name: string
  normalized_name?: string | null
  is_archived?: boolean
  // Home category: used for a vendor's first entry and to list it under a category.
  category_id?: number | null
}

// How each vendor has been used, worked out from past entries.
type VendorUsage = {
  // "vendorId:categoryId" -> number of entries
  byCategory: Record<string, number>
  // vendorId -> number of entries
  total: Record<number, number>
  // vendorId -> category of the most recent entry
  lastCategory: Record<number, number>
}

const EMPTY_USAGE: VendorUsage = { byCategory: {}, total: {}, lastCategory: {} }

type WalletRow = {
  id: number
  name: string
  type: 'cash' | 'bank' | 'card' | 'ewallet'
  is_archived?: boolean
  currency?: string | null
}

export type TransactionFormInitialValues = {
  type?: FormTransactionType
  category_id?: string
  vendor?: string
  vendor_id?: number | null
  wallet_id?: number | null
  transfer_wallet_id?: number | null
  amount?: string
  received_amount?: string
  date?: string
  note?: string
}

export type TransactionFormValues = {
  type: FormTransactionType
  category: string | null
  category_id: number | null
  vendor: string | null
  vendor_id: number | null
  wallet_id: number | null
  transfer_wallet_id: number | null
  amount: number
  // Exchange only: what arrived in the other wallet's currency.
  received_amount: number | null
  date: string
  note: string | null
}

type TransactionFormProps = {
  mode?: 'add' | 'edit'
  initialValues?: TransactionFormInitialValues
  submitLabel?: string
  showCancel?: boolean
  onCancel?: () => void
  onSubmit: (values: TransactionFormValues) => Promise<void> | void
}

function typeIdToLabel(typeId: number): TransactionType | null {
  if (typeId === 1) return 'Expense'
  if (typeId === 2) return 'Income'
  if (typeId === 3) return 'Investment'
  return null
}

function normalizeVendorName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Letters and digits only, so "AL-Andalus" and "Al Andalus" compare equal.
function vendorKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[b.length]
}

// Close enough to be the same vendor spelt differently ("Jaya Grocers" vs "Jaya Grocer").
function looksLikeSameVendor(typed: string, existing: string) {
  const a = vendorKey(typed)
  const b = vendorKey(existing)
  if (!a || !b) return false
  if (a === b) return true
  const allowed = Math.max(1, Math.floor(Math.min(a.length, b.length) / 5))
  return Math.abs(a.length - b.length) <= allowed && editDistance(a, b) <= allowed
}

function buildVendorUsage(rows: { vendor_id: number | null; category_id: number | null }[]): VendorUsage {
  const usage: VendorUsage = { byCategory: {}, total: {}, lastCategory: {} }
  // Rows arrive oldest first, so the last category seen is the most recent one.
  for (const row of rows) {
    if (!row.vendor_id) continue
    usage.total[row.vendor_id] = (usage.total[row.vendor_id] || 0) + 1
    if (!row.category_id) continue
    const key = `${row.vendor_id}:${row.category_id}`
    usage.byCategory[key] = (usage.byCategory[key] || 0) + 1
    usage.lastCategory[row.vendor_id] = row.category_id
  }
  return usage
}

function todayInputValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

// The categories, vendors and wallets lists are kept here once downloaded, so
// opening the form again does not wait on the database.
type Lookups = {
  categories: CategoryRow[]
  vendors: VendorRow[]
  wallets: WalletRow[]
  usage: VendorUsage
}

let lookupCache: Lookups | null = null
let lookupRequest: Promise<Lookups> | null = null

// Forget the kept lists, for example after signing out.
export function clearTransactionLookups() {
  lookupCache = null
}

// Downloads the lists, or reuses a download already in progress.
// refresh = false returns the kept lists without going to the database.
export function loadTransactionLookups(refresh = false): Promise<Lookups> {
  if (!refresh && lookupCache) return Promise.resolve(lookupCache)
  if (lookupRequest) return lookupRequest

  lookupRequest = Promise.all([
    supabase
      .from('categories')
      .select('id, name, type_id, is_archived, is_active')
      .order('type_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('vendors')
      .select('id, name, normalized_name, is_archived, category_id')
      .order('name', { ascending: true }),
    supabase
      .from('wallets')
      .select('id, name, type, is_archived, currency')
      .order('name', { ascending: true }),
    fetchAllRows<{ vendor_id: number | null; category_id: number | null }>(() =>
      supabase
        .from('transaction')
        .select('vendor_id, category_id')
        .not('vendor_id', 'is', null)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
    ),
  ])
    .then(([categoryRes, vendorRes, walletRes, usageRes]) => {
      // If one list fails, keep the last good copy of it.
      lookupCache = {
        categories: categoryRes.error ? lookupCache?.categories || [] : (categoryRes.data as CategoryRow[]) || [],
        vendors: vendorRes.error ? lookupCache?.vendors || [] : (vendorRes.data as VendorRow[]) || [],
        wallets: walletRes.error ? lookupCache?.wallets || [] : (walletRes.data as WalletRow[]) || [],
        usage: usageRes.error ? lookupCache?.usage || EMPTY_USAGE : buildVendorUsage(usageRes.data),
      }
      return lookupCache
    })
    .catch(() => lookupCache || { categories: [], vendors: [], wallets: [], usage: EMPTY_USAGE })
    .finally(() => {
      lookupRequest = null
    })

  return lookupRequest
}

export default function TransactionForm({
  mode = 'add',
  initialValues,
  submitLabel = 'Save Transaction',
  showCancel = false,
  onCancel,
  onSubmit,
}: TransactionFormProps) {
  // Start from the kept lists so the form is usable straight away.
  const [categories, setCategories] = useState<CategoryRow[]>(lookupCache?.categories || [])
  const [vendors, setVendors] = useState<VendorRow[]>(lookupCache?.vendors || [])
  const [wallets, setWallets] = useState<WalletRow[]>(lookupCache?.wallets || [])
  const [vendorUsage, setVendorUsage] = useState<VendorUsage>(lookupCache?.usage || EMPTY_USAGE)
  const [loading, setLoading] = useState(lookupCache === null)

  const [type, setType] = useState<FormTransactionType>(initialValues?.type || 'Expense')
  const [categoryId, setCategoryId] = useState(initialValues?.category_id || '')
  const [vendorInput, setVendorInput] = useState(initialValues?.vendor || '')
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(
    initialValues?.vendor_id ?? null
  )
  // Suggestions show only while the user is typing in the vendor box.
  const [showVendorSuggestions, setShowVendorSuggestions] = useState(false)
  const [showOtherVendors, setShowOtherVendors] = useState(false)
  // The typed name was confirmed with "+ Add as a new vendor".
  const [addNewVendor, setAddNewVendor] = useState(false)
  // Name of the vendor the category was filled in from, if any.
  const [categoryFilledFrom, setCategoryFilledFrom] = useState<string | null>(null)
  const vendorFieldRef = useRef<HTMLDivElement | null>(null)
  const [walletId, setWalletId] = useState<string>(
    initialValues?.wallet_id ? String(initialValues.wallet_id) : ''
  )
  const [transferWalletId, setTransferWalletId] = useState<string>(
    initialValues?.transfer_wallet_id ? String(initialValues.transfer_wallet_id) : ''
  )
  const [amount, setAmount] = useState(initialValues?.amount || '')
  const [receivedAmount, setReceivedAmount] = useState(initialValues?.received_amount || '')
  const [date, setDate] = useState(initialValues?.date || todayInputValue())
  const [note, setNote] = useState(initialValues?.note || '')

  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const today = todayInputValue()

  // Refresh the lists in the background each time the form opens, so a new
  // category, vendor or wallet added elsewhere still shows up.
  useEffect(() => {
    let active = true
    loadTransactionLookups(true).then((lookups) => {
      if (!active) return
      setCategories(lookups.categories)
      setVendors(lookups.vendors)
      setWallets(lookups.wallets)
      setVendorUsage(lookups.usage)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (mode === 'edit') return

    if (type === 'Transfer' || type === 'Exchange') {
      setCategoryId('')
      setSelectedVendorId(null)
      setVendorInput('')
      return
    }

    const typeCategories = categories.filter((category) => {
      if (category.is_archived === true) return false
      if (category.is_active === false) return false
      return typeIdToLabel(category.type_id) === type
    })

    if (categoryId) {
      const currentExists = typeCategories.some((category) => String(category.id) === categoryId)
      if (!currentExists) setCategoryId('')
    }
  }, [type, categories, categoryId, mode])

  useEffect(() => {
    setType(initialValues?.type || 'Expense')
    setCategoryId(initialValues?.category_id || '')
    setVendorInput(initialValues?.vendor || '')
    setSelectedVendorId(initialValues?.vendor_id ?? null)
    setShowVendorSuggestions(false)
    setWalletId(initialValues?.wallet_id ? String(initialValues.wallet_id) : '')
    setTransferWalletId(initialValues?.transfer_wallet_id ? String(initialValues.transfer_wallet_id) : '')
    setAmount(initialValues?.amount || '')
    setReceivedAmount(initialValues?.received_amount || '')
    setDate(initialValues?.date || todayInputValue())
    setNote(initialValues?.note || '')
  }, [initialValues])

  const activeWallets = useMemo(() => {
    return wallets.filter((wallet) => wallet.is_archived !== true)
  }, [wallets])

  const categoryOptions = useMemo(() => {
    if (type === 'Transfer' || type === 'Exchange') return []

    return categories.filter((category) => {
      if (category.is_archived === true) return false
      if (category.is_active === false) return false
      return typeIdToLabel(category.type_id) === type
    })
  }, [categories, type])

  // Close the vendor suggestions on a tap or click anywhere outside the vendor field.
  useEffect(() => {
    if (!showVendorSuggestions) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (vendorFieldRef.current?.contains(target)) return
      setShowVendorSuggestions(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [showVendorSuggestions])

  // The vendor list: the chosen category's vendors first (most used first),
  // then every other vendor. Typing searches all of them.
  const vendorLists = useMemo(() => {
    const active = vendors.filter((vendor) => vendor.is_archived !== true)
    const usedIn = (vendor: VendorRow) =>
      categoryId ? vendorUsage.byCategory[`${vendor.id}:${categoryId}`] || 0 : 0
    const totalUses = (vendor: VendorRow) => vendorUsage.total[vendor.id] || 0
    const byUse = (a: VendorRow, b: VendorRow) => totalUses(b) - totalUses(a) || a.name.localeCompare(b.name)

    const inCategory = categoryId
      ? active
          .filter((vendor) => usedIn(vendor) > 0 || String(vendor.category_id ?? '') === categoryId)
          .sort((a, b) => usedIn(b) - usedIn(a) || a.name.localeCompare(b.name))
      : []
    const inCategoryIds = new Set(inCategory.map((vendor) => vendor.id))
    const others = active.filter((vendor) => !inCategoryIds.has(vendor.id)).sort(byUse)

    const query = normalizeVendorName(vendorInput)
    const exact = query
      ? active.find((vendor) => (vendor.normalized_name || normalizeVendorName(vendor.name)) === query)
      : undefined
    const matches = query
      ? [...inCategory, ...others]
          .filter((vendor) => vendor.name.toLowerCase().includes(query))
          .slice(0, 8)
      : []
    const lookAlikes =
      query && !exact
        ? active
            .filter((vendor) => !matches.includes(vendor) && looksLikeSameVendor(query, vendor.name))
            .sort(byUse)
            .slice(0, 2)
        : []

    return { inCategory, inCategoryIds, others, query, exact, matches, lookAlikes, usedIn }
  }, [vendors, vendorUsage, categoryId, vendorInput])

  const categoryNameById = useMemo(() => {
    const names: Record<string, string> = {}
    categories.forEach((category) => {
      names[String(category.id)] = category.name
    })
    return names
  }, [categories])

  function pickVendor(vendor: VendorRow) {
    setVendorInput(vendor.name)
    setSelectedVendorId(vendor.id)
    setAddNewVendor(false)
    setShowVendorSuggestions(false)
    setShowOtherVendors(false)

    // Vendor picked first: fill in the category from the last entry with this
    // vendor, or its home category, when it fits the chosen type.
    if (!categoryId) {
      const fits = (id?: number | null) =>
        !!id && categoryOptions.some((category) => category.id === id)
      const last = vendorUsage.lastCategory[vendor.id]
      const fill = fits(last) ? last : fits(vendor.category_id) ? vendor.category_id : null
      if (fill) {
        setCategoryId(String(fill))
        setCategoryFilledFrom(vendor.name)
      }
    }
  }

  // "Wallet transfer" moves money between two of your wallets: no category or vendor.
  // You never pick Transfer or Exchange: if the two wallets use different
  // currencies it is saved as an Exchange (with the amount received), otherwise
  // as a normal Transfer.
  const isTransfer = type === 'Transfer' || type === 'Exchange'
  const isEditMode = mode === 'edit'

  // The currency comes from the wallet. The group being viewed elsewhere is listed first.
  const viewCurrency = useViewCurrency(currenciesInUse(wallets))
  const selectedWallet = wallets.find((wallet) => String(wallet.id) === walletId)
  const selectedCurrency = selectedWallet ? currencyInfo(walletCurrency(selectedWallet)) : null

  const transferTargets = activeWallets.filter((wallet) => String(wallet.id) !== walletId)
  const targetWallet = wallets.find((wallet) => String(wallet.id) === transferWalletId)
  const targetCurrency = targetWallet ? currencyInfo(walletCurrency(targetWallet)) : null
  const isExchange =
    isTransfer &&
    !!selectedWallet &&
    !!targetWallet &&
    walletCurrency(selectedWallet) !== walletCurrency(targetWallet)

  // The rate is worked out from the two amounts, never typed.
  const sentValue = Number(amount)
  const receivedValue = Number(receivedAmount)
  const exchangeRate =
    isExchange && selectedCurrency && targetCurrency && sentValue > 0 && receivedValue > 0
      ? receivedValue / sentValue
      : null

  function changeWallet(nextId: string) {
    setWalletId(nextId)
    if (nextId === transferWalletId) setTransferWalletId('')
  }

  function changeType(next: FormTransactionType) {
    setType(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Amount must be greater than 0.')
      return
    }

    if (!date) {
      setErrorMessage('Date is required.')
      return
    }

    if (date > today) {
      setErrorMessage('Future dates are not allowed.')
      return
    }

    if (!walletId) {
      setErrorMessage('Wallet is required.')
      return
    }

    let parsedReceived: number | null = null

    if (isTransfer) {
      if (!transferWalletId) {
        setErrorMessage('Choose the wallet the money went to.')
        return
      }

      if (walletId === transferWalletId) {
        setErrorMessage('Source and destination wallet cannot be the same.')
        return
      }

      if (isExchange) {
        parsedReceived = Number(receivedAmount)
        if (!Number.isFinite(parsedReceived) || parsedReceived <= 0) {
          setErrorMessage('Amount received must be greater than 0.')
          return
        }
      }
    } else {
      if (!categoryId) {
        setErrorMessage('Category is required.')
        return
      }
    }

    const trimmedVendor = vendorInput.trim()
    const trimmedNote = note.trim()

    let vendorIdToUse: number | null = trimmedVendor ? selectedVendorId : null
    let vendorTextToUse: string | null = trimmedVendor || null
    let createVendor = false

    if (!isTransfer && trimmedVendor) {
      const normalized = normalizeVendorName(trimmedVendor)
      const existingVendor = vendors.find(
        (vendor) =>
          vendor.is_archived !== true &&
          (vendor.normalized_name || normalizeVendorName(vendor.name)) === normalized
      )

      if (existingVendor) {
        vendorIdToUse = existingVendor.id
        vendorTextToUse = existingVendor.name
      } else if (addNewVendor) {
        createVendor = true
      } else {
        // Every entry's vendor is on the Vendors page; a new name is added on purpose.
        setErrorMessage(`Pick a vendor from the list, or tap "+ Add" to save "${trimmedVendor}" as a new vendor.`)
        setShowVendorSuggestions(true)
        return
      }
    }

    const selectedCategory =
      !isTransfer && categoryId
        ? categories.find((category) => String(category.id) === categoryId)
        : null

    const payload: TransactionFormValues = {
      type: isTransfer ? (isExchange ? 'Exchange' : 'Transfer') : type,
      category: isTransfer ? null : selectedCategory?.name || null,
      category_id: isTransfer ? null : Number(categoryId),
      vendor: isTransfer ? null : vendorTextToUse,
      vendor_id: isTransfer ? null : vendorIdToUse,
      wallet_id: Number(walletId),
      transfer_wallet_id: isTransfer ? Number(transferWalletId) : null,
      amount: parsedAmount,
      received_amount: isExchange ? parsedReceived : null,
      date,
      note: trimmedNote || null,
    }

    try {
      setSaving(true)

      if (createVendor && vendorTextToUse) {
        const normalized = normalizeVendorName(vendorTextToUse)
        const { data: created, error: createError } = await supabase
          .from('vendors')
          .insert([{ name: vendorTextToUse, normalized_name: normalized, category_id: Number(categoryId) }])
          .select('id, name, normalized_name, is_archived, category_id')
          .single()

        let vendorRow = created as VendorRow | null
        if (createError) {
          // Already added (for example from another device): use that one.
          const { data: found } = await supabase
            .from('vendors')
            .select('id, name, normalized_name, is_archived, category_id')
            .eq('normalized_name', normalized)
            .limit(1)
            .maybeSingle()
          if (!found) throw new Error(`Could not add vendor: ${createError.message}`)
          vendorRow = found as VendorRow
        }

        if (vendorRow) {
          payload.vendor_id = vendorRow.id
          payload.vendor = vendorRow.name
          const added = vendorRow
          setVendors((current) => (current.some((v) => v.id === added.id) ? current : [...current, added]))
          setSelectedVendorId(added.id)
          setAddNewVendor(false)
          if (lookupCache && !lookupCache.vendors.some((v) => v.id === added.id)) {
            lookupCache = { ...lookupCache, vendors: [...lookupCache.vendors, added] }
          }
        }
      }

      await onSubmit(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save transaction.'
      setErrorMessage(message)
    } finally {
      setSaving(false)
    }
  }

  const formGrid: CSSProperties = {
    display: 'grid',
    gap: '14px',
  }

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 700,
    color: '#374151',
    marginBottom: '6px',
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

  const textAreaStyle: CSSProperties = {
    width: '100%',
    minHeight: '92px',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  }

  const rowTwo: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  }

  const rowThree: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  }

  return (
    <form onSubmit={handleSubmit} style={formGrid}>
      <style>{`
        .transaction-form-vendor-suggestions {
          margin-top: 6px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          max-height: 300px;
          overflow-y: auto;
          background: #fff;
        }

        .transaction-form-vendor-heading {
          padding: 8px 12px 4px;
          background: #f8fafc;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .transaction-form-vendor-empty {
          padding: 10px 12px;
          color: #64748b;
          font-size: 13px;
        }

        .transaction-form-vendor-meta {
          color: #94a3b8;
          font-size: 12px;
          white-space: nowrap;
        }

        .transaction-form-vendor-item.is-add {
          color: #2563eb;
          font-weight: 700;
        }

        .transaction-form-vendor-item.is-lookalike {
          background: #fffbeb;
          color: #92400e;
          font-weight: 600;
        }

        .transaction-form-vendor-item.is-more {
          color: #475569;
          font-weight: 700;
        }

        .transaction-form-vendor-new {
          margin-top: 6px;
          color: #2563eb;
          font-size: 12px;
          font-weight: 600;
        }

        .transaction-form-filled-tag {
          margin-left: 8px;
          padding: 1px 6px;
          border-radius: 6px;
          background: #f0fdfa;
          color: #0f766e;
          font-size: 11px;
          font-weight: 700;
        }

        .transaction-form-vendor-item {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          border: none;
          border-top: 1px solid #f1f5f9;
          background: #fff;
          text-align: left;
          cursor: pointer;
          font-size: 14px;
        }

        .transaction-form-vendor-item:first-child {
          border-top: none;
        }

        .transaction-form-vendor-item:hover {
          background: #f8fafc;
        }

        @media (max-width: 640px) {
          .transaction-form-row-two,
          .transaction-form-row-three {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {errorMessage && (
        <div style={{ color: '#b91c1c', fontSize: '14px', fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: '14px' }}>Loading form options...</div>
      ) : (
        <>
          {!isEditMode && (
            <div>
              <label style={labelStyle}>Transaction Type</label>
              <select
                value={type === 'Exchange' ? 'Transfer' : type}
                onChange={(e) => changeType(e.target.value as FormTransactionType)}
                style={inputStyle}
              >
                <option value="Expense">Expense</option>
                <option value="Income">Income</option>
                <option value="Investment">Investment</option>
                <option value="Transfer">Wallet transfer</option>
              </select>
            </div>
          )}

          {!isTransfer ? (
            <div className="transaction-form-row-two" style={rowTwo}>
              <div>
                <label style={labelStyle}>
                  Category
                  {categoryFilledFrom && (
                    <span className="transaction-form-filled-tag">from {categoryFilledFrom}</span>
                  )}
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value)
                    setCategoryFilledFrom(null)
                  }}
                  style={inputStyle}
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={String(category.id)}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div
                ref={vendorFieldRef}
                onBlur={(e) => {
                  // Focus moved to another field (for example with Tab or the phone's Next key).
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setShowVendorSuggestions(false)
                  }
                }}
              >
                <label style={labelStyle}>Vendor</label>
                <input
                  type="text"
                  value={vendorInput}
                  onChange={(e) => {
                    setVendorInput(e.target.value)
                    setSelectedVendorId(null)
                    setAddNewVendor(false)
                    setShowVendorSuggestions(true)
                  }}
                  onFocus={() => setShowVendorSuggestions(true)}
                  onClick={() => setShowVendorSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowVendorSuggestions(false)
                  }}
                  placeholder="Search or pick a vendor"
                  aria-label="Vendor"
                  autoComplete="off"
                  style={inputStyle}
                />

                {addNewVendor && !showVendorSuggestions && (
                  <div className="transaction-form-vendor-new">
                    New vendor. It will be added to your Vendors page when you save.
                  </div>
                )}

                {showVendorSuggestions && (
                  <div className="transaction-form-vendor-suggestions" role="listbox" aria-label="Vendors">
                    {vendorLists.query ? (
                      <>
                        {vendorLists.lookAlikes.map((vendor) => (
                          <button
                            key={`like-${vendor.id}`}
                            type="button"
                            className="transaction-form-vendor-item is-lookalike"
                            onClick={() => pickVendor(vendor)}
                          >
                            Did you mean {vendor.name}?
                          </button>
                        ))}
                        {vendorLists.matches.map((vendor) => (
                          <button
                            key={vendor.id}
                            type="button"
                            className="transaction-form-vendor-item"
                            onClick={() => pickVendor(vendor)}
                          >
                            <span>{vendor.name}</span>
                            <span className="transaction-form-vendor-meta">
                              {vendor.category_id ? categoryNameById[String(vendor.category_id)] || '' : ''}
                            </span>
                          </button>
                        ))}
                        {!vendorLists.exact && (
                          <button
                            type="button"
                            className="transaction-form-vendor-item is-add"
                            onClick={() => {
                              setVendorInput(vendorInput.trim().replace(/\s+/g, ' '))
                              setAddNewVendor(true)
                              setSelectedVendorId(null)
                              setShowVendorSuggestions(false)
                            }}
                          >
                            + Add &ldquo;{vendorInput.trim()}&rdquo; as a new vendor
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {categoryId && (
                          <>
                            <div className="transaction-form-vendor-heading">
                              {categoryNameById[categoryId] || 'This category'}
                            </div>
                            {vendorLists.inCategory.length === 0 && (
                              <div className="transaction-form-vendor-empty">
                                No vendors here yet. Type a name to add one.
                              </div>
                            )}
                            {vendorLists.inCategory.map((vendor) => (
                              <button
                                key={vendor.id}
                                type="button"
                                className="transaction-form-vendor-item"
                                onClick={() => pickVendor(vendor)}
                              >
                                <span>{vendor.name}</span>
                                <span className="transaction-form-vendor-meta">
                                  {vendorLists.usedIn(vendor) || ''}
                                </span>
                              </button>
                            ))}
                          </>
                        )}
                        {categoryId && !showOtherVendors ? (
                          vendorLists.others.length > 0 && (
                            <button
                              type="button"
                              className="transaction-form-vendor-item is-more"
                              onClick={() => setShowOtherVendors(true)}
                            >
                              Other vendors ({vendorLists.others.length}) ▸
                            </button>
                          )
                        ) : (
                          <>
                            {vendorLists.others.length > 0 && (
                              <div className="transaction-form-vendor-heading">
                                {categoryId ? 'Other vendors' : 'Vendors'}
                              </div>
                            )}
                            {vendorLists.others.map((vendor) => (
                              <button
                                key={vendor.id}
                                type="button"
                                className="transaction-form-vendor-item"
                                onClick={() => pickVendor(vendor)}
                              >
                                <span>{vendor.name}</span>
                                <span className="transaction-form-vendor-meta">
                                  {vendor.category_id ? categoryNameById[String(vendor.category_id)] || '' : ''}
                                </span>
                              </button>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="transaction-form-row-two" style={rowTwo}>
              <div>
                <label style={labelStyle}>From Wallet</label>
                <WalletPicker
                  wallets={activeWallets}
                  value={walletId}
                  onChange={changeWallet}
                  placeholder="Select source wallet"
                  sheetTitle="Transfer from"
                  firstCurrency={viewCurrency}
                  inputStyle={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>To Wallet</label>
                <WalletPicker
                  wallets={transferTargets}
                  value={transferWalletId}
                  onChange={setTransferWalletId}
                  placeholder="Select destination wallet"
                  sheetTitle="Transfer to"
                  firstCurrency={viewCurrency}
                  inputStyle={inputStyle}
                />
              </div>
            </div>
          )}

          {!isTransfer && (
            <div>
              <label style={labelStyle}>Wallet</label>
              <WalletPicker
                wallets={activeWallets}
                value={walletId}
                onChange={changeWallet}
                placeholder="Select wallet"
                sheetTitle="Choose wallet"
                firstCurrency={viewCurrency}
                inputStyle={inputStyle}
              />
            </div>
          )}

          {isExchange && selectedCurrency && targetCurrency && (
            <div
              className="transaction-form-exchange-hint"
              style={{
                background: '#f0fdfa',
                color: '#115e59',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              Different currencies ({selectedCurrency.symbol} to {targetCurrency.symbol}), so add what arrived.
            </div>
          )}

          <div className="transaction-form-row-three" style={rowThree}>
            <div>
              <label style={labelStyle}>{isExchange ? 'Amount sent' : 'Amount'}</label>
              <div style={{ position: 'relative' }}>
                {selectedCurrency && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontWeight: 800,
                      fontSize: '14px',
                      color: '#2563eb',
                      pointerEvents: 'none',
                    }}
                  >
                    {selectedCurrency.symbol}
                  </span>
                )}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  aria-label={selectedCurrency ? `Amount in ${selectedCurrency.name}` : 'Amount'}
                  style={{
                    ...inputStyle,
                    paddingLeft: selectedCurrency ? `${20 + selectedCurrency.symbol.length * 9}px` : '12px',
                  }}
                />
              </div>
            </div>

            {isExchange ? (
              <div>
                <label style={labelStyle}>Amount received</label>
                <div style={{ position: 'relative' }}>
                  {targetCurrency && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontWeight: 800,
                        fontSize: '14px',
                        color: '#2563eb',
                        pointerEvents: 'none',
                      }}
                    >
                      {targetCurrency.symbol}
                    </span>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    value={receivedAmount}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                    placeholder="0.00"
                    aria-label={targetCurrency ? `Amount received in ${targetCurrency.name}` : 'Amount received'}
                    style={{
                      ...inputStyle,
                      paddingLeft: targetCurrency ? `${20 + targetCurrency.symbol.length * 9}px` : '12px',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={date}
                  max={today}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {isExchange && exchangeRate !== null && selectedCurrency && targetCurrency && (
            <div
              className="transaction-form-rate"
              style={{
                background: '#f0fdfa',
                border: '1px solid #99f6e4',
                color: '#115e59',
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              Rate: 1 {selectedCurrency.symbol} = {targetCurrency.symbol}{' '}
              {exchangeRate.toLocaleString('en-MY', { maximumFractionDigits: 4 })}
            </div>
          )}

          {isExchange && (
            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              style={textAreaStyle}
            />
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            {showCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  height: '44px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#111827',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                height: '44px',
                padding: '0 16px',
                borderRadius: '10px',
                border: '1px solid #0f172a',
                background: '#0f172a',
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                fontWeight: 700,
                fontSize: '14px',
              }}
            >
              {saving ? 'Saving...' : submitLabel}
            </button>
          </div>
        </>
      )}
    </form>
  )
}