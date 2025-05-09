import * as core from "@actions/core";
import { Duration } from "luxon";

import { getConfig } from "./action.ts";
import {
  getCheckId,
  getRunStatus,
  getWorkflowId,
  getWorkflowRun,
  init,
  RunConclusion,
  RunType,
} from "./api.ts";
import { getElapsedTime, sleep } from "./utils.ts";

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
      `Awaiting completion of local Workflow Run ${config.workflow}...\n` +
        `  Workflow: ${config.workflow}\n` +
        (config.checkName ? `  Check: ${config.checkName}\n` : "") +
        `  Timeout: ${Duration.fromMillis(timeoutMs).toHuman()}`,
    );

    // Give some initial time for GitHub to wake up and queue the checks.
    await sleep(INITIAL_WAIT_MS);

    const workflowId = await getWorkflowId(config.workflow);
    let workflowRunId: number | undefined;
    let checkSuiteId: number | undefined;
    let checkRunId: number | undefined;
    let checkRunStatus: (() => Promise<boolean>) | undefined;
    while (elapsedTime < timeoutMs) {
      attemptNo++;
      elapsedTime = Date.now() - startTime;

      if (workflowRunId === undefined) {
        const workflowRun = await getWorkflowRun(workflowId);
        workflowRunId = workflowRun?.id;
        checkSuiteId = workflowRun?.checkSuiteId;
      }

      if (
        config.checkName &&
        checkRunId === undefined &&
        checkSuiteId !== undefined
      ) {
        checkRunId = await getCheckId(checkSuiteId, config.checkName);
      }

      if (checkRunStatus !== undefined) {
        if (await checkRunStatus()) {
          return;
        }
        continue;
      }

      if (workflowRunId !== undefined) {
        const safeWorkflowRunId = workflowRunId;
        if (checkRunId !== undefined) {
          const safeCheckRunId = checkRunId;
          checkRunStatus = async (): Promise<boolean> => {
            const runStatus = await getRunStatus(
              safeCheckRunId,
              RunType.CheckRun,
            );

            if (runStatus.completed) {
              const conclusion = runStatus.conclusion;
              const completionMsg =
                "Check Run Completed:\n" +
                `  Check Run ID: ${safeCheckRunId}\n` +
                `  Elapsed Time: ${getElapsedTime(startTime, Date.now())}\n` +
                `  Conclusion: ${conclusion}`;

              if (conclusion !== RunConclusion.Success) {
                core.error(completionMsg);
                core.setFailed(
                  `Workflow ${config.workflow} (${workflowId}) has not completed successfully: ${conclusion}.`,
                );
              } else {
                core.info(completionMsg);
              }
              return true;
            }

            return false;
          };
        } else {
          checkRunStatus = async (): Promise<boolean> => {
            const runStatus = await getRunStatus(
              safeWorkflowRunId,
              RunType.WorkflowRun,
            );

            if (runStatus.completed) {
              const conclusion = runStatus.conclusion;
              const completionMsg =
                "Workflow Run Completed:\n" +
                `  Workflow Run ID: ${safeWorkflowRunId}\n` +
                `  Elapsed Time: ${getElapsedTime(startTime, Date.now())}\n` +
                `  Conclusion: ${conclusion}`;

              if (conclusion !== RunConclusion.Success) {
                core.error(completionMsg);
                core.setFailed(
                  `Workflow ${config.workflow} (${workflowId}) has not completed successfully: ${conclusion}.`,
                );
              } else {
                core.info(completionMsg);
              }
              return true;
            }
            return false;
          };
        }
      } else {
        core.debug("Run ID has not been discovered yet...");
      }

      core.debug(`Run has not concluded, attempt ${attemptNo}...\n`);

      await sleep(config.pollIntervalMs);
    }

    throw new Error(
      "Timeout exceeded while attempting to await local workflow run",
    );
  } catch (error) {
    if (error instanceof Error) {
      core.error(`Failed: ${error.message}`);
      if (!error.message.includes("Timeout")) {
        core.warning("Does the token have the correct permissions?");
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      error.stack && core.debug(error.stack);
      core.setFailed(error.message);
    }
  }
}

if (!process.env.VITEST) {
  await run();
}
