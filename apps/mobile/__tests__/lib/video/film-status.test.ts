import { deriveFilmStatus, formatLocalTime, isFusionLive, viewerRole, type FilmStatusInput } from "@/lib/video/film-status";
import type { LocalAngleJob } from "@/lib/video/angle-status";
import { angle, fusion, iso, ME, NOW, OPP, statusFixture, TK, V_ME, V_OPP, V_TK } from "../../support/match-video-status-fixture";

/**
 * COPY-DECK v2.2 table, one case per row (jits-n2im.25 AC1): the server
 * document (+ this phone's job) -> the strings every surface renders.
 */

/** Long and short dashes plus "!", built from code points so no dash sits in this file. */
const FORBIDDEN = new RegExp(`[${String.fromCharCode(0x2014, 0x2015, 0x2013)}!]`);

function view(over: Record<string, unknown>, opts: Partial<FilmStatusInput> = {}) {
  return deriveFilmStatus({
    status: statusFixture(over),
    viewerId: ME,
    local: null,
    nowMs: NOW,
    clockOffsetMs: 0,
    ...opts,
  });
}

function row(v: ReturnType<typeof view>, label: string) {
  const r = v.rows.find((x) => x.label === label);
  if (!r) throw new Error(`no row ${label}: ${v.rows.map((x) => x.label).join(", ")}`);
  return r;
}

const local = (over: Partial<LocalAngleJob>): LocalAngleJob => ({ status: "uploading", progress: 0.42, terminal: false, message: null, discardable: false, ...over });

