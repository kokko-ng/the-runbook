import type { ContentIndex, Quest } from '../src/engine/types'

export const NOW = '2026-01-01T00:00:00.000Z'

export const design: Quest = {
  id: 'q-design',
  chapter: 'act1-networking',
  title: 'The Peering Problem',
  summary: 'A spoke that cannot reach the hub.',
  objectives: ['AZ104-4.1.2', 'AZ104-4.1.4'],
  encounters: [
    {
      id: 'a',
      type: 'design',
      title: 'Two ways to route it',
      intro: 'The depot spoke needs to reach shared services.',
      prompt: 'What do you take to the change board?',
      objectives: ['AZ104-4.1.2'],
      resolution: 'Marek grunts, which is how he says yes.',
      hint: 'Think about what a peering needs on each side before it connects.',
      post_mortem: {
        question: 'What did that change actually get wrong?',
        options: [
          {
            id: 'a',
            label: 'It treated a routing gap as a security problem',
            correct: true,
            explain: 'The traffic was allowed; it had no path.',
          },
          {
            id: 'b',
            label: 'It used the wrong port range',
            correct: false,
            explain: 'Ports were never the issue.',
          },
        ],
      },
      options: [
        {
          id: 'a',
          label: 'Peer the spoke to the hub in both directions',
          correct: true,
          rep: 6,
          explain: 'Peering is not established until both sides have it.',
          diagram: [{ op: 'add_edge', edge: 'e-hub-depot' }],
        },
        {
          id: 'b',
          label: 'Open an any-any rule on the spoke subnet',
          correct: false,
          rep: -10,
          consequence: 'Wei Lin sees the rule in the audit export within the hour.',
          explain: 'A missing peering is not a security group problem.',
        },
      ],
    },
    {
      id: 'b',
      type: 'knowledge',
      title: 'Marek checks',
      intro: 'He puts his mug down.',
      speaker: 'Marek Sobczak',
      question: 'What does a peering state of Initiated mean?',
      objectives: ['AZ104-4.1.4'],
      options: [
        {
          id: 'a',
          label: 'Only one side of the peering exists',
          correct: true,
          rep: 4,
          explain: 'Connected requires a peering object on both virtual networks.',
        },
        {
          id: 'b',
          label: 'The peering is still provisioning and will connect itself',
          correct: false,
          rep: -5,
          consequence: 'You wait twenty minutes for nothing.',
          explain: 'Initiated is a terminal state until the other side is created.',
        },
      ],
    },
  ],
}

export const incident: Quest = {
  id: 'q-incident',
  chapter: 'act1-networking',
  title: 'Scanners Offline',
  summary: 'The depot scanners stopped uploading.',
  objectives: ['AZ104-4.1.5'],
  encounters: [
    {
      id: 'a',
      type: 'troubleshoot',
      title: 'INC-4471',
      intro: 'The NOC pings you at 09:12.',
      ticket: {
        ref: 'INC-4471',
        opened: '09:12',
        reporter: 'Joana Reyes',
        summary: 'Depot scanners cannot reach shared services.',
        severity: 'sev2',
      },
      time_budget: 4,
      hint: 'A peering that shows Initiated is waiting for its other half.',
      post_incident: {
        path: ['a', 'd'],
        text: 'Two peering listings, one from each side, settle it. The NSG and IP flow checks cannot tell you anything the symptom did not already say.',
      },
      investigate: [
        { id: 'a', action: 'Ask the NOC what changed overnight', reveals: 'A peering was recreated.' },
        { id: 'b', action: 'Read the change record', reveals: 'Only the hub side was recreated.', time_cost: 1 },
      ],
      commands: [
        {
          id: 'a',
          cmd: 'az network vnet peering list -g rg-hub --vnet-name vnet-hub -o table',
          output: 'hub-to-depot  Initiated',
          time_cost: 1,
        },
        {
          id: 'b',
          cmd: 'az network nsg rule list -g rg-depot --nsg-name nsg-depot -o table',
          output: 'AllowIntake  Allow',
          time_cost: 2,
        },
        {
          id: 'c',
          cmd: 'az network watcher test-ip-flow --vm vm-scan01 -g rg-depot',
          output: 'Access: Allow',
          time_cost: 1,
        },
        {
          id: 'd',
          cmd: 'az network vnet peering list -g rg-depot --vnet-name vnet-depot -o table',
          output: '(no peerings)',
          time_cost: 1,
        },
      ],
      fixes: [
        {
          id: 'a',
          label: 'Recreate the peering from the depot side as well',
          correct: true,
          rep: 8,
          explain: 'Both virtual networks need a peering object.',
          diagram: [{ op: 'set_status', node: 'vnet-depot', status: 'healthy' }],
        },
        {
          id: 'b',
          label: 'Add an any-any allow rule to nsg-depot',
          correct: false,
          rep: -10,
          consequence: 'Wei Lin opens a finding before lunch.',
          explain: 'The security group was already allowing the traffic.',
        },
        {
          id: 'c',
          label: 'Reboot vm-scan01',
          correct: false,
          rep: -6,
          consequence: 'Two depots lose their session and rescan everything.',
          explain: 'Nothing about the symptom points at the guest.',
        },
      ],
    },
  ],
}

