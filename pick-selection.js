(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipPickSelection = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function mergePickSelection(selected, target) {
    if (!target) return selected.slice();

    if (selected.some((item) => item === target || item.contains(target))) {
      return selected.slice();
    }

    return selected
      .filter((item) => !target.contains(item))
      .concat(target);
  }

  return { mergePickSelection };
});
