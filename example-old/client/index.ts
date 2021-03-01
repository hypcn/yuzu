import m from "mithril";
import { ExampleStatePage } from "./ExampleStatePage";

m.route(document.body, "/", {
  "/": ExampleStatePage,
});
