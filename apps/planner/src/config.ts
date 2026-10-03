/** Static planner constants (ADR-0020). */
import { PLAN_IMPORT_PATH } from "@/lib/plan-document/pending";
import { DEFAULT_HOSTED_URL } from "../build-config";

/** The hosted platform. Set at build from OPENLEAGUE_HOSTED_URL; the default under tests. */
export const HOSTED_URL: string =
    typeof __OPENLEAGUE_HOSTED_URL__ === "string" ? __OPENLEAGUE_HOSTED_URL__ : DEFAULT_HOSTED_URL;

/** Where "Open in OpenLeague" sends a plan (the signed-in import page, sub-project 1). */
export const HOSTED_IMPORT_URL = `${HOSTED_URL}${PLAN_IMPORT_PATH}`;

/** The static app has one implicit "team": this browser. The store ignores teamId. */
export const LOCAL_TEAM_ID = "local";
export const LOCAL_TEAM_NAME = "This device";
export const LOCAL_AUTHOR_NAME = "You";

export const PRIVACY_NOTE =
    "Your practices stay in this browser. Nothing is uploaded, and there's no account or tracking. " +
    "Browsers can clear site data, so download plan files to keep a backup. " +
    "Fonts load from Fontshare and Google Fonts, which see your IP address like any website.";