describe("phase (deck 4a, competitor)", () => {
  const cases: [string, Record<string, unknown>, { tag: string; line: string; helper: string | null }][] = [
    ["recording", { phase: "recording", phase_reason: null, angles: [angle("me", "waiting_for_phone"), angle("opp", "waiting_for_phone")] }, { tag: "Recording", line: "Recording. Film uploads after the final whistle.", helper: null }],
    ["pre-grace no video yet", { phase: "collecting", phase_reason: "no_video_yet", angles: [angle("me", "not_recording"), angle("opp", "not_recording")] }, { tag: "No video yet", line: "No video yet.", helper: "If someone recorded, it will show up here." }],
    ["collecting, 1 angle", { angles_expected: 1, angles: [angle("me", "uploading", { progress_pct: 42 }), angle("opp", "not_recording")] }, { tag: "Uploading", line: "Your film is on its way.", helper: "Your highlight starts as soon as it's in." }],
    ["collecting, 2 angles, fusion off: no multi-angle claim", {}, { tag: "Uploading", line: "Film is coming in from 2 phones.", helper: "Your highlight starts as soon as it's in." }],
    ["collecting, 2 angles, fusion live", { wait_extended: false }, { tag: "Uploading", line: "Film is coming in from 2 phones.", helper: "Your highlight uses every angle that arrives." }],
    ["collecting, nothing in after 15 min", { angles: [angle("me", "waiting_for_phone"), angle("opp", "waiting_for_phone")], film_window_until: iso(NOW + 3_600_000) }, { tag: "Uploading", line: "Film is coming in from 2 phones.", helper: `If nothing arrives by ${formatLocalTime(NOW + 3_600_000, NOW)}, we'll let you know there's no film.` }],
    ["building, pre-fusion: single-angle copy", { phase: "building", phase_reason: null, angles_ready: 2, angles: [angle("me", "ready"), angle("opp", "ready")] }, { tag: "Building", line: "Building your highlight.", helper: "Usually 1 to 3 minutes. We'll let you know." }],
    ["building from 2 angles (fusion)", { phase: "building", phase_reason: null, ...fusion(), angles: [angle("me", "ready", { used: true }), angle("opp", "ready", { used: true })] }, { tag: "Building", line: "Building your highlight from 2 angles.", helper: "Usually 1 to 3 minutes. We'll let you know." }],
    ["building, an angle missed the wait", { phase: "building", phase_reason: null, ...fusion({ dispatch_reason: "wait_expired", angles_used: [V_ME], angles_used_count: 1 }), angles: [angle("me", "ready", { used: true }), angle("opp", "upload_paused", { used: false })] }, { tag: "Building", line: "Building your highlight from your angle.", helper: "If D. Okafor's angle arrives in the next 24 hours, we'll add it." }],
    ["ready", { phase: "ready", phase_reason: null, angles: [angle("me", "ready"), angle("opp", "ready")], reels: [{ athlete_id: ME, state: "ready", version: 1, origin: "auto" }] }, { tag: "Ready", line: "Film and highlight ready.", helper: null }],
    ["ready, a late angle was added (fusion)", { phase: "ready", phase_reason: null, ...fusion(), angles: [angle("me", "ready", { used: true }), angle("opp", "ready", { used: true })], reels: [{ athlete_id: ME, state: "ready", version: 2, origin: "late_angle" }] }, { tag: "Ready", line: "Film and highlight ready.", helper: "D. Okafor's angle came in later. Your highlight was updated with it." }],
    ["ready, late_angle origin without fusion fields: no claim", { phase: "ready", phase_reason: null, angles: [angle("me", "ready"), angle("opp", "ready")], reels: [{ athlete_id: ME, state: "ready", origin: "late_angle" }] }, { tag: "Ready", line: "Film and highlight ready.", helper: null }],
    ["ready, no highlight possible (no clear moment)", { phase: "ready", phase_reason: null, angles: [angle("me", "ready")], reels: [{ athlete_id: ME, state: "none", none_reason: "no_clear_moment" }] }, { tag: "Film ready", line: "Film ready to watch.", helper: "We couldn't find a clear highlight of you in this video." }],
    ["ready, highlights switched off: no helper", { phase: "ready", phase_reason: null, angles: [angle("me", "ready")], reels: [{ athlete_id: ME, state: "none", none_reason: "highlights_disabled" }] }, { tag: "Film ready", line: "Film ready to watch.", helper: null }],
    ["ready, highlight failed", { phase: "ready", phase_reason: null, angles: [angle("me", "ready")], reels: [{ athlete_id: ME, state: "failed" }] }, { tag: "Film ready", line: "Film ready to watch.", helper: "We couldn't make your highlight." }],
    ["no film, nobody recorded", { phase: "no_film", phase_reason: "nobody_recorded", angles: [angle("me", "not_recording"), angle("opp", "not_recording")] }, { tag: "No film", line: "No film for this match.", helper: "No one recorded it. Turn on Record from my phone at the face-off next time." }],
    ["no film, none usable", { phase: "no_film", phase_reason: "none_usable", angles: [angle("me", "no_match"), angle("opp", "failed")] }, { tag: "No film", line: "No film for this match.", helper: "None of the video could be used. Your result and rating aren't affected." }],
    ["no film, window closed", { phase: "no_film", phase_reason: "window_closed", angles: [angle("me", "abandoned"), angle("opp", "upload_paused")] }, { tag: "No film", line: "No film for this match.", helper: "None of the video came in. Your result and rating aren't affected." }],
  ];
  it.each(cases)("%s", (_name, over, want) => {
    const v = view(over);
    expect({ tag: v.phaseTag, line: v.line, helper: v.helper }).toEqual(want);
  });

  it("a local job never sits under 'No video yet' or 'No one recorded it' (merge rule)", () => {
    for (const reason of ["no_video_yet", "nobody_recorded"]) {
      const v = view(
        { phase: reason === "no_video_yet" ? "collecting" : "no_film", phase_reason: reason, angles_expected: 0, angles: [angle("me", "not_recording"), angle("opp", "not_recording")] },
        { local: local({ status: "uploading" }) },
      );
      expect(v.phaseTag).toBe("Uploading");
      expect(v.line).toBe("Your film is on its way.");
      expect(v.rows[0]).toMatchObject({ label: "Your angle", tag: "Uploading", percent: 42 });
    }
  });
});

