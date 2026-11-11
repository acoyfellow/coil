export const title = "Coil live event inference";

const st = (v) => {
  const started = v.started.length;
  const done = v.ended.length;
  if (started === 0) return "Nothing running";
  if (done < started) return "Tools running";
  return "Tools finished";
};

export const state = st;

export const group = (v) =>
  v.ended.length < v.started.length ? "active" : v.started.length === 0 ? "idle" : "active";

export const colors = { active: "blue", idle: "orange", bad: "purple" };

export const step = (action, from, to) =>
  ({
    Start: "a tool call starts",
    Output: "tool output streams",
    End: "the tool ends",
    Attach: "the viewer attaches",
  })[action] ?? action;
