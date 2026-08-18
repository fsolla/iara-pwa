/**
 * `bun run worktree` — worktree management determinístico em torno da fila de
 * claim do projeto (mesma fila de `bun run agent:claim`).
 *
 *   bun run worktree next [--issue N] [--stay]
 *                              claima a próxima Issue claimável ANTES de criar
 *                              o worktree a partir de origin/main (mesma fila
 *                              e lock otimista de `bun run agent:claim`; claim
 *                              falhou → motivo e saída SEM worktree órfão);
 *                              branch `<code>-<slug>`.
 *                              `--issue N` claima a Issue direcionada (`ready`)
 *                              ou REABRE uma já claimada (`in-progress` — sem
 *                              re-claim; worktree reutilizado/criado e launch
 *                              na hora).
 *                              Por padrão imprime `cd <dir>` no fim — node
 *                              não muda o cwd do shell pai; o shell chamador
 *                              aplica (opencode/CDP usa o opencode command;
 *                              terminal interativo: função `worktree()` do
 *                              roteador em ~/.config/shell/worktree.sh).
 *                              `--stay` suprime a linha `cd` (o claim ainda
 *                              acontece); `--go` explícito continua aceito
 *                              como no-op.
 *                              Chamado do terminal interativo (com
 *                              `TEQO_WORKTREE_TERMINAL=1`), imprime também a
 *                              diretiva `launch opencode <dir> --model
 *                              deepseek/deepseek-v4-flash --auto --prompt
 *                              "/work-issue --issue <N>"` ANTES do `cd` — a
 *                              função shell executa o cd e então a linha, e o
 *                              TUI do opencode abre no worktree com
 *                              `/work-issue --issue <N>` já enviado. Presets
 *                              em scripts/lib/worktree.mjs. Sem o marcador
 *                              (comando `/worktree` do opencode), a diretiva
 *                              não é impressa — nunca abre TUI aninhado.
 *                              Provisiona o worktree: `bun install` (Iara é
 *                              um SPA sem banco — não há DB/porta/migrations).
 *   bun run worktree plan [bag] [--stay]
 *                              cria um worktree de PLANEJAMENTO novo para rodar
 *                              a skill /plan-issue sem ocupar o main — cada
 *                              invocação cria UM DIFERENTE: com `bag`, branch
 *                              `plans/plan-issue-<bag>` (e `-2`, `-3`, … se o
 *                              nome já estiver vivo); sem `bag`, o próximo
 *                              sequencial `plans/plan-issue-<n>` livre. Prefixo
 *                              minúsculo `plans/…` — nunca colide com um
 *                              `next` posterior.
 *   bun run worktree new [bag] [--stay]
 *                              cria um worktree NEUTRO novo — sem função
 *                              pré-definida (explorar ideia, conversar, ou
 *                              planejar sem registrar nada): branch `work/<bag>`
 *                              ou `work/<n>` sequencial.
 *   bun run worktree kill [--force]
 *                              destrói o worktree em que o shell atual está
 *                              (recusa worktree sujo sem `--force`); por
 *                              padrão termina imprimindo `cd <main>` para o
 *                              shell voltar ao worktree principal.
 *
 * Read-only no Forgejo? NÃO — desde o início `next` CLAIMA (mesma fila/ordem e
 * lock otimista do `bun run agent:claim`; `--issue N` claim direcionado ou
 * reabre sessão já claimada). `plan`/`new`/`kill` não tocam Issues.
 * Dir raiz: configurado em `.forgejo/worktree.env` (WORKTREES_ROOT; default
 * `~/.worktrees/<repo>`). Portado do teqo (scripts/worktree.mjs), sem banco.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  claimBriefLines,
  claimIssue,
  claimQueueEntry,
  claimTargetVerdict,
  dieAgent,
  issuesById,
  nextClaimableIssue,
  parseArgs,
} from './lib/agent-forgejo.mjs'
import { forgejoApi as api } from './lib/forgejo-api.mjs'
import { loadProjectEnv } from './lib/load-project-env.mjs'
import {
  branchNameForIssue,
  opencodeLaunchDirective,
  planBranchName,
  workBranchName,
  WORKTREE_TERMINAL_ENV,
} from './lib/worktree.mjs'

const { worktreesRoot } = loadProjectEnv()
const die = dieAgent('worktree')
const WORKTREES_ROOT = worktreesRoot

/**
 * True when the interactive terminal shell function sets `TEQO_WORKTREE_TERMINAL=1`
 * and will execute the `launch` directive we print. Without the marker (the
 * `/worktree` opencode command, automation) the launch line is never printed.
 */
