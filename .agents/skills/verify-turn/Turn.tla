------------------------------- MODULE Turn -------------------------------
(*
 Model of the coil turn machine.
 True to the code (src/ledger.ts):
   - startTurn INSERTs a row with done = 0.
   - openTurn SELECTs the latest (max seq) done = 0 row.
   - finishTurn UPDATEs that row to done = 1.
 True to the code (src/thread.ts):
   - send() holds busy for the whole turn, so a second startTurn cannot
     interleave; a turn starts only when no turn is open.
   - If the run crashes mid-turn the row stays open; the NEXT send closes
     it from the recovered open row before starting its own turn.
 *)
EXTENDS Naturals, TLC

Max(S) == CHOOSE x \in S : \A y \in S : y <= x

CONSTANT MaxTurns

VARIABLES done, started

(*
 * The rows: seq numbers 1..started exist; Open is the open subset.
 *)
Open == {seq \in 1..started : seq \notin done}

Init == /\ done = {}
        /\ started = 0

(*
 * send() starts a turn. Refused while a turn is open (busy), so the code
 * never INSERTs a second open row.
 *)
StartTurn ==
  /\ Open = {}
  /\ started < MaxTurns
  /\ started' = started + 1
  /\ done' = done

(*
 * The turn finishes: the code closes exactly the open row.
 *)
FinishTurn ==
  /\ Open # {}
  /\ LET seq == Max(({s \in Open : TRUE} \union {0}))
     IN /\ done' = done \cup {seq}
        /\ started' = started

(*
 * A crashed run leaves its row open. The next send recovers it (closes it
 * with zero tools) and only then starts its own turn.
 *)
Recover ==
  /\ Open # {}
  /\ LET latest == Max(({s \in Open : TRUE} \union {0}))
     IN /\ done' = done \cup {latest}
        /\ started' = started

(*
 * The bounded history is exhausted and every turn is closed: the machine
 * is done. This stutter action marks the end state so NoDeadlock does
 * not fire on the capacity bound.
 *)
Done ==
  /\ started = MaxTurns
  /\ Open = {}
  /\ UNCHANGED <<done, started>>

Next == \/ StartTurn
       \/ FinishTurn
       \/ Recover
       \/ Done

Spec == Init /\ [][Next]_<<done, started>>

(*
 * The code's promises:
 *)
AtMostOneOpen ==
  Open = {} \/ \E x \in Open : \A y \in Open : y = x

OpenIsTheNewest ==
  Open # {} => Max(({s \in Open : TRUE} \union {0})) = started

FinishedMeansStarted ==
  \A seq \in done : seq <= started

=========================================================================
