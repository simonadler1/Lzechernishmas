# Mishnayos campaign app: agent hand-off

Coordinates learning all of Shas Mishnayos in one shared, live chart, usually l'ilui nishmas someone who has passed away. It replaces the separate paper charts in different shuls, where nobody can tell whether all of Shas was finished.

To start an agent, say: **"Read plan/README.md and do the next task."**

## Documents

| File | Read it when |
| --- | --- |
| `PROGRESS.md` | Always first. It is the status board and the only list of tasks and their order. |
| `tasks/NN-*.md` | The task you picked up. |
| `PRODUCT.md` | The task points at a section, or you need to know how a feature should behave. |
| `ARCHITECTURE.md` | Before writing code. It holds the stack, layout, schema, API contract and conventions. |
| `DESIGN.md` | The task adds or changes anything a user sees. Load the `frontend-design` skill too, and treat this brief as its design plan, so every page shares one direction. |
| `DEPLOYMENT.md` | The task touches Wrangler config, environments, secrets, migrations or deploying. |
| `DECISIONS.md` | You are tempted to change a product default, or wonder why it is that way. |
| `reference/shas.json` | Task 02 only. Everything else imports the module built from it. |

## Working one task

1. Open `PROGRESS.md`. Take the first task marked `todo` whose dependencies are all `done`. Mark it `in progress`.
2. Read the task file and the sections it names.
3. Build exactly the task's scope. Later tasks own the work listed under "Out of scope".
4. Prove every "Done when" item by running it: `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass, plus the task's own checks.
5. If the task added or changed a page, and task 06b is done, follow "Keeping the device suite current" below.
6. Mark the task `done` in `PROGRESS.md`. Add a one-line note for anything the next agent could not learn from the code, such as a deviation or a gotcha.
7. Commit once, with the message `task NN: <title>`. Stop there, so each task gets a fresh agent and a reviewable commit.

Deploying, changing Cloudflare resources and remote D1 commands happen only when the human asks for them in the current session. Local work and `--dry-run` are always fine.

## Keeping the device suite current

Most visitors arrive on a phone from a QR sign, so a page is finished only when it passes on phones and desktop.

1. Register every new page and meaningful state (empty, error, completed) in `e2e/pages.ts`, adding a seed scenario if needed.
2. Add or extend a flow in `e2e/flows/` for each new user journey.
3. Run `pnpm test:all`, and fix the page when a check fails. Adjust a check only when the check itself is wrong, and say why in `PROGRESS.md`.
4. Run `pnpm test:visual:update` for intended visual changes. Then open every new or changed screenshot for one phone and one desktop project and judge it against `DESIGN.md`. A baseline proves only that nothing moved, so this look is what confirms the page is good.
5. Commit the updated baselines with the task.

## When the plan and reality disagree

- Technical detail (a library API changed, a file wants a different name): adapt, then update `ARCHITECTURE.md` so it stays true.
- Product behaviour (what users see, who gets messaged, what is public): stop, write the question in the task's note in `PROGRESS.md`, mark it `blocked`, and ask the human.

## After these tasks

Real SMS and email are deliberately not in this plan. Task 16 leaves a provider checklist in `docs/messaging-providers.md`.
