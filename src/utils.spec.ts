import type { Context } from "@actions/github/lib/context";
import type { WebhookPayload } from "@actions/github/lib/interfaces";
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

import {
  getBranchName,
  getElapsedTime,
  getHeadSha,
  getOffsetRange,
  sleep,
} from "./utils";

let mockedContext: Context = {} as any;
vi.mock("@actions/github", () => ({
  get context() {
    return mockedContext;
  },
}));

describe("utils", () => {
  /* eslint-disable no-redeclare */
  function mockContextProp(prop: "eventName", value: string): void;
  function mockContextProp(prop: "ref", value: string): void;
  function mockContextProp(prop: "sha", value: string): void;
  function mockContextProp(prop: "payload", value: WebhookPayload): void;
  function mockContextProp(
    prop: "eventName" | "ref" | "sha" | "payload",
    value: string | WebhookPayload
  ): void {
    Object.defineProperty(mockedContext, prop, {
      value,
      writable: true,
    });
  }
  /* eslint-enable no-redeclare */

  afterEach(() => {
    mockedContext = {} as any;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("getBranchNameFromRef", () => {
    it("should return the branch name for a valid branch ref", () => {
      const branchName = "cool_feature";
      mockContextProp("ref", `/refs/heads/${branchName}`);

      expect(getBranchName()).toStrictEqual(branchName);
    });

    it("should return the branch name for a valid branch ref without a leading slash", () => {
      const branchName = "cool_feature";
      mockContextProp("ref", `refs/heads/${branchName}`);

      expect(getBranchName()).toStrictEqual(branchName);
    });

    it("should return undefined for an invalid branch ref", () => {
      mockContextProp("ref", "refs/heads/");

      expect(getBranchName()).toBeUndefined();
    });

    it("should return undefined if the ref is for a tag", () => {
      mockContextProp("ref", "refs/tags/v1.0.1");

      expect(getBranchName()).toBeUndefined();
    });

    it("should return undefined if the ref is for an invalid tag", () => {
      mockContextProp("ref", "refs/tags/");

      expect(getBranchName()).toBeUndefined();
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

      expect(getBranchName()).toStrictEqual(branchName);
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

      expect(sha).toStrictEqual(mockSha);
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

      expect(sha).toStrictEqual(payload.head.sha);
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

      expect(range).toStrictEqual(expectedStartRange);
    });

    it("should throw if you give an invalid day offset", () => {
      expect(() => getOffsetRange(0)).toThrow(
        "daysBefore must be greater than 1, received: 0"
      );
    });
  });

  describe("sleep", () => {
    it("should sleep for a given time", async () => {
      const awaitTime = 2000;
      const start = Date.now();

      await sleep(awaitTime);
      expect(Date.now() - start).toBeGreaterThanOrEqual(awaitTime);
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

      expect(elapsedTime).toStrictEqual(
        `${timeDifference.hours} hours, ${timeDifference.minutes} minutes, ${(
          timeDifference.seconds +
          timeDifference.milliseconds / 1000
        ).toFixed(3)} seconds`
      );
    });
  });
});