describe("waiting_for_angle: server-clock countdown", () => {
  const waiting = (over: Record<string, unknown> = {}) => ({
    phase: "waiting_for_angle",
    phase_reason: null,
    ...fusion({ dispatched_at: null, dispatch_reason: null, angles_used: null, angles_used_count: null }),
    wait_deadline_at: iso(NOW + 492_000),
    angles: [angle("me", "ready"), angle("opp", "uploading", { progress_pct: 18 })],
    ...over,
  });

  it("counts 8:12 by the server's clock, whatever the device clock says", () => {
    // Device 5 min fast: the offset brings it back.
    const v = view(waiting(), { nowMs: NOW + 300_000, clockOffsetMs: -300_000 });
    expect(v.phaseTag).toBe("8:12 left");
    expect(v.countdown).toMatchObject({ label: "8:12", a11y: "8 minutes 12 seconds left" });
    expect(v.line).toBe("Waiting up to 10 min for D. Okafor's angle.");
    expect(v.helper).toBe("Your highlight uses it if it arrives. If not, we build it from what's in.");
  });

  it("reads 'Any second now' past the deadline while the server has not moved", () => {
    const v = view(waiting(), { nowMs: NOW + 600_000 });
    expect(v.phaseTag).toBe("Any second now");
    expect(v.countdown).toBeNull();
    expect(v.phase).toBe("waiting_for_angle");
  });

  it("2+ pending angles", () => {
    const v = view(waiting({ angles: [angle("me", "ready"), angle("opp", "uploading"), angle("tk", "upload_paused")] }));
    expect(v.line).toBe("Waiting up to 10 min for 2 more angles.");
    expect(v.helper).toBe("Your highlight uses them if they arrive. If not, we build it from what's in.");
  });

  it("the extended wait only when the server says so", () => {
    const v = view(waiting({ wait_extended: true, angles: [angle("me", "ready"), angle("opp", "processing")] }));
    expect(v.line).toBe("D. Okafor's angle is in. Giving it up to 10 more min.");
    expect(v.helper).toBe("It's being processed so your highlight can use it.");
    const plain = view(waiting({ wait_extended: false, angles: [angle("me", "ready"), angle("opp", "processing")] }));
    expect(plain.line).toBe("Waiting up to 10 min for D. Okafor's angle.");
  });

  it("without a server clock the tag has no digits", () => {
    expect(view(waiting({ server_now: null })).phaseTag).toBe("Waiting");
  });
});

describe("timekeeper view (deck 4b, 2e): film, never highlights", () => {
  const tk = (over: Record<string, unknown>, opts: Partial<FilmStatusInput> = {}) =>
    deriveFilmStatus({ status: statusFixture(over), viewerId: TK, local: null, nowMs: NOW, clockOffsetMs: 0, ...opts });

  it("is detected from the document", () => {
    expect(viewerRole(statusFixture({ angles: [angle("me", "ready"), angle("tk", "ready")] }), TK)).toBe("timekeeper");
    expect(viewerRole(statusFixture({}), ME)).toBe("competitor");
  });

  const cases: [string, Record<string, unknown>, { line: string; helper: string | null }][] = [
    ["recording", { phase: "recording", phase_reason: null, angles: [angle("tk", "waiting_for_phone")] }, { line: "You're recording this match as timekeeper.", helper: "Recording stops at the final whistle." }],
    ["collecting", { angles: [angle("tk", "uploading")] }, { line: "Film is coming in.", helper: null }],
    ["building (pre-fusion)", { phase: "building", phase_reason: null, angles: [angle("tk", "ready"), angle("me", "ready")] }, { line: "Building the players' highlights.", helper: null }],
    ["building (fusion, 2 angles)", { phase: "building", phase_reason: null, ...fusion(), angles: [angle("tk", "ready", { used: true }), angle("me", "ready", { used: true })] }, { line: "Building the players' highlights from 2 angles.", helper: null }],
    ["ready", { phase: "ready", phase_reason: null, angles: [angle("tk", "ready")] }, { line: "Film ready. Thanks for recording.", helper: null }],
    ["no film", { phase: "no_film", phase_reason: "none_usable", angles: [angle("tk", "failed")] }, { line: "No film for this match.", helper: "None of the video could be used." }],
  ];
  it.each(cases)("%s", (_n, over, want) => {
    const v = tk(over);
    expect(v.role).toBe("timekeeper");
    expect({ line: v.line, helper: v.helper }).toEqual(want);
  });

  it("keeps ELO RATED open while its own job runs", () => {
    expect(tk({ angles: [angle("tk", "uploading")] }, { local: local({ status: "uploading" }) }).helper).toBe("Keep ELO RATED open until your film uploads.");
  });

  it("rows drop every 'your highlight' helper and never tag itself Timekeeper", () => {
    const until = NOW + 3_600_000;
    const v = tk({ phase: "building", phase_reason: null, ...fusion({ late_angle_until: iso(until), angles_used: [V_TK, V_ME], angles_used_count: 2 }), angles: [angle("me", "ready", { used: true }), angle("opp", "processing", { used: false }), angle("tk", "ready", { used: true })] });
    expect(row(v, "Your angle").roleTag).toBeNull();
    expect(row(v, "D. Okafor's angle").helper).toBe(`It can still be added until ${formatLocalTime(until, NOW)}.`);
    expect(row(tk({ angles: [angle("tk", "ready"), angle("opp", "abandoned")] }), "D. Okafor's angle")).toMatchObject({ tag: "Didn't upload", helper: null, tone: "info" });
    expect(row(tk({ angles: [angle("tk", "failed"), angle("me", "ready")] }), "Your angle").helper).toBe("Thanks for recording. The players' angles are still used.");
  });
});

