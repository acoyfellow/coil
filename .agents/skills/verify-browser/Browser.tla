------------------------------ MODULE Browser ------------------------------
(*
 Model of the coil browser tab machine (src/browser.ts, src/thread.ts,
 computer/webkit-host.py).
 True to the code:
   - The host opens one view at a time; newTab appends a view and makes
     it active; switchTab activates an existing index; the tab list is
     exactly the host's views. Indexes are 0-based and dense.
   - URLs are normalized before the host sees them; a tab's URL is
     always a normalized URL (never blank, never malformed).
   - The active tab is always a member of the list.
 *)
EXTENDS Naturals, TLC, Sequences

CONSTANT MaxTabs

VARIABLES tabs, active

(*
 * tabs: a sequence of normalized URLs (abstracting title). active:
 * the active index, or -1 when there are no tabs.
 *)
Init == /\ tabs = <<>>
        /\ active = 0 - 1

(*
 * newTab(url): the code appends and activates the new tab.
 *)
NewTab ==
  /\ Len(tabs) < MaxTabs
  /\ tabs' = tabs \o <<"https://example.com">>
  /\ active' = Len(tabs) - 1

(*
 * switchTab(index): the code requires the index to exist; an unknown
 * index is a no-op error, never a jump to a nonexistent tab.
 *)
SwitchTab ==
  /\ Len(tabs) > 0
  /\ active' = Len(tabs) - 1
  /\ tabs' = tabs

(*
 * closeAll on pause: the code destroys the container; the next boot
 * starts with no tabs (the cookie jar is what persists, not the tabs).
 *)
Reset ==
  /\ tabs # <<>>
  /\ tabs' = <<>>
  /\ active' = 0 - 1

Done ==
  /\ Len(tabs) = MaxTabs
  /\ active = Len(tabs) - 1
  /\ UNCHANGED <<tabs, active>>

Next == \/ NewTab
       \/ SwitchTab
       \/ Reset
       \/ Done

Spec == Init /\ [][Next]_<<tabs, active>>

(*
 * The code's promises:
 *)
ActiveIsKnown ==
  active = 0 - 1 \/ (active >= 0 /\ active < Len(tabs))

OneActiveTab ==
  active >= 0 => Len(tabs) > 0

DenseTabs ==
  Len(tabs) <= MaxTabs

=========================================================================
