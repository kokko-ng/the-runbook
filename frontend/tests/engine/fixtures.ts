import type {
  ContentBundle,
  DesignDecisionEncounter,
  KnowledgeCheckEncounter,
  Manifest,
  Quest,
  TroubleshootEncounter,
} from '@/engine/types'

export const manifest: Manifest = {
  formatVersion: 1,
  exams: [
    {
      exam: 'az104',
      title: 'Test exam',
      act: 1,
      sourceUrl: '',
      fetchedOn: '',
      domains: [
        {
          id: 'test-d1',
          title: 'Test domain',
          chapter: 'test-chapter',
          weight: '',
          clusters: [
            {
              id: 'cluster-a',
              title: 'Cluster A',
              requires: [],
              objectives: [
                { id: 'OBJ-1', text: 'First' },
                { id: 'OBJ-2', text: 'Second' },
              ],
            },
            {
              id: 'cluster-b',
              title: 'Cluster B',
              requires: ['cluster-a'],
              objectives: [{ id: 'OBJ-3', text: 'Third' }],
            },
          ],
        },
      ],
    },
  ],
  chapters: [
    {
      id: 'test-chapter',
      act: 1,
      title: 'Test domain',
      domain: 'test-d1',
      quests: ['q1'],
    },
  ],
  quests: [
    {
      id: 'q1',
      title: 'Test Quest',
      act: 1,
      chapter: 'test-chapter',
      domain: 'test-d1',
      order: 1,
      role: 'junior-cloud-admin',
      summary: '',
      checkpoint: true,
      bonusVariantOf: null,
      objectives: ['OBJ-1', 'OBJ-2', 'OBJ-3'],
    },
  ],
  diagrams: {
    '1': {
      id: 'act1',
      title: 'Test',
      groups: [{ id: 'grp', label: 'Group' }],
      nodes: [
        { id: 'vnet-hub', label: 'Hub', kind: 'vnet', status: 'healthy' },
        { id: 'vnet-spoke', label: 'Spoke', kind: 'vnet', status: 'healthy' },
      ],
      edges: [
        {
          id: 'peer',
          source: 'vnet-hub',
          target: 'vnet-spoke',
          kind: 'peering',
          status: 'healthy',
        },
      ],
    },
  },
  coverage: {},
}

export function decision(
  overrides: Partial<DesignDecisionEncounter> = {},
): DesignDecisionEncounter {
  return {
    id: 'e1',
    type: 'design_decision',
    title: 'A decision',
    objectives: ['OBJ-1'],
    next: 'END',
    onEnterDiagramOps: [],
    rewards: {},
    scenario: 'Something happened.',
    prompt: 'What do you do?',
    options: [
      {
        id: 'wrong-a',
        label: 'Wrong A',
        correct: false,
        explain: 'Not that.',
        consequence: 'It goes badly.',
        diagramOps: [],
      },
      {
        id: 'right',
        label: 'Right',
        correct: true,
        explain: 'That.',
        diagramOps: [{ op: 'set_status', node: 'vnet-hub', status: 'warning' }],
      },
      {
        id: 'wrong-b',
        label: 'Wrong B',
        correct: false,
        explain: 'Also not that.',
        diagramOps: [],
      },
    ],
    ...overrides,
  }
}

export function troubleshoot(
  overrides: Partial<TroubleshootEncounter> = {},
): TroubleshootEncounter {
  return {
    id: 'e-inc',
    type: 'troubleshoot',
    title: 'An incident',
    objectives: ['OBJ-2'],
    next: 'END',
    onEnterDiagramOps: [{ op: 'set_status', node: 'vnet-spoke', status: 'broken' }],
    rewards: {},
    scenario: 'The spoke is down.',
    timeBudget: 4,
    investigate: [
      {
        id: 'inv-a',
        label: 'Ask the NOC',
        reveals: 'They changed a peering.',
        speaker: 'noc',
        timeCost: 0,
      },
      {
        id: 'inv-b',
        label: 'Read the ticket',
        reveals: 'Started at 09:12.',
        speaker: 'ticket',
        timeCost: 1,
      },
    ],
    commands: [
      {
        id: 'cmd-cheap',
        label: 'list peerings',
        command: 'az network vnet peering list',
        output: 'Initiated',
        timeCost: 1,
        note: 'Read the state.',
      },
      {
        id: 'cmd-dear',
        label: 'effective routes',
        command: 'az network nic show-effective-route-table',
        output: 'no route',
        timeCost: 3,
        note: '',
      },
    ],
    fixes: [
      {
        id: 'fix-wrong',
        label: 'Restart it',
        correct: false,
        explain: 'That is not the failure.',
        diagramOps: [],
      },
      {
        id: 'fix-right',
        label: 'Recreate the peering',
        correct: true,
        explain: 'Peering is two objects.',
        diagramOps: [{ op: 'set_edge_status', edge: 'peer', status: 'healthy' }],
      },
    ],
    ...overrides,
  }
}

export function knowledge(
  overrides: Partial<KnowledgeCheckEncounter> = {},
): KnowledgeCheckEncounter {
  return {
    id: 'e-quiz',
    type: 'knowledge_check',
    title: 'A check',
    objectives: ['OBJ-3'],
    next: 'END',
    onEnterDiagramOps: [],
    rewards: {},
    question: 'Is peering transitive?',
    options: [
      { id: 'no', label: 'No', correct: true, explain: 'Correct.', diagramOps: [] },
      { id: 'yes', label: 'Yes', correct: false, explain: 'Incorrect.', diagramOps: [] },
    ],
    ...overrides,
  }
}

export function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'q1',
    title: 'Test Quest',
    act: 1,
    chapter: 'test-chapter',
    domain: 'test-d1',
    order: 1,
    role: 'junior-cloud-admin',
    checkpoint: true,
    summary: '',
    entry: 'e1',
    encounters: [decision()],
    ...overrides,
  }
}

export function bundle(questOverrides: Partial<Quest> = {}): ContentBundle {
  return { manifest, quest: quest(questOverrides) }
}