describe("rows: your angle on the recording phone (2a, the local job wins)", () => {
  const cases: [string, Partial<LocalAngleJob>, { tag: string; tone: string; helper: string | null; action: string | null; percent: number | null }][] = [
    ["pending", { status: "pending", progress: null }, { tag: "Uploading", tone: "progress", helper: "Keep ELO RATED open until your film uploads.", action: null, percent: null }],
    ["uploading", { status: "uploading", progress: 0.42 }, { tag: "Uploading", tone: "progress", helper: "Keep ELO RATED open until your film uploads.", action: null, percent: 42 }],
    ["paused", { status: "paused", message: "No connection right now. It picks up where it left off." }, { tag: "Paused", tone: "waiting", helper: "No connection right now. It picks up where it left off.", action: "retry", percent: null }],
    ["failed, retryable (red)", { status: "error", message: null }, { tag: "Didn't upload", tone: "negative", helper: "The upload didn't finish.", action: "retry", percent: null }],
    ["failed again after Try again", { status: "error", message: "Still can't upload. Check your connection." }, { tag: "Didn't upload", tone: "negative", helper: "Still can't upload. Check your connection.", action: "retry", percent: null }],
    ["failed, terminal, clip gone (grey, nothing to do)", { status: "error", terminal: true, discardable: false, message: "The clip isn't on this phone anymore." }, { tag: "Didn't upload", tone: "info", helper: "The clip isn't on this phone anymore.", action: null, percent: null }],
    ["failed, terminal, clip here (Discard)", { status: "error", terminal: true, discardable: true, message: "This clip is too big to upload (2 GB max)." }, { tag: "Didn't upload", tone: "info", helper: "This clip is too big to upload (2 GB max).", action: "discard", percent: null }],
  ];
  it.each(cases)("%s", (_n, job, want) => {
    // The server still says uploading at 10%: the local job is fresher.
    const v = view({ angles: [angle("me", "uploading", { progress_pct: 10 }), angle("opp", "uploading")] }, { local: local(job) });
    const r = row(v, "Your angle");
    expect({ tag: r.tag, tone: r.tone, helper: r.helper, action: r.action, percent: r.percent }).toEqual(want);
    expect(r.watchable).toBe(false);
  });

  it("the server wins for everyone else's angle, whatever this phone holds", () => {
    const v = view({ angles: [angle("me", "uploading"), angle("opp", "upload_paused")] }, { local: local({ status: "error" }) });
    expect(row(v, "D. Okafor's angle")).toMatchObject({ tag: "Paused", tone: "waiting", action: null });
  });

  it("a row the server already has ready keeps saying what it is", () => {
    const v = view({ angles: [angle("me", "ready"), angle("opp", "uploading")] }, { local: local({ status: "uploading" }) });
    expect(row(v, "Your angle")).toMatchObject({ tag: "Ready to watch", watchable: true, duration: "4:31" });
  });

  it("a local job with no server row yet is still 'Your angle'", () => {
    const v = view({ angles: [angle("me", "not_recording"), angle("opp", "uploading")] }, { local: local({ status: "uploading" }) });
    expect(v.rows[0]).toMatchObject({ label: "Your angle", tag: "Uploading", percent: 42 });
  });

  it("red never appears on a server-derived row (deck 0.6)", () => {
    for (const s of ["waiting_for_phone", "uploading", "upload_paused", "processing", "ready", "no_match", "failed", "abandoned"]) {
      const v = view({ angles: [angle("me", s), angle("opp", s), angle("tk", s)] });
      expect(v.rows.every((r) => r.tone !== "negative")).toBe(true);
    }
  });
});