const terminalShell = process.env[WORKTREE_TERMINAL_ENV] === '1'

/** Print the `launch` directive (only exists from the terminal shell); the `cd` line stays last. */
const printLaunchDirective = ({ dir, purpose, issueNumber }) => {
  const line = opencodeLaunchDirective({ dir, purpose, terminal: terminalShell, issueNumber })
  if (line) console.log(line)
}

/** `git` wrapper; `okIfFails` swallows the failure and returns null instead. */
const git = (args, { okIfFails = false } = {}) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
  } catch (error) {
    if (okIfFails) return null
    const stderr = (error.stderr?.toString() ?? '').trim()
    die(stderr || error.message || `git ${args.join(' ')} falhou`)
  }
  return null
}

/** Parse `git worktree list --porcelain` into [{ path, branch }]. */
const parseWorktreeList = (porcelain) => {
  const entries = []
  let current = null
  for (const raw of porcelain.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null }
      entries.push(current)
    } else if (line.startsWith('branch refs/heads/')) {
      if (current) current.branch = line.slice('branch refs/heads/'.length)
    } else if (line === '') {
      current = null
    }
  }
  return entries
}

/** `bun install` no worktree se node_modules ainda não existir. */
const ensureWorktreeDeps = (dir) => {
  if (existsSync(join(dir, 'node_modules', '.bin'))) return
  console.log('[worktree] ▶ node_modules ausente — bun install …')
  execFileSync('bun', ['install'], { cwd: dir, stdio: 'inherit' })
}

/**
 * Provisiona o ambiente do worktree. Iara é um SPA sem banco — só `bun install`
 * e copia secretos gitignored de `.opencode/secrets/` se existirem (opencode
 * se recusa a abrir com referência `{file:…}` pendurada).
 */
const provision = async ({ dir, mainRoot }) => {
  const sourceDir = join(mainRoot, '.opencode', 'secrets')
  if (existsSync(sourceDir)) {
    const { copyFileSync, mkdirSync, readdirSync, statSync } = await import('node:fs')
    const targetDir = join(dir, '.opencode', 'secrets')
    mkdirSync(targetDir, { recursive: true })
    for (const name of readdirSync(sourceDir)) {
      const source = join(sourceDir, name)
      const target = join(targetDir, name)
      if (!statSync(source).isFile() || existsSync(target)) continue
      copyFileSync(source, target)
      console.log(`[worktree] .opencode/secrets/${name} copiado do worktree principal.`)
    }
  }
  ensureWorktreeDeps(dir)
}

/**
 * Pick determinístico do `next` — READ-ONLY no Forgejo: `--issue <N>` escolhe a
 * Issue direcionada (via `claimTargetVerdict`: `ready` → claim, `in-progress` →
 * reopen sem re-claim), sem a flag escolhe a próxima da fila (mesmo pick/ordem
 * do `bun run agent:claim`). O claim em si acontece só em `cmdNext`, DEPOIS da
 * derivação/validação do branch — uma Issue sem frontmatter id (ou branch
 * inválido) morre antes do flip de labels, nunca deixando claim órfão.
 */
