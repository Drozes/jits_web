/**
 * The backup-exclusion telemetry wired at bootstrap (jits-vjbq, F1).
 *
 * WHY THIS IS TESTED AT ALL. The exclusion is set by a NATIVE module, and
 * JS ships over the air while native code does not. The `runtimeVersion`
 * policy is `appVersion`, so the TestFlight build that adds the module and
 * every already-installed binary of the same version share a runtime
 * version and accept the same OTA. After that build there will be
 * two populations running byte-identical JS, one of which is silently
 * sending 300-600 MB clips to iCloud. This tag is the only thing that tells
 * them apart, so a regression that drops it is invisible by construction:
 * nothing breaks, the answer just stops existing.
 */
const mockSetSentryTag = jest.fn();
const mockResumeUploads = jest.fn(async () => undefined);
const mockEnsureListeners = jest.fn(() => () => undefined);
const mockSetUploadOwner = jest.fn();
const mockBindKeepAwake = jest.fn();
const mockBindNotice = jest.fn();
const mockStatus = { current: "active" as string };
const mockAuth = { current: { athlete: null } as { athlete: { id: string } | null } };

jest.mock("@/lib/error-tracking/sentry", () => ({
  setSentryTag: (...args: unknown[]) => mockSetSentryTag(...(args as [string, string])),
}));

jest.mock("@/modules/backup-exclusion", () => ({
  get backupExclusionStatus() {
    return mockStatus.current;
  },
}));

jest.mock("@/lib/video/video-upload-manager", () => ({
  ensureUploadListeners: () => mockEnsureListeners(),
  resumeMatchVideoUploads: () => mockResumeUploads(),
  setUploadOwner: (id: string | null) => mockSetUploadOwner(id),
}));

jest.mock("@/lib/video/upload-keep-awake", () => ({
  bindUploadKeepAwake: () => mockBindKeepAwake(),
}));

jest.mock("@/lib/video/upload-background-notice", () => ({
  bindUploadBackgroundNotice: () => mockBindNotice(),
}));

jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => mockAuth.current,
}));

import { render } from "@testing-library/react-native";
import { VideoUploadBootstrap } from "@/lib/video/video-upload-bootstrap";

let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.current = "active";
  mockAuth.current = { athlete: null };
  logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("backup-exclusion telemetry", () => {
  it("tags the launch with the status", () => {
    render(<VideoUploadBootstrap />);
    expect(mockSetSentryTag).toHaveBeenCalledWith("video.backup_exclusion", "active");
  });

  it("reports it even when NOBODY is signed in", () => {
    // It is a fact about the binary, not about the session, and an error
    // raised before sign-in should carry it too. The resume sweep beside it
    // IS auth-gated, so it is easy to gate this by accident.
    mockAuth.current = { athlete: null };
    render(<VideoUploadBootstrap />);
    expect(mockSetSentryTag).toHaveBeenCalledTimes(1);
    expect(mockResumeUploads).not.toHaveBeenCalled();
  });

  it("reports the MISSING case, which is the one that matters", () => {
    // An OTA that landed on a binary with no native module: the exclusion
    // is inert and nothing else would ever say so.
    mockStatus.current = "missing";
    render(<VideoUploadBootstrap />);
    expect(mockSetSentryTag).toHaveBeenCalledWith("video.backup_exclusion", "missing");
  });

  it("reports Android as not-applicable rather than as a failure", () => {
    // Android exclusion is declarative (manifest backup rules), so a false
    // `isBackupExclusionSupported` there is correct. Collapsing it into the
    // same value as "missing" would bury every real iOS case under the
    // entire Android install base.
    mockStatus.current = "not-applicable";
    render(<VideoUploadBootstrap />);
    expect(mockSetSentryTag).toHaveBeenCalledWith("video.backup_exclusion", "not-applicable");
  });

  it("logs it too, for device consoles where Sentry may not be wired", () => {
    render(<VideoUploadBootstrap />);
    expect(logSpy).toHaveBeenCalledWith("[video] backup exclusion: active");
  });

  it("reports once per launch, not once per auth change", () => {
    const view = render(<VideoUploadBootstrap />);
    mockAuth.current = { athlete: { id: "a1" } };
    view.rerender(<VideoUploadBootstrap />);
    expect(mockSetSentryTag).toHaveBeenCalledTimes(1);
  });

  it("still resumes uploads once a user is present", () => {
    // The tag must not have displaced what this component is actually for.
    mockAuth.current = { athlete: { id: "a1" } };
    render(<VideoUploadBootstrap />);
    expect(mockEnsureListeners).toHaveBeenCalled();
    expect(mockResumeUploads).toHaveBeenCalled();
  });
});

describe("upload scope and app-wide bindings (jits-n2im.1, .6)", () => {
  it("scopes resumes to the signed-in athlete before sweeping", () => {
    mockAuth.current = { athlete: { id: "a1" } };
    render(<VideoUploadBootstrap />);
    expect(mockSetUploadOwner).toHaveBeenCalledWith("a1");
    expect(mockSetUploadOwner.mock.invocationCallOrder[0]).toBeLessThan(
      mockResumeUploads.mock.invocationCallOrder[0],
    );
  });

  it("re-scopes when a different athlete signs in", () => {
    mockAuth.current = { athlete: { id: "a1" } };
    const view = render(<VideoUploadBootstrap />);
    mockAuth.current = { athlete: { id: "b2" } };
    view.rerender(<VideoUploadBootstrap />);
    expect(mockSetUploadOwner).toHaveBeenLastCalledWith("b2");
    expect(mockResumeUploads).toHaveBeenCalledTimes(2);
  });

  it("binds the upload keep-awake and the backgrounding notice once, signed in or not", () => {
    const view = render(<VideoUploadBootstrap />);
    mockAuth.current = { athlete: { id: "a1" } };
    view.rerender(<VideoUploadBootstrap />);
    expect(mockBindKeepAwake).toHaveBeenCalledTimes(1);
    expect(mockBindNotice).toHaveBeenCalledTimes(1);
  });
});