describe("rows: your angle seen on another device (2b) and its server states (2a)", () => {
  const cases: [string, string, Record<string, unknown>, { tag: string; helper: string | null; tone: string }][] = [
    ["waiting for your phone", "waiting_for_phone", {}, { tag: "Waiting for your phone", helper: "Open ELO RATED on the phone that recorded to start the upload.", tone: "waiting" }],
    ["uploading (no Try again here)", "uploading", { progress_pct: 42 }, { tag: "Uploading", helper: null, tone: "progress" }],
    ["paused", "upload_paused", {}, { tag: "Paused", helper: "Open ELO RATED on the phone that recorded to finish the upload.", tone: "waiting" }],
    ["abandoned", "abandoned", {}, { tag: "Didn't upload", helper: "The upload didn't finish on the phone that recorded.", tone: "info" }],
    ["processing", "processing", {}, { tag: "Processing", helper: null, tone: "waiting" }],
    ["ready", "ready", {}, { tag: "Ready to watch", helper: null, tone: "done" }],
    ["no match", "no_match", {}, { tag: "Not used", helper: "We couldn't see a match in this clip.", tone: "info" }],
  ];
  it.each(cases)("%s", (_n, state, over, want) => {
    const r = row(view({ angles: [angle("me", state, over), angle("opp", "processing")] }), "Your angle");
    expect({ tag: r.tag, helper: r.helper, tone: r.tone }).toEqual(want);
    expect(r.action).toBeNull();
  });

  it("pipeline failed: names the angle the highlight uses, else nothing for you to do", () => {
    expect(row(view({ angles: [angle("me", "failed"), angle("opp", "ready")] }), "Your angle").helper).toBe("Your highlight uses D. Okafor's angle.");
    expect(row(view({ angles: [angle("me", "failed"), angle("opp", "processing")] }), "Your angle").helper).toBe("Something went wrong on our side. Nothing for you to do.");
  });
});

describe("rows: another competitor's angle (2c) and the timekeeper's (2d)", () => {
  const cases: [string, string, Record<string, unknown>, { tag: string; helper: string | null; tone: string }][] = [
    ["waiting for their phone", "waiting_for_phone", {}, { tag: "Waiting for their phone", helper: "It uploads when ELO RATED is open on D. Okafor's phone.", tone: "waiting" }],
    ["uploading", "uploading", { progress_pct: 18 }, { tag: "Uploading", helper: null, tone: "progress" }],
    ["paused: what the server knows, never blame", "upload_paused", {}, { tag: "Paused", helper: "We haven't heard from D. Okafor's phone for a few minutes. It picks up where it left off.", tone: "waiting" }],
    ["processing", "processing", {}, { tag: "Processing", helper: null, tone: "waiting" }],
    ["ready", "ready", {}, { tag: "Ready to watch", helper: null, tone: "done" }],
    ["no match", "no_match", {}, { tag: "Not used", helper: "No match was found in this clip.", tone: "info" }],
    ["failed", "failed", {}, { tag: "Not used", helper: "This clip couldn't be processed.", tone: "info" }],
  ];
  it.each(cases)("%s", (_n, state, over, want) => {
    const r = row(view({ angles: [angle("me", "processing"), angle("opp", state, over)] }), "D. Okafor's angle");
    expect({ tag: r.tag, helper: r.helper, tone: r.tone }).toEqual(want);
  });

  it("uploading carries the server's percent", () => {
    expect(row(view({ angles: [angle("me", "processing"), angle("opp", "uploading", { progress_pct: 18 })] }), "D. Okafor's angle").percent).toBe(18);
  });

  it("abandoned: 'uses your angle' only when mine is usable", () => {
    expect(row(view({ angles: [angle("me", "ready"), angle("opp", "abandoned")] }), "D. Okafor's angle").helper).toBe("Your highlight uses your angle.");
    expect(row(view({ angles: [angle("me", "processing"), angle("opp", "abandoned")] }), "D. Okafor's angle").helper).toBeNull();
  });

  it("the timekeeper's angle: tagged, and 'uses the other angles' when abandoned", () => {
    const v = view({ angles: [angle("me", "ready"), angle("opp", "ready"), angle("tk", "abandoned")] });
    expect(row(v, "J. Cruz's angle")).toMatchObject({ roleTag: "Timekeeper", tag: "Didn't upload", helper: "Your highlight uses the other angles." });
    expect(row(view({ angles: [angle("me", "processing"), angle("tk", "waiting_for_phone")] }), "J. Cruz's angle").helper).toBe("It uploads when ELO RATED is open on J. Cruz's phone.");
  });

  it("orders rows yours, the other competitor, the timekeeper, and hides not_recording", () => {
    const v = view({ angles: [angle("tk", "uploading"), angle("opp", "ready"), angle("me", "processing"), angle("opp", "not_recording", { recorder_athlete_id: "zz" })] });
    expect(v.rows.map((r) => r.label)).toEqual(["Your angle", "D. Okafor's angle", "J. Cruz's angle"]);
  });

  describe("after dispatch (fusion only)", () => {
    const until = NOW + 3_600_000;
    const base = (oppState: string, over: Record<string, unknown> = {}) =>
      view({ phase: "ready", phase_reason: null, ...fusion({ angles_used: [V_ME], angles_used_count: 1, late_angle_until: iso(until) }), angles: [angle("me", "ready", { used: true }), angle("opp", oppState, { used: false })], reels: [{ athlete_id: ME, state: "ready" }], ...over });

    it("still waiting: can be added until {until}", () => {
      expect(row(base("waiting_for_phone"), "D. Okafor's angle").helper).toBe(`It can still be added to your highlight until ${formatLocalTime(until, NOW)}.`);
      expect(row(base("upload_paused"), "D. Okafor's angle").helper).toBe(`It can still be added to your highlight until ${formatLocalTime(until, NOW)}.`);
    });
    it("processing: if it's in by {until}", () => {
      expect(row(base("processing"), "D. Okafor's angle").helper).toBe(`If it's in by ${formatLocalTime(until, NOW)}, we'll add it to your highlight.`);
    });
    it("late window closed: Not in your highlight, grey", () => {
      expect(row(base("waiting_for_phone", { late_angle_until: iso(NOW - 1) }), "D. Okafor's angle")).toMatchObject({ tag: "Not in your highlight", helper: "It will still be watchable if it uploads.", tone: "info" });
    });
    it("without late_angle_until: no row helper (the plate helper speaks)", () => {
      expect(row(base("waiting_for_phone", { late_angle_until: null }), "D. Okafor's angle").helper).toBeNull();
    });
    it("pre-fusion the late-angle promises never appear", () => {
      const s = statusFixture({ phase: "ready", phase_reason: null, angles: [angle("me", "ready"), angle("opp", "waiting_for_phone")], reels: [{ athlete_id: ME, state: "ready" }] });
      expect(isFusionLive(s)).toBe(false);
      const v = deriveFilmStatus({ status: s, viewerId: ME, local: null, nowMs: NOW, clockOffsetMs: 0 });
      expect(row(v, "D. Okafor's angle").helper).toBe("It uploads when ELO RATED is open on D. Okafor's phone.");
    });
  });
});

