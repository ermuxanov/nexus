// Library slots use NEXUS classes so SCSS owns the visual contract in both themes.
export const uiConfig = {
  select: {
    slots: {
      base: "nexus-select",
      content: "nexus-select-menu",
      viewport: "nexus-select-viewport",
      item: "nexus-select-option",
      itemTrailingIcon: "nexus-select-check",
    },
  },
  slider: {
    slots: {
      root: "nexus-slider",
      track: "nexus-slider-track",
      range: "nexus-slider-range",
      thumb: "nexus-slider-thumb",
    },
  },
  tooltip: { slots: { content: "nexus-tooltip" } },
};
