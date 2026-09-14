package demo

import (
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/oxynote/oxynote/server/core/pkg/timeutil"
)

// _tick is the interval between two demo samples.
const _tick = time.Minute

// _tickMillis is that same interval in the milliseconds the storage layer
// counts in.
const _tickMillis = int64(_tick / time.Millisecond)

// _walkStride is how many ticks pass between two steps of a walk, which
// is the interval the generator these parameters come from advanced on.
// Ticks in between are interpolated, so a walk costs a fifth of what
// stepping it every tick would while reading the same at any tick.
const _walkStride = 5

// _segment is how many walk steps one cached segment spans — a day of
// them. A segment is replayed whole the first time a step of it is read,
// so a query pays one replay per day it spans rather than one per sample.
// Where a segment ends is drawn in closed form rather than stepped to, so
// reaching a day a year out costs a draw per day, not a step per minute.
const _segment = 288

// _seedStride separates the random streams of two series whose segment
// numbers differ by one, so no two streams overlap.
const _seedStride = 1_000_003

// _epoch is the instant the demo timeline starts. It is fixed so that a
// tick always denotes the same moment, on every install and every run.
var _epoch = time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

// tickAt reports which tick covers the given instant.
func tickAt(t time.Time) int64 {
	return int64(t.Sub(_epoch) / _tick)
}

// tickAtMillis reports which tick covers the given millisecond instant.
func tickAtMillis(ms int64) int64 {
	return (ms - _epoch.UnixMilli()) / _tickMillis
}

// timeAt reports the instant the given tick starts at.
func timeAt(tick int64) time.Time {
	return _epoch.Add(time.Duration(tick) * _tick)
}

// latestTick reports the last tick the timeline has reached. Nothing past
// it is ever sampled: the demo has no more happened in the future than a
// real deployment has.
func latestTick() int64 {
	return tickAt(timeutil.Now())
}

// newRand returns the random stream the given seed and stream number
// name. Every segment of every series draws from its own stream, so a
// value never depends on which ticks were read before it.
func newRand(seed, stream int64) *rand.Rand {
	//nolint:gosec // demo data wants a cheap reproducible source, not a cryptographic one
	return rand.New(rand.NewSource(seed*_seedStride + stream))
}

// normal returns a sample from N(mean, stddev) via the Box-Muller
// transform.
func normal(r *rand.Rand, mean, stddev float64) float64 {
	u1 := r.Float64()
	u2 := r.Float64()
	z := math.Sqrt(-2.0*math.Log(u1)) * math.Cos(2.0*math.Pi*u2)

	return mean + stddev*z
}

// clamp returns x clamped to [lo, hi].
func clamp(x, lo, hi float64) float64 {
	if x < lo {
		return lo
	}

	if x > hi {
		return hi
	}

	return x
}

// countAt returns the count the given bucket reports at the given tick.
// A count is resampled from scratch every tick, so it needs no history.
func countAt(seed, tick int64, mean, relStdDev float64) float64 {
	v := math.Round(normal(newRand(seed, tick), mean, mean*relStdDev))
	if v < 0 {
		return 0
	}

	return v
}

// walkParams configures a gauge that evolves each tick via drift and mean
// reversion.
type walkParams struct {
	// Min is the lower bound of the gauge value.
	Min float64

	// Max is the upper bound of the gauge value.
	Max float64

	// Start is the value the walk begins at, at the epoch.
	Start float64

	// DriftPerStep is a constant added each tick, modelling a slow
	// linear trend. Mean reversion absorbs it, so the walk settles
	// around Target+DriftPerStep/MeanReversion rather than running away.
	DriftPerStep float64

	// NoiseStdDev is the standard deviation of the Gaussian noise added
	// each tick.
	NoiseStdDev float64

	// SpikeChance is the probability (0–1) of an additional spike
	// occurring on any given tick.
	SpikeChance float64

	// SpikeStdDev is the standard deviation of the spike magnitude when
	// one occurs.
	SpikeStdDev float64

	// MeanReversion is the fraction (0–1) of the distance to Target
	// pulled back each tick. It must be positive: the closed form the
	// segment endpoints are drawn from divides by it.
	MeanReversion float64

	// Target is the attractor value for mean reversion.
	Target float64
}

