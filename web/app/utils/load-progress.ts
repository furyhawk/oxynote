// dev-only trace of a document's load progression, so the sections can be
// watched arriving in order. Callers wrap every call in import.meta.dev,
// which drops the trace and this module from production builds.

const PAGE_LOAD_PREFIX = "[page-load]"
const DOC_SWITCH_PREFIX = "[doc-switch]"
const BAR_WIDTH = 16

// one line per burst rather than one per block, so a document full of
// diagrams does not bury the rest of the trace
const PROGRESS_INTERVAL_MS = 150

// the load being timed: navigation start for the first one, the moment of
// the switch for every one after it
let startedAt = 0
let loads = 0

// far enough back that the first update of a load is never throttled; a
// plain 0 is a real timestamp moments after the page opens
let lastProgressAt = Number.NEGATIVE_INFINITY

// the first load is the page arriving; every one after it is the reader
// moving between documents
function prefix(): string {
	return loads <= 1 ? PAGE_LOAD_PREFIX : DOC_SWITCH_PREFIX
}

function elapsed(): string {
	return `${((performance.now() - startedAt) / 1000).toFixed(2)}s`
}

// opens a load's trace. The first load keeps navigation start as its
// baseline, so the numbers cover everything the reader waited for.
export function startLoadProgress() {
	loads += 1
	startedAt = loads === 1 ? 0 : performance.now()
	lastProgressAt = Number.NEGATIVE_INFINITY
}

export function logSectionReady(section: string) {
	console.log(`${prefix()} ${section} ready in ${elapsed()}`)
}

export function logAsyncBlockProgress(rendered: number, total: number) {
	const now = performance.now()
	const complete = rendered >= total

	if (!complete && now - lastProgressAt < PROGRESS_INTERVAL_MS) {
		return
	}

	lastProgressAt = now

	const filled = Math.round((rendered / total) * BAR_WIDTH)
	const bar = `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`

	console.log(
		`${prefix()} async blocks ${bar} ${rendered}/${total} rendered, ${total - rendered} waiting`,
	)
}