const pickNextIssue = async ({ requestedIssueNumber, die }) => {
  if (requestedIssueNumber !== null) {
    const raw = String(requestedIssueNumber)
    const number = Number(raw)
    if (!Number.isInteger(number) || number <= 0) {
      die(`--issue inválido: ${raw}`)
    }
    const target = await api.getIssue(number)
    const verdict = claimTargetVerdict(target)
    if (verdict.kind === 'error') die(verdict.message)
    const entry = claimQueueEntry(target, await issuesById())
    if (verdict.kind === 'reopen') {
      // Sessão já claimada — reabrir não re-claima (reopen é sobre a sessão).
      return { entry, reopened: true, directed: true }
    }
    if (entry.blockedBy.length > 0) {
      die(`Issue #${number} não é claimável (bloqueada por ${entry.blockedBy.join(', ')}).`)
    }
    return { entry, reopened: false, directed: true }
  }

  const pick = await nextClaimableIssue()
  if (!pick) {
    die('Fila vazia — nada `ready` desbloqueado. Rode `bun run agent:status` para ver a fila.')
  }
  return { entry: pick, reopened: false, directed: false }
}

const cmdNext = async (stay, requestedIssueNumber) => {
  const { entry, reopened, directed } = await pickNextIssue({ requestedIssueNumber, die })

  const issue = entry.issue
  const branch = branchNameForIssue({ ...issue, meta: entry.meta })
  if (git(['check-ref-format', '--allow-onelevel', branch], { okIfFails: true }) === null) {
    die(`Branch derivado inválido para refname: ${branch}`)
  }
  const dir = join(WORKTREES_ROOT, branch)

  // O claim flips labels — só depois da derivação do branch provar que a Issue
  // tem tudo para virar worktree.
  if (!reopened) await claimIssue(entry, die)
  const claimedIssueNumber = reopened ? null : issue.number

  const headline = reopened
    ? 'Sessão já claimada — reabrindo (sem re-claim)'
    : directed
      ? 'Claimado (direcionado — `--issue`)'
      : 'Claimado da fila'
  console.log(`\n${headline}: #${issue.number} ${issue.title}`)
  for (const line of claimBriefLines(entry)) console.log(line)

  try {
    git(['fetch', 'origin'])

    const entries = parseWorktreeList(git(['worktree', 'list', '--porcelain']))
    if (entries.some((entry) => resolve(entry.path) === resolve(dir))) {
      console.log(`Worktree já existe em ${dir} — reutilizando, sem duplicar.`)
    } else {
      const branchExists =
        git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
          okIfFails: true,
        }) !== null
      if (branchExists) {
        // Reopen com worktree removido à mão: `-B` resetaria commits de sessão.
        const ahead = git(['log', '--oneline', `origin/main..${branch}`], { okIfFails: true })
        if (ahead) {
          die(
            `Branch ${branch} tem commits fora de origin/main e o worktree não existe — reabrir com -B descartaria esses commits. Rode \`git branch -D ${branch}\` (sessão encerrada) ou resolva antes.`,
          )
        }
      }
      const flag = branchExists ? '-B' : '-b'
      git(['worktree', 'add', flag, branch, dir, 'origin/main'])

      console.log('Worktree criado:')
      console.log(`  branch: ${branch}`)
      console.log(`  path:   ${dir}`)
      console.log('  origem: origin/main')
    }
    console.log(
      reopened
        ? 'Issue já claimada (sessão reaberta) — NÃO rodar `bun run agent:claim` (o claim é parte do `worktree next`).'
        : 'Issue claimada por este comando — NÃO rodar `bun run agent:claim` (o claim é parte do `worktree next`).',
    )

    const mainRoot = entries[0]?.path
    await provision({ dir, mainRoot })

    console.log(`\nAmbiente provisionado: bun install em ${dir}`)
  } catch (error) {
    if (claimedIssueNumber !== null) {
      console.error(
        `\n[worktree] Issue #${claimedIssueNumber} ficou claimada (o worktree não foi concluído) — ` +
          `reabra quando quiser: \`bun run worktree next --issue ${claimedIssueNumber}\`.\n`,
      )
    }
    throw error
  }

  if (!stay) {
    printLaunchDirective({ dir, purpose: 'next', issueNumber: issue.number })
    console.log(`cd ${dir}`)
  }
}

