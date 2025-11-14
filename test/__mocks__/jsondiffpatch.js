module.exports = {
  diff: () => undefined,
  clone: value => JSON.parse(JSON.stringify(value)),
  patch: () => undefined,
};
