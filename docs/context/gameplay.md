# Gameplay

Scope: game rules, design meaning, progression, scoring semantics, and bot
behavior. Server implementation → [backend.md](./backend.md). Wire contract →
[networking.md](./networking.md). `Game_Config.js` owns current tuning values;
this document owns what the knobs mean.

## Core loop

Corp Tower is a three-player real-time selfish-cooperation puzzle. Players race
for individual score and MVP while building one shared tower. Each receives
server-assigned bricks, places on a shared grid, refills from one shared draw
pile, and waits through a personal placement cooldown.

The level ends when the target is reached or a failure condition fires. Useful
height is finite and individually claimed, but every player must satisfy their
own contribution requirement at an Impact checkpoint. One player's surplus
cannot cover another's deficit, so selfish scoring and team survival remain in
tension.

Reconnect resumes the same seat and authoritative room during the server TTL.
The client offers drag placement plus an accessibility tap-select, aim, and
confirm flow; both submit the same server placement intent.

## Bricks and supply

Five four-cell shapes are available from the start. Orientation is randomized
when dealt and cannot be rotated by the player. A brick's effective height comes
from its dealt cells, not its shape name or cell count. Early levels expose two
hand slots and later levels three; the next shared draw is visible and goes to
the next player who places.

Every level combines successful carry-over with a generated reserve. Reserve
size derives from target height, placeable width, brick geometry, and expected
packing efficiency, so tuning those systems cannot leave a stale supply table.
Early levels have surplus and later coverage tightens. Successful levels carry
unused bricks precision-first; failure discards carry-over.

Opening hands obey solvability constraints. The impossible-height failure uses
the optimistic physical height remaining and is deferred while any player holds
a Replenish capable of rescuing supply.

## Power

Power and the shared side quest unlock with normal play. The active quest rewards
the first exact-finishing player with Replenish. Earned inventory persists within
the current Impact band and is restored from its checkpoint snapshot on rollback,
preventing failed-attempt farming.

Activation is instant, has no target, affects the room including the caster, and
is blocked by a shared cooldown and the final moments of a level. Replenish adds
fresh bricks to the shared pile without disturbing the visible next draw. Other
implemented effects remain inactive tuning options rather than normal play.

## Tower and placement

Target height grows without a cap. The placeable site widens from that target,
is clamped to the visible tower grid, forced even, and centered. Height and
footprint therefore evolve from one curve rather than independent tables. A
brick's entire footprint must stay inside the site.

A snapped row is where the brick is released, not necessarily where it rests.
Gravity still resolves first contact, so players can aim into reachable gaps and
unsupported aims fall instead of floating. Overhangs are legal and are the main
surface for the stability mechanic. Overbuilding is allowed but excess height is
wasted and exact-finish rewards are lost.

The client renders authoritative tower blocks and a presentation-only structural
pose. Pose never changes legality, snapping, scoring, or collapse.

### Stability

The support graph produces Balance and Integrity; tower stability is the weaker
of them. Balance measures lean against a contact span. Integrity measures whether
contact width and independent paths can carry the load, so a centered bottleneck
can fail without a false directional warning.

`towerStabilityDifficulty` is the single gameplay stability dial. It interpolates
forgiving and harsh behavior while height and maturity pressure let openings
survive and weak load-bearing interfaces become dangerous later. Directly
repairing a weak interface can reduce risk, earn structural value, and qualify
for a capped Critical Save.

## Time, failure, and progression

The round clock derives from target height, expected human packing efficiency,
players, cooldown, and a level-dependent slack curve. It grows with the tower
rather than using a flat duration. The reconnect TTL is independent, so long
late-game rounds can outlast a disconnected player's recovery window.

A level fails when its Timer expires, an Impact contribution checkpoint is
unmet, supply is exhausted, or the remaining bricks cannot reach the target.
Replenish can defer the insufficient-supply check while it can still rescue the
run. Collapse and lost height alone do not fail. Quick chat is a small fixed
template set with a server-authoritative per-player cooldown.

Each Impact band begins at a secured checkpoint. Failure replays the active band
from its saved score, eligible contribution, and Power inventory while retaining
the retry count. Securing the next checkpoint is the only reset. Exhausting the
budget enters terminal game over and returns players Home after the summary.

## Scoring and contribution

Every settled brick produces one authoritative placement transaction. Rows above
the level's historical maximum earn Height once; rebuilt lost rows earn one-time
Recovery at the configured share. Risk at the placed brick's component peak
discounts both. Every direct surviving repair on the active tallest tower earns
Reinforce; repairs to other components do not. A mature rescue may add a
single-use Critical Save. Any placement that drops a brick earns no placement or
Impact points. Height, Recovery, Critical Save, then Reinforce share the cap.

Only capped useful placement components count toward Impact contribution.
Completion, MVP, exact-finish, Power, and other display-score bonuses do not.
Level score banks only on success, while the server's `impactScoreStatus` combines
banked and live eligible contribution exactly once. Clients, bots, and tools use
that status rather than reconstructing it from score totals.

The checkpoint requirement is the greater of a flat floor and each player's
configured share of the expected normal useful pool across the band. It is a
personal requirement, not a team total or an expected stability-adjusted payout.

## Debug tuning

The debug menu changes live server configuration and receives the clamped
authoritative snapshot. It is a tuning surface, not a second rules engine.
Client-only presentation controls remain local; synchronized cosmetic state that
all players must see travels through the server. Public release still requires
server-side admin authorization for debug writes.

The most coupled tuning surfaces are stability difficulty, personal Impact
share, and site slenderness. Geometry changes require a balance pass because they
simultaneously change reachability, support width, supply efficiency, and the
scorable height pool.

Last Chance is debug-only: it rescues one collapsing placement into a pending
one-percent state and requires the next placement to recover.

## Bot behavior

Bots exist for QA and demos, not as production authority. They choose brick and
placement together by asking the engine what each candidate would score. Ranking
by height alone makes zero-height structural repairs unreachable.

MVP-greedy takes the best non-collapsing personal transaction. Cooperative play
first stays near the best available stability, then maximizes authoritative
score. After meeting its own Impact share it prefers a useful repair and may wait
so a short teammate can claim scarce height. It reads canonical Impact status,
not display score.

Because candidate selection rejects collapse, simulated bot collapse rate cannot
calibrate stability. Use stability distributions, contribution outcomes, and
human playtests for messy gap-filling behavior.
