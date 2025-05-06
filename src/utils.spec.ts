import type { Context } from "@actions/github/lib/context.js";
import type { WebhookPayload } from "@actions/github/lib/interfaces.js";
import { DateTime } from "luxon";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";
import {
  getBranchName,
  getElapsedTime,
  getHeadSha,
  getOffsetRange,
  sleep,
} from "./utils.ts";

vi.mock("@actions/core");
let mockedContext: Context = {} as any;
vi.mock("@actions/github", () => ({
  get context() {
    return mockedContext;
  },
}));

describe("utils", () => {
  const {
    coreDebugLogMock,
    coreWarningLogMock,
    assertOnlyCalled,
    assertNoneCalled,
  } = mockLoggingFunctions();

  function mockContextProp(prop: "eventName", value: string): void;
  function mockContextProp(prop: "ref", value: string): void;
  function mockContextProp(prop: "sha", value: string): void;
  function mockContextProp(prop: "payload", value: WebhookPayload): void;
  function mockContextProp(
    prop: "eventName" | "ref" | "sha" | "payload",
    value: string | WebhookPayload,
  ): void {
    Object.defineProperty(mockedContext, prop, {
      value,
      writable: true,
    });
  }

  afterEach(() => {
    mockedContext = {} as any;
    vi.resetAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("getBranchNameFromRef", () => {
    it("should return the branch name for a valid branch ref", () => {
      const branchName = "cool_feature";
      mockContextProp("ref", `/refs/heads/${branchName}`);

      // Behaviour
      expect(getBranchName()).toStrictEqual(branchName);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getWorkflowRunIds: Filtered branch name: /refs/heads/cool_feature"`,
      );
    });

    it("should return the branch name for a valid branch ref without a leading slash", () => {
      const branchName = "cool_feature";
      mockContextProp("ref", `refs/heads/${branchName}`);

      // Behaviour
      expect(getBranchName()).toStrictEqual(branchName);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getWorkflowRunIds: Filtered branch name: refs/heads/cool_feature"`,
      );
    });

    it("should return undefined for an invalid branch ref", () => {
      mockContextProp("ref", "refs/heads/");

      // Behaviour
      expect(getBranchName()).toBeUndefined();

      // Logging
      assertOnlyCalled(coreWarningLogMock);
      expect(coreWarningLogMock).toHaveBeenCalledOnce();
      expect(coreWarningLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"failed to get branch for ref: refs/heads/, please raise an issue with this git ref."`,
      );
    });

    it("should return undefined if the ref is for a tag", () => {
      mockContextProp("ref", "refs/tags/v1.0.1");

      // Behaviour
      expect(getBranchName()).toBeUndefined();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Unable to filter branch, unsupported ref: refs/tags/v1.0.1"`,
      );
    });

    it("should return undefined if the ref is for an invalid tag", () => {
      mockContextProp("ref", "refs/tags/");

      // Behaviour
      expect(getBranchName()).toBeUndefined();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Unable to filter branch, unsupported ref: refs/tags/"`,
      );
    });

    it("should return a ref from the github payload if the event is a pull request", () => {
      const branchName = "cool_feature";
      mockContextProp("ref", "refs/pull/2081/merge");
      mockContextProp("eventName", "pull_request");
      mockContextProp("payload", {
        pull_request: {
          number: 0,
          head: {
            ref: branchName,
          },
        },
      });

      // Behaviour
      expect(getBranchName()).toStrictEqual(branchName);

      // Logging
      assertNoneCalled();
    });
  });

  describe("getHeadSha", () => {
    const mockSha = "1234567890123456789012345678901234567890";

    beforeEach(() => {
      mockContextProp("eventName", "push");
      mockContextProp("sha", mockSha);
    });

    it("should return a sha from the github context", () => {
      const sha = getHeadSha();

      // Behaviour
      expect(sha).toStrictEqual(mockSha);

      // Logging
      assertNoneCalled();
    });

    it("should return a sha from the github payload if the event is a pull request", () => {
      mockContextProp("eventName", "pull_request");
      const payload = {
        head: {
          sha: "prsha",
        },
        number: 0,
      };
      mockContextProp("payload", {
        pull_request: payload,
      });

      const sha = getHeadSha();

      // Behaviour
      expect(sha).toStrictEqual(payload.head.sha);

      // Logging
      assertNoneCalled();
    });
  });

  describe("getOffsetRange", () => {
    it("should return a valid date range", () => {
      const expectedStartDate = DateTime.now()
        .toUTC()
        .minus({ days: 1 })
        .toFormat("yyyy-LL-dd");
      const expectedStartRange = `${expectedStartDate}..*`;
      const range = getOffsetRange(1);

      // Behaviour
      expect(range).toStrictEqual(expectedStartRange);

      // Logging
      assertNoneCalled();
    });

    it("should throw if you give an invalid day offset", () => {
      expect(() => getOffsetRange(0)).toThrow(
        "daysBefore must be greater than 1, received: 0",
      );
    });
  });

  describe("sleep", () => {
    it("should sleep for a given time", async () => {
      vi.useFakeTimers();
      const awaitTime = 2000;
      const start = Date.now();

      const sleepPromise = sleep(awaitTime);

      // Behaviour
      vi.advanceTimersByTime(awaitTime);
      await expect(sleepPromise).resolves.not.toThrow();
      expect(Date.now() - start).toBeGreaterThanOrEqual(awaitTime);

      // Logging
      assertNoneCalled();
    });
  });

  describe("getElapsedTime", () => {
    it("should return the difference between two unix times in human readable text", () => {
      const dt = DateTime.now();
      const timeDifference = {
        hours: 4,
        minutes: 3,
        seconds: 2,
        milliseconds: 1,
      };
      const start = dt.minus(timeDifference).toMillis();
      const end = dt.toMillis();

      const elapsedTime = getElapsedTime(start, end);

      // Behaviour
      expect(elapsedTime).toStrictEqual(
        `${timeDifference.hours} hours, ${timeDifference.minutes} minutes, ${(
          timeDifference.seconds +
          timeDifference.milliseconds / 1000
        ).toFixed(3)} seconds`,
      );

      // Logging
      assertNoneCalled();
    });
  });
});
