/**
 * The backup-exclusion telemetry wired at bootstrap (jits-vjbq, F1).
 *
 * WHY THIS IS TESTED AT ALL. The exclusion is set by a NATIVE module, and
 * JS ships over the air while native code does not. `expo.version` is 0.2.0
 * with a `runtimeVersion` policy of `appVersion`, so the TestFlight build
 * that adds the module and every already-installed 0.2.0 binary share a
 * runtime version and accept the same OTA. After that build there will be
 * two populations running byte-identical JS, one of which is silently
 * sending 300-600 MB clips to iCloud. This tag is the only thing that tells
 * them apart, so a regression that drops it is invisible by construction:
 * nothing breaks, the answer just stops existing.
 */
const mockSetSentryTag = jest.fn();
const mockResumeUploads = jest.fn(async () => undefined);
const mockEnsureListeners = jest.fn(() => () => undefined);
const mockStatus = { current: "active" as string };
const mockAuth = { current: { user: null } as { user: { id: string } | null } };

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
  mockAuth.current = { user: null };
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
    mockAuth.current = { user: null };
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

  it("logs it too, because the release Sentry DSN is not wired yet", () => {
    render(<VideoUploadBootstrap />);
    expect(logSpy).toHaveBeenCalledWith("[video] backup exclusion: active");
  });

  it("reports once per launch, not once per auth change", () => {
    const view = render(<VideoUploadBootstrap />);
    mockAuth.current = { user: { id: "u1" } };
    view.rerender(<VideoUploadBootstrap />);
    expect(mockSetSentryTag).toHaveBeenCalledTimes(1);
  });

  it("still resumes uploads once a user is present", () => {
    // The tag must not have displaced what this component is actually for.
    mockAuth.current = { user: { id: "u1" } };
    render(<VideoUploadBootstrap />);
    expect(mockEnsureListeners).toHaveBeenCalled();
    expect(mockResumeUploads).toHaveBeenCalled();
  });
});
