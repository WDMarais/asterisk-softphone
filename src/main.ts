// Entry point and composition root. Mounts the registration screen (Phase B
// slice 1) and chooses the RegistrationClient: the real sip.js-backed SipUa, or
// the PBX-free MockSipUa when VITE_PBX_MOCK=1. Call handling and the broker
// /events feed are wired in subsequent slices.
//
// isMock is a build-time constant (VITE_PBX_MOCK is inlined by Vite), so in a
// real build the mock branch is dead code and MockSipUa is tree-shaken out.

import "./ui/styles.css";
import { defaultConfig, isMock } from "./config";
import { mountApp } from "./ui/appShell";
import { SipUa, type PhoneClientFactory } from "./sip/ua";
import { MockSipUa } from "./sip/mockUa";

const makeClient: PhoneClientFactory = isMock
  ? (config, onOutcome) => new MockSipUa(config, onOutcome)
  : (config, onOutcome) => new SipUa(config, onOutcome);

const app = document.querySelector<HTMLDivElement>("#app");
if (app) mountApp(app, defaultConfig, makeClient);
