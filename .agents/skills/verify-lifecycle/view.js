export const title = "Coil thread lifecycle";

const lifecycleOf = (v) =>
  v.compacting ? "compacting" : v.busy ? "working" : v.wakeError ? "failed" : v.phase;

const label = (s) =>
  ({
    new: "New",
    awake: "Awake",
    paused: "Paused",
    working: "Working",
    compacting: "Compacting",
    failed: "Wake failed",
  })[s] ?? s;

export const state = (v) => label(lifecycleOf(v));

export const group = (v) =>
  lifecycleOf(v) === "failed" ? "bad" : lifecycleOf(v) === "paused" || lifecycleOf(v) === "new" ? "idle" : "active";

export const colors = { active: "blue", idle: "orange", bad: "purple" };

export const step = (action, from, to) =>
  ({
    BootOK: "container boots",
    BootFail: "boot fails",
    StartWork: "you send a message",
    FinishWork: "the turn ends",
    StartCompact: "context compacts",
    EndCompact: "compaction done",
    Pause: "thread sleeps (idle)",
  })[action] ?? action;
