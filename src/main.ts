// Entry point. UI wiring lands in Phase B (src/ui/) once the SIP.js UA and the
// FSM are in place. For now this is just a placeholder mount point so the Vite
// dev server has something to serve.

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.textContent = "asterisk-softphone — scaffold up. Logic lands next.";
}
