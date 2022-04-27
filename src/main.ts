import * as core from "@actions/core";
import { getConfig } from "./action";
import {
  getWorkflowId,
  getWorkflowRunId,
  getWorkflowRunStatus,
  init,
  WorkflowRunConclusion,
} from "./api";
import { getElapsedTime, sleep } from "./utils";

const INITIAL_WAIT_MS = 10 * 1000; // 10 seconds

async function run(): Promise<void> {
  try {
    const config = getConfig();
    const startTime = Date.now();
    init(config);

    const timeoutMs = config.timeoutMins * 60 * 1000;
    let attemptNo = 0;
    let elapsedTime = Date.now() - startTime;

    core.info(
      `Awaiting completion of local Workflow Run ${config.workflowName}...\n` +
        `  Workflow: ${config.workflowName}\n` +
        (config.checkName ? `  Check: ${config.checkName}\n` : "") +
        `  Timeout: ${config.timeoutMins} (mins)`
    );

    // Give some initial time for GitHub to wake up and queue the checks.
    await sleep(INITIAL_WAIT_MS);

    const workflowId = await getWorkflowId(config.workflowName);
    let workflowRunId: number | undefined;
    while (elapsedTime < timeoutMs) {
      attemptNo++;
      elapsedTime = Date.now() - startTime;

      if (workflowRunId === undefined) {
        workflowRunId = await getWorkflowRunId(workflowId);
      }

      if (workflowRunId !== undefined) {
        const workflowRunStatus = await getWorkflowRunStatus(workflowRunId);
        if (workflowRunStatus.completed) {
          const conclusion = workflowRunStatus.conclusion;
          const completionMsg =
            "Workflow Run Completed:" +
            `  Run ID: ${workflowRunId}` +
            `  Elapsed Time: ${getElapsedTime(startTime, Date.now())}` +
            `  Conclusion: ${conclusion}`;

          if (conclusion !== WorkflowRunConclusion.Success) {
            core.error(completionMsg);
            core.setFailed(
              `Workflow ${config.workflowName} (${workflowId}) has not completed successfully: ${conclusion}.`
            );
          } else {
            core.info(completionMsg);
          }
          return;
        }
      } else {
        core.debug("Workflow Run ID has not been discovered yet...");
      }

      core.debug(`Run has not concluded, attempt ${attemptNo}...`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.error(`Failed: ${error.message}`);
      if (!error.message.includes("Timeout")) {
        core.warning("Does the token have the correct permissions?");
      }
      error.stack && core.debug(error.stack);
      core.setFailed(error.message);
    }
  }
}

(() => run())();