describe("Best angle (deck 13)", () => {
  it("marks the server-elected primary only among 2+ ready angles", () => {
    const v = view({ phase: "ready", phase_reason: null, angles: [angle("me", "ready"), angle("opp", "ready", { is_primary: true })] });
    expect(v.bestVideoId).toBe(V_OPP);
    expect(row(v, "D. Okafor's angle").best).toBe(true);
    expect(row(v, "Your angle").best).toBe(false);
  });
  it("not with one ready angle, nor with no primary elected", () => {
    expect(view({ angles: [angle("me", "ready", { is_primary: true }), angle("opp", "processing")] }).bestVideoId).toBeNull();
    expect(view({ angles: [angle("me", "ready"), angle("opp", "ready")] }).bestVideoId).toBeNull();
  });
  it("not on a primary that is not ready", () => {
    expect(view({ angles: [angle("me", "ready"), angle("opp", "ready"), angle("tk", "processing", { is_primary: true })] }).bestVideoId).toBeNull();
  });
});

describe("contradiction rules", () => {
  it("rule 4 without the playback read: ready and no-match angles play, nothing still processing", () => {
    const v = view({ angles: [angle("me", "processing"), angle("opp", "ready"), angle("tk", "uploading")] });
    expect(v.playableVideoIds).toEqual([V_OPP]);
    expect(v.rows.filter((r) => r.watchable).map((r) => r.videoId)).toEqual([V_OPP]);
  });
  it("rule 3: {n} equals the ready, used rows", () => {
    const v = view({ phase: "building", phase_reason: null, ...fusion({ angles_used: [V_ME, V_OPP, V_TK], angles_used_count: 3 }), angles: [angle("me", "ready", { used: true }), angle("opp", "ready", { used: true }), angle("tk", "ready", { used: true })] });
    expect(v.line).toBe("Building your highlight from 3 angles.");
    expect(v.rows.filter((r) => r.tag === "Ready to watch")).toHaveLength(3);
  });
  it("no derived string carries a long dash or an exclamation mark", () => {
    const all = [
      view({}),
      view({ phase: "no_film", phase_reason: "window_closed", angles: [angle("me", "abandoned"), angle("opp", "upload_paused")] }),
      view({ phase: "ready", phase_reason: null, angles: [angle("me", "failed"), angle("opp", "ready")] }),
    ];
    for (const v of all) {
      for (const s of [v.line, v.helper, v.phaseTag, ...v.rows.flatMap((r) => [r.label, r.tag, r.helper])]) {
        expect(s ?? "").not.toMatch(FORBIDDEN);
      }
    }
  });
});

