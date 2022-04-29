import * as github from "@actions/github";
import { DateTime } from "luxon";
import {
  getBranchName,
  getElapsedTime,
  getHeadSha,
  getOffsetRange,
  getRef,
  sleep,
} from "./utils";

describe("utils", () => {
  describe("getBranchNameFromRef", () => {
    it("should return the branch name for a valid branch ref", () => {
      const branchName = "cool_feature";
      const ref = `/refs/heads/${branchName}`;
      const branch = getBranchName(ref);

      expect(branch).toStrictEqual(branchName);
    });

    it("should return the branch name for a valid branch ref without a leading slash", () => {
      const branchName = "cool_feature";
      const ref = `refs/heads/${branchName}`;
      const branch = getBranchName(ref);

      expect(branch).toStrictEqual(branchName);
    });

    it("should return undefined for an invalid branch ref", () => {
      const branch = getBranchName("refs/heads/");

      expect(branch).toBeUndefined();
    });

    it("should return undefined if the ref is for a tag", () => {
      const branch = getBranchName("refs/tags/v1.0.1");

      expect(branch).toBeUndefined();
    });

    it("should return undefined if the ref is for an invalid tag", () => {
      const branch = getBranchName("refs/tags/");

      expect(branch).toBeUndefined();
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

  describe("getRef", () => {
    const mockRef = "/refs/heads/cool_branch";

    beforeEach(() => {
      github.context.eventName = "push";
      github.context.ref = mockRef;
    });

    it("should return a ref from the github context", () => {
      const ref = getRef();

      expect(ref).toStrictEqual(mockRef);
    });

    it("should return a ref from the github payload if the event is a pull request", () => {
      github.context.ref = "refs/pull/2081/merge";
      github.context.eventName = "pull_request";
      const payload = {
        head: {
          ref: "/refs/heads/actual_ref",
        },
      };
      (github.context as any).payload = {
        pull_request: payload,
      };

      const ref = getRef();

      expect(ref).toStrictEqual(payload.head.ref);
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
