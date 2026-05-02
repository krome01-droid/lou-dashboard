import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Strip leading WordPress HTML error divs and trailing HTML comments so JSON.parse
// doesn't fail on responses like "{...} <!-- aem-mu-shutdown-test -->".
export function extractJson(raw: string): string {
  const start = raw.indexOf("{")
  const startArr = raw.indexOf("[")
  const jsonStart =
    start === -1
      ? startArr
      : startArr === -1
        ? start
        : Math.min(start, startArr)
  if (jsonStart < 0) return raw

  const slice = raw.slice(jsonStart)
  const closing = slice[0] === "[" ? "]" : "}"
  const jsonEnd = slice.lastIndexOf(closing)
  if (jsonEnd < 0) return slice
  return slice.slice(0, jsonEnd + 1)
}
