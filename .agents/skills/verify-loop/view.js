export const title = "Coil loop machine";

const decision = (v) =>
  !v.enabled
    ? "stop"
    : v.stopped
      ? "stop"
      : v.busy
        ? "wait"
        : v.gatePending
          ? "check-gate"
          : v.runs >= 3
            ? "stop"
            : "run";

const label = (s) =>
  ({ run: "Run", wait: "Wait", "check-gate": "Check gate", stop: "Stopped" })[s] ?? s;

export const state = (v) => label(decision(v));

export const group = (v) =>
  decision(v) === "stop" ? "bad" : decision(v) === "wait" ? "idle" : "active";

export const colors = { active: "blue", idle: "orange", bad: "purple" };

export const step = (action, from, to) =>
  ({
    StartRun: "the loop starts a run",
    FinishRun: "the run ends",
    CheckGate: "the gate is checked",
    Disable: "you stop the loop",
    Done: "done",
  })[action] ?? action;
