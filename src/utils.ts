import * as core from "@actions/core";
import * as github from "@actions/github";
import type { PullRequestEvent } from "@octokit/webhooks-types";
import { DateTime, Duration } from "luxon";

function getBranchNameFromRef(ref: string): string | undefined {
  const refItems = ref.split(/\/?refs\/heads\//);
  if (refItems.length > 1 && refItems[1].length > 0) {
    return refItems[1];
  }
}

function isTagRef(ref: string): boolean {
  return new RegExp(/\/?refs\/tags\//).test(ref);
}

export function getBranchName(): string | undefined {
  // If this is run in a PR we can access the event for this and get the branch directly.
  if (github.context.eventName === "pull_request") {
    const pullRequestPayload = github.context.payload as PullRequestEvent;
    // The ref is actually just the branch name, not a proper ref.
    return pullRequestPayload.pull_request.head.ref;
  }

  const ref = github.context.ref;
  let branchName;
  if (!isTagRef(ref)) {
    /**
     * The listRepoWorkflows request only accepts a branch name and not a ref (for some reason).
     *
     * Attempt to filter the branch name specifically and use that.
     */
    const branch = getBranchNameFromRef(ref);
    if (branch) {
      branchName = branch;

      core.debug(`getWorkflowRunIds: Filtered branch name: ${ref}`);
    } else {
      core.warning(
        `failed to get branch for ref: ${ref}, please raise an issue with this git ref.`
      );
    }
  } else {
    core.debug(`Unable to filter branch, unsupported ref: ${ref}`);
  }

  return branchName;
}

export function getHeadSha(): string {
  if (github.context.eventName === "pull_request") {
    const pullRequestPayload = github.context.payload as PullRequestEvent;
    return pullRequestPayload.pull_request.head.sha;
  }

  return github.context.sha;
}

/**
 * Specify how many days prior to specify the date range query.
 *
 * Used in the GitHub API to satisfy the `created` parameter.
 *
 * @see https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax#query-for-dates GitHub date query documentation
 * @param daysBefore positive number > 1
 * @returns a range that conforms to the GitHub date range query requirements.
 */
export function getOffsetRange(daysBefore: number): string {
  if (daysBefore < 1) {
    throw new Error(
      `daysBefore must be greater than 1, received: ${daysBefore}`
    );
  }
  const startDate = DateTime.now()
    .toUTC()
    .minus({ days: daysBefore })
    .toFormat("yyyy-LL-dd");

  return `${startDate}..*`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function getElapsedTime(start: number, end: number): string {
  const duration = Duration.fromMillis(end - start).shiftTo(
    "hours",
    "minutes",
    "seconds"
  );

  return duration.toHuman();
}
