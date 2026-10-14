/**
 * The setup wizard's step header names the Terms step "Terms of Service"
 * (jits-rog5.8), never the retired "End User Agreement".
 *
 * Source: apps/mobile/components/profile-setup/setup-wizard.tsx
 */
import * as React from "react";
import { render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ signOut: jest.fn(), user: null }) }));
jest.mock("@/lib/profile-setup/use-setup-submit", () => ({
  useSetupSubmit: () => ({ loading: false, error: null, acceptTos: jest.fn(), submit: jest.fn() }),
}));
jest.mock("@/components/profile-setup/tos-step", () => ({ TosStep: () => null }));
jest.mock("@/components/profile-setup/identity-step", () => ({ IdentityStep: () => null }));
jest.mock("@/components/profile-setup/training-step", () => ({ TrainingStep: () => null }));

import { SetupWizard } from "@/components/profile-setup/setup-wizard";

const PROPS = {
  authUserId: "u1",
  athlete: null,
  gyms: [],
  cities: [],
  waiverId: "w1",
  isEditing: false,
  gymAccess: { kind: "none" } as never,
};

describe("SetupWizard step header", () => {
  it("labels the Terms step Terms of Service", () => {
    render(<SetupWizard {...PROPS} hasAcceptedTos={false} />);
    expect(screen.getByText("Terms of Service")).toBeTruthy();
    expect(screen.queryByText(/End User Agreement/i)).toBeNull();
  });

  it("starts at the identity step once the Terms were accepted", () => {
    render(<SetupWizard {...PROPS} hasAcceptedTos />);
    expect(screen.queryByText("Terms of Service")).toBeNull();
    expect(screen.getByText("Who Are You")).toBeTruthy();
  });
});
