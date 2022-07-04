import * as github from "@actions/github";
import { WebhookPayload } from "@actions/github/lib/interfaces";
import { DateTime } from "luxon";
import {
  getBranchName,
  getElapsedTime,
  getHeadSha,
  getOffsetRange,
  sleep,
} from "./utils";

describe("utils", () => {
  describe("getBranchNameFromRef", () => {
    let originalRef: string;
    let originalEventName: string;
    let originalPayload: WebhookPayload;

    beforeEach(() => {
      originalRef = github.context.ref;
      originalEventName = github.context.eventName;
      originalPayload = github.context.payload;
    });

    afterEach(() => {
      github.context.ref = originalRef;
      github.context.eventName = originalEventName;
      github.context.payload = originalPayload;
    });

    it("should return the branch name for a valid branch ref", () => {
      const branchName = "cool_feature";
      github.context.ref = `/refs/heads/${branchName}`;

      expect(getBranchName()).toStrictEqual(branchName);
    });

    it("should return the branch name for a valid branch ref without a leading slash", () => {
      const branchName = "cool_feature";
      github.context.ref = `refs/heads/${branchName}`;

      expect(getBranchName()).toStrictEqual(branchName);
    });

    it("should return undefined for an invalid branch ref", () => {
      github.context.ref = "refs/heads/";

      expect(getBranchName()).toBeUndefined();
    });

    it("should return undefined if the ref is for a tag", () => {
      github.context.ref = "refs/tags/v1.0.1";

      expect(getBranchName()).toBeUndefined();
    });

    it("should return undefined if the ref is for an invalid tag", () => {
      github.context.ref = "refs/tags/";

      expect(getBranchName()).toBeUndefined();
    });

    it("should return a ref from the github payload if the event is a pull request", () => {
      const branchName = "cool_feature";
      github.context.ref = "refs/pull/2081/merge";
      github.context.eventName = "pull_request";
      github.context.payload = {
        pull_request: {
          number: 0,
          head: {
            ref: branchName,
          },
        },
      };

      expect(getBranchName()).toStrictEqual(branchName);
    });
  });

  describe("getHeadSha", () => {
    const mockSha = "1234567890123456789012345678901234567890";

    beforeEach(() => {
      github.context.eventName = "push";
      github.context.sha = mockSha;
    });

    it("should return a sha from the github context", () => {
      const sha = getHeadSha();

      expect(sha).toStrictEqual(mockSha);
    });

    it("should return a sha from the github payload if the event is a pull request", () => {
      github.context.eventName = "pull_request";
      const payload = {
        head: {
          sha: "prsha",
        },
      };
      (github.context as any).payload = {
        pull_request: payload,
      };

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
