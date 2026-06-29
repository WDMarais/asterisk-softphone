// App shell — the first-principles desktop layout (region model in PLAN.md):
//   ┌ banner ─────────────────────────┐   alerts: §2.7 banner / toast / dismissable
//   │ rail    │  stage     │ context  │   rail = call list · stage = active call/dialer
//   │ presence│ (stage…)   │ (context)│   context = linked record + notes
//   └─────────┴────────────┴──────────┘   presence = identity + availability (bottom-left)
//
// Regions are honest placeholders for now; each fills in as its slice lands.
// The registration/availability controls already exist, so they're mounted into
// the presence region — everything else is a labelled stub. The grid + responsive
// reflow live in styles.css (.app-shell / .region--*).

import { mountRegistration } from "./registration";
import type { PhoneClientFactory } from "../sip/ua";
import type { SoftphoneConfig } from "../config";

export function mountApp(
  root: HTMLElement,
  config: SoftphoneConfig,
  makeClient: PhoneClientFactory,
): void {
  root.innerHTML = `
    <div class="app-shell">
      <header class="region region--banner" aria-label="Alerts">
        <span class="region__tag">banner</span>
        <span class="region__note">notifications — banner / toast / dismissable (§2.7)</span>
      </header>

      <nav class="region region--rail" aria-label="Activity">
        <span class="region__tag">activity</span>
        <div class="placeholder">Call list — active + recent, grouped by linkedid</div>
      </nav>

      <main class="region region--stage" aria-label="Call">
        <span class="region__tag">call stage</span>
        <div class="placeholder placeholder--lead">
          No active call
          <small>dialer (type a number, Enter) and in-call controls land here</small>
        </div>
      </main>

      <aside class="region region--context" aria-label="Context">
        <span class="region__tag">context</span>
        <div class="placeholder">Linked record (screen-pop) + notes / disposition</div>
      </aside>

      <section class="region region--presence" id="presence" aria-label="Presence"></section>
    </div>
  `;

  const presence = root.querySelector<HTMLElement>("#presence");
  if (presence) mountRegistration(presence, config, makeClient);
}
