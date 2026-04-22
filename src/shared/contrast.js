(function () {
  "use strict";
  window.FT = window.FT || {};

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function relLuminance([r, g, b]) {
    const toLin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  }

  // WCAG threshold 0.179 keeps mid-saturation colors readable.
  function textColorFor(bgHex) {
    const rgb = hexToRgb(bgHex);
    if (!rgb) return "#1c1e21";
    return relLuminance(rgb) > 0.179 ? "#1c1e21" : "#ffffff";
  }

  window.FT.contrast = { textColorFor, hexToRgb, relLuminance };
})();
