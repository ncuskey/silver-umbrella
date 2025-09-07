import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CBM Writing & Spelling Tool',
  description: 'Curriculum-Based Measurement tool for writing and spelling assessment',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                var params = new URLSearchParams(location.search);
                if (params.get('debug') === '1') {
                  try { localStorage.setItem('cbm_debug','1'); } catch(e){}
                  window.__CBM_DEBUG__ = true;
                  console.log('[CBM] debug enabled via ?debug=1');
                } else if (localStorage.getItem('cbm_debug') === '1') {
                  window.__CBM_DEBUG__ = true;
                }
              })();
            `
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
