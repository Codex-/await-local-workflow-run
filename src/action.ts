import * as core from "@actions/core";

const WORKFLOW_TIMEOUT_MINUTES = 15;
const POLL_INTERVAL_MS = 15000;

/**
 * action.yaml definition.
 */
export interface ActionConfig {
  /**
   * GitHub API token for making requests.
   */
  token: string;

  /**
   * The workflow that you wish to await completion of.
   */
  workflow: string;

  /**
   * A specific check within the workflow to wait for. Await all checks if this is not specified.
   */
  checkName?: string;

  /**
   * Time until giving up on the completion of an action.
   * @default 15
   */
  timeoutMins: number;

  /**
   * Frequency to poll the action for a status.
   * @default 5000
   */
  pollIntervalMs: number;
}

export function getConfig(): ActionConfig {
  return {
    token: core.getInput("token", { required: true }),
    workflow: core.getInput("workflow", { required: true }),
    checkName: (() => {
      const input = core.getInput("check_name");
      return input === "" ? undefined : input;
    })(),
    timeoutMins:
      getNumberFromValue(core.getInput("timeout_mins")) ||
      WORKFLOW_TIMEOUT_MINUTES,
    pollIntervalMs:
      getNumberFromValue(core.getInput("poll_interval_ms")) || POLL_INTERVAL_MS,
  };
}

function getNumberFromValue(value: string): number | undefined {
  if (value === "") {
    return undefined;
  }

  try {
    const num = parseInt(value);

    if (isNaN(num)) {
      throw new Error("Parsed value is NaN");
    }

    return num;
  } catch {
    throw new Error(`Unable to parse value: ${value}`);
  }
}
