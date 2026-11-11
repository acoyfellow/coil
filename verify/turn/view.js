export const title = "Coil turn machine";

const open = (v) => {
  const started = v.started;
  const done = new Set(v.done);
  const open = [];
  for (let s = 1; s <= started; s++) if (!done.has(s)) open.push(s);
  return open;
};

export const state = (v) => {
  const o = open(v);
  if (o.length === 0) return v.started === 0 ? "No turn yet" : "All turns closed";
  return o.length === 1 ? "Turn open" : "Two turns open";
};

export const group = (v) =>
  open(v).length > 1 ? "bad" : open(v).length === 1 ? "active" : "idle";

export const colors = { active: "blue", idle: "orange", bad: "purple" };

export const step = (action, from, to) =>
  ({
    StartTurn: "you send a message",
    FinishTurn: "the turn ends",
    Recover: "a crashed turn is closed",
    Done: "done",
  })[action] ?? action;
