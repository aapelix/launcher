/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import { Route, Router } from "@solidjs/router";

import Instances from "./pages/Instances";
import New from "./pages/New";

render(
  () => (
    <Router root={App}>
      <Route path="/" component={Instances} />
      <Route path="/new" component={New} />
    </Router>
  ),
  document.getElementById("root") as HTMLElement,
);