// walk replays a mean-reverting random walk. The value at a tick depends
// only on the walk's seed and the tick's distance from the epoch, never on
// which ticks were read before it — so every query sees the same history,
// and a line already drawn never rewrites itself.
type walk struct {
	// params govern the walk's drift, noise and mean reversion.
	params walkParams

	// seed distinguishes this walk's random streams from every other
	// series'.
	seed int64

	// mu guards checkpoints and segments.
	mu sync.Mutex

	// checkpoints holds the walk's value at the start of each segment,
	// grown on demand. Index i is the value at step i*_segment.
	checkpoints []float64

	// segments holds every step value of each segment a query has read,
	// keyed by segment number. Only the segments read are kept: a walk
	// spans a thousand of them since the epoch, and a chart reads one or
	// two.
	segments map[int64][]float64
}

// newWalk creates a fresh instance of walk.
func newWalk(seed int64, params walkParams) *walk {
	return &walk{
		params:   params,
		seed:     seed,
		segments: map[int64][]float64{},
	}
}

// at returns the walk's value at the given tick, interpolating between
// the two walk steps it falls between so a chart drawn at tick
// resolution is a line rather than a staircase.
func (w *walk) at(tick int64) float64 {
	if tick < 0 {
		tick = 0
	}

	step := tick / _walkStride

	from := w.atStep(step)
	if tick%_walkStride == 0 {
		return from
	}

	to := w.atStep(step + 1)

	return from + (to-from)*float64(tick%_walkStride)/_walkStride
}

// atStep returns the walk's value at the given step of its own clock.
func (w *walk) atStep(step int64) float64 {
	return w.segment(step / _segment)[step%_segment]
}

// segment returns the walk's value at every step of the given segment,
// replaying and caching it on first read.
func (w *walk) segment(n int64) []float64 {
	w.mu.Lock()
	defer w.mu.Unlock()

	if s, ok := w.segments[n]; ok {
		return s
	}

	// the stream's first draw is where the segment ends, the same draw
	// the checkpoint chain makes for it, so the segment lands exactly on
	// the checkpoint the next one starts from.
	start := w.checkpoint(n)
	r := newRand(w.seed, n)
	s := replay(start, endpoint(start, w.params, r), w.params, r)
	w.segments[n] = s

	return s
}

// checkpoint returns the walk's value at the first step of the given
// segment, computing and caching every segment before it that is not
// cached yet. The caller holds mu.
func (w *walk) checkpoint(segment int64) float64 {
	if len(w.checkpoints) == 0 {
		w.checkpoints = []float64{clamp(w.params.Start, w.params.Min, w.params.Max)}
	}

	for int64(len(w.checkpoints)) <= segment {
		last := int64(len(w.checkpoints)) - 1

		w.checkpoints = append(w.checkpoints, endpoint(
			w.checkpoints[last],
			w.params,
			newRand(w.seed, last),
		))
	}

	return w.checkpoints[segment]
}

// endpoint draws where a segment starting at v ends. Ignoring the clamp,
// a step is an AR(1) update with drift, so the value _segment steps on is
// normal with a closed-form mean and variance: the mean decays from v
// towards the level the walk settles at, and the variance accumulates the
// per-step noise — Gaussian plus the spike mixture — under that decay.
func endpoint(v float64, p walkParams, r *rand.Rand) float64 {
	keep := 1 - p.MeanReversion
	decay := math.Pow(keep, _segment)
	level := p.Target + p.DriftPerStep/p.MeanReversion
	stepVar := p.NoiseStdDev*p.NoiseStdDev + p.SpikeChance*p.SpikeStdDev*p.SpikeStdDev
	variance := stepVar * (1 - decay*decay) / (1 - keep*keep)

	return clamp(normal(r, level+(v-level)*decay, math.Sqrt(variance)), p.Min, p.Max)
}

// replay walks v through one segment and returns the value at every step:
// index 0 is v and index _segment is end. The steps follow the walk's own
// rule and are then tilted linearly so the last one lands on end, which
// keeps each segment continuous with the next.
func replay(v, end float64, p walkParams, r *rand.Rand) []float64 {
	vv := make([]float64, _segment+1)
	vv[0] = v

	for i := 1; i <= _segment; i++ {
		v = step(v, p, r)
		vv[i] = v
	}

	tilt := end - v

	for i := 1; i <= _segment; i++ {
		vv[i] = clamp(vv[i]+tilt*float64(i)/_segment, p.Min, p.Max)
	}

	return vv
}

// step advances v by one step of the walk.
func step(v float64, p walkParams, r *rand.Rand) float64 {
	v += p.MeanReversion * (p.Target - v)
	v += p.DriftPerStep + normal(r, 0, p.NoiseStdDev)

	if r.Float64() < p.SpikeChance {
		v += normal(r, 0, p.SpikeStdDev)
	}

	return clamp(v, p.Min, p.Max)
}
