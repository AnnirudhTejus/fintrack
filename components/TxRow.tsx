// One compact row for an entry, used on the Dashboard, Transactions and each
// wallet's page so they all look the same:
//
//   ● Jaya Grocer                         RM 51.00  ⋯
//     Grocery · Credit Card · weekly shop
//
// Styles live in app/globals.css (classes starting with "txr").

import type { ReactNode } from 'react'

type RowTextInput = {
  type: string
  vendor?: string | null
  category?: string | null
  // Shown on Dashboard and Transactions; left out on a wallet's own page.
  walletName?: string | null
  // Transfers: the two wallets.
  fromName?: string | null
  toName?: string | null
  // A wallet's own page: whether the transfer came in or went out.
  flow?: 'in' | 'out' | null
  note?: string | null
  // Dashboard: a short date, because its list is not grouped by day.
  dateLabel?: string | null
}

// Title: the vendor, or the category when there is no vendor, or "Maybank → ICICI"
// for a transfer. The grey line underneath holds everything else.
export function txRowText(input: RowTextInput): { title: string; subtitle: string } {
  const parts: string[] = []
  let title: string

  if (input.type === 'Transfer' || input.type === 'Exchange') {
    title = `${input.fromName || 'No wallet'} → ${input.toName || 'No wallet'}`
    parts.push(input.flow === 'in' ? 'Transfer in' : input.flow === 'out' ? 'Transfer out' : 'Transfer')
  } else if (input.vendor) {
    title = input.vendor
    parts.push(input.category || input.type)
    if (input.walletName) parts.push(input.walletName)
  } else {
    title = input.category || 'Uncategorized'
    parts.push(input.type)
    if (input.walletName) parts.push(input.walletName)
  }

  if (input.dateLabel) parts.push(input.dateLabel)
  if (input.note) parts.push(input.note)

  return { title, subtitle: parts.join(' · ') }
}

type TxRowProps = {
  title: string
  subtitle?: string
  dotColor: string
  amount: string
  amountColor: string
  // Exchange: the other side, e.g. "received ₹ 18,450.00".
  amountNote?: string
  menu?: ReactNode
  className?: string
}

export default function TxRow({
  title,
  subtitle,
  dotColor,
  amount,
  amountColor,
  amountNote,
  menu,
  className,
}: TxRowProps) {
  return (
    <div className={`txr${menu ? ' has-menu' : ''}${className ? ` ${className}` : ''}`}>
      <span className="txr-dot" style={{ background: dotColor }} aria-hidden="true" />
      <div className="txr-text">
        <div className="txr-title">{title}</div>
        {subtitle && <div className="txr-sub">{subtitle}</div>}
      </div>
      <div className="txr-amount" style={{ color: amountColor }}>
        {amount}
        {amountNote && <small>{amountNote}</small>}
      </div>
      {menu && <div className="txr-menu">{menu}</div>}
    </div>
  )
}

type DayHeaderProps = {
  label: string
  parts: Array<{ text: string; color: string }>
}

// "06 OCT 2026 ............ RM 63.50 spent · RM 1,000 transfer" on one line.
export function TxDayHeader({ label, parts }: DayHeaderProps) {
  return (
    <div className="txr-day">
      <span className="txr-day-label">{label}</span>
      <span className="txr-day-totals">
        {parts.map((part, index) => (
          <span key={index} style={{ color: part.color }}>
            {index > 0 && <span style={{ color: '#94a3b8' }}> · </span>}
            {part.text}
          </span>
        ))}
      </span>
    </div>
  )
}
