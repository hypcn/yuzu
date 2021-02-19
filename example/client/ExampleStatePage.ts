import m from "mithril";
import { Subscription } from "rxjs";
import { UI_STATE } from "../shared/ui-state-definition";
import { state } from "./ui-state";

// Example Mithril page component
export const ExampleStatePage: m.Component<{}, {
  sub: Subscription,
}> = {

  oninit() {
    this.sub = new Subscription();

    // Listen to changes on a state key
    this.sub.add(state.listen("shades", (shades) => console.log("shades updated")));

    // Listen to changes on ALL state keys
    this.sub.add(state.listenAll((key, value) => {
      console.log(`State key "${key}" updated, redrawing...`);
      m.redraw();
    }));
  },

  onremove() {
    // Clean up listeners when they are finished with
    this.sub.unsubscribe();
  },

  view() {
    return m("", [
      m("h1", "UI State Example Page"),

      // Read state using key strings
      m("h2", "Shade Status:"),
      state.get("shades").map(s => {
        const alertMsg = s.alerts.length > 0 ? s.alerts.join(", ") : "no alerts";
        return m("p", `Shade ${s.id}: ${s.statusName} @${s.position}% (${alertMsg})`);
      }),

      // (Optional) Read state using state keys object
      m("p", `Fixture ABC123 alerts: ${state.get(UI_STATE.fixtures)
        .filter(f => f.id === "abc123")
        .map(f => `${f.alerts}`)}`),
    ]);
  }

};