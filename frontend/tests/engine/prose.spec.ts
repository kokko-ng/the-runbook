import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseProse } from '@/components/feed/prose'
import type { Quest } from '@/engine/types'

describe('prose parsing', () => {
  it('re-flows hard-wrapped prose into one paragraph', () => {
    const blocks = parseProse(
      'The NOC pings you at 09:12. Forty tablets on the warehouse\nfloor are showing a login spinner.',
    )
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        text: 'The NOC pings you at 09:12. Forty tablets on the warehouse floor are showing a login spinner.',
      },
    ])
  })

  it('splits paragraphs on blank lines', () => {
    const blocks = parseProse('First beat.\n\nSecond beat.')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
  })

  it('keeps requirement bullets as a list', () => {
    const blocks = parseProse('- RPO of one hour\n- RTO of four hours\n- Under 900 a month')
    expect(blocks).toEqual([
      { kind: 'list', items: ['RPO of one hour', 'RTO of four hours', 'Under 900 a month'] },
    ])
  })

  it('rejoins a bullet that wraps onto a continuation line', () => {
    const blocks = parseProse('- A signature photo is personal data under PDPA and under\n  the clause Sunda insisted on.')
    expect(blocks).toEqual([
      {
        kind: 'list',
        items: ['A signature photo is personal data under PDPA and under the clause Sunda insisted on.'],
      },
    ])
  })

  it('preserves indentation in a code block', () => {
    const source = [
      "resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {",
      '  name: vnetName',
      '  location: location',
      '}',
    ].join('\n')
    const blocks = parseProse(source)

    expect(blocks[0]!.kind).toBe('code')
    expect((blocks[0] as { text: string }).text).toContain('\n  name: vnetName')
  })

  it('separates a code block from the prose around it', () => {
    const blocks = parseProse(
      'Desmond drops a file into the review.\n\nparam siteCode string\nvar vnetName = 1\n\nTell Priya what it does.',
    )
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'code', 'paragraph'])
  })

  it('does not mistake ordinary prose containing punctuation for code', () => {
    const blocks = parseProse(
      'Evelyn asks what it costs. Desmond says it depends.\nPriya says decide by Friday.',
    )
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph'])
  })
})

// The shipped content is the real test: a misclassification here would render a
// requirement list or a Bicep file as one run-on paragraph, and the encounter
// would stop being answerable.
const GENERATED = join(__dirname, '../../src/generated/content')
const quests: Quest[] = readdirSync(join(GENERATED, 'quests'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(GENERATED, 'quests', name), 'utf-8')))

describe('shipped prose', () => {
  it('renders every authored bullet list as a list', () => {
    // A hyphen mid-sentence is ordinary punctuation in this content, so the
    // signal is a line that *starts* with a bullet, not one that contains a
    // dash.
    for (const quest of quests) {
      for (const encounter of quest.encounters) {
        const scenario = encounter.scenario ?? ''
        const hasBullets = scenario.split('\n').some((line) => /^\s*[-*]\s+\S/.test(line))
        if (!hasBullets) continue

        const kinds = parseProse(scenario).map((block) => block.kind)
        expect(kinds, `${quest.id}:${encounter.id} lost its requirement bullets`).toContain('list')
      }
    }
  })

  it('leaves most encounters as plain paragraphs', () => {
    // A classifier that saw structure everywhere would be as wrong as one that
    // saw none, so check the common case still reads as prose.
    const allBlocks = quests.flatMap((quest) =>
      quest.encounters.flatMap((encounter) => parseProse(encounter.scenario ?? '')),
    )
    const paragraphs = allBlocks.filter((block) => block.kind === 'paragraph').length

    expect(paragraphs / allBlocks.length).toBeGreaterThan(0.7)
  })

  it('classifies the authored Bicep file as code', () => {
    const quest = quests.find((q) => q.id === 'act1-cmp-03-four-sites')!
    const encounter = quest.encounters.find((e) => e.id === 'e1-read-bicep')!
    const kinds = parseProse(encounter.scenario!).map((b) => b.kind)

    expect(kinds).toContain('code')
  })

  it('classifies the residency requirements as a list', () => {
    const quest = quests.find((q) => q.id === 'act2-data-03-photos-and-footage')!
    const encounter = quest.encounters.find((e) => e.id === 'e3-redundancy')!
    const kinds = parseProse(encounter.scenario!).map((b) => b.kind)

    expect(kinds).toContain('list')
  })
})
