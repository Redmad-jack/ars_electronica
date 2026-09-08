import "./style.css";

// Keep camera and actuator clients out of the exhibition boot path.
if (new URLSearchParams(location.search).get("view") === "exhibition") {
  await import("./exhibition/main");
} else {
  await import("./debug-main");
}
