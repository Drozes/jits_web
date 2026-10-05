/**
 * Angle rows from the server (jits-n2im.12): COPY-DECK v2.2 section 2 strings,
 * the local job winning for "Your angle", and nothing playable before bytes.
 */
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import {
  ANGLE_TAG,
  angleCounts,
  angleOwnerName,
  angleRowA11yLabel,
  angleStatus,
  angleWatchable,
  localAngleJob,
} from "@/lib/video/angle-status";

function v(over: Partial<MatchDetailVideo> = {}): MatchDetailVideo {
  return {
    id: "v1",
    uploaded_by: "opp",
    uploaded_by_name: "Dee Okafor",
    status: "ready",
    playability: "playable",
    duration_seconds: 360,
    camera_angle: null,
    has_analysis: false,
    is_mine: false,
    angle_label: "Dee Okafor's recording",
    poster_url: null,
    ...over,
  };
}

const CTX = { name: "D. Okafor" };
const LONG_DASH = new RegExp(String.fromCharCode(8212));

it("another athlete's upload shows Uploading with the heartbeat percent", () => {
  const s = angleStatus(
    v({ status: "uploading", playability: "processing", upload_bytes_confirmed: 42, upload_bytes_total: 100, upload_in_flight: true }),
    CTX,
  );
  expect(s).toEqual({ tag: "Uploading", tone: "progress", right: "42%", percent: 42, helper: null });
});

it("Uploading with no total yet shows no percent", () => {
  const s = angleStatus(v({ status: "uploading", playability: "processing" }), CTX);
  expect(s.tag).toBe("Uploading");
  expect(s.right).toBeNull();
});

it("an upload the server has not heard from is Paused, with the deck's no-blame helper", () => {
  const s = angleStatus(
    v({ status: "uploading", playability: "processing", upload_in_flight: false, upload_bytes_confirmed: 10, upload_bytes_total: 100 }),
    CTX,
  );
  expect(s.tag).toBe("Paused");
  expect(s.tone).toBe("waiting");
  expect(s.helper).toBe("We haven't heard from D. Okafor's phone for a few minutes. It picks up where it left off.");
});

it("my own angle seen without its local job points at the recording phone", () => {
  const s = angleStatus(v({ is_mine: true, status: "uploading", playability: "processing", upload_in_flight: false }), CTX);
  expect(s.helper).toBe("Open ELO RATED on the phone that recorded to finish the upload.");
});

it("on the recording phone the local job wins while the row has no bytes", () => {
  const row = v({ is_mine: true, status: "uploading", playability: "processing", upload_in_flight: false, upload_bytes_confirmed: 1, upload_bytes_total: 100 });
  expect(angleStatus(row, { ...CTX, local: { status: "uploading", progress: 0.64, terminal: false } })).toMatchObject({
    tag: "Uploading",
    right: "64%",
    helper: null,
  });
});

it("minor 1: a paused or failed local job never reads Uploading", () => {
  const row = v({ is_mine: true, status: "uploading", playability: "processing", upload_in_flight: true, upload_bytes_confirmed: 42, upload_bytes_total: 100 });
  expect(angleStatus(row, { ...CTX, local: { status: "paused", progress: 0.42, terminal: false } })).toMatchObject({
    tag: "Paused",
    tone: "waiting",
    right: null,
  });
  expect(angleStatus(row, { ...CTX, local: { status: "error", progress: 0.42, terminal: false } })).toMatchObject({
    tag: "Didn't upload",
    tone: "negative",
  });
  expect(angleStatus(row, { ...CTX, local: { status: "error", progress: null, terminal: true } })).toMatchObject({
    tag: "Didn't upload",
    tone: "info",
  });
});

it("a row that already plays keeps saying so while a re-record uploads (B1 wave 1 order)", () => {
  const row = v({ is_mine: true, status: "analyzed", has_analysis: true });
  expect(angleStatus(row, { ...CTX, local: { status: "uploading", progress: 0.1, terminal: false } }).tag).toBe("Breakdown ready");
});

