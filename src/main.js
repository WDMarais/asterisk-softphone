// Entry point. Mounts the registration screen (Phase B slice 1). Call handling
// and the broker /events feed are wired in subsequent slices.
import "./ui/styles.css";
import { defaultConfig } from "./config";
import { mountRegistration } from "./ui/registration";
const app = document.querySelector("#app");
if (app)
    mountRegistration(app, defaultConfig);
