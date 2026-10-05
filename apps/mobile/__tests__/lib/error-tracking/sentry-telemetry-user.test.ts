import { scrubTelemetryUser } from "@/lib/error-tracking/sentry";

/** m7: funnel telemetry carries the athlete id only; error events are untouched. */
const USER = { id: "athlete-1", email: "kai@example.com", username: "kai", name: "kai" };

describe("scrubTelemetryUser", () => {
  it("keeps only the id on a playback session event", () => {
    const event = { message: "Video playback session", tags: { "video.playback.surface": "match" }, user: { ...USER } };
    expect(scrubTelemetryUser(event).user).toEqual({ id: "athlete-1", ip_address: null });
  });

  it("keeps only the id on upload telemetry events", () => {
    const event = { message: "Match video uploaded", tags: { "video.upload.outcome": "uploaded" }, user: { ...USER } };
    expect(scrubTelemetryUser(event).user).toEqual({ id: "athlete-1", ip_address: null });
  });

  it("leaves error events alone, even with a telemetry tag", () => {
    const event = { exception: { values: [] }, tags: { "video.upload.outcome": "abandoned" }, user: { ...USER } };
    expect(scrubTelemetryUser(event).user).toEqual(USER);
  });

  it("leaves other messages (feedback, bug reports) alone", () => {
    const event = { message: "something", tags: { "app.build": "25" }, user: { ...USER } };
    expect(scrubTelemetryUser(event).user).toEqual(USER);
  });
});
