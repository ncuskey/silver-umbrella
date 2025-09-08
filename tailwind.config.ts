import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],

  // ✅ Add this block
  safelist: [
    // emerald colors (for "ok" status)
    'bg-emerald-50','text-emerald-800','border-emerald-300','ring-emerald-300',
    // amber colors (for "maybe" status)
    'bg-amber-50','text-amber-800','border-amber-300','ring-amber-300',
    // rose colors (for "bad" status)
    'bg-rose-50','text-rose-800','border-rose-300','ring-rose-300',
    // ring and selection styles
    'ring-2','ring-offset-1','ring-offset-white',
    // additional colors for other components
    'bg-green-50','bg-green-100','text-green-800','ring-green-300','ring-green-400',
    'bg-amber-100','ring-amber-400',
    'bg-red-50','bg-red-100','text-red-800','ring-red-300','ring-red-400',
    // UI component colors
    'bg-slate-100','bg-slate-200','text-slate-500','text-slate-600','border-slate-200',
    'bg-blue-50','bg-blue-100','text-blue-700','text-blue-800','border-blue-200',
    'bg-red-200','border-red-300','text-red-600','text-red-800','hover:bg-red-200',
    'bg-emerald-200','border-emerald-300',
    'bg-amber-200','border-amber-300','text-amber-700',
    'hover:bg-blue-200',
    // neutral / selection helpers
    'ring-1','ring-offset-background',
    'border','border-dashed','border-transparent','border-amber-300','border-amber-400',
  ],

  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}
export default config