/** Branch short-names already alive — local refs plus origin (shortened). */
const buildTakenBranchNames = () => {
  const taken = new Set()
  for (const scope of [
    (
      git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
        okIfFails: true,
      }) ?? ''
    ).split('\n'),
    (
      git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], {
        okIfFails: true,
      }) ?? ''
    )
      .split('\n')
      .map((name) => name.replace(/^origin\//, '')),
  ]) {
    for (const name of scope) if (name) taken.add(name)
  }
  return taken
}

/**
 * Shared runner for namespace worktrees NOT tied to the claim queue (`plan`
 * and `new`): fetches origin, picks a FRESH branch in the namespace, provisions
 * the worktree and prints the `cd <dir>` line by default (`--stay` suppresses).
 */
const cmdNamespaceBranch = async ({ stay, purpose, noun, sessionLabel, branchName }) => {
  git(['fetch', 'origin'])

  const entries = parseWorktreeList(git(['worktree', 'list', '--porcelain']))
  const taken = buildTakenBranchNames()

  const branch = branchName(taken)
  if (git(['check-ref-format', '--allow-onelevel', branch], { okIfFails: true }) === null) {
    die(`Branch ${purpose} inválido para refname: ${branch}`)
  }
  const dir = join(WORKTREES_ROOT, branch)

  if (entries.some((entry) => resolve(entry.path) === resolve(dir))) {
    die(
      `Já existe um worktree ${noun} em ${dir} (branch ${branch} não detectado nos refs). Rode \`bun run worktree kill\` de dentro dele.`,
    )
  }

  git(['worktree', 'add', '-b', branch, dir, 'origin/main'])

  console.log(`Worktree ${noun} criado:`)
  console.log(`  sessão: ${sessionLabel}`)
  console.log(`  branch: ${branch}`)
  console.log(`  path:   ${dir}`)
  console.log('  origem: origin/main')

  const mainRoot = entries[0]?.path
  await provision({ dir, mainRoot })

  if (!stay) {
    printLaunchDirective({ dir, purpose })
    console.log(`cd ${dir}`)
  }
}

/** `plan` — um worktree de planejamento `/plan-issue`, diferente por invocação. */
const cmdPlan = async (stay, bag) =>
  cmdNamespaceBranch({
    stay,
    purpose: 'plan',
    noun: 'de planejamento',
    sessionLabel: bag && bag.trim() ? `lote "${bag}"` : 'sequencial',
    branchName: (taken) => planBranchName({ bag, taken }),
  })

/** `new` — um worktree NEUTRO (sem função pré-definida), diferente por invocação. */
const cmdNew = async (stay, bag) =>
  cmdNamespaceBranch({
    stay,
    purpose: 'new',
    noun: 'neutro',
    sessionLabel: bag && bag.trim() ? `bag "${bag}"` : 'sequencial',
    branchName: (taken) => workBranchName({ bag, taken }),
  })

const cmdKill = async (force) => {
  const entries = parseWorktreeList(git(['worktree', 'list', '--porcelain']))
  const mainRoot = entries[0]?.path
  if (!mainRoot) die('Não consegui ler os worktrees deste repo.')
  const top = git(['rev-parse', '--show-toplevel'])
  if (resolve(top) === resolve(mainRoot)) {
    die(
      'Você está no worktree principal (main) — não dá para destruí-lo. Rode `git worktree list`.',
    )
  }

  const entry = entries.find((candidate) => resolve(candidate.path) === resolve(top))
  const branch = entry?.branch ?? null

  const dirty = git(['-C', top, 'status', '--porcelain'])
  if (dirty && !force) {
    const sample = dirty
      .split('\n')
      .slice(0, 10)
      .map((line) => `    ${line}`)
      .join('\n')
    die(
      `Worktree ${top} está sujo. Commite/stacke ou confirme com \`bun run worktree kill --force\`.\n${sample}`,
    )
  }

  git(['-C', mainRoot, 'worktree', 'remove', '--force', top])
  if (branch) git(['-C', mainRoot, 'branch', '-D', branch])

  console.log(`Worktree destruído: ${top}`)
  console.log(`  branch removido: ${branch ?? '(detached — nada a remover)'}`)

  console.log(`cd ${mainRoot}`)
}

