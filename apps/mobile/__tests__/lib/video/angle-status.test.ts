/**
 * Angle rows from the server (jits-n2im.12): COPY-DECK v2.2 section 2 strings,
 * the local job winning for "Your angle", and nothing playable before bytes.
 */
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { ANGLE_TAG, angleStatus, angleWatchable } from "@/lib/video/angle-status";

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

it("on the recording phone the local job's progress wins", () => {
  const s = angleStatus(
    v({ is_mine: true, status: "uploading", playability: "processing", upload_in_flight: false, upload_bytes_confirmed: 1, upload_bytes_total: 100 }),
    { ...CTX, localProgress: 0.64 },
  );
  expect(s).toMatchObject({ tag: "Uploading", right: "64%", helper: null });
});

it.each([
  [{ status: "merging", playability: "processing" }, "Processing", "waiting"],
  [{ status: "slicing" }, "Analyzing", "waiting"],
  [{ status: "analyzed", has_analysis: true }, "Breakdown ready", "done"],
  [{ status: "ready" }, "Ready to watch", "done"],
  [{ status: "failed", playability: "failed" }, ANGLE_TAG.analysisFailed, "negative"],
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
