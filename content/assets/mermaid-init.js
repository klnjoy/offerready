// Give Mermaid diagrams a cleaner look that fits the OfferReady navy/green brand.
// Material loads mermaid; we just tweak defaults if it's available.
document.addEventListener("DOMContentLoaded", function () {
  if (window.mermaid && window.mermaid.initialize) {
    try {
      window.mermaid.initialize({
        theme: "base",
        themeVariables: {
          primaryColor: "#eef3fa",
          primaryBorderColor: "#16305c",
          primaryTextColor: "#0c1c38",
          lineColor: "#1a9e64",
          fontFamily: "Inter, system-ui, sans-serif",
        },
        flowchart: { curve: "basis", htmlLabels: true },
      });
    } catch (e) {
      /* non-fatal */
    }
  }
});
