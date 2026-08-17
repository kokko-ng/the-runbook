/**
 * Authored prose is plain text with three shapes, and each needs different
 * rendering:
 *
 *   paragraph  hard-wrapped sentences; the wrapping is incidental and must be
 *              re-flowed to the reader's width
 *   list       requirement bullets, which carry the constraints an AZ-305 design
 *              question is answered from - collapsing them loses the question
 *   code       Bicep, ARM, or CLI, where indentation and line breaks are the
 *              content
 *
 * Classification leans on one reliable signal: after YAML strips the block
 * scalar's common indent, ordinary prose never has leading whitespace. So a
 * block with bullets is a list, a block with indented or syntax-heavy lines is
 * code, and everything else is a paragraph.
 */

export type ProseBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'code'; text: string }

const BULLET = /^\s*[-*]\s+/

/** Code-ish without being indented: a short CLI or expression block. */
const CODE_TOKEN = /(^|\s)(param|var|resource|output|targetScope|az|kubectl|SELECT|FROM|WHERE)\s|[{}[\]]|=>|::/

/**
 * A line that declares something, with no terminal punctuation. Prose does not
 * start with these words followed by an identifier, so this is safe on its own.
 */
const DECLARATION = /^(param|var|resource|output|targetScope|module|az|kubectl)\s+\S.*[^.?!]$/

function isBullet(line: string): boolean {
  return BULLET.test(line)
}

function classify(lines: string[]): ProseBlock['kind'] {
  const nonEmpty = lines.filter((line) => line.trim().length > 0)
  if (nonEmpty.length === 0) return 'paragraph'

  if (nonEmpty.some(isBullet)) return 'list'

  // Ordinary prose is flush left once YAML has dedented it.
  if (nonEmpty.some((line) => /^\s+\S/.test(line))) return 'code'

  // A single flush-left declaration is still code: Bicep files are authored
  // with blank lines between their param, var, and output sections.
  if (nonEmpty.every((line) => DECLARATION.test(line.trim()))) return 'code'

  // Unindented code: several lines, most of them carrying syntax rather than
  // sentences.
  if (nonEmpty.length >= 2) {
    const syntactic = nonEmpty.filter(
      (line) => CODE_TOKEN.test(line) && !/[.?!]\s*$/.test(line.trim()),
    )
    if (syntactic.length / nonEmpty.length > 0.6) return 'code'
  }

  return 'paragraph'
}

/** Bullets may wrap onto indented continuation lines; rejoin them. */
function toItems(lines: string[]): string[] {
  const items: string[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    if (isBullet(line)) {
      items.push(line.replace(BULLET, '').trim())
    } else if (items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`
    } else {
      items.push(line.trim())
    }
  }
  return items
}

export function parseProse(source: string): ProseBlock[] {
  const blocks: ProseBlock[] = []

  for (const raw of source.split(/\n\s*\n/)) {
    const lines = raw.replace(/\s+$/, '').split('\n')
    if (lines.every((line) => !line.trim())) continue

    switch (classify(lines)) {
      case 'list':
        blocks.push({ kind: 'list', items: toItems(lines) })
        break
      case 'code':
        // Drop any common indent so the snippet sits flush in its pane.
        blocks.push({ kind: 'code', text: dedent(lines) })
        break
      default:
        // The author's line wrapping is not meaningful; the reader's width is.
        blocks.push({ kind: 'paragraph', text: lines.map((l) => l.trim()).join(' ').trim() })
    }
  }

  return mergeAdjacentCode(blocks)
}

/**
 * A source file split by its own blank lines should read as one pane, not as
 * three stacked ones.
 */
function mergeAdjacentCode(blocks: ProseBlock[]): ProseBlock[] {
  const merged: ProseBlock[] = []
  for (const block of blocks) {
    const previous = merged[merged.length - 1]
    if (block.kind === 'code' && previous?.kind === 'code') {
      previous.text = `${previous.text}\n\n${block.text}`
      continue
    }
    merged.push(block)
  }
  return merged
}

function dedent(lines: string[]): string {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0)
  const common = indents.length ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(common)).join('\n').replace(/\s+$/, '')
}
