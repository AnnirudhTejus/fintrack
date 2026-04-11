import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FinTrack',
  description: 'Personal finance tracker',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#fff',
          color: '#111827',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            minHeight: '100vh',
            overflowX: 'hidden',
          }}
        >
          {children}
        </div>
      </body>
    </html>
  )
}