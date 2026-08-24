/**
 * A deliberately tiny Markdown renderer for the legal pages.
 *
 * It handles headings, paragraphs, lists, links, bold and inline code, escapes
 * everything else, and never runs anything. Pulling a full Markdown library in
 * to render two static documents is not a trade worth making.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="font-mono text-[0.85em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
      '<a class="text-signal-600 underline dark:text-signal-400" href="$2">$1</a>',
    )
}

export function renderMarkdown(source: string): string {
  const out: string[] = []
  let list: string[] | null = null

  const flushList = () => {
    if (list) {
      out.push(`<ul class="ml-5 list-disc space-y-1">${list.join('')}</ul>`)
      list = null
    }
  }

  for (const raw of source.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushList()
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flushList()
      const level = heading[1].length
      const size = ['text-2xl', 'text-xl', 'text-lg', 'text-base'][level - 1]
      out.push(`<h${level} class="${size} font-semibold tracking-tight">${inline(heading[2])}</h${level}>`)
      continue
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      list = list ?? []
      list.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }
    flushList()
    out.push(`<p>${inline(line)}</p>`)
  }
  flushList()
  return out.join('')
}
