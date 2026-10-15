/**
 * Try again on a clip queued before the consent prompt existed
 * (jits-rog5.11): it asks first, Allow records consent and uploads, Not now
 * keeps the clip parked.
 */
import { Alert } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));
const mockRetry = jest.fn();
jest.mock("@/lib/video/upload-control", () => ({
  retryMatchUpload: (...a: unknown[]) => mockRetry(...a),
  discardMatchUpload: (...a: unknown[]) => mockDiscard(...a),
}));
const mockDiscard = jest.fn();
const mockGive = jest.fn();
jest.mock("@/lib/moderation/ai-consent", () => ({ giveAiConsent: () => mockGive() }));

import { useUploadActions } from "@/lib/video/use-upload-actions";

type Btn = { text: string; onPress?: () => void };
function buttons(): Btn[] {
  return (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as Btn[];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockRetry.mockResolvedValueOnce("needs_consent").mockResolvedValue("started");
  mockGive.mockResolvedValue(true);
});

it("asks Before you upload, with what is shared", async () => {
  const { result } = renderHook(() => useUploadActions("M1"));
  await act(async () => result.current.retry());
  const [title, body] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe("Before you upload");
  expect(body).toMatch(/with your display name, rating and weight division, is sent to Google Gemini/);
  expect(buttons().map((b) => b.text)).toEqual(["Not now", "Read the Privacy Policy", "Delete clip", "Allow and upload"]);
});

it("Allow and upload records consent, then retries", async () => {
  const { result } = renderHook(() => useUploadActions("M1"));
  await act(async () => result.current.retry());
  await act(async () => buttons()[3].onPress?.());
  expect(mockGive).toHaveBeenCalledTimes(1);
  expect(mockRetry).toHaveBeenCalledTimes(2);
});

it("Not now keeps the clip parked and says so", async () => {
  const { result } = renderHook(() => useUploadActions("M1"));
  await act(async () => result.current.retry());
  act(() => buttons()[0].onPress?.());
  expect(mockGive).not.toHaveBeenCalled();
  expect(mockRetry).toHaveBeenCalledTimes(1);
  expect(mockToast.info).toHaveBeenCalledWith("Your clip stays on this phone until you allow it.");
});

it("the privacy link opens the policy at section 4", async () => {
  const { result } = renderHook(() => useUploadActions("M1"));
  await act(async () => result.current.retry());
  act(() => buttons()[1].onPress?.());
  expect(mockPush).toHaveBeenCalledWith("/legal/privacy?section=4");
});

it("Delete clip drops it without consenting, through the usual Discard confirm", async () => {
  const { result } = renderHook(() => useUploadActions("M1"));
  await act(async () => result.current.retry());
  act(() => buttons()[2].onPress?.());
  const [title] = (Alert.alert as jest.Mock).mock.calls.at(-1);
  expect(title).toBe("Discard this recording?");
  await act(async () => buttons().find((b) => b.text === "Discard")?.onPress?.());
  expect(mockDiscard).toHaveBeenCalledWith("M1");
  expect(mockGive).not.toHaveBeenCalled();
});
