---------------------------- MODULE Lifecycle ----------------------------
(*
 Model of the coil thread lifecycle machine.
 True to the code:
   - src/ledger.ts: Phase = 'new' | 'awake' | 'paused'; busy, compacting,
     wakeError are coil_kv flags.
   - src/lifecycle.ts: lifecycleOf({phase,busy,compacting,wakeError}):
       compacting -> "compacting"; busy -> "working";
       wakeError != "" -> "failed"; else phase.
   - src/thread.ts compact() refuses while busy; compactNow holds
     serialized() and pause() also serializes, so the two never interleave.
   - src/thread.ts send() sets busy immediately and does NOT serialize
     against compactNow, so a turn can start during a manual compaction.
 *)
EXTENDS Naturals, TLC

VARIABLES phase, busy, compacting, wakeError

Phase == {"new", "awake", "paused"}

State == IF compacting THEN "compacting"
         ELSE IF busy THEN "working"
         ELSE IF wakeError THEN "failed"
         ELSE phase

Init == /\ phase = "new"
        /\ busy = FALSE
        /\ compacting = FALSE
        /\ wakeError = FALSE

(*
 * Boot the container. In code this is awakeInsideLifecycle: it boots the
 * container, warms the browser, then sets phase := 'awake' and clears
 * wakeError. A failed boot sets wakeError and leaves phase unchanged.
 *)
BootOK ==
  /\ phase # "awake"
  /\ phase' = "awake"
  /\ wakeError' = FALSE
  /\ UNCHANGED <<busy, compacting>>

BootFail ==
  /\ phase # "awake"
  /\ wakeError' = TRUE
  /\ UNCHANGED <<phase, busy, compacting>>

(*
 * A message arrives and the agent starts a turn (src/thread.ts send sets
 * busy := true). The thread must be awake first; the code wakes it inline.
 *)
StartWork ==
  /\ phase = "awake"
  /\ busy' = TRUE
  /\ UNCHANGED <<phase, compacting, wakeError>>

FinishWork ==
  /\ busy
  /\ busy' = FALSE
  /\ UNCHANGED <<phase, compacting, wakeError>>

(*
 * Manual compaction (src/thread.ts compactNow). Refused while busy, and it
 * holds serialized() until compacting := false, so Pause cannot interleave.
 *)
StartCompact ==
  /\ ~ busy
  /\ compacting' = TRUE
  /\ busy' = busy
  /\ UNCHANGED <<phase, wakeError>>

EndCompact ==
  /\ compacting
  /\ compacting' = FALSE
  /\ busy' = busy
  /\ UNCHANGED <<phase, wakeError>>

(*
 * Pause: the code snapshots the computer, records the pair, destroys the
 * container, and raises phase := 'paused'. It refuses while busy, and its
 * serialized() usage excludes a concurrent compactNow, so it cannot fire
 * while compacting.
 *)
Pause ==
  /\ phase = "awake"
  /\ ~ busy
  /\ ~ compacting
  /\ phase' = "paused"
  /\ UNCHANGED <<busy, compacting, wakeError>>

Next == \/ BootOK
       \/ BootFail
       \/ StartWork
       \/ FinishWork
       \/ StartCompact
       \/ EndCompact
       \/ Pause

Spec == Init /\ [][Next]_<<phase, busy, compacting, wakeError>>

(*
 * The promises the code makes:
 *)
WorkingMeansActive ==
  State = "working" => busy

FailedMeansWakeError ==
  State = "failed" => (wakeError /\ ~ busy /\ ~ compacting)

PausedMeansIdle ==
  phase = "paused" => (State = "paused" \/ State = "failed")

NoWorkWhileAsleep ==
  phase = "paused" => State # "working"

(*
 * Reachable in code: a send during a manual compaction sets busy while
 * compacting is still true, and lifecycleOf prefers "compacting", so the
 * working truth is hidden behind the compaction label.
 *)
BusyAndCompactingCoexist ==
  (busy /\ compacting) => State = "compacting"

=========================================================================
