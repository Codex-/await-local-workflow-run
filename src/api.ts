import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import { ActionConfig, getConfig } from "./action";

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
