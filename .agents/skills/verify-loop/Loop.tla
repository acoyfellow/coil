------------------------------- MODULE Loop -------------------------------
(*
 Model of the coil loop machine.
 True to the code (src/loop.ts):
   - decide(loop, now, cost, busy, ownerSpend, ownerLimit) is a pure
     transition function: stop beats everything, then wait (busy or
     nextAt in the future), then check-gate (previous run unevaluated),
     then stop at maxRuns, else run.
 True to the code (src/thread.ts):
   - loopStep runs only when loop.enabled and not busy (guard before the
     alarm), a started run flips busy for the turn, and the alarm rearms
     the next decision.
 *)
EXTENDS Naturals, TLC

CONSTANT MaxRuns

VARIABLES enabled, runs, busy, gatePending, stopped

Decision ==
  IF ~ enabled THEN "stop"
  ELSE IF stopped THEN "stop"
  ELSE IF busy THEN "wait"
  ELSE IF gatePending THEN "check-gate"
  ELSE IF runs >= MaxRuns THEN "stop"
  ELSE "run"

Init == /\ enabled = TRUE
        /\ runs = 0
        /\ busy = FALSE
        /\ gatePending = FALSE
        /\ stopped = FALSE

(*
 * A run starts: busy flips for the turn.
 *)
StartRun ==
  /\ enabled
  /\ ~ busy
  /\ ~ gatePending
  /\ runs < MaxRuns
  /\ busy' = TRUE
  /\ gatePending' = gatePending
  /\ UNCHANGED <<enabled, runs, stopped>>

(*
 * The turn ends: busy clears; the finished run arms exactly one gate
 * check (the code records gateExit = null until evaluated).
 *)
FinishRun ==
  /\ busy
  /\ busy' = FALSE
  /\ runs' = runs + 1
  /\ gatePending' = TRUE
  /\ UNCHANGED <<enabled, stopped>>

CheckGate ==
  /\ gatePending
  /\ gatePending' = FALSE
  /\ UNCHANGED <<enabled, runs, busy, stopped>>

(*
 * The manual stop (user disables): enabled clears and the machine stops.
 *)
Disable ==
  /\ enabled
  /\ enabled' = FALSE
  /\ stopped' = TRUE
  /\ UNCHANGED <<runs, busy, gatePending>>

(*
 * Terminal: the bounded history is exhausted with every gate checked.
 * Stutter action so NoDeadlock does not fire on the end state.
 *)
Done ==
  /\ (runs = MaxRuns \/ stopped)
  /\ ~ gatePending
  /\ UNCHANGED <<enabled, runs, busy, gatePending, stopped>>

Next == \/ StartRun
       \/ FinishRun
       \/ CheckGate
       \/ Disable
       \/ Done

Spec == Init /\ [][Next]_<<enabled, runs, busy, gatePending, stopped>>

(*
 * The code's promises:
 *)
NeverRunsWhileBusy ==
  Decision = "run" => ~ busy

GateCheckedExactlyOnce ==
  gatePending => ~ busy

StopIsTerminal ==
  (~ enabled \/ stopped) => Decision = "stop"

BoundedRuns ==
  runs <= MaxRuns

=========================================================================
