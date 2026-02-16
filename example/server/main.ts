import { Server } from "http";
import { YuzuService } from "./server-ui-state";

const PORT = 3000;

const USE_EXISTING_SERVER = true;

/**
 * Simple example HTTP server to use for the server's UI state websocket server
 */
const server = USE_EXISTING_SERVER ? new Server((req, res) => {
  console.log(`Req: ${req.headers.origin}`);

  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.writeHead(200);
  res.end("Hello, World!");
}) : undefined;


// ===== Binding Example =====

const yuzuSvc = new YuzuService({ server, port: PORT });
// YuzuServer(UI_STATE, { httpServer: server });

function getAlerts() {

  const isErr = Math.random() < 0.1;
  if (!isErr) return [];

  const errors = [
    "under voltage",
    "over voltage",
    "under temp",
    "over temp",
    "unknown error",
  ];
  const error = errors[Math.floor(Math.random() * errors.length)];

  return [error];
}

/** Get a rendom percentage integer */
function getPc() {
  return Math.round(Math.random() * 100);
}

function updateShades() {

  yuzuSvc.updateShadeStatus("shade1", {
    id: "shade1", statusName: "stopped", position: getPc(), alerts: getAlerts(),
  });
  yuzuSvc.updateShadeStatus("shade2", {
    id: "shade2", statusName: "stopped", position: getPc(), alerts: getAlerts(),
  });
  yuzuSvc.updateShadeStatus("shade3", {
    id: "shade3", statusName: "stopped", position: getPc(), alerts: getAlerts(),
  });

  setTimeout(() => {
    updateShades();
  }, 10 + Math.random() * 1_000);
}
updateShades();

function updateFixtures() {

  yuzuSvc.updateFixture("1", { id: "1", brightness: getPc(), alerts: getAlerts() });
  yuzuSvc.updateFixture("2", { id: "2", brightness: getPc(), alerts: getAlerts() });
  yuzuSvc.updateFixture("3", { id: "3", brightness: getPc(), alerts: getAlerts() });
  yuzuSvc.updateFixture("4", { id: "4", brightness: getPc(), alerts: getAlerts() });
  yuzuSvc.updateFixture("5", { id: "5", brightness: getPc(), alerts: getAlerts() });
  yuzuSvc.updateFixture("6", { id: "6", brightness: getPc(), alerts: getAlerts() });

  setTimeout(() => {
    updateFixtures();
  }, 5_000 + Math.random() * 5_000);
}
updateFixtures();


if (USE_EXISTING_SERVER) {
  server?.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}
