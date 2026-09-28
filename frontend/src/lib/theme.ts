// Light/dark mode. No stored choice = follow the operating system (prefers-color-scheme). The toggle writes an
// explicit data-theme on <html>, which the CSS tokens in index.css honour in both directions.

import { readJson, writeJson } from './storage'

export type Theme = 'light' | 'dark'
const KEY = 'shopflow.theme'

export function storedTheme(storage?: Storage): Theme | null {
  const value = readJson<unknown>(KEY, null, storage)
  return value === 'light' || value === 'dark' ? value : null
}

export function saveTheme(theme: Theme, storage?: Storage): void {
  writeJson(KEY, theme, storage)
}

export function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme
}

export function currentTheme(): Theme {
  const explicit = document.documentElement.dataset.theme
  if (explicit === 'light' || explicit === 'dark') return explicit
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
