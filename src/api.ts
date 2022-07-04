import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import { ActionConfig, getConfig } from "./action";
import { getBranchName, getHeadSha, getOffsetRange } from "./utils";

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

let attemptWithBranch = false;
export async function getWorkflowRun(
  workflowId: number
): Promise<WorkflowRun | undefined> {
  const workflowRuns = await getWorkflowRuns(workflowId, attemptWithBranch);
  if (workflowRuns.length === 0) {
    attemptWithBranch = !attemptWithBranch;
    return;
  }
  const workflowRun = workflowRuns[0];

  core.debug(
    "Workflow Run ID Found:\n" +
      `  Workflow ID: ${workflowId}\n` +
      `  Run ID: ${workflowRun.id}\n` +
      `  Run Attempt: ${workflowRun.attempt}\n` +
      `  Run Check Suite ID: ${workflowRun.checkSuiteId || "null"}\n` +
      `  Run Status: ${workflowRun.status || "null"}`
  );

  return workflowRun;
}

export function resetGetWorkflowRunCfg() {
  attemptWithBranch = false;
}

export enum RunStatus {
  Queued = "queued",
  InProgress = "in_progress",
  Completed = "completed",
}

export interface WorkflowRun {
  id: number;
  attempt: number;
  checkSuiteId?: number;
  status?: RunStatus;
}

/**
 * @param tryUseBranch limit search for the run ID to the branch being used.
 */
export async function getWorkflowRuns(
  workflowId: number,
  tryUseBranch = false
): Promise<WorkflowRun[]> {
  try {
    const branchName = tryUseBranch ? getBranchName() : undefined;

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
      .filter((workflowRun) => workflowRun.head_sha === getHeadSha())
      .map((workflowRun) => ({
        id: workflowRun.id,
        attempt: workflowRun.run_attempt || 0,
        checkSuiteId: workflowRun.check_suite_id,
        status: (workflowRun.status as RunStatus) || undefined,
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
        `  Triggering SHA: ${getHeadSha()}\n` +
        `  Runs Fetched: [${runs.map(
          (run) => `${run.id} (Attempt ${run.attempt})`
        )}]`
    );

    return runs;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRuns: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export enum RunConclusion {
  Success = "success",
  Failure = "failure",
  Neutral = "neutral",
  Cancelled = "cancelled",
  Skipped = "skipped",
  TimedOut = "timed_out",
  ActionRequired = "action_required",
  Stale = "stale",
}

type WorkflowCompleted = {
  completed: true;
  conclusion?: RunConclusion;
};

type WorkflowIncomplete = {
  completed: false;
};

export type RunResult = WorkflowCompleted | WorkflowIncomplete;

export async function getCheckId(
  checkSuiteId: number,
  checkName: string
): Promise<number> {
  try {
    // https://docs.github.com/en/rest/checks/runs#list-check-runs-in-a-check-suite
    const response = await octokit.rest.checks.listForSuite({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      check_suite_id: checkSuiteId,
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Checks, expected 200 but received ${response.status}`
      );
    }

    const checkIdsMap: Record<string, number | undefined> = Object.fromEntries(
      response.data.check_runs.map((check) => [check.name, check.id])
    );
    const checksWithIds = response.data.check_runs.map(
      (check) => `${check.name} (${check.id})`
    );

    core.debug(
      `Fetched Checks:\n` +
        `  Repository: ${github.context.repo.owner}/${github.context.repo.repo}\n` +
        `  Total Checks: ${response.data.total_count}\n` +
        `  Checks: [${checksWithIds}]`
    );

    const id = checkIdsMap[checkName];
    if (id === undefined) {
      throw new Error(
        `Failed to get Check ID for '${checkName}', available checks: [${checksWithIds}]`
      );
    }

    return id;
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getCheckId: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export enum RunType {
  WorkflowRun,
  CheckRun,
}

export interface RunState {
  status: RunStatus | null;
  conclusion: RunConclusion | null;
}

type CheckRunResponse = Awaited<ReturnType<Octokit["rest"]["checks"]["get"]>>;
type WorkflowRunResponse = Awaited<
  ReturnType<Octokit["rest"]["actions"]["getWorkflowRun"]>
>;

export async function getRunState(
  runId: number,
  runType: RunType
): Promise<RunState> {
  try {
    let response: CheckRunResponse | WorkflowRunResponse;
    switch (runType) {
      case RunType.WorkflowRun:
        // https://docs.github.com/en/rest/reference/actions#get-a-workflow-run
        response = await octokit.rest.actions.getWorkflowRun({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          run_id: runId,
        });
        break;
      case RunType.CheckRun:
        // https://docs.github.com/en/rest/checks/runs#get-a-check-run
        response = await octokit.rest.checks.get({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          check_run_id: runId,
        });
        break;
      default:
        throw new Error("Unknown run type specified");
    }

    if (response.status !== 200) {
      throw new Error(
        `Failed to get run state, expected 200 but received ${response.status}`
      );
    }

    core.debug(
      `Fetched Run:\n` +
        `  Repository: ${github.context.repo.owner}/${github.context.repo.repo}\n` +
        `  Run ID: ${runId}\n` +
        `  Run Type: ${runType === RunType.CheckRun ? "Check" : "Workflow"}\n` +
        `  Status: ${response.data.status}\n` +
        `  Conclusion: ${response.data.conclusion}`
    );

    return {
      status: response.data.status as RunStatus | null,
      conclusion: response.data.conclusion as RunConclusion | null,
    };
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getRunState: An unexpected error has occurred: ${error.message}`
      );
      error.stack && core.debug(error.stack);
    }
    throw error;
  }
}

export async function getRunStatus(
  runId: number,
  runType: RunType
): Promise<RunResult> {
  const { status, conclusion } = await getRunState(runId, runType);

  if (status === RunStatus.Completed) {
    switch (conclusion) {
      case RunConclusion.Success:
        break;
      case RunConclusion.ActionRequired:
      case RunConclusion.Cancelled:
      case RunConclusion.Failure:
      case RunConclusion.Neutral:
      case RunConclusion.Skipped:
      case RunConclusion.Stale:
      case RunConclusion.TimedOut:
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
