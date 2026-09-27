import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { ApiError } from '../api/client'
import { ErrorNotice, fieldLabel, primaryButton, textInput } from '../components/ui'
import { asApiError } from '../lib/useApi'
import { useAuth } from '../state/contexts'

const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<ApiError | string>()
  const [submitting, setSubmitting] = useState(false)

  // Only follow relative "next" paths, so a crafted link can't send people to another site after login.
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/'

  function validate(): string | undefined {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter an email address like name@example.com.'
    if (mode === 'register' && password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for your password.`
    if (password.length > PASSWORD_MAX) return `Passwords can be at most ${PASSWORD_MAX} characters.`
    if (!password) return 'Enter your password.'
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const invalid = validate()
    setProblem(invalid)
    if (invalid) return
    setSubmitting(true)
    try {
      await (mode === 'login' ? login(email.trim(), password) : register(email.trim(), password))
      navigate(next, { replace: true })
    } catch (error) {
      const apiError = asApiError(error)
      setProblem(
        apiError.code === 'EMAIL_ALREADY_REGISTERED' ? 'An account with this email already exists. Log in instead.' : apiError,
      )
    } finally {
      setSubmitting(false)
    }
  }

  const title = mode === 'login' ? 'Log in' : 'Create an account'
  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-6 text-4xl">{title}</h1>
      <form onSubmit={submit} noValidate className="space-y-4 border border-rule bg-surface p-6">
        <ErrorNotice error={problem} />
        <div>
          <label htmlFor="email" className={fieldLabel}>
            Email
          </label>
          <input id="email" type="email" autoComplete="email" className={textInput} value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={fieldLabel}>
            Password
          </label>
          <input id="password" type="password" className={textInput} value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            aria-describedby={mode === 'register' ? 'password-hint' : undefined}
            onChange={(e) => setPassword(e.target.value)} />
          {mode === 'register' && (
            <p id="password-hint" className="mt-1 text-sm text-slate">
              At least {PASSWORD_MIN} characters.
            </p>
          )}
        </div>
        <button type="submit" className={`${primaryButton} w-full`} disabled={submitting}>
          {submitting ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : title}
        </button>
      </form>
      <p className="mt-4 text-sm">
        {mode === 'login' ? (
          <>New here? <Link to={`/register?next=${encodeURIComponent(next)}`} className="text-indigo underline">Create an account</Link></>
        ) : (
          <>Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`} className="text-indigo underline">Log in</Link></>
        )}
      </p>
    </section>
  )
}

export const LoginPage = () => <AuthForm mode="login" />
export const RegisterPage = () => <AuthForm mode="register" />
