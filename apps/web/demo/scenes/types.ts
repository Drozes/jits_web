import type { Page, Browser } from "@playwright/test";

export interface AccountInfo {
  email: string;
  password: string;
  athleteId?: string;
}

export interface SharedState {
  challengeId?: string;
  matchId?: string;
  conversationId?: string;
}

export interface SceneContext {
  browser: Browser;
  pageA: Page;
  pageB?: Page;
  baseURL: string;
  accounts: {
    primary: AccountInfo;
    secondary: AccountInfo;
  };
  shared: SharedState;
}

export type SceneFn = (ctx: SceneContext) => Promise<void>;

export interface PreCheckContext {
  shared: SharedState;
  accounts: { primary: AccountInfo; secondary: AccountInfo };
}

export interface Scene {
  sceneName: string;
  requiresSecondAccount: boolean;
  /** When true, the scene receives an unauthenticated context and handles login itself. */
  skipAuth?: boolean;
  /** Return false to skip this scene entirely (no browser context created, no video). */
  shouldRun?: (ctx: PreCheckContext) => boolean;
  run: SceneFn;
}
