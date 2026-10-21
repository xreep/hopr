import { useEffect } from 'react'

// Sets the browser tab title, e.g. "Analytics | Hopr". Falsy titles leave it unchanged.
export default function usePageTitle(title) {
  useEffect(() => {
    if (title) document.title = `${title} | Hopr`
  }, [title])
}
