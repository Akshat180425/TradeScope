export function random(state) {
  state.rng = (Math.imul(1664525, state.rng) + 1013904223) >>> 0;
  return (state.rng + 1) / 4294967297;
}
export function normal(state) {
  return Math.sqrt(-2 * Math.log(random(state))) * Math.cos(2 * Math.PI * random(state));
}