describe("formatLocalTime ({until})", () => {
  it("today, tomorrow, later", () => {
    const base = new Date(2026, 9, 5, 18, 0).getTime();
    expect(formatLocalTime(new Date(2026, 9, 5, 21, 42).getTime(), base)).toBe("9:42 PM");
    expect(formatLocalTime(new Date(2026, 9, 6, 0, 5).getTime(), base)).toBe("tomorrow 12:05 AM");
    expect(formatLocalTime(new Date(2026, 9, 8, 9, 0).getTime(), base)).toBe("Oct 8, 9:00 AM");
  });
});

void OPP;

describe("playability is PLAYABLE, not analysed (coordinator decision 2026-10-05, deck 14)", () => {
  const playable = (entries: [string, number | null][]) => new Map(entries);

  it("an analysing angle with playable bytes plays at once, tagged Analyzing", () => {
    const v = view({ angles: [angle("me", "processing"), angle("opp", "processing")] }, { playable: playable([[V_ME, 271], [V_OPP, null]]) });
    expect(row(v, "Your angle")).toMatchObject({ tag: "Analyzing", tone: "waiting", watchable: true, duration: "4:31" });
    expect(row(v, "D. Okafor's angle")).toMatchObject({ tag: "Analyzing", watchable: true });
    expect(v.playableVideoIds).toEqual([V_ME, V_OPP]);
  });

  it("a processing angle the playback query cannot open (still merging) stays Processing, not watchable", () => {
    const v = view({ angles: [angle("me", "processing"), angle("opp", "processing")] }, { playable: playable([[V_ME, 271]]) });
    expect(row(v, "D. Okafor's angle")).toMatchObject({ tag: "Processing", watchable: false });
  });

  it("a pipeline failure on a playable file: Analysis failed, may still play (grey, never red), and it plays", () => {
    const v = view({ angles: [angle("me", "failed"), angle("opp", "failed")] }, { playable: playable([[V_ME, 200], [V_OPP, 190]]) });
    expect(row(v, "Your angle")).toMatchObject({ tag: "Analysis failed · may still play", tone: "info", watchable: true });
    expect(row(v, "D. Okafor's angle")).toMatchObject({ tag: "Analysis failed · may still play", tone: "info", watchable: true, helper: "This clip couldn't be processed." });
  });

  it("a pipeline failure with no playable file stays Not used", () => {
    const v = view({ angles: [angle("me", "ready"), angle("opp", "failed")] }, { playable: playable([[V_ME, 271]]) });
    expect(row(v, "D. Okafor's angle")).toMatchObject({ tag: "Not used", watchable: false });
  });

  it("a no-match angle still plays", () => {
    expect(row(view({ angles: [angle("me", "no_match"), angle("opp", "processing")] }), "Your angle")).toMatchObject({ tag: "Not used", watchable: true });
  });

  it("an analysing angle that plays ends the local job's say over Your angle (wave 2)", () => {
    const v = view({ angles: [angle("me", "processing"), angle("opp", "uploading")] }, { playable: playable([[V_ME, 271]]), local: local({ status: "uploading" }) });
    expect(row(v, "Your angle")).toMatchObject({ tag: "Analyzing", watchable: true });
  });

  it("Best angle counts playable angles, analysed or not", () => {
    const v = view({ angles: [angle("me", "processing"), angle("opp", "ready", { is_primary: true })] }, { playable: playable([[V_ME, 271]]) });
    expect(v.bestVideoId).toBe(V_OPP);
  });

  it("the verdict CTA set (playableVideoIds) is the same set the rows play", () => {
    const v = view({ angles: [angle("me", "processing"), angle("opp", "uploading")] }, { playable: playable([[V_ME, 271]]) });
    expect(v.playableVideoIds).toEqual([V_ME]);
  });
});

