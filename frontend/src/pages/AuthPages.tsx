import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { ApiError } from '../api/client'
import { CheckIcon, HandIcon, SparkIcon, TruckIcon } from '../components/icons'
import { ErrorNotice, fieldLabel, primaryButton, quietButton, textInput } from '../components/ui'
import { CATALOG } from '../lib/catalog'
import { PASSWORD_MAX, passwordAcceptable, passwordChecks } from '../lib/password'
import { asApiError } from '../lib/useApi'
import { safeNextPath } from '../lib/user'
import { useAuth } from '../state/contexts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function BrandPanel() {
  const pieces = ['JACKET-KANTHA', 'SCARF-BLOCK', 'TEE-INDIGO'].map((sku) => CATALOG[sku].imageUrl)
  const points = [
    { icon: HandIcon, text: 'Hand-dyed in small batches by independent makers' },
    { icon: SparkIcon, text: 'See exactly how many of each piece are left' },
    { icon: TruckIcon, text: 'Free shipping on orders over ₹999' },
  ]
  return (
    <div className="bg-holo relative hidden flex-col justify-between gap-10 overflow-hidden rounded-hero border border-rule p-10 lg:flex">
      <Link to="/" className="font-numeral text-4xl"><span className="text-ink">Shop</span><span className="text-indigo">Flow</span></Link>
      <div>
        <p className="text-4xl font-extrabold [font-stretch:78%]">Limited runs,<br />dyed by hand.</p>
        <ul className="mt-6 flex flex-col gap-3">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 font-semibold">
              <span className="grid size-9 place-items-center rounded-pill bg-surface text-indigo shadow-card"><Icon size={18} /></span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-3" aria-hidden="true">
        {pieces.map((src, i) => (
          <img key={src} src={src} alt="" className={`w-1/3 rounded-card border-4 border-surface object-cover shadow-lift ${i === 1 ? '-translate-y-4' : ''}`} />
        ))}
      </div>
    </div>
  )
}

/** Social sign-in isn't available (the backend is email + password only), so these are shown but disabled. */
function SocialButtons() {
  return (
    <>
      <div className="flex items-center gap-3 text-sm text-slate"><span className="h-px flex-1 bg-rule" />or continue with<span className="h-px flex-1 bg-rule" /></div>
      <div className="grid grid-cols-2 gap-3">
        {['Google', 'GitHub'].map((name) => (
          <button key={name} type="button" aria-disabled="true" title="Coming soon" className={`${quietButton} min-h-11 cursor-not-allowed opacity-60`}>
            {name}<span className="sr-only"> (coming soon)</span>
          </button>
        ))}
      </div>
    </>
  )
}

function AuthShell({ title, subtitle, children }: { title: ReactNode; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid gap-8 lg:min-h-[640px] lg:grid-cols-2">
      <BrandPanel />
      <section className="flex flex-col justify-center">
        <div className="mx-auto w-full max-w-md rounded-hero border border-rule bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-4xl">{title}</h1>
          <p className="mt-2 mb-6 text-slate">{subtitle}</p>
          {children}
        </div>
      </section>
    </div>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [problem, setProblem] = useState<ApiError | string>()
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const invalid = !EMAIL_PATTERN.test(email.trim()) ? 'Enter an email address like name@example.com.'
      : !password ? 'Enter your password.' : undefined
    setProblem(invalid)
    if (invalid) return
    setSubmitting(true)
    try {
      await login(email.trim(), password, remember) // login, then /auth/me
      navigate(next, { replace: true })
    } catch (error) {
      setProblem(asApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title={<>Welcome Back <span aria-hidden="true">👋</span></>} subtitle="Log in to see your cart, orders and saved pieces.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorNotice error={problem} />
        <div>
          <label htmlFor="email" className={fieldLabel}>Email</label>
          <input id="email" type="email" autoComplete="email" className={textInput} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={fieldLabel}>Password</label>
          <input id="password" type="password" autoComplete="current-password" maxLength={PASSWORD_MAX} className={textInput}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 font-semibold">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-indigo" />
            Keep me signed in
          </label>
          <button type="button" aria-disabled="true" title="Coming soon" className="cursor-not-allowed font-semibold text-slate/70">
            Forgot password?<span className="sr-only"> (coming soon)</span>
          </button>
        </div>
        <button type="submit" className={`${primaryButton} w-full text-base`} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in →'}
        </button>
        <SocialButtons />
        <p className="text-center text-sm">
          New here? <Link to={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-indigo underline">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<ApiError | string>()
  const [submitting, setSubmitting] = useState(false)
  const checks = passwordChecks(password)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const invalid = !EMAIL_PATTERN.test(email.trim()) ? 'Enter an email address like name@example.com.'
      : !passwordAcceptable(password) ? 'Use a password of 8 to 128 characters.' : undefined
    setProblem(invalid)
    if (invalid) return
    setSubmitting(true)
    try {
      await register(email.trim(), password) // register, then log in
      navigate(next, { replace: true })
    } catch (error) {
      const apiError = asApiError(error)
      setProblem(apiError.code === 'EMAIL_ALREADY_REGISTERED' ? 'An account with this email already exists. Log in instead.' : apiError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title={<>Create Your Account <span aria-hidden="true">✨</span></>} subtitle="Save pieces, check out faster and track your orders.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorNotice error={problem} />
        <div>
          <label htmlFor="email" className={fieldLabel}>Email</label>
          <input id="email" type="email" autoComplete="email" className={textInput} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={fieldLabel}>Password</label>
          <input id="password" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} className={textInput}
            value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="password-checks" />
          <ul id="password-checks" className="mt-3 flex flex-col gap-1.5 text-sm" aria-live="polite">
            {checks.map((check) => (
              <li key={check.label} className={`flex items-center gap-2 ${check.met ? 'text-ink' : 'text-slate'}`}>
                <span className={`grid size-5 place-items-center rounded-pill ${check.met ? 'bg-pill-active' : 'border border-rule'}`}>
                  {check.met && <CheckIcon size={13} />}
                </span>
                {check.label}{check.required ? '' : ' (recommended)'}
                <span className="sr-only">{check.met ? ': done' : ': not yet'}</span>
              </li>
            ))}
          </ul>
        </div>
        <button type="submit" className={`${primaryButton} w-full text-base`} disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account →'}
        </button>
        <SocialButtons />
        <p className="text-center text-sm">
          Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-indigo underline">Log in</Link>
        </p>
      </form>
    </AuthShell>
  )
}
