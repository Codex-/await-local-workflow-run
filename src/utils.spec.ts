import { DateTime } from "luxon";
import { getBranchName, getElapsedTime, getOffsetRange, sleep } from "./utils";

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