describe("review M1: the viewer's own highlight beats the match-level building phase", () => {
  const reels = (mine: string, theirs: string) => [
    { athlete_id: ME, state: mine, version: 1, origin: "auto" },
    { athlete_id: OPP, state: theirs },
  ];
  const building = (mine: string, theirs = "building", over: Record<string, unknown> = {}) =>
    view({ phase: "building", phase_reason: null, angles: [angle("me", "ready"), angle("opp", "ready")], reels: reels(mine, theirs), ...over });

  it("A ready while B still renders: A reads Ready, not Building", () => {
    const v = building("ready");
    expect({ tag: v.phaseTag, line: v.line, helper: v.helper }).toEqual({ tag: "Ready", line: "Film and highlight ready.", helper: null });
  });

  it("A none while B builds: the film-only state", () => {
    const v = building("none", "building", { reels: [{ athlete_id: ME, state: "none", none_reason: "no_clear_moment" }, { athlete_id: OPP, state: "building" }] });
    expect({ tag: v.phaseTag, line: v.line, helper: v.helper }).toEqual({ tag: "Film ready", line: "Film ready to watch.", helper: "We couldn't find a clear highlight of you in this video." });
  });

  it("A failed while B builds: the failed state (Try again is on the highlight card)", () => {
    const v = building("failed");
    expect({ tag: v.phaseTag, line: v.line, helper: v.helper }).toEqual({ tag: "Film ready", line: "Film ready to watch.", helper: "We couldn't make your highlight." });
  });

  it("A still building: the match phase speaks", () => {
    expect(building("building").line).toBe("Building your highlight.");
  });

  it("the timekeeper keeps the match-level phase (no reel of their own)", () => {
    const v = deriveFilmStatus({ status: statusFixture({ phase: "building", phase_reason: null, angles: [angle("tk", "ready"), angle("me", "ready")], reels: reels("ready", "building") }), viewerId: TK, local: null, nowMs: NOW, clockOffsetMs: 0 });
    expect(v.line).toBe("Building the players' highlights.");
  });
});

describe("review M2 (v2.4): film in, analysing", () => {
  it("bytes in for an angle, nothing analysed: Analyzing, 'Your film is in. Analyzing now.'", () => {
    const v = view({ angles: [angle("me", "processing"), angle("opp", "uploading", { progress_pct: 30 })] }, { playable: new Map([[V_ME, 271]]) });
    expect({ tag: v.phaseTag, line: v.line, helper: v.helper }).toEqual({ tag: "Analyzing", line: "Your film is in. Analyzing now.", helper: null });
    // Rows keep their own states.
    expect(row(v, "Your angle").tag).toBe("Analyzing");
    expect(row(v, "D. Okafor's angle")).toMatchObject({ tag: "Uploading", percent: 30 });
  });

  it("nothing landed yet: still Uploading", () => {
    expect(view({}).phaseTag).toBe("Uploading");
  });
});

describe("review minors 1 to 3", () => {
  it("1. a terminal local failure never forces 'on its way' over No video yet", () => {
    const v = view(
      { phase: "collecting", phase_reason: "no_video_yet", angles_expected: 0, angles: [angle("me", "not_recording"), angle("opp", "not_recording")] },
      { local: local({ status: "error", terminal: true, message: "This clip is too big to upload (2 GB max)." }) },
    );
    expect(v.line).toBe("No video yet.");
    expect(v.rows[0]).toMatchObject({ tag: "Didn't upload", helper: "This clip is too big to upload (2 GB max)." });
  });

  it("1. the timekeeper's keep-open helper is not shown for a terminal job", () => {
    const v = deriveFilmStatus({ status: statusFixture({ angles: [angle("tk", "waiting_for_phone"), angle("me", "uploading")] }), viewerId: TK, local: local({ status: "error", terminal: true }), nowMs: NOW, clockOffsetMs: 0 });
    expect(v.helper).toBeNull();
  });

  it("2. after a Discard the recording phone gets its own copy, and no 'on its way' for a clip that will never come", () => {
    const v = view({ angles_expected: 1, angles: [angle("me", "waiting_for_phone"), angle("opp", "not_recording")] }, { discardedHere: true });
    expect(row(v, "Your angle")).toMatchObject({ tag: "Not uploaded", helper: "The clip isn't on this phone anymore.", tone: "info" });
    expect(v.line).toBe("No film for this match.");
  });

  it("2. after a Discard, another angle still coming keeps the collecting line, counting only it", () => {
    const v = view({ angles_expected: 2, angles: [angle("me", "waiting_for_phone"), angle("opp", "uploading")] }, { discardedHere: true });
    expect(v.line).toBe("Your film is on its way.");
  });

  it("3. a disputed result promises no highlight: helpers drop, lines stay", () => {
    const v = view({ match_status: "disputed", phase: "building", phase_reason: null, angles: [angle("me", "ready"), angle("opp", "ready")] });
    expect(v.line).toBe("Building your highlight.");
    expect(v.helper).toBeNull();
    expect(view({ match_status: "disputed" }).helper).toBeNull();
  });
});