export const bonus: Quest = {
  ...incident,
  id: 'q-bonus',
  variant: 'bonus',
  bonus_of: 'q-incident',
  title: 'Scanners Offline, Exam Hard',
}

export const index: ContentIndex = {
  version: 'test',
  company: { name: 'Veymark Logistics' },
  ranks: [{ id: 'junior-cloud-admin', title: 'Junior Cloud Admin' }],
  cast: [{ id: 'marek', name: 'Marek Sobczak', role: 'Senior Cloud Admin', note: '' }],
  acts: [{ id: 'act1', number: 1, exam: 'AZ-104', title: 'The Ticket Queue', tagline: '', chapters: ['act1-networking', 'act1-monitoring'] }],
  chapters: [
    {
      id: 'act1-networking',
      act: 'act1',
      order: 1,
      domain: 'AZ104-4',
      title: 'Wires and Rules',
      rank: 'junior-cloud-admin',
      blurb: '',
      quests: [
        {
          id: 'q-design', title: design.title, summary: '', variant: 'core', bonus_of: null,
          objectives: design.objectives, estimated_minutes: 10, encounter_count: 2,
          encounter_types: ['design', 'knowledge'],
          encounters: [
            { id: 'a', type: 'design', objectives: ['AZ104-4.1.2'] },
            { id: 'b', type: 'knowledge', objectives: ['AZ104-4.1.4'] },
          ],
        },
        {
          id: 'q-incident', title: incident.title, summary: '', variant: 'core', bonus_of: null,
          objectives: incident.objectives, estimated_minutes: 10, encounter_count: 1,
          encounter_types: ['troubleshoot'],
          encounters: [{ id: 'a', type: 'troubleshoot', objectives: ['AZ104-4.1.5'] }],
        },
        {
          id: 'q-bonus', title: bonus.title, summary: '', variant: 'bonus', bonus_of: 'q-incident',
          objectives: incident.objectives, estimated_minutes: 10, encounter_count: 1,
          encounter_types: ['troubleshoot'],
          encounters: [{ id: 'a', type: 'troubleshoot', objectives: ['AZ104-4.1.5'] }],
        },
      ],
    },
    {
      id: 'act1-monitoring',
      act: 'act1',
      order: 2,
      domain: 'AZ104-5',
      title: 'Pager Discipline',
      rank: 'junior-cloud-admin',
      blurb: '',
      quests: [
        { id: 'q-later', title: 'Later', summary: '', variant: 'core', bonus_of: null, objectives: ['AZ104-5.1.1'], estimated_minutes: 10, encounter_count: 3, encounter_types: ['design'] },
      ],
    },
  ],
  exams: [
    {
      exam: 'AZ-104',
      act: 1,
      title: 'Microsoft Azure Administrator',
      source_url: 'https://example.invalid',
      skills_measured_as_of: '2026-04-17',
      fetched_on: '2026-08-24',
      domains: [
        {
          id: 'AZ104-4',
          title: 'Implement and manage virtual networking',
          weight: '15-20%',
          chapter: 'act1-networking',
          groups: [
            {
              id: 'AZ104-4.1',
              title: 'Configure and manage virtual networks in Azure',
              objectives: [
                { id: 'AZ104-4.1.2', text: 'Create and configure virtual network peering' },
                { id: 'AZ104-4.1.4', text: 'Configure user-defined routes' },
                { id: 'AZ104-4.1.5', text: 'Troubleshoot network connectivity' },
              ],
            },
          ],
        },
      ],
    },
  ],
  diagrams: {
    act1: {
      act: 1,
      groups: [{ id: 'hub', label: 'hub' }],
      nodes: [
        { id: 'vnet-hub', label: 'vnet-hub', kind: 'vnet', group: 'hub', x: 0, y: 0, present: true },
        { id: 'vnet-depot', label: 'vnet-depot', kind: 'vnet', group: 'hub', x: 0, y: 90 },
      ],
      edges: [{ id: 'e-hub-depot', source: 'vnet-hub', target: 'vnet-depot' }],
    },
  },
  legal: [],
}

export function questById(id: string): Quest {
  return { 'q-design': design, 'q-incident': incident, 'q-bonus': bonus }[id] as Quest
}
