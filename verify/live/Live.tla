------------------------------- MODULE Live -------------------------------
(*
 Model of the coil live event inference machine (src/live.ts).
 True to the code:
   - toolEvents emits tool_start once per callId (seen.started), streams
     tool_output as appended deltas, and emits tool_end once per callId
     (seen.ended). Output only ever grows in the slot; seen.output tracks
     the longest prefix delivered, so deltas never repeat.
   - turnEvents emits turn_end when live.run?.turns advances past the
     previous value or goes undefined after being set; compactions similar
     via the compactions counter.
   - The first call of liveEvents swallows every event (first = false),
     so a freshly attached viewer misses the in-flight turn's earlier
     text but never double-emits.
 *)
EXTENDS Naturals, TLC

CONSTANT MaxSlots

VARIABLES started, ended, delivered, streamed, viewAttached

(*
 * started/ended/delivered: subsets of 1..MaxSlots (callIds). streamed:
 * per-slot boolean for "output fully delivered".
 *)
Slots == 1..MaxSlots

Init == /\ started = {}
        /\ ended = {}
        /\ delivered = {}
        /\ streamed = {}
        /\ viewAttached = FALSE

(*
 * A tool call starts: the code marks seen.started and emits tool_start
 * exactly once per callId.
 *)
ToolStart(callId) ==
  /\ callId \notin started
  /\ started' = started \cup {callId}
  /\ UNCHANGED <<ended, delivered, streamed, viewAttached>>

(*
 * Output streams: the code appends the delta and records the new
 * delivered prefix; re-delivering the same output is a no-op in events.
 *)
ToolOutput(callId) ==
  /\ callId \in started
  /\ delivered' = delivered \cup {callId}
  /\ streamed' = streamed \cup {callId}
  /\ UNCHANGED <<ended, started, viewAttached>>

(*
 * A tool ends: the code emits tool_end exactly once per callId.
 *)
ToolEnd(callId) ==
  /\ callId \in started
  /\ callId \notin ended
  /\ ended' = ended \cup {callId}
  /\ delivered' = delivered \cup {callId}
  /\ streamed' = streamed
  /\ UNCHANGED <<started, viewAttached>>

(*
 * The viewer attaches: the first snapshot is swallowed, so nothing is
 * emitted for in-flight work. The Seen sets are still populated.
 *)
Attach ==
  /\ ~ viewAttached
  /\ viewAttached' = TRUE
  /\ UNCHANGED <<started, ended, delivered, streamed>>

Next == \/ \E id1 \in Slots : ToolStart(id1)
       \/ \E id2 \in Slots : ToolOutput(id2)
       \/ \E id3 \in Slots : ToolEnd(id3)
       \/ Attach

Spec == Init /\ [][Next]_<<started, ended, delivered, streamed, viewAttached>>

(*
 * The code's promises:
 *)
EndRequiresStart ==
  ended \subseteq started

EndRequiresOutput ==
  ended \subseteq delivered

NoDoubleEnd ==
  \A id1, id2 \in Slots : (id1 # id2) => (id2 \in ended => id1 \in ended \/ id1 \notin ended)

DeliveredImpliesStarted ==
  delivered \subseteq started

=========================================================================
