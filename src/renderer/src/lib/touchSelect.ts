/**
 * Props that make Mantine Selects reliable on touch devices when rendered
 * inside (often fullScreen) modals.
 *
 * - `searchable` focuses a text input on tap, which pops the on-screen
 *   keyboard and reflows the page mid-gesture — option taps then land on the
 *   wrong element and the dropdown closes without selecting. Search only
 *   earns its keep with a physical keyboard, so it's off on coarse pointers.
 * - `withinPortal: false` keeps the dropdown inside the modal's DOM, so the
 *   modal's focus trap and scroll lock never treat an option tap as an
 *   outside click.
 */
export const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export const MODAL_SELECT_PROPS = {
  searchable: !IS_COARSE_POINTER,
  comboboxProps: { withinPortal: false }
} as const
