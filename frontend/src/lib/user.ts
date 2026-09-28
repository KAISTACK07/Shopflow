/** Avatar initials from an email: "asha.rao@x.com" -> "AR", "asha@x.com" -> "AS", "shop-3be1@x.com" -> "SH". */
export function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local.split(/[._-]+/).filter((part) => /^[a-z]/i.test(part)) // skip parts like "3be1"
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? local).slice(0, 2)
  return letters.toUpperCase() || '?'
}

/**
 * Where to go after login: only a path inside this site. "//evil.example" also starts with "/", but browsers treat it
 * as another site (protocol-relative URL), and "/\evil.example" can be normalised the same way, so both are refused.
 */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}
