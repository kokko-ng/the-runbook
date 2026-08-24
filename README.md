# The Runbook

An Azure career RPG. You join Meridian Logistics as a junior cloud admin, work
the ticket queue, survive the outages and the design reviews, and climb to
solutions architect. Every objective on the current AZ-104 and AZ-305 study
guides is covered by a scenario you actually play.

Free, both acts, no accounts required, no payments anywhere in the codebase.

**The Runbook is an independent study aid. It is not affiliated with, endorsed
by, or sponsored by Microsoft Corporation.** Microsoft, Azure, Microsoft Entra
and the exam codes AZ-104 and AZ-305 are trademarks of the Microsoft group of
companies. Meridian Logistics is fictional.

## How it works

- **Every input is a choice.** Nothing is typed anywhere in the game. The
  engine's only input primitive is a choice id.
- **No language model at runtime.** Every scenario is authored by hand in YAML
  and checked by a linter. Marginal cost per player is zero.
- **Three encounter types.** Design decisions with one best answer and plausible
  wrong ones; three-phase troubleshooting (investigate, diagnose, fix) on a time
  budget; and the occasional knowledge check from your mentor.
- **Reputation, not lives.** A global 0-100 bar. Wrong answers cost 5 to 15 and
  teach you why. Zero means a performance improvement plan and a restart from the
  chapter's checkpoint with 40 reputation.
- **A living architecture diagram.** The world map is Meridian's Azure estate. It
  grows when you deploy something and turns red when an incident touches it.
- **Skill trees that light themselves.** One tree per exam domain. Clearing an
  encounter lights the objectives it covers, so the tree doubles as a readiness
  view.

## What is in it

Two acts, nine chapters, 57 core quests and 18 exam-hard bonus variants: 231
encounters and about 94,000 words of authored scenario. Every one of the 131
objectives on the current AZ-104 and AZ-305 study guides is covered by at least
one core encounter, and the build fails if that stops being true.

| Act | Chapters | Core quests | Bonus | Encounters |
| --- | --- | --- | --- | --- |
| 1 (AZ-104) | Identity, Storage, Compute, Networking, Monitoring | 33 | 10 | 133 |
| 2 (AZ-305) | Identity and governance, Data, Continuity, Infrastructure | 24 | 8 | 98 |

## Layout

```
content/        Authored quests, objective inventories, diagrams, legal pages
  schema/       JSON Schema for every content file
  objectives/   AZ-104 and AZ-305 objectives, transcribed from the study guides
  quests/       One YAML file per quest
frontend/       Vue 3 + Vite + Pinia + Tailwind. The engine lives in src/engine
backend/        Django 5 + Django Ninja. Accounts, save sync, telemetry, linter
deploy/         PythonAnywhere WSGI entry point and deploy scripts
```

The game engine (`frontend/src/engine`) is a pure state machine:
`(save state, content, action) -> (new state, events)`. No Vue, no storage, no
clock of its own. That is what makes it testable and what keeps game rules out of
components.

## Running it locally

```bash
# backend
cd backend
python3.13 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python manage.py migrate
.venv/bin/python manage.py build_content     # compiles content into frontend/public/content
.venv/bin/python manage.py runserver

# frontend, in another terminal
cd frontend
npm install
npm run dev                                   # http://localhost:5173, proxies /api
```

The content bundle is generated, not committed. Run `build_content` after
editing anything under `content/`.

## Checks

```bash
cd backend  && .venv/bin/python manage.py validate_content   # lint + coverage matrix
cd backend  && .venv/bin/python -m pytest -q                 # API and pipeline tests
cd frontend && npm run test                                  # engine tests
cd frontend && npm run build                                 # type check + production build
```

CI runs all four on every pull request and every push to `main`. The content
linter fails the build if an objective in a written chapter has no encounter, if
a diagram operation names a node that does not exist, if a wrong answer has no
teaching explanation, if a beat runs past 250 words, or if en-GB spelling creeps
into text that sits next to en-US Azure documentation.

## Writing content

One YAML file per quest under `content/quests/act1` or `act2`, validated against
`content/schema/quest.schema.json`. The rules the linter enforces:

- Exactly one correct option per encounter; wrong options carry both an in-fiction
  consequence and a teaching explanation.
- Correct answers restore 2 to 10 reputation, wrong answers cost 5 to 15.
- Beats are at most 250 words and answerable from the facts on the page.
- Command output is realistic and current, and every diagnostic starts with a
  tool that exists.
- Diagram operations may only name nodes and edges declared in
  `content/diagrams/`.
- Bonus quests never carry unique objective coverage.

`python manage.py validate_content --partial` relaxes the coverage gate while a
chapter is half written. `--require-all-chapters` is the release gate.

## Back office

`/admin` is the support and content QA surface: player saves (read-only, with the
blob pretty-printed), anonymous analytics events, a coverage matrix rendered from
the same code the linter uses, and a quest browser that shows every encounter,
option and command output without a checkout.

Because the project collects no email address, Django's `createsuperuser` cannot
run non-interactively. Use the command that does not need one:

```bash
python manage.py create_admin --username dana                 # prompts for a password
python manage.py create_admin --username hendrik --player     # reset a player's password
```

That second form is the manual password reset the privacy page promises, since
there is no self-serve reset without an email address.

## Deploying

Push to `main`. CI lints the content, runs the tests, builds the frontend, and
then the deploy job ships it to PythonAnywhere. See [DEPLOYMENT.md](DEPLOYMENT.md)
for how the trigger works and what to do when it does not, and
[docs/QA.md](docs/QA.md) for the cross-device matrix and what it does not cover.
