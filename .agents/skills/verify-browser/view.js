export const title = "Coil browser tabs";

const count = (v) => Object.keys(v.tabs).length;

export const state = (v) => {
  const n = count(v);
  if (n === 0) return "No tabs";
  if (n === 1) return "One tab";
  return n + " tabs";
};

export const group = (v) => (count(v) === 0 ? "idle" : "active");

export const colors = { active: "blue", idle: "orange", bad: "purple" };

export const step = (action, from, to) =>
  ({
    NewTab: "open a tab",
    SwitchTab: "switch tab",
    Reset: "tabs reset (restart)",
    Done: "done",
  })[action] ?? action;
