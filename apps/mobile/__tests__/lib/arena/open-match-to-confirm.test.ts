/**
 * The chip's CONFIRM segment and the Arena's ConfirmStrip open the match to
 * confirm the same way: navigate, never push, so a double tap does not stack
 * two match screens. The screen-level check lives in
 * __tests__/screens/arena.test.tsx.
 */
import { openMatchToConfirm } from "@/lib/arena/open-match-to-confirm";

it("navigates to the match route and never pushes", () => {
  const router = { navigate: jest.fn(), push: jest.fn() };
  openMatchToConfirm(router, "m-1");
  openMatchToConfirm(router, "m-1");
  expect(router.navigate).toHaveBeenCalledTimes(2);
  expect(router.navigate).toHaveBeenLastCalledWith("/match/m-1");
  expect(router.push).not.toHaveBeenCalled();
});
