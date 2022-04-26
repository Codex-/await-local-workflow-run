import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import { ActionConfig, getConfig } from "./action";
import { getBranchName, getOffsetRange } from "./utils";

type Octokit = InstanceType<typeof GitHub>;

let config: ActionConfig;
let octokit: Octokit;

export function init(cfg?: ActionConfig): void {
  config = cfg || getConfig();
  octokit = github.getOctokit(config.token);
}

function sanitiseWorkflowPath(workflowPath: string): string {
  return workflowPath.replace(/\.github\/workflows\//i, "");
}

export async function getWorkflowId(workflowFilename: string): Promise<number> {
  try {
    // https://docs.github.com/en/rest/reference/actions#list-repository-workflows
    const response = await octokit.rest.actions.listRepoWorkflows({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflows, expected 200 but received ${response.status}`
      );
    }

    const workflowsIdsMap: Record<string, number | undefined> =
      Object.fromEntries(
        response.data.workflows.map((workflow) => [
          sanitiseWorkflowPath(workflow.path),
          workflow.id,
        ])
      );
    const workflowsWithIds = response.data.workflows.map(
      (workflow) => `${sanitiseWorkflowPath(workflow.path)} (${workflow.id})`
    );

    core.debug(
      `Fetched Workflows:\n` +
        `  Repository: ${github.context.repo.owner}/${github.context.repo.repo}\n` +
        `  Total Workflows: ${response.data.total_count}\n` +
        `  Workflows: [${workflowsWithIds}]`
    );

    const id = workflowsIdsMap[workflowFilename];
    if (id === undefined) {
      throw new Error(
        `Failed to get Workflow ID for '${workflowFilename}', available workflows: [${workflowsWithIds}]`
      );
    }

    return id;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowId: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export enum WorkflowRunStatus {
  Queued = "queued",
  InProgress = "in_progress",
  Completed = "completed",
}

export interface WorkflowRun {
  id: number;
  attempt: number;
  checkSuiteId?: number;
  status?: WorkflowRunStatus;
}

/**
 * @param tryUseBranch limit search for the run ID to the branch being used.
 */
export async function getWorkflowRuns(
  workflowId: number,
  tryUseBranch = false
): Promise<WorkflowRun[]> {
  try {
    const branchName = tryUseBranch
      ? getBranchName(github.context.ref)
      : undefined;

    // https://docs.github.com/en/rest/reference/actions#list-workflow-runs
    const response = await octokit.rest.actions.listWorkflowRuns({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      workflow_id: workflowId,
      exclude_pull_requests: true,
      ...(branchName
        ? {
            branch: branchName,
            per_page: 25,
          }
        : {
            created: getOffsetRange(1),
            per_page: 50,
          }),
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow runs, expected 200 but received ${response.status}`
      );
    }

    const runs: WorkflowRun[] = response.data.workflow_runs
      .filter((workflowRun) => workflowRun.head_sha === github.context.sha)
      .map((workflowRun) => ({
        id: workflowRun.id,
        attempt: workflowRun.run_attempt || 0,
        checkSuiteId: workflowRun.check_suite_id,
        status: (workflowRun.status as WorkflowRunStatus) || undefined,
      }));

    // Ordering should be newest to oldest by date and time, but
    // I could not find any promises to this ordering.
    if (runs.length > 1) {
      // Sort by highest attempt to lowest attempt,
      // we're only interest in the most recent attempt.
      runs.sort((a, b) => {
        if (a.attempt > b.attempt) {
          return -1;
        }
        if (a.attempt < b.attempt) {
          return 1;
        }

        return 0;
      });
    }

    core.debug(
      "Fetched Workflow Runs:\n" +
        `  Repository: ${github.context.repo.owner}/${github.context.repo.repo}\n` +
        `  Workflow ID: ${workflowId}\n` +
        `  Triggering SHA: ${github.context.sha}` +
        `  Runs Fetched: [${runs.map(
          (run) => `${run.id} (Attempt ${run.attempt})`
        )}]`
    );

    return runs;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunIds: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export enum WorkflowRunConclusion {
  Success = "success",
  Failure = "failure",
  Neutral = "neutral",
  Cancelled = "cancelled",
  Skipped = "skipped",
  TimedOut = "timed_out",
  ActionRequired = "action_required",
}

export interface WorkflowRunState {
  status: WorkflowRunStatus | null;
  conclusion: WorkflowRunConclusion | null;
}

export async function getWorkflowRunState(
  runId: number
): Promise<WorkflowRunState> {
  try {
    // https://docs.github.com/en/rest/reference/actions#get-a-workflow-run
    const response = await octokit.rest.actions.getWorkflowRun({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      run_id: runId,
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow Run state, expected 200 but received ${response.status}`
      );
    }

    core.debug(
      `Fetched Run:\n` +
        `  Repository: ${github.context.repo.owner}/${github.context.repo.repo}\n` +
        `  Run ID: ${runId}\n` +
        `  Status: ${response.data.status}\n` +
        `  Conclusion: ${response.data.conclusion}`
    );

    return {
      status: response.data.status as WorkflowRunStatus | null,
      conclusion: response.data.conclusion as WorkflowRunConclusion | null,
    };
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunState: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

type WorkflowCompleted = {
  completed: true;
  conclusion?: WorkflowRunConclusion;
};

type WorkflowIncomplete = {
  completed: false;
};

export type WorkflowResult = WorkflowCompleted | WorkflowIncomplete;

export async function getWorkflowRunStatus(
  runId: number
): Promise<WorkflowResult> {
  const { status, conclusion } = await getWorkflowRunState(runId);

  if (status === WorkflowRunStatus.Completed) {
    switch (conclusion) {
      case WorkflowRunConclusion.Success:
        break;
      case WorkflowRunConclusion.ActionRequired:
      case WorkflowRunConclusion.Cancelled:
      case WorkflowRunConclusion.Failure:
      case WorkflowRunConclusion.Neutral:
      case WorkflowRunConclusion.Skipped:
      case WorkflowRunConclusion.TimedOut:
        core.error(`Run has failed with conclusion: ${conclusion}`);
        core.setFailed(conclusion);
        break;
      default:
        core.setFailed(`Unknown conclusion: ${conclusion}`);
        break;
    }

    return {
      completed: true,
      conclusion: conclusion || undefined,
    };
  }

  return {
    completed: false,
  };
}
