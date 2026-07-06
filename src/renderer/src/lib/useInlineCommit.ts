import React, { useEffect, useRef, useState } from 'react'

/**
 * State for a table cell edited in place (spend-so-far, earn %, partial use):
 * holds the input value while focused, re-syncs from the row when not (drawer
 * edits, refetches), and commits on blur — Enter just blurs. The commit
 * callback owns parsing and the no-op comparison against the row.
 */
export function useInlineCommit<V>(
  source: V,
  commit: (value: V) => void
): {
  value: V
  setValue: React.Dispatch<React.SetStateAction<V>>
  focusProps: {
    onFocus: () => void
    onBlur: () => void
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  }
} {
  const [value, setValue] = useState<V>(source)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setValue(source)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  return {
    value,
    setValue,
    focusProps: {
      onFocus: () => {
        focused.current = true
      },
      onBlur: () => {
        focused.current = false
        commit(value)
      },
      onKeyDown: (e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }
    }
  }
}
