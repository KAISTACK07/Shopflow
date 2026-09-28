// Small inline SVG icons (24px grid, stroke = currentColor). Decorative by default: pair each with visible text or
// an aria-label on the control that contains it.

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  )
}

export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>
export const MoonIcon = (p: IconProps) => <Icon {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></Icon>
export const SunIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill={filled ? 'currentColor' : 'none'} /></Icon>
)
export const BagIcon = (p: IconProps) => <Icon {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></Icon>
export const CartIcon = (p: IconProps) => <Icon {...p}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6" /></Icon>
export const ChevronRight = (p: IconProps) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>
export const ChevronLeft = (p: IconProps) => <Icon {...p}><path d="m15 6-6 6 6 6" /></Icon>
export const ArrowRight = (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
export const CloseIcon = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>
export const FilterIcon = (p: IconProps) => <Icon {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Icon>
export const GridIcon = (p: IconProps) => <Icon {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Icon>
export const ListIcon = (p: IconProps) => <Icon {...p}><rect x="4" y="5" width="5" height="5" rx="1" /><rect x="4" y="14" width="5" height="5" rx="1" /><path d="M12 7.5h8M12 16.5h8" /></Icon>
export const StarIcon = ({ filled = true, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} strokeWidth={1.5}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" fill={filled ? 'currentColor' : 'none'} /></Icon>
)
export const TruckIcon = (p: IconProps) => <Icon {...p}><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></Icon>
export const ReturnIcon = (p: IconProps) => <Icon {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" /></Icon>
export const HandIcon = (p: IconProps) => <Icon {...p}><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 5 14.8l-1.4-3.3a1.5 1.5 0 0 1 2.7-1.3L8 13" /></Icon>
export const FlameIcon = (p: IconProps) => <Icon {...p}><path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-1.5 2-2 3.5-2 5-1-1-1.5-2-1.5-3C7 9 6 12 6 15a6 6 0 0 0 6 6Z" /></Icon>
export const TrashIcon = (p: IconProps) => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>
export const PlayIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m10 8.5 5 3.5-5 3.5Z" fill="currentColor" /></Icon>
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
export const SparkIcon = (p: IconProps) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></Icon>

// Category icons for the filter rail and quick-nav cards.
export const TeeIcon = (p: IconProps) => <Icon {...p}><path d="M8 4 4 6.5 5.5 10 8 9v11h8V9l2.5 1L20 6.5 16 4a4 4 0 0 1-8 0Z" /></Icon>
export const SockIcon = (p: IconProps) => <Icon {...p}><path d="M9 3h6v9l3.5 3.5a2.5 2.5 0 0 1-3.5 3.5L9 13V3Z" /><path d="M9 6h6" /></Icon>
export const TagIcon = (p: IconProps) => <Icon {...p}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.3" /></Icon>
export const JacketIcon = (p: IconProps) => <Icon {...p}><path d="M9 3 5 5 3 11l2 1 1-3v12h12V9l1 3 2-1-2-6-4-2-3 4-3-4Z" /><path d="M12 7v14" /></Icon>
export const AllIcon = (p: IconProps) => <Icon {...p}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></Icon>
