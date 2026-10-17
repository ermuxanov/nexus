// Each domain owns its gate. Only the most recent request may update its state.
export function createLatestRequest() {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    isCurrent(token) {
      return token === generation;
    },
  };
}
