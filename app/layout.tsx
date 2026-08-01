import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const SITE_URL = 'https://phumoonlight.github.io'
const DESCRIPTION =
  'Web developer building admin portals, internal tools, and design systems with Next.js, React, and TypeScript.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Phumoonlight — Web Developer',
  description: DESCRIPTION,
  openGraph: {
    title: 'Phumoonlight — Web Developer',
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'Phumoonlight',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