it("localAngleJob maps the store entry and drops it once it landed", () => {
  expect(localAngleJob(null)).toBeNull();
  expect(localAngleJob({ status: "uploaded", progress: 1, errorClass: null })).toBeNull();
  expect(localAngleJob({ status: "error", progress: 0.5, errorClass: "too_large" })).toEqual({ status: "error", progress: 0.5, terminal: true, message: null, discardable: true });
  expect(localAngleJob({ status: "paused", progress: null, errorClass: "offline" })).toEqual({ status: "paused", progress: null, terminal: false, message: null, discardable: false });
});

it("minor 2: another athlete's pipeline failure is grey 'Not used' (deck 2c), never red", () => {
  expect(angleStatus(v({ status: "failed", playability: "failed" }), CTX)).toEqual({
    tag: "Not used",
    tone: "info",
    right: null,
    percent: null,
    helper: "This clip couldn't be processed.",
  });
  expect(angleStatus(v({ is_mine: true, status: "failed", playability: "failed" }), CTX).tone).toBe("negative");
});

it("nit 4: a nameless timekeeper is 'the timekeeper', never the opponent", () => {
  const short = (n: string) => `S(${n})`;
  expect(angleOwnerName({ uploaded_by_name: null, recording_type: "timekeeper" }, "Mina Park", short)).toBe("the timekeeper");
  expect(angleOwnerName({ uploaded_by_name: null, recording_type: "self" }, "Mina Park", short)).toBe("S(Mina Park)");
  expect(angleOwnerName({ uploaded_by_name: "Jo Cruz", recording_type: "timekeeper" }, "Mina Park", short)).toBe("S(Jo Cruz)");
  expect(angleOwnerName({ uploaded_by_name: null, recording_type: null }, null, short)).toBe("your opponent");
});

it("minor 3: the row label is {label}, {tag}, {helper}", () => {
  const status = angleStatus(v({ status: "uploading", playability: "processing", upload_in_flight: false }), CTX);
  expect(angleRowA11yLabel("D. Okafor's angle", null, status)).toBe(
    "D. Okafor's angle, Paused, We haven't heard from D. Okafor's phone for a few minutes. It picks up where it left off.",
  );
  expect(angleRowA11yLabel("J. Cruz's angle", "Timekeeper", angleStatus(v({ status: "uploading", playability: "processing", upload_bytes_confirmed: 5, upload_bytes_total: 10 }), CTX))).toBe(
    "J. Cruz's angle, Timekeeper, Uploading, 50%",
  );
});

it("abandoned and deleted rows do not count as angles", () => {
  expect(angleCounts(v({ status: "failed", failure_code: "upload_abandoned" }))).toBe(false);
  expect(angleCounts(v({ status: "deleted" }))).toBe(false);
  expect(angleCounts(v({ status: "failed" }))).toBe(true);
  expect(angleCounts(v({ status: "uploading" }))).toBe(true);
});

it.each([
  [{ status: "merging", playability: "processing" }, "Processing", "waiting"],
  [{ status: "slicing" }, "Analyzing", "waiting"],
  [{ status: "analyzed", has_analysis: true }, "Breakdown ready", "done"],
  [{ status: "ready" }, "Ready to watch", "done"],
  [{ status: "failed", playability: "failed", is_mine: true }, ANGLE_TAG.analysisFailed, "negative"],
] as const)("%p -> %s", (over, tag, tone) => {
  expect(angleStatus(v(over as Partial<MatchDetailVideo>), CTX)).toMatchObject({ tag, tone });
});

it("an abandoned upload reads Didn't upload (grey) and is not watchable, by failure_code", () => {
  const row = v({ status: "failed", playability: "failed", failure_code: "upload_abandoned", error_message: "anything" });
  expect(angleStatus(row, CTX)).toMatchObject({ tag: "Didn't upload", tone: "info", helper: null });
  expect(angleWatchable(row)).toBe(false);
  expect(angleWatchable(v({ status: "failed", playability: "failed" }))).toBe(true);
  expect(angleWatchable(v({ status: "uploading", playability: "processing" }))).toBe(false);
});

it("never uses a long dash", () => {
  for (const tag of Object.values(ANGLE_TAG)) expect(tag).not.toMatch(LONG_DASH);
});