const { flags, positional } = parseArgs(process.argv.slice(2), new Set(['issue']))
const subcommand = positional[0]

if (!subcommand) {
  console.log(
    'Uso: bun run worktree next [--issue N] [--stay] | plan [bag] [--stay] | new [bag] [--stay] | kill [--force]',
  )
  console.log('  next [--issue N] [--stay]')
  console.log('    CLAIMA a próxima Issue claimável (mesma fila/ordem e lock otimista do')
  console.log('    `bun run agent:claim`) e cria o worktree dela (branch <code>-<slug>) de')
  console.log('    origin/main, com bun install. `--issue N` claima a Issue direcionada')
  console.log('    (`ready`) ou REABRE uma já claimada (`in-progress`, sem re-claim). Por')
  console.log('    padrão imprime `cd <dir>` no fim; no terminal (TEQO_WORKTREE_TERMINAL=1)')
  console.log('    imprime também a diretiva `launch opencode … --prompt "/work-issue --issue <N>"`;')
  console.log('    --stay suprime cd e launch (o claim ainda acontece); --go é no-op')
  console.log('\n  plan [bag] [--stay]')
  console.log('    cria um worktree de planejamento DIFERENTE a cada invocação (sessões')
  console.log('    /plan-issue paralelas): com bag, branch plans/plan-issue-<bag> (sufixo')
  console.log('    -2/-3 se o nome já existir); sem bag, o próximo plans/plan-issue-<n>')
  console.log('    sequencial livre; o prefixo minúsculo plans/… nunca colide com o branch')
  console.log('    <code>-<slug> de `next`; no terminal, mesma diretiva `launch` com')
  console.log('    --prompt /plan-issue enviado')
  console.log('\n  new [bag] [--stay]')
  console.log('    cria um worktree NEUTRO (sem função pré-definida) DIFERENTE a cada')
  console.log('    invocação: com bag, branch work/<bag> (sufixo -2/-3 se o nome já')
  console.log('    existir); sem bag, o próximo work/<n> sequencial livre; no terminal,')
  console.log('    mesma diretiva `launch` porém sem --prompt (apenas conversar)')
  console.log('  kill [--force]  destrói o worktree em que você está (recusa sujo sem')
  console.log('                  --force) e imprime `cd <main>` no fim')
  process.exit(1)
}

try {
  if (subcommand === 'next') {
    if ('issue' in flags && flags.issue === undefined) {
      die('`--issue` requer um número (ex.: `--issue 12`).')
    }
    if (positional.length > 1) {
      die('`next` não aceita argumento posicional — use `--issue <N>` para direcionar a Issue.')
    }
    await cmdNext(Boolean(flags.stay), flags.issue ?? null)
  } else if (subcommand === 'plan') await cmdPlan(Boolean(flags.stay), positional[1])
  else if (subcommand === 'new') await cmdNew(Boolean(flags.stay), positional[1])
  else if (subcommand === 'kill') {
    if (flags.stay) die('`--stay` não se aplica a `kill` — ele sempre volta ao main.')
    await cmdKill(Boolean(flags.force))
  } else die(`subcomando desconhecido: ${subcommand} (esperado: next | plan | new | kill)`)
} catch (error) {
  if (error?.stderr) die(error.stderr.toString().trim())
  die(error?.message ?? String(error))
}
